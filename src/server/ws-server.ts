import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { AppState } from "./state.js";
import type { ClaudeMessage } from "./types.js";
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

        // Handle system/init
        if (claudeMsg.type === "system" && claudeMsg.subtype === "init") {
          if (!sessionId) {
            // Fall back to session_id from the init message
            sessionId = claudeMsg.session_id ?? "unknown";
          }

          const session = state.sessions.get(sessionId ?? "");
          if (session) {
            session.wsSend = (d: string) => {
              if (ws.readyState === ws.OPEN) {
                ws.send(d);
              }
            };
            session.status = "connected";
            if (claudeMsg.session_id) {
              session.cliSessionId = claudeMsg.session_id;
            }

            console.log(
              `[bridge] Session ${sessionId} system/init received (CLI session_id: ${claudeMsg.session_id})`,
            );
            state.emitSessionStatus(sessionId!, "connected");
          } else {
            console.error(`[bridge] system/init: no session found for ${sessionId}`);
          }
        }

        // Mark Active on assistant/stream_event
        if (claudeMsg.type === "assistant" || claudeMsg.type === "stream_event") {
          const session = state.sessions.get(sessionId ?? "");
          if (session && (session.status === "connected" || session.status === "idle")) {
            session.status = "active";
            state.emitSessionStatus(sessionId!, "active");
          }
        }

        // Mark Idle on result
        if (claudeMsg.type === "result") {
          const session = state.sessions.get(sessionId ?? "");
          if (session) {
            session.status = "idle";
            state.emitSessionStatus(sessionId!, "idle");
          }
        }

        // Store in message history (skip user echoes, system, keep_alive, auth_status)
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

        // Broadcast to event bus
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
