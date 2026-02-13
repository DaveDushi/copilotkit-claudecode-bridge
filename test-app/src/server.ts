/**
 * Test server — spawns the bridge and exposes a management API
 * so the frontend can create, switch, and delete sessions,
 * change models, switch modes, interrupt, and more.
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
        const sessions = [];
        for (const id of bridge.getSessionIds()) {
          const info = bridge.getSessionInfo(id);
          if (info) sessions.push(info);
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

      // ── PUT /api/sessions/:id/model ───────────────────────────
      const modelMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/model$/);
      if (modelMatch && req.method === "PUT") {
        const sessionId = modelMatch[1];
        const body = await readBody(req);
        const { model } = JSON.parse(body);
        if (!model || typeof model !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "model is required" }));
          return;
        }
        await bridge.setModel(sessionId, model);
        console.log(`[test] Set model to ${model} for session ${sessionId.slice(0, 8)}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, model }));
        return;
      }

      // ── PUT /api/sessions/:id/mode ────────────────────────────
      const modeMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/mode$/);
      if (modeMatch && req.method === "PUT") {
        const sessionId = modeMatch[1];
        const body = await readBody(req);
        const { mode } = JSON.parse(body);
        if (!mode || typeof mode !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "mode is required" }));
          return;
        }
        const result = await bridge.setPermissionMode(sessionId, mode as any);
        console.log(`[test] Set mode to ${mode} for session ${sessionId.slice(0, 8)}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, mode: result.mode ?? mode }));
        return;
      }

      // ── POST /api/sessions/:id/interrupt ──────────────────────
      const interruptMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/interrupt$/);
      if (interruptMatch && req.method === "POST") {
        const sessionId = interruptMatch[1];
        await bridge.interrupt(sessionId);
        console.log(`[test] Interrupted session ${sessionId.slice(0, 8)}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // ── POST /api/sessions/:id/initialize ─────────────────────
      const initMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/initialize$/);
      if (initMatch && req.method === "POST") {
        const sessionId = initMatch[1];
        const body = await readBody(req);
        const options = body ? JSON.parse(body) : {};
        const result = await bridge.sendInitialize(sessionId, options);
        console.log(`[test] Initialized session ${sessionId.slice(0, 8)}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // ── GET /api/sessions/:id/capabilities ────────────────────
      const capsMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/capabilities$/);
      if (capsMatch && req.method === "GET") {
        const sessionId = capsMatch[1];
        const caps = bridge.getCapabilities(sessionId);
        const initData = bridge.getInitData(sessionId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ capabilities: caps, initData }));
        return;
      }

      // ── GET /api/sessions/:id/mcp ─────────────────────────────
      const mcpMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/mcp$/);
      if (mcpMatch && req.method === "GET") {
        const sessionId = mcpMatch[1];
        const result = await bridge.getMcpStatus(sessionId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
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
