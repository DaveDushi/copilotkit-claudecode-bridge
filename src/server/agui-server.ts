import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { v4 as uuidv4 } from "uuid";
import type { AppState } from "./state.js";
import type { AguiEvent, RunAgentInput } from "./agui-events.js";
import type { ClaudeMessage, WsEvent } from "./types.js";
import { BridgeState, translateClaudeMessage } from "./bridge.js";

export interface AguiServerConfig {
  agentId?: string;
  agentDescription?: string;
  corsOrigins?: string[];
}

/**
 * Creates the HTTP server with AG-UI endpoints.
 *
 * CopilotKit uses the AG-UI protocol with these endpoints:
 *   - POST /agent/{agentId}/run  — main SSE streaming endpoint
 *   - POST /agent/{agentId}/connect — alias for run
 *   - GET  /info                 — agent discovery
 *   - POST /info                 — agent discovery (single transport)
 */
export function createAguiServer(
  state: AppState,
  config: AguiServerConfig = {},
): HttpServer {
  const agentId = config.agentId ?? "default";
  const agentDescription = config.agentDescription ?? "Claude Code AI agent";
  const corsOrigins = config.corsOrigins ?? ["*"];

  const server = createServer((req, res) => {
    // CORS headers
    setCorsHeaders(res, corsOrigins);

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? "";

    // Route matching
    if (url === "/info" || url === "/api/copilotkit/info") {
      handleInfo(req, res, agentId, agentDescription);
    } else if (
      url === `/agent/${agentId}/run` ||
      url === `/agent/${agentId}/connect` ||
      url === "/api/copilotkit"
    ) {
      if (req.method === "POST") {
        handleRun(req, res, state, agentId);
      } else {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method Not Allowed");
      }
    } else {
      console.log(`[bridge] Unmatched request: ${req.method} ${url}`);
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  });

  return server;
}

function setCorsHeaders(res: ServerResponse, origins: string[]): void {
  res.setHeader("Access-Control-Allow-Origin", origins.join(", "));
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function handleInfo(
  req: IncomingMessage,
  res: ServerResponse,
  agentId: string,
  agentDescription: string,
): void {
  console.log(`[bridge] /info endpoint hit (${req.method})`);
  const body = JSON.stringify({
    agents: {
      [agentId]: {
        description: agentDescription,
      },
    },
    version: "1.0.0",
  });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(body);
}

function handleRun(
  req: IncomingMessage,
  res: ServerResponse,
  state: AppState,
  agentId: string,
): void {
  console.log(`[bridge] AG-UI run request for agent: ${agentId}`);

  // Read request body
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    let input: RunAgentInput;
    try {
      input = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Invalid JSON");
      return;
    }

    // Set up SSE response
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const threadId = input.threadId ?? uuidv4();
    const runId = input.runId ?? uuidv4();

    const sendEvent = (event: AguiEvent) => {
      const json = JSON.stringify(event);
      res.write(`data: ${json}\n\n`);
    };

    // 1. Emit RunStarted
    sendEvent({ type: "RUN_STARTED", threadId, runId });

    // 2. Extract last user message from CopilotKit input
    const userMessage = extractUserMessage(input);

    if (!userMessage) {
      sendEvent({
        type: "RUN_ERROR",
        threadId,
        runId,
        message: "No user message provided",
      });
      res.end();
      return;
    }

    // 3a. Build readable context from CopilotKit's context array
    const readableContext = buildReadableContext(input.context);

    // 3b. Build tool context from CopilotKit's tools array
    const toolsContext = buildToolsContext(input.tools);

    // 4. Combine contexts + user message
    const fullMessage = `${readableContext}${toolsContext}${userMessage}`;

    // 5. Find the active session and send the message
    startBridgeLoop(state, res, sendEvent, threadId, runId, fullMessage, userMessage);
  });
}

function extractUserMessage(input: RunAgentInput): string | null {
  if (!input.messages) return null;

  for (let i = input.messages.length - 1; i >= 0; i--) {
    const msg = input.messages[i];
    if (msg.role === "user" && typeof msg.content === "string") {
      return msg.content;
    }
  }
  return null;
}

