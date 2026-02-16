/**
 * Test app server — minimal setup to showcase dynamic UI spawning.
 *
 * Ports:
 *   3000  AG-UI  (CopilotKit connects here)
 *   3001  WS     (Claude CLI connects here)
 *   3002  Mgmt   (tool approval SSE + response)
 *
 * User picks a workspace folder from the UI, then a session is spawned.
 */
import { createServer } from "node:http";
import { CopilotKitClaudeBridge } from "copilotkit-claude-bridge";

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
  });
}

async function main() {
  const bridge = new CopilotKitClaudeBridge({ httpPort: 3000, wsPort: 3001 });

  bridge.on("session:status", (sessionId: string, status: string) => {
    console.log(`[session ${sessionId.slice(0, 8)}] ${status}`);
  });

  const { wsPort, httpPort } = await bridge.start();
  console.log(`\n  AG-UI server:     http://localhost:${httpPort}`);
  console.log(`  WebSocket server: ws://localhost:${wsPort}`);

  // ── Management API (tool approval only) ──────────────────────────
  const mgmtServer = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const pathname = (req.url ?? "").split("?")[0];

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
