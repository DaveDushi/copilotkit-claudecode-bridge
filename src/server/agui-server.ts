import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { v4 as uuidv4 } from "uuid";
import type { AppState } from "./state.js";
import type { AguiEvent, RunAgentInput } from "./agui-events.js";
import type { WsEvent } from "./types.js";
import type { Session } from "./session.js";
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
  state: AppState,
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

    const threadId = input.threadId ?? uuidv4();
    const runId = input.runId ?? uuidv4();

    const lines: string[] = [];
    const push = (event: Record<string, unknown>) => {
      lines.push(`data: ${JSON.stringify(event)}`, "");
    };

    push({ type: "RUN_STARTED", threadId, runId });

    // Build snapshot with session capabilities
    const session = state.activeSessionId
      ? state.sessions.get(state.activeSessionId)
      : null;

    push({
      type: "STATE_SNAPSHOT",
      snapshot: buildCapabilitiesSnapshot(agentId, session),
    });

    // Replay message history from the active session
    if (session && session.messageHistory.length > 0) {
      replayHistory(session.messageHistory, runId, push);
    }

    push({ type: "RUN_FINISHED", threadId, runId });
    lines.push("");

    const body2 = lines.join("\n");
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "close",
      "Content-Length": Buffer.byteLength(body2),
    });
    res.end(body2);
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
      // Single transport connect — replay message history if available
      handleConnectFromInput(res, state, innerBody as Partial<RunAgentInput>, agentId);
    } else if (method === "agent/stop") {
      // Stop request — interrupt the active Claude CLI session so it aborts
      // the current turn. This unblocks the SSE response from handleRunFromInput
      // because Claude CLI will send a `result` message which triggers RUN_FINISHED.
      handleStop(state);
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
  state: AppState,
  input: Partial<RunAgentInput>,
  agentId: string,
): void {
  const threadId = input.threadId ?? uuidv4();
  const runId = input.runId ?? uuidv4();

  const lines: string[] = [];
  const push = (event: Record<string, unknown>) => {
    lines.push(`data: ${JSON.stringify(event)}`, "");
  };

  push({ type: "RUN_STARTED", threadId, runId });

  // Build snapshot with session capabilities
  const session = state.activeSessionId
    ? state.sessions.get(state.activeSessionId)
    : null;

  push({
    type: "STATE_SNAPSHOT",
    snapshot: buildCapabilitiesSnapshot(agentId, session),
  });

  // Replay message history from the active session so the UI shows prior chat
  if (session && session.messageHistory.length > 0) {
    replayHistory(session.messageHistory, runId, push);
  }

  push({ type: "RUN_FINISHED", threadId, runId });
  lines.push(""); // trailing newline

  const body = lines.join("\n");
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "close",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
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

    // 2. Check for frontend tool results (role: "tool" messages).
    //    When CopilotKit's useCopilotAction handler returns a value,
    //    CopilotKit re-invokes agent/run with the result as a role:"tool"
    //    message. We forward these to Claude CLI as tool_result blocks
    //    so Claude knows the frontend action succeeded.
    const toolResults = extractToolResults(input);
    if (toolResults.length > 0) {
      console.log(`[bridge] Forwarding ${toolResults.length} frontend tool result(s) to Claude CLI`);
      startToolResultBridge(state, res, sendEvent, threadId, runId, toolResults);
      return;
    }

    // 3. Extract last user message from CopilotKit input
    const userMessage = extractUserMessage(input);

    if (!userMessage) {
      // No user message and no tool results — connect-style call or empty input.
      sendEvent({ type: "RUN_FINISHED", threadId, runId });
      res.end();
      return;
    }

    // 4a. Build readable context from CopilotKit's context array
    const readableContext = buildReadableContext(input.context);

    // 4b. Build tool context from CopilotKit's tools array
    const toolsContext = buildToolsContext(input.tools);

    // 5. Combine contexts + user message
    const fullMessage = `${readableContext}${toolsContext}${userMessage}`;

    // 6. Find the active session and send the message
    startBridgeLoop(state, res, sendEvent, threadId, runId, fullMessage, userMessage);
}

/**
 * Interrupt the active Claude CLI session.
 *
 * Sends an `interrupt` control request via WebSocket. Claude CLI will
 * abort the current turn and send a `result` message, which the bridge's
 * event handler translates into RUN_FINISHED — closing the SSE response
 * and unblocking CopilotKit's UI.
 */
