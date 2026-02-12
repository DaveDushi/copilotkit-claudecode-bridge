/**
 * Test server — spawns the bridge and exposes a management API
 * so the frontend can create, switch, and delete sessions.
 *
 * Run:  npx tsx src/server.ts
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
  const bridge = new CopilotKitClaudeBridge({
    httpPort: 3000,
    wsPort: 3001,
  });

  bridge.on("session:status", (sessionId, status) => {
    console.log(`[test] Session ${sessionId.slice(0, 8)}: ${status}`);
  });

  const { wsPort, httpPort } = await bridge.start();
  console.log(`\n  AG-UI server:     http://localhost:${httpPort}`);
  console.log(`  WebSocket server: ws://localhost:${wsPort}`);

  // ── Management API on a separate port ──────────────────────────
  const mgmtServer = createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? "";
    const pathname = url.split("?")[0];

    try {
      // ── GET /api/sessions ─────────────────────────────────────
      if (pathname === "/api/sessions" && req.method === "GET") {
        const sessions: {
          id: string;
          workingDir: string;
          status: string;
          active: boolean;
        }[] = [];
        for (const [id, s] of (bridge as any).state.sessions.entries()) {
          sessions.push({
            id,
            workingDir: s.workingDir,
            status: typeof s.status === "string" ? s.status : "error",
            active: bridge.activeSessionId === id,
          });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sessions }));
        return;
      }

      // ── POST /api/sessions ────────────────────────────────────
      if (pathname === "/api/sessions" && req.method === "POST") {
        const body = await readBody(req);
        const { workingDir } = JSON.parse(body);
        if (!workingDir || typeof workingDir !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "workingDir is required" }));
          return;
        }

        const sessionId = await bridge.spawnSession(workingDir);
        console.log(`[test] Spawned session ${sessionId.slice(0, 8)} in ${workingDir}`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sessionId, workingDir }));
        return;
      }

      // ── PUT /api/sessions/:id/activate ────────────────────────
      const activateMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/activate$/);
      if (activateMatch && req.method === "PUT") {
        const sessionId = activateMatch[1];
        bridge.setActiveSession(sessionId);
        console.log(`[test] Activated session ${sessionId.slice(0, 8)}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, activeSessionId: sessionId }));
        return;
      }

      // ── DELETE /api/sessions/:id ──────────────────────────────
      const deleteMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (deleteMatch && req.method === "DELETE") {
        const sessionId = deleteMatch[1];
        await bridge.killSession(sessionId);
        console.log(`[test] Killed session ${sessionId.slice(0, 8)}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    } catch (err: any) {
      console.error("[mgmt] Error:", err.message);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  mgmtServer.listen(3002, "127.0.0.1", () => {
    console.log(`  Management API:   http://localhost:3002`);
  });

  // Spawn a default session in cwd
  const sessionId = await bridge.spawnSession(process.cwd());
  console.log(`\n  Default session:  ${sessionId.slice(0, 8)} (${process.cwd()})`);
  console.log(`\n  Open http://localhost:5173 in your browser to chat!\n`);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n  Shutting down...");
    await bridge.stop();
    mgmtServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
