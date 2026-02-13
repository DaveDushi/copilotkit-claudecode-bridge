/**
 * ============================================================================
 * TEST SERVER — Full-featured management API for the CopilotKit Claude Bridge
 * ============================================================================
 *
 * This server demonstrates ALL capabilities of the copilotkit-claude-bridge
 * library. It acts as the backend for the test-app React frontend.
 *
 * Architecture:
 *   - Port 3000: AG-UI HTTP server (CopilotKit single-endpoint transport)
 *   - Port 3001: WebSocket server (Claude CLI connects here via --sdk-url)
 *   - Port 3002: Management API (REST endpoints for the frontend UI)
 *
 * The Management API exposes every bridge capability as a REST endpoint:
 *   - Session lifecycle: create, activate, delete, list
 *   - Model switching: change between Sonnet, Opus, Haiku at runtime
 *   - Permission modes: switch between default, plan, acceptEdits, etc.
 *   - MCP management: list servers, reconnect, toggle, configure
 *   - Tool approval: approve or deny tool-use requests from Claude
 *   - Initialize: send the initialize control request to register hooks/MCP
 *   - Interrupt: abort the current agent turn
 *   - Thinking tokens: set the thinking budget for extended reasoning
 *   - Environment variables: update CLI environment at runtime
 *   - File rewind: undo file changes to a specific checkpoint
 *
 * Run:  npx tsx src/server.ts
 */
import { createServer } from "node:http";
import { CopilotKitClaudeBridge } from "copilotkit-claude-bridge";

