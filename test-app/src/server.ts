/**
 * Test app server — minimal setup to showcase dynamic UI spawning.
 *
 * Ports:
 *   3000  AG-UI  (CopilotKit connects here)
 *   3001  WS     (Claude CLI connects here)
 *   3002  Mgmt   (tool approval SSE + response + file tree)
 *
 * User picks a workspace folder from the UI, then a session is spawned.
 */
import { createServer } from "node:http";
import { readdir } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { CopilotKitClaudeBridge } from "copilotkit-claude-bridge";

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
  });
}

// Patterns to hide from the file tree
const HIDDEN = new Set([
  ".git", "node_modules", ".env", ".env.local", ".DS_Store",
  "Thumbs.db", ".vscode", ".idea", "__pycache__", ".cache",
  "dist", "build", ".next", ".turbo",
]);

async function main() {
  const bridge = new CopilotKitClaudeBridge({ httpPort: 3000, wsPort: 3001 });

  bridge.on("session:status", (sessionId: string, status: string) => {
    console.log(`[session ${sessionId.slice(0, 8)}] ${status}`);
  });

  const { wsPort, httpPort } = await bridge.start();
  console.log(`\n  AG-UI server:     http://localhost:${httpPort}`);
  console.log(`  WebSocket server: ws://localhost:${wsPort}`);

  // ── Management API (tool approval + file tree) ─────────────────
  const mgmtServer = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const pathname = url.pathname;

    try {
      // SSE stream — tool approval requests
      if (pathname === "/api/events" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });

        const heartbeat = setInterval(() => res.write(":heartbeat\n\n"), 15000);

        const handler = (sessionId: string, message: any) => {
          if (
            message.type === "control_request" &&
            message.request?.subtype === "can_use_tool"
          ) {
            res.write(`event: tool_approval_request\ndata: ${JSON.stringify({
              sessionId,
              requestId: message.request.request_id ?? message.request_id,
              toolName: message.request.tool_name,
              toolInput: message.request.input,
              toolUseId: message.request.tool_use_id,
              description: message.request.description,
            })}\n\n`);
          }
        };

        bridge.on("session:message", handler);
        req.on("close", () => {
          clearInterval(heartbeat);
          bridge.off("session:message", handler);
        });
        return;
      }

      // GET /api/sessions — check if a session exists
      if (pathname === "/api/sessions" && req.method === "GET") {
        const ids = bridge.getSessionIds();
        const sessions = ids.map((id) => bridge.getSessionInfo(id)).filter(Boolean);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sessions }));
        return;
      }

      // POST /api/sessions — create a session with a chosen workspace folder
      if (pathname === "/api/sessions" && req.method === "POST") {
        const body = JSON.parse(await readBody(req));
        const workingDir = body.workingDir as string;
        if (!workingDir) { res.writeHead(400); res.end('{"error":"workingDir required"}'); return; }
        const sessionId = await bridge.spawnSession(workingDir);
        console.log(`[server] Session ${sessionId.slice(0, 8)} spawned in ${workingDir}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sessionId, workingDir }));
        return;
      }

      // POST /api/sessions/:id/permission-mode — change permission mode
      const modeMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/permission-mode$/);
      if (modeMatch && req.method === "POST") {
        const sessionId = modeMatch[1];
        const body = JSON.parse(await readBody(req));
        const mode = body.mode;
        if (!mode) { res.writeHead(400); res.end('{"error":"mode required"}'); return; }

        const result = await bridge.setPermissionMode(sessionId, mode);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, mode: (result as any).mode ?? mode }));
        return;
      }

      // POST /api/sessions/:id/tool-approval — approve or deny
      const match = pathname.match(/^\/api\/sessions\/([^/]+)\/tool-approval$/);
      if (match && req.method === "POST") {
        const sessionId = match[1];
        const body = JSON.parse(await readBody(req));
        if (!body.requestId) { res.writeHead(400); res.end('{"error":"requestId required"}'); return; }

        if (body.behavior === "deny") {
          await bridge.denyTool(sessionId, body.requestId, body.message || "Denied by user", false);
        } else {
          await bridge.approveTool(sessionId, body.requestId, {
            behavior: "allow",
            updatedInput: body.updatedInput ?? body.toolInput,
          });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
        return;
      }

      // GET /api/files?path=<relative> — list directory contents for file tree
      if (pathname === "/api/files" && req.method === "GET") {
        const reqPath = url.searchParams.get("path") ?? ".";

        // Find the session's working dir
        const ids = bridge.getSessionIds();
        if (ids.length === 0) {
          res.writeHead(400);
          res.end('{"error":"No active session"}');
          return;
        }
        const info = bridge.getSessionInfo(ids[0]);
        const workingDir = (info as any)?.workingDir ?? process.cwd();

        // Resolve and verify the path stays within workingDir
        const absPath = resolve(workingDir, reqPath);
        const rel = relative(workingDir, absPath);
        if (rel.startsWith("..")) {
          res.writeHead(403);
          res.end('{"error":"Path outside workspace"}');
          return;
        }

        try {
          const dirents = await readdir(absPath, { withFileTypes: true });
          const entries = dirents
            .filter((d) => !HIDDEN.has(d.name) && !d.name.startsWith("."))
            .sort((a, b) => {
              // Dirs first, then alphabetical
              if (a.isDirectory() && !b.isDirectory()) return -1;
              if (!a.isDirectory() && b.isDirectory()) return 1;
              return a.name.localeCompare(b.name);
            })
            .map((d) => ({
              name: d.name,
              type: d.isDirectory() ? "dir" : "file",
              path: reqPath === "." ? d.name : join(reqPath, d.name).replace(/\\/g, "/"),
            }));

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ entries }));
        } catch (err: any) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    } catch (err: any) {
      console.error("[mgmt] Error:", err.message);
      if (!res.headersSent) res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  mgmtServer.listen(3002, "127.0.0.1", () => {
    console.log(`  Management API:   http://localhost:3002`);
  });

  console.log(`\n  Open http://localhost:5173 to start.\n`);

  process.on("SIGINT", async () => {
    console.log("\n  Shutting down...");
    await bridge.stop();
    mgmtServer.close();
    process.exit(0);
  });
}

main().catch((err) => { console.error("Failed to start:", err); process.exit(1); });