function handleStop(state: AppState): void {
  const session = state.activeSessionId
    ? state.sessions.get(state.activeSessionId)
    : null;

  if (!session?.wsSend) {
    // Try any session with an open WebSocket
    for (const [, s] of state.sessions) {
      if (s.wsSend) {
        sendInterrupt(s);
        return;
      }
    }
    console.log("[bridge] agent/stop: no session to interrupt");
    return;
  }

  sendInterrupt(session);
}

function sendInterrupt(session: Session): void {
  const requestId = uuidv4();
  const msg = JSON.stringify({
    type: "control_request",
    request_id: requestId,
    request: { subtype: "interrupt" },
  });
  session.wsSend!(`${msg}\n`);
  console.log(`[bridge] Sent interrupt to session ${session.id.slice(0, 8)}`);
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

/**
 * Extract frontend tool results from CopilotKit's message array.
 *
 * When a useCopilotAction handler returns a value, CopilotKit adds a
 * role:"tool" message and re-invokes agent/run. We detect these and
 * forward them to Claude CLI so it knows the action succeeded.
 */
function extractToolResults(input: RunAgentInput): Array<{ toolCallId: string; content: string }> {
  if (!input.messages) return [];

  const results: Array<{ toolCallId: string; content: string }> = [];

  // Look at messages from the end — tool results come after the assistant's tool calls.
  // We only want NEW tool results (ones not yet forwarded to Claude).
  // CopilotKit sends the full history, so we look for tool messages that appear
  // after the last assistant message.
  let foundAssistant = false;
  for (let i = input.messages.length - 1; i >= 0; i--) {
    const msg = input.messages[i];

    if (msg.role === "tool") {
      const toolCallId = (msg.toolCallId ?? msg.tool_call_id ?? "") as string;
      if (toolCallId) {
        const content = typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content ?? "");
        results.push({ toolCallId, content });
      }
    } else if (msg.role === "assistant") {
      // Stop once we hit the assistant message that triggered these tool calls
      foundAssistant = true;
      break;
    } else if (msg.role === "user") {
      // If we hit a user message before an assistant, these aren't new tool results
      break;
    }
  }

  return results;
}

/**
 * Forward frontend tool results to Claude CLI and bridge the response.
 *
 * This handles the case where CopilotKit re-invokes agent/run to deliver
 * the results of useCopilotAction handlers. We send them to Claude as
 * tool_result content blocks in a user message, then stream Claude's
 * response back through the normal bridge translation.
 */
function startToolResultBridge(
  state: AppState,
  res: ServerResponse,
  sendEvent: (event: AguiEvent) => void,
  threadId: string,
  runId: string,
  toolResults: Array<{ toolCallId: string; content: string }>,
): void {
  const session = state.activeSessionId
    ? state.sessions.get(state.activeSessionId)
    : null;

  if (!session?.wsSend) {
    // No active session — try to find any session with a connection
    for (const [, s] of state.sessions) {
      if (s.wsSend) {
        sendToolResults(s, toolResults);
        bridgeResponse(state, s, res, sendEvent, threadId, runId);
        return;
      }
    }
    // No session at all — finish gracefully
    console.log("[bridge] No session available for tool results, finishing run");
    sendEvent({ type: "RUN_FINISHED", threadId, runId });
    res.end();
    return;
  }

  sendToolResults(session, toolResults);
  bridgeResponse(state, session, res, sendEvent, threadId, runId);
}

/**
 * Send tool_result content blocks to Claude CLI via WebSocket.
 * Claude expects these as a user message with content: ToolResultBlock[].
 */
function sendToolResults(
  session: Session,
  toolResults: Array<{ toolCallId: string; content: string }>,
): void {
  const resultBlocks = toolResults.map((r) => ({
    type: "tool_result" as const,
    tool_use_id: r.toolCallId,
    content: r.content,
  }));

  const msg = JSON.stringify({
    type: "user",
    message: { role: "user", content: resultBlocks },
    parent_tool_use_id: null,
    session_id: session.cliSessionId ?? "",
  });

  session.wsSend!(`${msg}\n`);
}

