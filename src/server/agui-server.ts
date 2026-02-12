import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { v4 as uuidv4 } from "uuid";
import type { AppState } from "./state.js";
import type { AguiEvent, RunAgentInput } from "./agui-events.js";
import type { WsEvent } from "./types.js";
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
    // Strip query string for route matching
    const pathname = url.split("?")[0];

    // Detect if path is a connect endpoint
    const isConnectPath =
      pathname === `/agent/${agentId}/connect` ||
      !!pathname.match(/^\/agent\/[^/]+\/connect$/);

    // Route matching
    if (pathname === "/info" || pathname === "/api/copilotkit/info") {
      handleInfo(req, res, agentId, agentDescription);
    } else if (isConnectPath) {
      if (req.method === "POST") {
        handleConnect(req, res, state, agentId);
      } else {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method Not Allowed");
      }
    } else if (
      pathname === `/agent/${agentId}/run` ||
      pathname === "/api/copilotkit"
    ) {
      if (req.method === "POST") {
        handleRun(req, res, state, agentId, false);
      } else {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method Not Allowed");
      }
    } else if (pathname.match(/^\/agent\/[^/]+\/run$/)) {
      if (req.method === "POST") {
        handleRun(req, res, state, agentId, false);
      } else {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method Not Allowed");
      }
    } else if (req.method === "POST") {
      // CopilotKit may POST to the runtimeUrl directly (single transport mode)
      // or to unexpected paths during agent connection. Handle all POSTs.
      console.log(`[bridge] Fallback POST handler for: ${pathname}`);
      handleSingleTransport(req, res, state, agentId);
    } else {
      console.log(`[bridge] Unmatched request: ${req.method} ${pathname}`);
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
  _req: IncomingMessage,
  res: ServerResponse,
  agentId: string,
  agentDescription: string,
): void {
  console.log("[bridge] /info endpoint hit");
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

/**
 * Handles the /agent/{id}/connect endpoint.
 *
 * CopilotKit calls this when initializing the agent connection (connectAgent).
 * It's a lifecycle handshake — no user message is expected.
 * We return a minimal SSE stream: RUN_STARTED → STATE_SNAPSHOT → RUN_FINISHED.
 */
function handleConnect(
  req: IncomingMessage,
  res: ServerResponse,
  _state: AppState,
  agentId: string,
): void {
  console.log(`[bridge] AG-UI connect request for agent: ${agentId}`);

  // Read request body (even though we mostly ignore it for connect)
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    let input: Partial<RunAgentInput> = {};
    try {
      if (body) input = JSON.parse(body);
    } catch {
      // Tolerate invalid JSON for connect — it's a handshake
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

    sendEvent({ type: "RUN_STARTED", threadId, runId });

    // Send a state snapshot so CopilotKit knows the agent is alive
    sendEvent({
      type: "STATE_SNAPSHOT",
      snapshot: {
        agentId,
        status: "connected",
      },
    });

    sendEvent({ type: "RUN_FINISHED", threadId, runId });
    res.end();
  });
}

/**
 * Handles single transport mode POSTs.
 *
 * CopilotKit can POST to the runtimeUrl directly with a `method` field
 * in the JSON body to indicate the intent (e.g., "info", "agent/connect",
 * "agent/run").
 */
function handleSingleTransport(
  req: IncomingMessage,
  res: ServerResponse,
  state: AppState,
  agentId: string,
): void {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    let parsed: Record<string, unknown> = {};
    try {
      if (body) parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Invalid JSON");
      return;
    }

    const method = typeof parsed.method === "string" ? parsed.method : "";
    // Single transport wraps the real input inside `body`:
    //   { method: "agent/run", params: { agentId: "..." }, body: { threadId, messages, ... } }
    const innerBody = (parsed.body && typeof parsed.body === "object" ? parsed.body : parsed) as Record<string, unknown>;
    console.log(`[bridge] Single transport: method="${method}" keys=${Object.keys(parsed).join(",")}`);

    if (method === "info") {
      // Single transport info request
      const infoBody = JSON.stringify({
        agents: {
          [agentId]: { description: "Claude Code AI agent" },
        },
        version: "1.0.0",
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(infoBody);
    } else if (method === "agent/connect") {
      // Single transport connect — same as handleConnect
      handleConnectFromInput(res, innerBody as Partial<RunAgentInput>, agentId);
    } else if (method === "agent/stop") {
      // Stop request — acknowledge and return
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } else if (method === "agent/run" || method === "") {
      // Run request (or unknown method — treat as run)
      handleRunFromInput(res, state, innerBody as RunAgentInput, agentId);
    } else {
      console.log(`[bridge] Unknown single transport method: "${method}"`);
      handleRunFromInput(res, state, innerBody as RunAgentInput, agentId);
    }
  });
}

function handleConnectFromInput(
  res: ServerResponse,
  input: Partial<RunAgentInput>,
  agentId: string,
): void {
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

  sendEvent({ type: "RUN_STARTED", threadId, runId });
  sendEvent({
    type: "STATE_SNAPSHOT",
    snapshot: { agentId, status: "connected" },
  });
  sendEvent({ type: "RUN_FINISHED", threadId, runId });
  res.end();
}

function handleRun(
  req: IncomingMessage,
  res: ServerResponse,
  state: AppState,
  agentId: string,
  _isConnect: boolean,
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

    handleRunFromInput(res, state, input, agentId);
  });
}

function handleRunFromInput(
  res: ServerResponse,
  state: AppState,
  input: RunAgentInput,
  agentId: string,
): void {
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
      // No user message — this may be a connect-style call or empty input.
      // Complete gracefully instead of erroring.
      sendEvent({ type: "RUN_FINISHED", threadId, runId });
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