function buildReadableContext(context?: Array<Record<string, unknown>>): string {
  if (!context || context.length === 0) return "";

  const parts: string[] = [];
  for (const c of context) {
    const desc = typeof c.description === "string" ? c.description : "";
    const value = c.value;
    if (value == null) continue;

    const valStr = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (!valStr || valStr === "null") continue;

    parts.push(`[${desc}]\n${valStr}`);
  }

  if (parts.length === 0) return "";

  return `\n\n[CURRENT WORKSPACE STATE — the user can edit these fields directly. Always read the latest values from here before responding:]\n${parts.join("\n\n")}\n\n`;
}

function buildToolsContext(tools?: Array<Record<string, unknown>>): string {
  if (!tools || tools.length === 0) return "";

  const descriptions: string[] = [];
  for (const t of tools) {
    const name = typeof t.name === "string" ? t.name : null;
    if (!name) continue;

    const desc = typeof t.description === "string" ? t.description : "No description";
    const schema = t.jsonSchema ?? t.parameters;
    const schemaStr = schema ? JSON.stringify(schema) : "none";

    descriptions.push(`- **${name}**: ${desc}\n  Parameters: ${schemaStr}`);
  }

  if (descriptions.length === 0) return "";

  return `\n\n[AVAILABLE UI ACTIONS - You can call these as tool_use to render rich UI components in the chat for the user:]\n${descriptions.join("\n")}\n\nTo use an action, output a tool_use block with the action name and parameters.\n\n`;
}

function startBridgeLoop(
  state: AppState,
  res: ServerResponse,
  sendEvent: (event: AguiEvent) => void,
  threadId: string,
  runId: string,
  fullMessage: string,
  userMessage: string,
): void {
  // Wait up to 15s for a CLI to connect (handles race where
  // CopilotKit sends a message before Claude CLI finishes connecting).
  const maxAttempts = 30;
  let attempt = 0;

  const tryFindSession = () => {
    for (const [, session] of state.sessions) {
      if (session.wsSend) {
        return session;
      }
    }
    return null;
  };

  const pollForSession = () => {
    const session = tryFindSession();

    if (session) {
      if (attempt > 0) {
        console.log(`[bridge] AG-UI found active session after ${attempt * 500}ms wait`);
      }

      // Store user message in history
      session.messageHistory.push({
        type: "user_message",
        content: userMessage,
        timestamp: Date.now(),
        id: `user-${Date.now()}`,
      });

      // Send message to Claude CLI via WebSocket
      const msg = JSON.stringify({
        type: "user",
        message: { role: "user", content: fullMessage },
        parent_tool_use_id: null,
        session_id: session.cliSessionId ?? "",
      });
      session.wsSend!(`${msg}\n`);

      // Subscribe to Claude events and translate to AG-UI
      const bridge = new BridgeState();
      const handler = (wsEvent: WsEvent) => {
        const aguiEvents = translateClaudeMessage(
          wsEvent.message,
          threadId,
          runId,
          bridge,
        );

        let isFinished = false;
        for (const event of aguiEvents) {
          if (event.type === "RUN_FINISHED") {
            isFinished = true;
          }
          sendEvent(event);
        }

        if (isFinished || wsEvent.message.type === "result") {
          state.offWsEvent(handler);
          res.end();
        }
      };

      state.onWsEvent(handler);

      // Clean up on client disconnect
      res.on("close", () => {
        state.offWsEvent(handler);
      });
    } else {
      attempt++;
      if (attempt >= maxAttempts) {
        console.log("[bridge] AG-UI: No session with wsSend found after 15s wait");
        sendEvent({
          type: "RUN_ERROR",
          threadId,
          runId,
          message: "No active Claude session. Start a session first.",
        });
        res.end();
      } else {
        setTimeout(pollForSession, 500);
      }
    }
  };

  // Log session state on first attempt
  const sessionInfo = Array.from(state.sessions.entries()).map(
    ([id, s]) =>
      `${id.slice(0, 8)}(ws=${!!s.wsSend}, status=${typeof s.status === "string" ? s.status : "error"})`,
  );
  console.log(
    `[bridge] AG-UI looking for active session. ${state.sessions.size} session(s): [${sessionInfo.join(", ")}]`,
  );

  pollForSession();
}
