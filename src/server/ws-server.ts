import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { AppState } from "./state.js";
import type { ClaudeMessage, SystemMessage } from "./types.js";
import { parseClaudeMessage } from "./types.js";

/**
 * Starts the WebSocket server that Claude CLI processes connect to via --sdk-url.
 *
 * The server accepts connections at ws://127.0.0.1:{port}/ws/cli/{sessionId}.
 * The session ID is embedded in the URL path so we can associate each
 * CLI connection with the correct session immediately on connect.
 */
export function createWsServer(state: AppState): {
  httpServer: HttpServer;
  wss: WebSocketServer;
} {
  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws: WebSocket, req) => {
    const url = req.url ?? "";
    console.log(`[bridge] WebSocket connection from ${req.socket.remoteAddress} path=${url}`);

    // Extract session ID from URL path: /ws/cli/{sessionId}
    let sessionId = extractSessionId(url);

    // If we got a session ID from the URL, immediately associate the
    // WebSocket sender with that session.
    if (sessionId) {
      const session = state.sessions.get(sessionId);
      if (session) {
        session.wsSend = (data: string) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(data);
          }
        };
        console.log(`[bridge] Session ${sessionId} CLI connected (from URL path)`);
      } else {
        console.error(`[bridge] URL session_id ${sessionId} not found in state`);
      }
    }

    // Read loop: parse messages from Claude CLI.
    // Each WebSocket frame may contain a single JSON object or multiple
    // newline-delimited JSON objects (NDJSON).
    ws.on("message", (data) => {
      const text = data.toString();
      const lines = text.split("\n").filter((l) => l.trim().length > 0);

      for (const line of lines) {
        const claudeMsg = parseClaudeMessage(line.trim());
        if (!claudeMsg) {
          const preview = line.slice(0, 200);
          console.error(`[bridge] Failed to parse JSON: ${preview}`);
          continue;
        }

        // ── Handle system messages ──────────────────────────────
        if (claudeMsg.type === "system") {
          handleSystemMessage(state, sessionId, claudeMsg, ws);
        }

        // ── Handle control_response (for our server-initiated requests) ──
        if (claudeMsg.type === "control_response") {
          handleControlResponse(state, sessionId, claudeMsg);
        }

        // ── Mark Active on assistant/stream_event ────────────────
        if (claudeMsg.type === "assistant" || claudeMsg.type === "stream_event") {
          const session = state.sessions.get(sessionId ?? "");
          if (session && (session.status === "connected" || session.status === "idle")) {
            session.status = "active";
            state.emitSessionStatus(sessionId!, "active");
          }
        }

        // ── Mark Idle on result, update stats ────────────────────
        if (claudeMsg.type === "result") {
          const session = state.sessions.get(sessionId ?? "");
          if (session) {
            session.status = "idle";
            // Update cumulative stats from result
            if (typeof claudeMsg.total_cost_usd === "number") {
              session.totalCostUsd = claudeMsg.total_cost_usd;
            }
            if (typeof claudeMsg.num_turns === "number") {
              session.numTurns = claudeMsg.num_turns;
            }
            state.emitSessionStatus(sessionId!, "idle");
          }
        }

        // ── Store in message history ─────────────────────────────
        // Skip user echoes, system, keep_alive, auth_status
        if (
          claudeMsg.type !== "user" &&
          claudeMsg.type !== "system" &&
          claudeMsg.type !== "keep_alive" &&
          claudeMsg.type !== "auth_status"
        ) {
          const session = state.sessions.get(sessionId ?? "");
          if (session) {
            session.messageHistory.push(claudeMsg);
          }
        }

        // ── Broadcast to event bus ───────────────────────────────
        state.emitWsEvent({
          session_id: sessionId ?? "unknown",
          message: claudeMsg,
        });
        state.emitSessionMessage(sessionId ?? "unknown", claudeMsg);
      }
    });

    ws.on("close", () => {
      console.log(`[bridge] WebSocket connection closed for session ${sessionId}`);
      const session = state.sessions.get(sessionId ?? "");
      if (session) {
        session.status = "disconnected";
        session.wsSend = null;
        // Reject any pending control requests
        for (const [reqId, pending] of session.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(new Error("WebSocket connection closed"));
          session.pendingRequests.delete(reqId);
        }
        state.emitSessionStatus(sessionId!, "disconnected");
      }
    });

    ws.on("error", (err) => {
      console.error(`[bridge] WebSocket error for session ${sessionId}:`, err.message);
    });
  });

  return { httpServer, wss };
}

/**
 * Handle system messages from Claude CLI.
 * Captures capabilities from system/init and handles other system subtypes.
 */
