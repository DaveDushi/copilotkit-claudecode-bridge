/**
 * Test server — spawns the bridge and exposes a management API
 * so the frontend can pick which folder Claude works in.
 *
 * Run:  npx tsx src/server.ts
 */
import { createServer } from "node:http";
import { CopilotKitClaudeBridge } from "copilotkit-claude-bridge";

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
  // The frontend calls these to spawn/kill/list sessions.
  const mgmtServer = createServer((req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? "";
    const pathname = url.split("?")[0];

    if (pathname === "/api/sessions" && req.method === "GET") {
      // List all sessions
      const sessions: { id: string; workingDir: string; status: string }[] = [];
      for (const [id, s] of (bridge as any).state.sessions.entries()) {
        sessions.push({
          id,
          workingDir: s.workingDir,
          status: typeof s.status === "string" ? s.status : "error",
        });
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessions }));
    } else if (pathname === "/api/sessions" && req.method === "POST") {
      // Spawn a new session
      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", async () => {
        try {
          const { workingDir } = JSON.parse(body);
          if (!workingDir || typeof workingDir !== "string") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "workingDir is required" }));
            return;
          }

          // Kill existing sessions first (single-session mode for simplicity)
          for (const [id] of (bridge as any).state.sessions) {
            await bridge.killSession(id);
          }

          const sessionId = await bridge.spawnSession(workingDir);
          console.log(`[test] Spawned session ${sessionId.slice(0, 8)} in ${workingDir}`);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ sessionId, workingDir }));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else if (pathname.startsWith("/api/sessions/") && req.method === "DELETE") {
      // Kill a session
      const sessionId = pathname.replace("/api/sessions/", "");
      bridge.killSession(sessionId).then(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  });

  mgmtServer.listen(3002, "127.0.0.1", () => {
    console.log(`  Management API:   http://localhost:3002`);
  });

  // Spawn a default session in cwd so it works immediately
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