/**
 * Subscribe to Claude's response events and stream them as AG-UI SSE.
 * Used by both the normal user message path and the tool result path.
 */
function bridgeResponse(
  state: AppState,
  session: Session,
  res: ServerResponse,
  sendEvent: (event: AguiEvent) => void,
  threadId: string,
  runId: string,
): void {
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

  res.on("close", () => {
    state.offWsEvent(handler);
  });
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

  return `\n\n[AVAILABLE FRONTEND ACTIONS — these are intercepted by a middleware layer BEFORE reaching your tool executor. They WILL execute successfully on the user's UI even if you see an error like "No such tool". DO NOT retry, apologize, or investigate if you get an error after calling one of these — the action already succeeded on the frontend. Just continue naturally as if it worked.]\n${descriptions.join("\n")}\n\nTo use an action, output a tool_use block with the action name and parameters. The middleware intercepts and executes it in the browser — you may see a spurious error from the CLI, IGNORE IT.\n\n`;
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
    // Prefer the explicitly active session
    if (state.activeSessionId) {
      const active = state.sessions.get(state.activeSessionId);
      if (active?.wsSend) return active;
    }
    // Fall back to any session with an open WebSocket
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

/**
 * Build a capabilities snapshot from the active session to include in STATE_SNAPSHOT events.
 * This exposes slash_commands, skills, agents, mcp_servers, model, permissionMode, etc.
 * to the CopilotKit frontend.
 */
function buildCapabilitiesSnapshot(
  agentId: string,
  session: Session | null | undefined,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    agentId,
    status: session ? "connected" : "disconnected",
  };

  if (!session) return base;

  const caps = session.capabilities;
  if (caps) {
    base.model = caps.model;
    base.permissionMode = caps.permissionMode;
    base.tools = caps.tools;
    base.cwd = caps.cwd;
    base.claudeCodeVersion = caps.claudeCodeVersion;
    base.slashCommands = caps.slashCommands;
    base.agents = caps.agents;
    base.skills = caps.skills;
    base.mcpServers = caps.mcpServers;
    base.plugins = caps.plugins;
    base.apiKeySource = caps.apiKeySource;
  }

  const initData = session.initData;
  if (initData) {
    base.commands = initData.commands;
    base.models = initData.models;
    base.account = initData.account;
    base.fastMode = initData.fastMode;
  }

  base.isCompacting = session.isCompacting;
  base.totalCostUsd = session.totalCostUsd;
  base.numTurns = session.numTurns;
  base.sessionId = session.cliSessionId;

  return base;
}

/**
 * Replays a session's message history as AG-UI events during an agent/connect
 * response. This lets CopilotKit repopulate the chat UI when switching sessions.
 *
 * We walk the messageHistory and emit:
 *  - User messages  → TEXT_MESSAGE_START(role=user) + CONTENT + END
 *  - Assistant text → TEXT_MESSAGE_START(role=assistant) + CONTENT + END
 *  - Tool calls are omitted (implementation details, not user-facing chat)
 */
function replayHistory(
  history: unknown[],
  runId: string,
  push: (event: Record<string, unknown>) => void,
): void {
  let msgCounter = 0;

  for (const entry of history) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    // User messages stored by our AG-UI handler
    if (e.type === "user_message" && typeof e.content === "string") {
      const msgId = `${runId}-replay-${msgCounter++}`;
      push({ type: "TEXT_MESSAGE_START", messageId: msgId, role: "user" });
      push({ type: "TEXT_MESSAGE_CONTENT", messageId: msgId, delta: e.content });
      push({ type: "TEXT_MESSAGE_END", messageId: msgId });
      continue;
    }

    // Assistant messages from Claude CLI (final complete message with content blocks)
    if (e.type === "assistant") {
      const msg = e.message as Record<string, unknown> | undefined;
      const content = msg?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;

        if (b.type === "text" && typeof b.text === "string") {
          const msgId = `${runId}-replay-${msgCounter++}`;
          push({ type: "TEXT_MESSAGE_START", messageId: msgId, role: "assistant" });
          push({ type: "TEXT_MESSAGE_CONTENT", messageId: msgId, delta: b.text });
          push({ type: "TEXT_MESSAGE_END", messageId: msgId });
        }
      }
      continue;
    }

    // stream_event, result, control_request etc. — skip during replay
  }
}