function handleSystemMessage(
  state: AppState,
  sessionId: string | null,
  msg: ClaudeMessage,
  ws: WebSocket,
): void {
  if (msg.type !== "system") return;

  const session = state.sessions.get(sessionId ?? "");

  switch (msg.subtype) {
    case "init": {
      if (!sessionId) {
        sessionId = msg.session_id ?? "unknown";
      }

      const s = state.sessions.get(sessionId ?? "");
      if (s) {
        s.wsSend = (d: string) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(d);
          }
        };
        s.status = "connected";
        if (msg.session_id) {
          s.cliSessionId = msg.session_id;
        }

        // Capture full capabilities
        s.capabilities = {
          tools: msg.tools ?? [],
          model: msg.model ?? "unknown",
          permissionMode: msg.permissionMode ?? "default",
          cwd: msg.cwd ?? s.workingDir,
          claudeCodeVersion: msg.claude_code_version ?? "",
          slashCommands: msg.slash_commands ?? [],
          agents: msg.agents ?? [],
          skills: msg.skills ?? [],
          mcpServers: msg.mcp_servers ?? [],
          plugins: msg.plugins ?? [],
          outputStyle: msg.output_style ?? "",
          apiKeySource: msg.apiKeySource ?? "",
        };

        console.log(
          `[bridge] Session ${sessionId} system/init received (CLI session_id: ${msg.session_id})`,
        );
        console.log(
          `[bridge] Capabilities: model=${s.capabilities.model}, tools=${s.capabilities.tools.length}, ` +
          `commands=${s.capabilities.slashCommands.length}, agents=${s.capabilities.agents.length}, ` +
          `skills=${s.capabilities.skills.length}, mcp=${s.capabilities.mcpServers.length}`,
        );
        state.emitSessionStatus(sessionId!, "connected");
      } else {
        console.error(`[bridge] system/init: no session found for ${sessionId}`);
      }
      break;
    }

    case "status": {
      if (session) {
        const isCompacting = msg.status === "compacting";
        session.isCompacting = isCompacting;
        // Permission mode may change with status updates
        if (msg.permissionMode && session.capabilities) {
          session.capabilities.permissionMode = msg.permissionMode;
        }
        console.log(`[bridge] Session ${sessionId?.slice(0, 8)}: status=${msg.status ?? "idle"}`);
      }
      break;
    }

    case "task_notification": {
      console.log(
        `[bridge] Session ${sessionId?.slice(0, 8)}: task ${msg.task_id} ${msg.task_status}`,
      );
      break;
    }

    case "hook_started":
    case "hook_progress":
    case "hook_response": {
      console.log(
        `[bridge] Session ${sessionId?.slice(0, 8)}: ${msg.subtype} hook=${msg.hook_name}`,
      );
      break;
    }

    case "compact_boundary": {
      console.log(
        `[bridge] Session ${sessionId?.slice(0, 8)}: compact_boundary trigger=${msg.compact_metadata?.trigger}`,
      );
      break;
    }

    case "files_persisted": {
      console.log(
        `[bridge] Session ${sessionId?.slice(0, 8)}: files_persisted count=${msg.files?.length ?? 0}`,
      );
      break;
    }

    default: {
      const unknownSubtype: string = (msg as SystemMessage).subtype;
      console.log(`[bridge] Session ${sessionId?.slice(0, 8)}: unknown system subtype "${unknownSubtype}"`);
      break;
    }
  }
}

/**
 * Handle control_response messages from CLI (responses to our server-initiated requests).
 * Routes the response to the correct pending request resolver.
 */
function handleControlResponse(
  state: AppState,
  sessionId: string | null,
  msg: ClaudeMessage,
): void {
  // The CLI sends control_response when responding to our server-initiated control_requests
  // (e.g., initialize, set_model, mcp_status). The response has a request_id that we correlate
  // with our pending request map.
  if (msg.type !== "control_response" || !msg.response) return;

  const response = msg.response;
  const requestId = response.request_id;
  if (!requestId) return;

  const session = state.sessions.get(sessionId ?? "");
  if (!session) return;

  const pending = session.pendingRequests.get(requestId);
  if (!pending) return;

  clearTimeout(pending.timer);
  session.pendingRequests.delete(requestId);

  if (response.subtype === "error") {
    pending.reject(new Error(response.error ?? "Control request failed"));
  } else {
    pending.resolve(response.response ?? {});
  }
}

/**
 * Extract session ID from the WebSocket upgrade request path.
 * Expects /ws/cli/{sessionId}.
 */
function extractSessionId(path: string): string | null {
  const parts = path.split("/");
  // /ws/cli/{sessionId} -> ["", "ws", "cli", "{sessionId}"]
  if (parts.length >= 4 && parts[1] === "ws" && parts[2] === "cli" && parts[3]) {
    return parts[3];
  }
  return null;
}