// ═══════════════════════════════════════════════════════════════════════════
// Utility: read the full request body as a string
// ═══════════════════════════════════════════════════════════════════════════
function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility: parse JSON body, returning {} if empty/invalid
// ═══════════════════════════════════════════════════════════════════════════
function parseJsonBody(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility: send a JSON response with proper headers
// ═══════════════════════════════════════════════════════════════════════════
function json(
  res: import("node:http").ServerResponse,
  status: number,
  data: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function main() {
  // ═════════════════════════════════════════════════════════════════════════
  // 1. CREATE THE BRIDGE
  // ═════════════════════════════════════════════════════════════════════════
  //
  // The CopilotKitClaudeBridge is the main facade class that ties together:
  //   - A WebSocket server (port 3001) for Claude CLI connections
  //   - An AG-UI HTTP server (port 3000) for CopilotKit frontend requests
  //   - Session management with full lifecycle control
  //   - Control request/response correlation for all Claude Code features
  //
  // Configuration options:
  //   httpPort:                AG-UI server port (CopilotKit connects here)
  //   wsPort:                 WebSocket server port (Claude CLI connects here)
  //   host:                   Bind address (default: "127.0.0.1")
  //   agentId:                Agent ID for AG-UI discovery (default: "default")
  //   agentDescription:       Human-readable agent description
  //   claudeCliPath:          Path to claude CLI binary (default: "claude")
  //   corsOrigins:            CORS origins for HTTP server (default: ["*"])
  //   controlRequestTimeout:  Timeout for control requests in ms (default: 30000)
  //   autoInitialize:         Auto-send initialize on CLI connect (default: false)
  //   systemPrompt:           System prompt for initialize
  //   appendSystemPrompt:     Additional system prompt text
  const bridge = new CopilotKitClaudeBridge({
    httpPort: 3000,
    wsPort: 3001,
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. LISTEN TO BRIDGE EVENTS
  // ═════════════════════════════════════════════════════════════════════════
  //
  // The bridge extends EventEmitter and emits these events:
  //   "session:status"       - Fired when session status changes
  //                            (starting, connected, active, idle, disconnected, terminated)
  //   "session:message"      - Fired for every Claude CLI message (NDJSON)
  //   "session:capabilities" - Fired when session capabilities are available
  //   "ports"                - Fired when servers start, with actual port numbers
  bridge.on("session:status", (sessionId, status) => {
    console.log(`[test] Session ${sessionId.slice(0, 8)}: ${status}`);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 3. START THE BRIDGE SERVERS
  // ═════════════════════════════════════════════════════════════════════════
  //
  // bridge.start() launches both servers:
  //   - WebSocket server on wsPort (Claude CLI connects via --sdk-url flag)
  //   - AG-UI HTTP server on httpPort (CopilotKit frontend POSTs here)
  //
  // Returns the actual ports (useful when using port 0 for auto-assign).
  const { wsPort, httpPort } = await bridge.start();
  console.log(`\n  AG-UI server:     http://localhost:${httpPort}`);
  console.log(`  WebSocket server: ws://localhost:${wsPort}`);

  // ═════════════════════════════════════════════════════════════════════════
  // 4. MANAGEMENT API — REST endpoints for the frontend UI
  // ═════════════════════════════════════════════════════════════════════════
  //
  // This management API runs on a separate port (3002) and exposes ALL
  // bridge capabilities as REST endpoints. The React frontend calls these
  // to control sessions, change models, manage MCP servers, etc.
  const mgmtServer = createServer(async (req, res) => {
    // ── CORS headers ──────────────────────────────────────────────────
    // Allow all origins for development. In production, restrict this.
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
      // ════════════════════════════════════════════════════════════════
      // GET /api/sessions — List all sessions
      // ════════════════════════════════════════════════════════════════
      //
      // Returns an array of SessionInfo objects, each containing:
      //   id:            Unique session UUID
      //   workingDir:    Filesystem path the CLI operates in
      //   status:        Current status (starting/connected/active/idle/etc.)
      //   active:        Whether this is the session receiving AG-UI requests
      //   capabilities:  Tools, model, permissions, commands, skills, MCP, etc.
      //   initData:      Data from initialize (commands, models, account info)
      //   isCompacting:  Whether context window is being compacted
      //   totalCostUsd:  Cumulative API cost across all turns
      //   numTurns:      Total number of conversation turns
      if (pathname === "/api/sessions" && req.method === "GET") {
        const sessions = [];
        for (const id of bridge.getSessionIds()) {
          const info = bridge.getSessionInfo(id);
          if (info) sessions.push(info);
        }
        json(res, 200, { sessions });
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // POST /api/sessions — Create a new session
      // ════════════════════════════════════════════════════════════════
      //
      // Spawns a new Claude CLI process targeting the specified directory.
      // The CLI connects back via WebSocket using --sdk-url.
      //
      // Body: { "workingDir": "/path/to/project", "initialPrompt": "optional" }
      //
      // spawnSession() blocks until the CLI connects via WebSocket (up to 30s).
      // The new session is automatically activated (receives AG-UI requests).
      if (pathname === "/api/sessions" && req.method === "POST") {
        const body = parseJsonBody(await readBody(req));
        const workingDir = body.workingDir as string | undefined;
        if (!workingDir || typeof workingDir !== "string") {
          json(res, 400, { error: "workingDir is required" });
          return;
        }

        // Optional initial prompt to pre-load the conversation
        const initialPrompt = (body.initialPrompt as string) || undefined;
        const sessionId = await bridge.spawnSession(workingDir, initialPrompt);
        console.log(`[test] Spawned session ${sessionId.slice(0, 8)} in ${workingDir}`);

        json(res, 200, { sessionId, workingDir });
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // PUT /api/sessions/:id/activate — Switch the active session
      // ════════════════════════════════════════════════════════════════
      //
      // Only the "active" session receives AG-UI run requests from CopilotKit.
      // When the user switches sessions in the sidebar, this endpoint is called
      // to route future messages to the selected session.
      //
      // The frontend also uses key={sessionId} on CopilotKit to force a
      // remount — the chat UI resets but Claude's backend retains full history.
      const activateMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/activate$/);
      if (activateMatch && req.method === "PUT") {
        const sessionId = activateMatch[1];
        bridge.setActiveSession(sessionId);
        console.log(`[test] Activated session ${sessionId.slice(0, 8)}`);
        json(res, 200, { ok: true, activeSessionId: sessionId });
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // PUT /api/sessions/:id/model — Change the AI model at runtime
      // ════════════════════════════════════════════════════════════════
      //
      // Uses the set_model control request to switch between models:
      //   - "claude-sonnet-4-5-20250929"  (Sonnet 4.5 — fast, balanced)
      //   - "claude-opus-4-6"             (Opus 4.6 — most capable)
      //   - "claude-haiku-4-5-20251001"   (Haiku 4.5 — fastest, cheapest)
      //   - "default"                     (reset to account default)
      //
      // The model change takes effect on the NEXT turn — the current turn
      // (if any) continues with the previous model.
      const modelMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/model$/);
      if (modelMatch && req.method === "PUT") {
        const sessionId = modelMatch[1];
        const body = parseJsonBody(await readBody(req));
        const model = body.model as string | undefined;
        if (!model || typeof model !== "string") {
          json(res, 400, { error: "model is required" });
          return;
        }
        await bridge.setModel(sessionId, model);
        console.log(`[test] Set model to ${model} for session ${sessionId.slice(0, 8)}`);
        json(res, 200, { ok: true, model });
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // PUT /api/sessions/:id/mode — Change the permission mode
      // ════════════════════════════════════════════════════════════════
      //
      // Permission modes control how Claude handles tool approval:
      //   - "default"            Ask for permission on dangerous operations
      //   - "plan"               Claude plans but doesn't execute
      //   - "acceptEdits"        Auto-approve file edits, ask for others
      //   - "bypassPermissions"  Auto-approve everything (dangerous!)
      //   - "dontAsk"            Like bypass but also skips confirmations
      //   - "delegate"           Delegate to sub-agents
      //
      // Uses the set_permission_mode control request.
      const modeMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/mode$/);
      if (modeMatch && req.method === "PUT") {
        const sessionId = modeMatch[1];
        const body = parseJsonBody(await readBody(req));
        const mode = body.mode as string | undefined;
        if (!mode || typeof mode !== "string") {
          json(res, 400, { error: "mode is required" });
          return;
        }
        const result = await bridge.setPermissionMode(sessionId, mode as any);
        console.log(`[test] Set mode to ${mode} for session ${sessionId.slice(0, 8)}`);
        json(res, 200, { ok: true, mode: result.mode ?? mode });
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // POST /api/sessions/:id/interrupt — Abort the current turn
      // ════════════════════════════════════════════════════════════════
      //
      // Sends the interrupt control request to stop whatever Claude is
      // currently doing. The CLI will stop mid-generation and send a
      // result message with the partial output.
      const interruptMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/interrupt$/);
      if (interruptMatch && req.method === "POST") {
        const sessionId = interruptMatch[1];
        await bridge.interrupt(sessionId);
        console.log(`[test] Interrupted session ${sessionId.slice(0, 8)}`);
        json(res, 200, { ok: true });
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // POST /api/sessions/:id/initialize — Send the initialize request
      // ════════════════════════════════════════════════════════════════
      //
      // The initialize control request MUST be sent before the first user
      // message. It registers hooks, MCP servers, agents, system prompt,
      // and returns:
      //   - commands:  Available slash commands (e.g., /commit, /bug)
      //   - models:    Available models with display names
      //   - account:   User's account info (email, org, subscription)
      //
      // Body (all optional):
      //   { "systemPrompt": "...", "appendSystemPrompt": "...",
      //     "hooks": {...}, "sdkMcpServers": [...], "agents": {...} }
      const initMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/initialize$/);
      if (initMatch && req.method === "POST") {
        const sessionId = initMatch[1];
        const body = parseJsonBody(await readBody(req));
        const result = await bridge.sendInitialize(sessionId, body as any);
        console.log(`[test] Initialized session ${sessionId.slice(0, 8)}`);
        json(res, 200, result);
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // GET /api/sessions/:id/capabilities — Get session capabilities
      // ════════════════════════════════════════════════════════════════
      //
      // Returns two objects:
      //   capabilities: From system/init — tools, model, permissionMode,
      //                 slashCommands, agents, skills, mcpServers, plugins
      //   initData:     From initialize — commands, models, account info
      //
      // Capabilities are available as soon as the CLI connects (system/init).
      // initData is only available after sendInitialize() is called.
      const capsMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/capabilities$/);
      if (capsMatch && req.method === "GET") {
        const sessionId = capsMatch[1];
        const caps = bridge.getCapabilities(sessionId);
        const initData = bridge.getInitData(sessionId);
        json(res, 200, { capabilities: caps, initData });
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // GET /api/sessions/:id/mcp — Get MCP server status
      // ════════════════════════════════════════════════════════════════
      //
      // Uses the mcp_status control request to get the real-time status
      // of all configured MCP (Model Context Protocol) servers.
      //
      // Returns server name, status (connected/disconnected/error),
      // available tools, and connection info.
      const mcpMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/mcp$/);
      if (mcpMatch && req.method === "GET") {
        const sessionId = mcpMatch[1];
        const result = await bridge.getMcpStatus(sessionId);
        json(res, 200, result);
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // POST /api/sessions/:id/mcp/:serverName/reconnect — Reconnect MCP
      // ════════════════════════════════════════════════════════════════
      //
      // Reconnects a specific MCP server by name. Useful when an MCP
      // server drops its connection or needs to be restarted.
      const mcpReconnectMatch = pathname.match(
        /^\/api\/sessions\/([^/]+)\/mcp\/([^/]+)\/reconnect$/,
      );
      if (mcpReconnectMatch && req.method === "POST") {
        const sessionId = mcpReconnectMatch[1];
        const serverName = decodeURIComponent(mcpReconnectMatch[2]);
        await bridge.mcpReconnect(sessionId, serverName);
        console.log(`[test] Reconnected MCP server "${serverName}" for session ${sessionId.slice(0, 8)}`);
        json(res, 200, { ok: true });
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // PUT /api/sessions/:id/mcp/:serverName/toggle — Enable/disable MCP
      // ════════════════════════════════════════════════════════════════
      //
      // Enables or disables a specific MCP server without removing its
      // configuration. Disabled servers don't expose their tools.
      //
      // Body: { "enabled": true/false }
      const mcpToggleMatch = pathname.match(
        /^\/api\/sessions\/([^/]+)\/mcp\/([^/]+)\/toggle$/,
      );
      if (mcpToggleMatch && req.method === "PUT") {
        const sessionId = mcpToggleMatch[1];
        const serverName = decodeURIComponent(mcpToggleMatch[2]);
        const body = parseJsonBody(await readBody(req));
        const enabled = body.enabled !== false;
        await bridge.mcpToggle(sessionId, serverName, enabled);
        console.log(`[test] MCP "${serverName}" ${enabled ? "enabled" : "disabled"} for session ${sessionId.slice(0, 8)}`);
        json(res, 200, { ok: true, enabled });
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // POST /api/sessions/:id/tool-approval — Approve/deny a tool
      // ════════════════════════════════════════════════════════════════
      //
      // When Claude wants to use a tool (e.g., Bash, Edit, Write), it
      // sends a can_use_tool control_request. The bridge translates this
      // into a CUSTOM "tool_approval_request" AG-UI event. The frontend
      // displays the request and the user can approve or deny.
      //
      // Body for ALLOW:
      //   { "requestId": "...", "behavior": "allow",
      //     "updatedInput": { ...original or modified input... } }
      //
      // Body for DENY:
      //   { "requestId": "...", "behavior": "deny",
      //     "message": "Reason for denial", "interrupt": false }
      //
      // IMPORTANT: When allowing, updatedInput is MANDATORY — it replaces
      // the tool's input entirely. Pass the original input unchanged if
      // no modifications are needed.
      const toolApprovalMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/tool-approval$/);
      if (toolApprovalMatch && req.method === "POST") {
        const sessionId = toolApprovalMatch[1];
        const body = parseJsonBody(await readBody(req));
        const requestId = body.requestId as string;
        if (!requestId) {
          json(res, 400, { error: "requestId is required" });
          return;
        }

        if (body.behavior === "deny") {
          // Deny the tool use with an optional message
          await bridge.denyTool(
            sessionId,
            requestId,
            (body.message as string) || "Denied by user",
            (body.interrupt as boolean) || false,
          );
          console.log(`[test] Denied tool for session ${sessionId.slice(0, 8)}`);
        } else {
          // Approve the tool — updatedInput is MANDATORY
          await bridge.approveTool(sessionId, requestId, {
            behavior: "allow",
            updatedInput: body.updatedInput ?? body.originalInput,
          });
          console.log(`[test] Approved tool for session ${sessionId.slice(0, 8)}`);
        }
        json(res, 200, { ok: true });
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // PUT /api/sessions/:id/thinking — Set max thinking tokens
      // ════════════════════════════════════════════════════════════════
      //
      // Controls Claude's "thinking" budget for extended reasoning.
      // Higher values allow more thorough reasoning but cost more.
      //
      // Body: { "maxTokens": 16384 }     — set a specific limit
      //       { "maxTokens": null }       — remove the limit entirely
      const thinkingMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/thinking$/);
      if (thinkingMatch && req.method === "PUT") {
        const sessionId = thinkingMatch[1];
        const body = parseJsonBody(await readBody(req));
        const maxTokens = body.maxTokens as number | null;
        await bridge.setMaxThinkingTokens(sessionId, maxTokens ?? null);
        console.log(`[test] Set thinking tokens to ${maxTokens} for session ${sessionId.slice(0, 8)}`);
        json(res, 200, { ok: true, maxTokens });
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // PUT /api/sessions/:id/env — Update environment variables
      // ════════════════════════════════════════════════════════════════
      //
      // Updates environment variables in the running Claude CLI process.
      // Useful for passing API keys, feature flags, or config values
      // that the CLI or its tools need at runtime.
      //
      // Body: { "variables": { "KEY": "value", "ANOTHER": "value" } }
      const envMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/env$/);
      if (envMatch && req.method === "PUT") {
        const sessionId = envMatch[1];
        const body = parseJsonBody(await readBody(req));
        const variables = (body.variables as Record<string, string>) || {};
        await bridge.updateEnvironmentVariables(sessionId, variables);
        console.log(`[test] Updated env vars for session ${sessionId.slice(0, 8)}: ${Object.keys(variables).join(", ")}`);
        json(res, 200, { ok: true });
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // POST /api/sessions/:id/rewind — Rewind file changes
      // ════════════════════════════════════════════════════════════════
      //
      // Undoes file changes made after a specific message checkpoint.
      // Uses the rewind_files control request.
      //
      // Body: { "messageId": "...", "dryRun": false }
      //   dryRun=true returns what WOULD be reverted without doing it.
      const rewindMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/rewind$/);
      if (rewindMatch && req.method === "POST") {
        const sessionId = rewindMatch[1];
        const body = parseJsonBody(await readBody(req));
        const messageId = body.messageId as string;
        if (!messageId) {
          json(res, 400, { error: "messageId is required" });
          return;
        }
        const dryRun = (body.dryRun as boolean) || false;
        const result = await bridge.rewindFiles(sessionId, messageId, dryRun);
        console.log(`[test] Rewind ${dryRun ? "(dry run) " : ""}for session ${sessionId.slice(0, 8)}`);
        json(res, 200, result);
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // POST /api/sessions/:id/message — Send a message directly
      // ════════════════════════════════════════════════════════════════
      //
      // Sends a user message directly to Claude via the WebSocket,
      // bypassing CopilotKit's AG-UI protocol. Useful for programmatic
      // interactions or when the frontend needs to send messages outside
      // the normal chat flow.
      //
      // Body: { "content": "Hello, Claude!" }
      const messageMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/message$/);
      if (messageMatch && req.method === "POST") {
        const sessionId = messageMatch[1];
        const body = parseJsonBody(await readBody(req));
        const content = body.content as string;
        if (!content) {
          json(res, 400, { error: "content is required" });
          return;
        }
        await bridge.sendMessage(sessionId, content);
        console.log(`[test] Sent message to session ${sessionId.slice(0, 8)}`);
        json(res, 200, { ok: true });
        return;
      }

      // ════════════════════════════════════════════════════════════════
      // DELETE /api/sessions/:id — Kill and remove a session
      // ════════════════════════════════════════════════════════════════
      //
      // Kills the Claude CLI process (SIGTERM, then SIGKILL after 5s),
      // cleans up pending requests, and removes the session from state.
      // If this was the active session, another is auto-activated.
      const deleteMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (deleteMatch && req.method === "DELETE") {
        const sessionId = deleteMatch[1];
        await bridge.killSession(sessionId);
        console.log(`[test] Killed session ${sessionId.slice(0, 8)}`);
        json(res, 200, { ok: true });
        return;
      }

      // ── 404 ─────────────────────────────────────────────────────────
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

  mgmtServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`  [!] Management API port 3002 is already in use.`);
      console.error(`      Kill the old process or pick another port.`);
    } else {
      console.error(`  [!] Management API error: ${err.message}`);
    }
    // Don't crash — AG-UI + WebSocket still work without the mgmt API
  });

  mgmtServer.listen(3002, "127.0.0.1", () => {
    console.log(`  Management API:   http://localhost:3002`);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 5. SPAWN A DEFAULT SESSION
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Automatically spawn a session targeting the current working directory.
  // This provides a session immediately on startup so the user doesn't
  // have to manually create one.
  const sessionId = await bridge.spawnSession(process.cwd());
  console.log(`\n  Default session:  ${sessionId.slice(0, 8)} (${process.cwd()})`);
  console.log(`\n  Open http://localhost:5173 in your browser to chat!\n`);

  // ═════════════════════════════════════════════════════════════════════════
  // 6. GRACEFUL SHUTDOWN
  // ═════════════════════════════════════════════════════════════════════════
  //
  // bridge.stop() kills all CLI processes and closes both servers.
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
