# copilotkit-claude-bridge — Bridge Library Documentation

## Overview

**copilotkit-claude-bridge** is a TypeScript library that connects [CopilotKit](https://copilotkit.ai) (AG-UI protocol) to [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (NDJSON/WebSocket protocol). It spawns Claude Code CLI processes in SDK mode, translates their streaming NDJSON messages into AG-UI Server-Sent Events, and serves an HTTP endpoint that CopilotKit's React frontend connects to. This gives any CopilotKit app a full Claude Code-powered agent with tool approval, model switching, permission modes, MCP servers, slash commands, and more.

The library runs **three servers**: an HTTP server for CopilotKit (AG-UI), a WebSocket server for Claude CLI connections, and an optional MCP server that exposes CopilotKit frontend actions as tools Claude can call.

---

## Architecture

```
                          CopilotKit React Frontend
                                    |
                    POST http://localhost:3000
                    { method: "agent/run", body: { messages, tools, context } }
                                    v
                  +-----------------------------------+
                  |  AG-UI HTTP Server (:3000)        |   <-- single-endpoint transport
                  |  agui-server.ts                   |       info / connect / run / stop
                  +---------+-------------------------+
                            |
                     translateClaudeMessage()
                     (bridge.ts — BridgeState)
                            |
                  +---------+-------------------------+
                  |  WebSocket Server (:3001)         |   <-- NDJSON over WebSocket
                  |  ws-server.ts                     |
                  +---------+-------------------------+
                            |
              ws://127.0.0.1:3001/ws/cli/{sessionId}
                            v
                     Claude Code CLI
                     (spawned with --sdk-url)
                            |
                  +---------+-------------------------+
                  |  Frontend Tools MCP (:random)     |   <-- optional, JSON-RPC over HTTP
                  |  frontend-tools-mcp.ts            |       exposes useCopilotAction tools
                  +-----------------------------------+
```

---

## File Tree

```
src/
  index.ts                       Main exports (re-exports everything public)
  CopilotKitClaudeBridge.ts      Facade class — the public API for consumers
  server/
    types.ts                     Protocol types: ClaudeMessage, 13 control subtypes, MCP, permissions
    session.ts                   Session interface, SessionCapabilities, SessionInitData, createSession()
    state.ts                     AppState (EventEmitter) — shared state + event bus
    process.ts                   spawnClaude(), monitorProcess(), checkClaudeCli()
    ws-server.ts                 WebSocket server — receives NDJSON from CLI, routes control_response
    bridge.ts                    BridgeState + translateClaudeMessage() — Claude→AG-UI translation
    agui-server.ts               HTTP server — single-endpoint transport, history replay, capabilities
    agui-events.ts               AG-UI event type definitions (11 event types)
    frontend-tools-mcp.ts        MCP server exposing CopilotKit actions as tools for Claude CLI
  react/
    index.ts                     React exports
    useClaudeBridge.ts           Hook that creates HttpAgent props for <CopilotKit>
```

---

## Core Concepts

### Sessions

A **session** represents one Claude Code CLI process connected via WebSocket. Each session has:

- A **working directory** (the folder Claude operates in)
- A **status lifecycle**: `starting` → `connected` → `active` → `idle` → `disconnected` → `terminated`
- **Capabilities** (populated on `system/init`): tools, model, permission mode, slash commands, agents, skills, MCP servers
- **Init data** (populated after `sendInitialize()`): available models, commands, account info
- **Message history**: stored for replay when CopilotKit reconnects
- **Pending requests**: a `Map<requestId, {resolve, reject, timer}>` for correlating control request/response pairs

The bridge supports **multiple concurrent sessions**. One session is "active" at a time — it receives all AG-UI run requests from CopilotKit. You can switch the active session with `setActiveSession()`.

### Single-Endpoint Transport

CopilotKit v1.51+ uses **single-endpoint transport**: all requests are POSTed to the `runtimeUrl` with a JSON envelope:

```json
{ "method": "agent/run", "params": { "agentId": "default" }, "body": { "threadId": "...", "messages": [...], "tools": [...], "context": [...] } }
```

The bridge's `handleSingleTransport()` unwraps this envelope and routes based on the `method` field:
- `"info"` → returns agent discovery JSON
- `"agent/connect"` → lifecycle handshake (STATE_SNAPSHOT + history replay)
- `"agent/run"` → send message to Claude, stream response back
- `"agent/stop"` → interrupt the active session

### Control Requests

The bridge communicates with Claude CLI bidirectionally via WebSocket:

**CLI → Server** (inbound): `ClaudeMessage` types parsed from NDJSON lines
**Server → CLI** (outbound): `ServerMessage` types sent as NDJSON lines

For features like `initialize`, `set_model`, `set_permission_mode`, and MCP management, the bridge sends **server-initiated control requests** to the CLI and waits for a `control_response` with a matching `request_id`. This uses the `pendingRequests` Map on the Session for async correlation:

```
Bridge sends:    { type: "control_request", request_id: "abc", request: { subtype: "set_model", model: "claude-opus-4-6" } }
CLI responds:    { type: "control_response", response: { subtype: "success", request_id: "abc", response: {} } }
```

The pending promise resolves or rejects based on `response.subtype` ("success" or "error").

### Tool Approval

When Claude CLI wants to use a tool (Bash, Write, Edit, etc.), it sends a `control_request` with `subtype: "can_use_tool"`. The bridge:

1. Translates this into a `CUSTOM` AG-UI event with name `"tool_approval_request"`
2. Emits it on the `session:message` event bus
3. Waits for the server-side code (or management API) to call `approveTool()` or `denyTool()`
4. Sends a `control_response` back to the CLI with the approval/denial

**Critical**: When approving, `updatedInput` is **mandatory** — it replaces the tool's input entirely. Pass the original input unchanged if no modifications are needed:

```ts
bridge.approveTool(sessionId, requestId, {
  behavior: "allow",
  updatedInput: originalToolInput,  // REQUIRED — cannot be omitted
});
```

### Frontend Tools MCP

CopilotKit registers frontend actions (via `useCopilotAction`) that run in the browser — things like `spawnCanvas`, `addTask`, `updateScratchpad`. Claude CLI doesn't know about these tools and would reject `tool_use` blocks for them.

The **Frontend Tools MCP** solves this by running a small HTTP MCP server:

1. On each `agent/run`, the bridge extracts CopilotKit's `tools` array and registers them with the MCP server
2. The MCP server is registered with Claude CLI via `mcp_set_servers`
3. When Claude calls a frontend tool, CLI routes it through MCP to our server
4. Our server returns an immediate "success" acknowledgment
5. Meanwhile, the bridge's streaming pipeline already sent the `TOOL_CALL` events to CopilotKit, so the frontend action executes in the browser

This is a dual-path approach: Claude CLI sees a successful MCP tool call, and CopilotKit sees normal TOOL_CALL AG-UI events.

### Context Injection

When CopilotKit sends an `agent/run` request, it includes:
- `messages[]` — chat history with the latest user message
- `tools[]` — registered frontend actions (useCopilotAction)
- `context[]` — readable state (useCopilotReadable)

The bridge prepends context and tool descriptions to the user message before sending to Claude:

```
[CURRENT WORKSPACE STATE — ...]
[scratchpad]
Current content of the scratchpad...

[tasks]
[{"id":"1","text":"Review PR","done":false}]

[AVAILABLE FRONTEND ACTIONS — ...]
- **spawnCanvas**: Create or update a visualization on the canvas
  Parameters: {"type":"object","properties":{"type":{"type":"string"},...}}

<actual user message>
```

This is done in `buildReadableContext()` and `buildToolsContext()` in `agui-server.ts`.

### Frontend Tool Results

When a `useCopilotAction` handler returns a value, CopilotKit re-invokes `agent/run` with a `role: "tool"` message containing the result. The bridge detects these, extracts them via `extractToolResults()`, and forwards them to Claude CLI as `tool_result` content blocks in a user message. This closes the tool-call loop so Claude knows the action succeeded and can continue.

### History Replay

On `agent/connect` (lifecycle handshake), the bridge replays the active session's message history as AG-UI events:
- User messages → `TEXT_MESSAGE_START(role=user)` + `CONTENT` + `END`
- Assistant text blocks → `TEXT_MESSAGE_START(role=assistant)` + `CONTENT` + `END`
- Tool calls, results, system messages → skipped (not user-facing chat)

This lets CopilotKit repopulate the chat UI when reconnecting or switching sessions.

### Connect Response Format

Connect responses (`agent/connect`) are written as a **complete body** with `Connection: close` and `Content-Length` headers. This is critical — without these headers, the browser's `fetch()` call hangs because it waits for more data on a keep-alive connection. The run endpoint (`agent/run`) uses `Connection: keep-alive` for streaming SSE.

---

## Data Flow Walkthroughs

### 1. User Sends a Message

```
1. User types in CopilotKit chat UI
2. CopilotKit POSTs to runtimeUrl:
   { method: "agent/run", body: { messages: [..., {role:"user", content:"..."}], tools: [...], context: [...] } }
3. agui-server.ts handleSingleTransport() → handleRunFromInput()
4. extractToolResults() returns empty → not a tool result callback
5. extractUserMessage() returns last role:"user" message
6. buildReadableContext() + buildToolsContext() prepend to user message
7. startBridgeLoop() polls for a session with wsSend (up to 15s)
8. Sends to Claude CLI via WebSocket:
   { type: "user", message: { role: "user", content: "<context + user message>" }, parent_tool_use_id: null, session_id: "..." }
9. BridgeState created, handler subscribed to ws_event bus
10. Claude CLI streams back NDJSON messages:
    - stream_event(content_block_start, type=text) → TEXT_MESSAGE_START
    - stream_event(content_block_delta, text_delta)  → TEXT_MESSAGE_CONTENT
    - stream_event(content_block_stop)              → TEXT_MESSAGE_END
    - result                                         → CUSTOM(result_stats) + RUN_FINISHED
11. Each AG-UI event is written as SSE: data: {...}\n\n
12. On RUN_FINISHED, handler unsubscribes and res.end()
```

### 2. Tool Approval Flow

```
1. Claude decides to use Bash tool
2. CLI sends: { type: "control_request", request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "ls" }, request_id: "xyz" } }
3. ws-server.ts receives, broadcasts via emitWsEvent() + emitSessionMessage()
4. bridge.ts translateClaudeMessage() → CUSTOM event { name: "tool_approval_request", value: { requestId, toolName, toolInput } }
5. AG-UI SSE sends this to CopilotKit frontend
6. Management API (if used) also receives via session:message event → SSE to approval UI
7. User clicks Allow → POST /api/sessions/:id/tool-approval { requestId, behavior: "allow", updatedInput: {...} }
8. Server calls bridge.approveTool() → sends control_response via WebSocket:
   { type: "control_response", response: { subtype: "success", request_id: "xyz", response: { behavior: "allow", updatedInput: {...} } } }
9. Claude CLI receives approval, executes the tool, continues streaming
```

### 3. Frontend Action (useCopilotAction)

```
1. Claude outputs tool_use block for "spawnCanvas" (a frontend action)
2. If Frontend Tools MCP is active:
   a. CLI routes to MCP server → JSON-RPC tools/call → immediate "success" response
   b. CLI sees successful tool result, continues
3. Bridge translates stream_event to AG-UI TOOL_CALL_START/ARGS/END events
4. CopilotKit frontend receives TOOL_CALL events → matches useCopilotAction("spawnCanvas") handler
5. Handler runs in browser (e.g., adds component to canvas)
6. Handler returns a value → CopilotKit re-invokes agent/run with role:"tool" message
7. Bridge's extractToolResults() detects the tool result
8. startToolResultBridge() sends tool_result content blocks to CLI via WebSocket
9. Claude receives the result and continues the conversation
```

### 4. Session Lifecycle

```
1. bridge.spawnSession("/path/to/project")
2. Creates Session with status="starting", stores in state.sessions Map
3. spawnClaude() spawns: claude --sdk-url ws://127.0.0.1:3001/ws/cli/{sessionId} --print --output-format stream-json --input-format stream-json --verbose -p ""
4. Claude CLI starts, connects WebSocket to /ws/cli/{sessionId}
5. ws-server.ts extracts sessionId from URL, sets session.wsSend
6. CLI sends system/init message → ws-server.ts captures capabilities (tools, model, etc.)
7. Session status → "connected", spawnSession() promise resolves
8. User sends message → session status → "active"
9. Claude finishes (result message) → session status → "idle"
10. bridge.killSession() → SIGTERM → session status → "terminated"
```

---

## Protocol Reference

### Claude CLI → Server (Inbound)

The `ClaudeMessage` union type covers all messages Claude CLI sends via WebSocket NDJSON:

| Type | Description | Key Fields |
|------|-------------|------------|
| `system` | System lifecycle events | `subtype`, varies by subtype |
| `assistant` | Complete assistant message (final, non-streamed) | `message: { id, role, model, content: ContentBlock[], stop_reason, usage }` |
| `result` | Turn complete | `subtype`, `is_error`, `duration_ms`, `num_turns`, `total_cost_usd`, `usage` |
| `stream_event` | Streaming token events | `event: { type, delta, index, content_block }` |
| `control_request` | CLI requests action from server | `request: { subtype, request_id, ...fields }` |
| `control_response` | CLI responds to server-initiated request | `response: { subtype, request_id, response }` |
| `tool_progress` | Tool execution progress | `tool_use_id`, `tool_name`, `elapsed_time_seconds` |
| `tool_use_summary` | Summary of recent tool uses | `summary`, `preceding_tool_use_ids` |
| `keep_alive` | Heartbeat | (no fields) |
| `user` | Echo of user message | (ignored by bridge) |
| `auth_status` | Authentication status | `isAuthenticating`, `output`, `error` |

### System Subtypes

| Subtype | Description | Key Fields |
|---------|-------------|------------|
| `init` | First message after CLI connects | `tools[]`, `model`, `cwd`, `permissionMode`, `claude_code_version`, `slash_commands[]`, `agents[]`, `skills[]`, `mcp_servers[]`, `plugins[]` |
| `status` | Status change (compacting, etc.) | `status: "compacting" \| null`, `permissionMode` |
| `compact_boundary` | Context compaction occurred | `compact_metadata: { trigger, pre_tokens }` |
| `task_notification` | Background task completed/failed | `task_id`, `task_status`, `output_file`, `summary` |
| `files_persisted` | Files saved to cloud | `files[]`, `failed[]` |
| `hook_started` | Hook execution began | `hook_id`, `hook_name`, `hook_event` |
| `hook_progress` | Hook execution progress | `hook_id`, `output`, `stdout`, `stderr` |
| `hook_response` | Hook execution completed | `hook_id`, `exit_code`, `outcome` |

### Control Request Subtypes (13 total)

| Subtype | Direction | Description |
|---------|-----------|-------------|
| `can_use_tool` | CLI → Server | Claude wants to use a tool, needs approval |
| `initialize` | Server → CLI | Register hooks, MCP, system prompt. Returns commands, models, account |
| `interrupt` | Server → CLI | Abort the current agent turn |
| `set_permission_mode` | Server → CLI | Change mode: default, plan, acceptEdits, bypassPermissions, dontAsk |
| `set_model` | Server → CLI | Change model at runtime |
| `set_max_thinking_tokens` | Server → CLI | Set thinking budget (null to remove) |
| `mcp_status` | Server → CLI | Get status of all MCP servers |
| `mcp_message` | Server → CLI | Send JSON-RPC message to an MCP server |
| `mcp_reconnect` | Server → CLI | Reconnect a disconnected MCP server |
| `mcp_toggle` | Server → CLI | Enable/disable an MCP server |
| `mcp_set_servers` | Server → CLI | Configure MCP servers |
| `rewind_files` | Server → CLI | Undo file changes to a checkpoint |
| `hook_callback` | CLI → Server | Hook needs server input |

### Server → CLI (Outbound)

The `ServerMessage` union covers all messages the bridge sends to Claude CLI:

| Type | Description |
|------|-------------|
| `user` | User message with content (string or ContentBlock[]) |
| `control_request` | Server-initiated request (initialize, set_model, etc.) |
| `control_response` | Response to CLI's control_request (tool approval) |
| `control_cancel_request` | Cancel a pending control request |
| `keep_alive` | Heartbeat |
| `update_environment_variables` | Update CLI env vars |

### AG-UI Events (Server → CopilotKit Frontend)

Sent as SSE (`data: {json}\n\n`) to the CopilotKit frontend:

| Event Type | Description | Key Fields |
|------------|-------------|------------|
| `RUN_STARTED` | Run began | `threadId`, `runId` |
| `RUN_FINISHED` | Run complete | `threadId`, `runId` |
| `RUN_ERROR` | Run failed | `threadId`, `runId`, `message` |
| `TEXT_MESSAGE_START` | Text block began | `messageId`, `role` |
| `TEXT_MESSAGE_CONTENT` | Text token | `messageId`, `delta` |
| `TEXT_MESSAGE_END` | Text block ended | `messageId` |
| `TOOL_CALL_START` | Tool call began | `toolCallId`, `toolCallName` |
| `TOOL_CALL_ARGS` | Tool call argument chunk | `toolCallId`, `delta` (partial JSON) |
| `TOOL_CALL_END` | Tool call complete | `toolCallId` |
| `STATE_SNAPSHOT` | Session capabilities | `snapshot: { agentId, model, tools, cwd, ... }` |
| `CUSTOM` | Extension events | `name`, `value` |

### Translation Matrix

How each Claude NDJSON message type maps to AG-UI events:

| Claude Message | AG-UI Event(s) |
|---------------|----------------|
| `system/init` | `STATE_SNAPSHOT` |
| `system/status` | `CUSTOM("system_status")` |
| `system/task_notification` | `CUSTOM("task_notification")` |
| `system/compact_boundary` | `CUSTOM("compact_boundary")` |
| `system/files_persisted` | `CUSTOM("files_persisted")` |
| `system/hook_*` | `CUSTOM("hook_started" \| "hook_progress" \| "hook_response")` |
| `stream_event(content_block_start, text)` | `TEXT_MESSAGE_START` |
| `stream_event(content_block_delta, text_delta)` | `TEXT_MESSAGE_CONTENT` |
| `stream_event(content_block_stop, text)` | `TEXT_MESSAGE_END` |
| `stream_event(content_block_start, tool_use)` | `TOOL_CALL_START` |
| `stream_event(content_block_delta, input_json_delta)` | `TOOL_CALL_ARGS` |
| `stream_event(content_block_stop, tool_use)` | `TOOL_CALL_END` |
| `assistant` (non-streamed text) | `TEXT_MESSAGE_START` + `CONTENT` + `END` |
| `assistant` (non-streamed tool_use) | `TOOL_CALL_START` + `ARGS` + `END` |
| `control_request(can_use_tool)` | `CUSTOM("tool_approval_request")` |
| `control_request(hook_callback)` | `CUSTOM("hook_callback")` |
| `tool_progress` | `CUSTOM("tool_progress")` |
| `tool_use_summary` | `CUSTOM("tool_use_summary")` |
| `auth_status` | `CUSTOM("auth_status")` |
| `result` | `CUSTOM("result_stats")` + `RUN_FINISHED` |
| `keep_alive`, `user` | (ignored) |

---

## File-by-File Reference

### `src/index.ts`

**Purpose**: Main package entry point. Re-exports everything public.

**Exports**:
- `CopilotKitClaudeBridge` class and `BridgeConfig` type
- `BridgeState` class and `translateClaudeMessage()` function
- All AG-UI event types (`AguiEvent`, `RunAgentInput`, etc.)
- All Claude protocol types (`ClaudeMessage`, `SystemMessage`, `ControlRequestBody`, etc.)
- `parseClaudeMessage()` helper
- Session types (`Session`, `SessionStatus`, `SessionCapabilities`, `SessionInitData`)
- Process utilities (`spawnClaude`, `monitorProcess`, `checkClaudeCli`)
- Server components (`createWsServer`, `createAguiServer`, `AppState`)

### `src/CopilotKitClaudeBridge.ts`

**Purpose**: The main facade class. This is what consumers import and use.

**Class**: `CopilotKitClaudeBridge extends EventEmitter`

**Constructor**: Takes a `BridgeConfig` object with sensible defaults:
- `wsPort: 0` (random), `httpPort: 0` (random), `host: "127.0.0.1"`
- `agentId: "default"`, `claudeCliPath: "claude"`, `corsOrigins: ["*"]`
- `controlRequestTimeout: 30000`, `autoInitialize: false`

**Lifecycle methods**:
- `start()` → creates WS + HTTP servers, returns `{ wsPort, httpPort }`
- `stop()` → kills all sessions, closes all servers

**Session management**:
- `spawnSession(workingDir, initialPrompt?)` → spawns Claude CLI, waits up to 30s for WebSocket connection, returns session ID
- `killSession(sessionId)` → SIGTERM (then SIGKILL after 5s), cleans up pending requests
- `setActiveSession(sessionId)` → routes AG-UI requests to this session
- `activeSessionId` getter

**Messaging**:
- `sendMessage(sessionId, content)` → sends user message via WebSocket

**Tool approval**:
- `approveTool(sessionId, requestId, response: ToolApprovalResponse)` → full control over the response
- `approveToolSimple(sessionId, requestId, originalInput)` → convenience: approve with original input
- `denyTool(sessionId, requestId, message?, interrupt?)` → deny with optional reason

**Control requests** (Server → CLI, with async response):
- `sendControlRequest<T>(sessionId, request, timeoutMs?)` → generic, returns Promise<T>
- `sendInitialize(sessionId, options?)` → register hooks, MCP, system prompt. Returns commands, models, account info
- `interrupt(sessionId)` → abort current turn
- `setModel(sessionId, model)` → change model at runtime
- `setPermissionMode(sessionId, mode)` → change permission mode
- `setMaxThinkingTokens(sessionId, tokens)` → set thinking budget

**MCP management**:
- `getMcpStatus(sessionId)`, `mcpReconnect(sessionId, serverName)`, `mcpToggle(sessionId, serverName, enabled)`, `mcpSetServers(sessionId, servers)`, `mcpMessage(sessionId, serverName, message)`

**Other**:
- `rewindFiles(sessionId, messageId, dryRun?)` → undo file changes
- `updateEnvironmentVariables(sessionId, vars)` → update CLI env vars
- `getCapabilities(sessionId)`, `getInitData(sessionId)`, `getSessionIds()`, `getSessionInfo(sessionId)` → read session state
- `getRequestHandler()` → returns `(req, res) => void` for Express/Hono embedding
- `runtimeUrl` getter → `http://{host}:{httpPort}`

**Events emitted**:
- `session:status(sessionId, status)` — status changed
- `session:message(sessionId, message)` — message received from CLI
- `session:capabilities(sessionId, capabilities)` — capabilities available (after init)
- `ports(wsPort, httpPort)` — servers started

**Auto-initialize**: When `autoInitialize: true`, the bridge calls `sendInitialize()` automatically when a session reaches "connected" status.

### `src/server/types.ts`

**Purpose**: Complete TypeScript type definitions for the Claude CLI NDJSON protocol.

**Key types**:

```typescript
// Inbound (CLI → Server)
type ClaudeMessage = SystemMessage | AssistantMessage | ResultMessage | StreamEventMessage
  | ControlRequestMessage | ControlResponseMessage | ToolProgressMessage | ToolUseSummaryMessage
  | KeepAliveMessage | UserMessage | AuthStatusMessage;

type SystemSubtype = "init" | "status" | "compact_boundary" | "task_notification"
  | "files_persisted" | "hook_started" | "hook_progress" | "hook_response";

type ControlRequestSubtype = "can_use_tool" | "initialize" | "interrupt" | "set_permission_mode"
  | "set_model" | "set_max_thinking_tokens" | "mcp_status" | "mcp_message" | "mcp_reconnect"
  | "mcp_toggle" | "mcp_set_servers" | "rewind_files" | "hook_callback";

type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "delegate" | "dontAsk";

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock;

// Outbound (Server → CLI)
type ServerMessage = ServerUserMessage | ServerControlRequest | ServerControlResponse
  | ServerControlCancelRequest | ServerKeepAlive | ServerUpdateEnvironmentVariables;
```

**Helper**: `parseClaudeMessage(line: string): ClaudeMessage | null` — parses a single NDJSON line, returns null on failure.

### `src/server/session.ts`

**Purpose**: Session state definition and factory.

**Key types**:

```typescript
type SessionStatus = "starting" | "connected" | "active" | "idle" | "disconnected" | "terminated" | { error: string };

interface SessionCapabilities {
  tools: string[];           // ["Task", "Bash", "Glob", "Grep", "Read", "Edit", "Write", ...]
  model: string;             // "claude-sonnet-4-5-20250929"
  permissionMode: PermissionMode;
  cwd: string;
  claudeCodeVersion: string;
  slashCommands: string[];   // ["bug", "commit", "compact", ...]
  agents: string[];          // ["task"]
  skills: string[];          // ["pdf", "commit", ...]
  mcpServers: McpServerInfo[];
  plugins: { name: string; path: string }[];
  outputStyle: string;
  apiKeySource: string;
}

interface SessionInitData {
  commands: { name: string; description: string; argumentHint?: string }[];
  models: { value: string; displayName: string; description: string }[];
  account: { email?, organization?, subscriptionType?, apiKeySource? };
  outputStyle: string;
  availableOutputStyles: string[];
  fastMode?: boolean;
}

interface Session {
  id: string;
  status: SessionStatus;
  workingDir: string;
  process: ChildProcess | null;
  wsSend: ((data: string) => void) | null;    // Set when WebSocket connects
  cliSessionId: string | null;                 // CLI's internal ID (from system/init)
  messageHistory: unknown[];                    // For replay on reconnect
  createdAt: number;
  capabilities: SessionCapabilities | null;     // Null until system/init
  initData: SessionInitData | null;             // Null until initialize is called
  initialized: boolean;
  pendingRequests: Map<string, { resolve, reject, timer }>;
  isCompacting: boolean;
  totalCostUsd: number;
  numTurns: number;
}
```

**Factory**: `createSession(id, workingDir)` — returns a Session with all fields initialized to defaults.

### `src/server/state.ts`

**Purpose**: Shared application state with event bus.

**Class**: `AppState extends EventEmitter`

**Fields**:
- `sessions: Map<string, Session>` — all sessions by ID
- `activeSessionId: string | null` — which session receives AG-UI run requests

**Event methods**:
- `emitWsEvent(event: WsEvent)` / `onWsEvent()` / `offWsEvent()` — WebSocket message bus (used by bridge loop)
- `emitSessionStatus(sessionId, status)` — forwarded to `CopilotKitClaudeBridge` events
- `emitSessionMessage(sessionId, message)` — forwarded to `CopilotKitClaudeBridge` events

### `src/server/process.ts`

**Purpose**: Spawning and monitoring Claude CLI processes.

**`spawnClaude(options: SpawnOptions)`**: Spawns the CLI with:
```
claude --sdk-url ws://127.0.0.1:{wsPort}/ws/cli/{sessionId} --print --output-format stream-json --input-format stream-json --verbose -p "{initialPrompt or empty}"
```
- Session ID is embedded in the WebSocket URL path for immediate association
- `stdio: ["ignore", "pipe", "pipe"]` — stdin ignored, stdout/stderr piped for logging
- `cwd` is set to the session's working directory

**`monitorProcess(state, sessionId, child)`**: Listens for process exit, updates session status to "terminated" or `{ error: "..." }`.

**`checkClaudeCli(path?)`**: Runs `claude --help` and checks if output contains "sdk-url". Returns boolean.

### `src/server/ws-server.ts`

**Purpose**: WebSocket server that Claude CLI processes connect to.

**`createWsServer(state)`**: Creates an HTTP server + WebSocketServer (ws library).

**Connection handling**:
1. Extracts session ID from URL path: `/ws/cli/{sessionId}`
2. Associates `session.wsSend` with the WebSocket's `send()` method
3. Parses incoming data as NDJSON (may be multiple lines per frame)
4. For each parsed `ClaudeMessage`:
   - `system` → `handleSystemMessage()` (captures capabilities from `init`, tracks compacting from `status`)
   - `control_response` → `handleControlResponse()` (resolves pending request promises)
   - `assistant` or `stream_event` → marks session as "active"
   - `result` → marks session as "idle", updates `totalCostUsd` and `numTurns`
   - Stores in `messageHistory` (except `user`, `system`, `keep_alive`, `auth_status`)
   - Broadcasts via `emitWsEvent()` and `emitSessionMessage()`

**On disconnect**: Sets `session.status = "disconnected"`, nulls `wsSend`, rejects all pending requests.

**Gotcha**: The `default` case in the SystemSubtype switch casts `(msg as SystemMessage).subtype` to `string` to avoid a TypeScript `never` type error, since the subtype union may expand in future CLI versions.

### `src/server/bridge.ts`

**Purpose**: Central translation layer between Claude Code's NDJSON protocol and AG-UI events.

**`BridgeState`**: Tracks state within a single AG-UI run:
- `blockTypes: Map<index, "text" | "tool_use">` — content block types by stream index
- `blockToolIds: Map<index, toolId>` — tool IDs by stream index
- `hasStreamedText: boolean` — whether any streaming text was received
- `streamedToolIds: Set<string>` — tool IDs that were already streamed

A new `BridgeState` is created for each `agent/run` request.

**`translateClaudeMessage(msg, threadId, runId, bridge)`**: Returns `AguiEvent[]` (zero or more).

**Translation logic by message type**:

- **`system`**: Switches on `subtype` — each maps to a specific AG-UI event (see Translation Matrix above)
- **`stream_event`**: The real-time streaming path:
  - `content_block_start` → registers block type, emits `TEXT_MESSAGE_START` or `TOOL_CALL_START`
  - `content_block_delta` → emits `TEXT_MESSAGE_CONTENT` (text_delta) or `TOOL_CALL_ARGS` (input_json_delta)
  - `content_block_stop` → emits `TEXT_MESSAGE_END` or `TOOL_CALL_END`
- **`assistant`**: Final complete message. Only emits events for blocks that weren't already streamed (dedup via `hasStreamedText` and `streamedToolIds`). This handles the case where Claude sends a non-streamed response.
- **`control_request`**: Only translates `can_use_tool` and `hook_callback` subtypes to CUSTOM events. Other subtypes (initialize, set_model, etc.) are handled server-side, not forwarded to the frontend.
- **`tool_progress`**, **`tool_use_summary`**, **`auth_status`**: Each maps to a CUSTOM event.
- **`result`**: Emits `CUSTOM("result_stats")` with run statistics, then `RUN_FINISHED`.
- **`keep_alive`**, **`user`**: Ignored.

### `src/server/agui-server.ts`

**Purpose**: HTTP server implementing the AG-UI protocol for CopilotKit.

**`createAguiServer(state, config)`**: Returns a Node.js HTTP server.

**Route handling** (in priority order):
1. `/info` or `/api/copilotkit/info` → `handleInfo()` — returns agent discovery JSON
2. `/agent/{id}/connect` → `handleConnect()` — lifecycle handshake
3. `/agent/{id}/run` or `/api/copilotkit` → `handleRun()` — main streaming endpoint
4. Any POST → `handleSingleTransport()` — unwraps `{ method, body }` envelope

**`handleConnect()`**: Returns a buffered SSE response (all events pre-built):
- `RUN_STARTED` → `STATE_SNAPSHOT` → history replay → `RUN_FINISHED`
- Uses `Connection: close` + `Content-Length` (critical for browser compatibility)

**`handleRunFromInput()`**: The core streaming handler:
1. Sets up SSE response with `Connection: keep-alive`
2. Emits `RUN_STARTED`
3. Checks for tool results (`extractToolResults()`) — if present, forwards to CLI via `startToolResultBridge()`
4. Extracts user message (`extractUserMessage()`)
5. Builds context (`buildReadableContext()` + `buildToolsContext()`)
6. Calls `startBridgeLoop()` which:
   - Polls for an active session with `wsSend` (up to 15s, 500ms intervals)
   - Stores user message in `session.messageHistory`
   - Sends combined message to CLI via WebSocket
   - Creates `BridgeState`, subscribes to `ws_event` bus
   - Translates each `ClaudeMessage` to AG-UI events and writes SSE
   - On `RUN_FINISHED` or `result`, unsubscribes and ends response

**`handleStop()`**: Sends an `interrupt` control request to the active session (or any session with a WebSocket).

**`buildCapabilitiesSnapshot()`**: Builds the STATE_SNAPSHOT payload from session capabilities, init data, and runtime stats (cost, turns, compacting status).

**`replayHistory()`**: Walks `session.messageHistory` and emits AG-UI TEXT_MESSAGE events for user messages and assistant text blocks. Skips tool calls, results, and system messages.

### `src/server/agui-events.ts`

**Purpose**: TypeScript type definitions for the 11 AG-UI event types.

```typescript
type AguiEvent = RunStartedEvent | RunFinishedEvent | RunErrorEvent
  | TextMessageStartEvent | TextMessageContentEvent | TextMessageEndEvent
  | ToolCallStartEvent | ToolCallArgsEvent | ToolCallEndEvent
  | StateSnapshotEvent | CustomEvent;

interface RunAgentInput {
  threadId?: string;
  runId?: string;
  messages?: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  state?: unknown;
  context?: Array<Record<string, unknown>>;
  forwardedProps?: unknown;
}
```

### `src/server/frontend-tools-mcp.ts`

**Purpose**: Lightweight MCP HTTP server that makes CopilotKit frontend actions callable by Claude CLI.

**Class**: `FrontendToolsMcp`

**Lifecycle**:
- `start(host?)` → starts HTTP server on random port, returns port number
- `stop()` → closes the HTTP server
- `getPort()` → returns the actual port
- `getMcpConfig()` → returns `{ type: "http", url: "http://127.0.0.1:{port}" }` for registering with Claude CLI

**Tool management**:
- `updateTools(tools[])` → adds/updates tools from CopilotKit's tools array (accumulates, never clears)
- `hasTool(name)` → checks if a tool is registered

**JSON-RPC handler** (MCP Streamable HTTP transport):
- `initialize` → returns protocol version, capabilities, server info
- `notifications/initialized` → 204 No Content
- `tools/list` → returns all registered tools with name, description, input schema
- `tools/call` → returns immediate success acknowledgment (actual execution happens on CopilotKit frontend via AG-UI events)

**Server name**: `"copilotkit-frontend"` (used when registering with Claude CLI's `mcp_set_servers`)

### `src/react/useClaudeBridge.ts`

**Purpose**: React hook for wiring CopilotKit to the bridge server.

```typescript
function useClaudeBridge(config: { runtimeUrl: string; agentId?: string }) {
  // Returns { runtimeUrl, agents, agentId }
  // Creates HttpAgent from @ag-ui/client (dynamic import, optional peer dep)
}
```

Usage:
```tsx
const { runtimeUrl, agents } = useClaudeBridge({ runtimeUrl: "http://localhost:3000" });
<CopilotKit runtimeUrl={runtimeUrl} agent="default" agents__unsafe_dev_only={agents}>
```

---

## Patterns and Gotchas

### 1. `updatedInput` is mandatory when approving tools

When calling `approveTool()` with `behavior: "allow"`, you **must** include `updatedInput`. It replaces the tool's input entirely. To approve without changes, pass the original input back:

```ts
bridge.approveTool(sessionId, requestId, {
  behavior: "allow",
  updatedInput: originalToolInput,  // REQUIRED — omitting causes silent failure
});
```

### 2. Connect responses require `Connection: close` + `Content-Length`

The `agent/connect` endpoint writes a complete buffered response (not streaming). Without `Connection: close` and `Content-Length`, the browser's `fetch()` will hang indefinitely waiting for more data. The `agent/run` endpoint uses `Connection: keep-alive` for real streaming.

### 3. Context injection format

User messages sent to Claude CLI are prepended with workspace state and available tools:

```
[CURRENT WORKSPACE STATE — the user can edit these fields directly. Always read the latest values from here before responding:]
[description]
value

[AVAILABLE FRONTEND ACTIONS — these are intercepted by a middleware layer BEFORE reaching your tool executor...]
- **toolName**: description
  Parameters: {schema}

To use an action, output a tool_use block with the action name and parameters...

{actual user message}
```

### 4. Message history filtering

The WebSocket server stores messages in `session.messageHistory` for replay on reconnect, but **skips** these types:
- `user` (echoes from CLI)
- `system` (lifecycle, not user-facing)
- `keep_alive` (heartbeats)
- `auth_status` (authentication flow)

### 5. Session polling on run

When `handleRunFromInput()` needs to send a message, it polls for a session with an active WebSocket every 500ms for up to 15 seconds. This handles the race condition where CopilotKit sends a message before Claude CLI has finished connecting.

### 6. Frontend Tools MCP accumulates tools

`FrontendToolsMcp.updateTools()` **accumulates** tools across requests — it never clears the set. CopilotKit may send different subsets of tools on different `agent/run` calls (depending on which components are mounted), so accumulating ensures Claude always sees all available tools.

### 7. SystemSubtype switch default

In `ws-server.ts` line 248, the `default` case in the SystemSubtype switch casts `(msg as SystemMessage).subtype` to `string`. Without this cast, TypeScript narrows the type to `never` (since all known subtypes are covered), which prevents logging unknown subtypes from newer CLI versions.

### 8. Tool result forwarding

When CopilotKit re-invokes `agent/run` with `role: "tool"` messages (results from `useCopilotAction` handlers), the bridge detects these via `extractToolResults()` and sends them to Claude CLI as a user message with `content: ToolResultBlock[]` — not as a string. This is the format Claude CLI expects for tool results.

### 9. Deduplication in assistant messages

The `assistant` message type contains the complete final response (all content blocks). But if streaming was active, those blocks were already sent as AG-UI events via `stream_event`. The `BridgeState` tracks which blocks were streamed (`hasStreamedText`, `streamedToolIds`) and the `assistant` handler only emits events for non-streamed blocks. This prevents duplicate messages in the CopilotKit UI.

### 10. Auto-activate sessions

`spawnSession()` always sets the new session as active (`state.activeSessionId = sessionId`). When `killSession()` removes the active session, it auto-activates the next available session from the Map.

---

## Usage Examples

### Minimal Standalone Server

```ts
import { CopilotKitClaudeBridge } from "copilotkit-claude-bridge";

const bridge = new CopilotKitClaudeBridge({ httpPort: 3000, wsPort: 3001 });
const { wsPort, httpPort } = await bridge.start();

bridge.on("session:status", (id, status) => console.log(`${id}: ${status}`));

const sessionId = await bridge.spawnSession(process.cwd());
console.log(`Ready! Connect CopilotKit to http://localhost:${httpPort}`);
```

### Embedding in Express

```ts
import express from "express";
import { CopilotKitClaudeBridge } from "copilotkit-claude-bridge";

const app = express();
const bridge = new CopilotKitClaudeBridge({ wsPort: 3001 });

await bridge.start();
await bridge.spawnSession(process.cwd());

app.use(bridge.getRequestHandler());
app.listen(3000);
```

### Multi-Session

```ts
const bridge = new CopilotKitClaudeBridge({ httpPort: 3000 });
await bridge.start();

const s1 = await bridge.spawnSession("/path/to/frontend");
const s2 = await bridge.spawnSession("/path/to/backend");

bridge.setActiveSession(s1);  // CopilotKit talks to frontend session
bridge.setActiveSession(s2);  // Switch to backend session

await bridge.killSession(s1); // Next available auto-activates
```

### Tool Approval with Custom Management API

```ts
bridge.on("session:message", (sessionId, message) => {
  if (message.type === "control_request" && message.request?.subtype === "can_use_tool") {
    const requestId = message.request.request_id ?? message.request_id;
    const toolName = message.request.tool_name;
    const toolInput = message.request.input;

    // Auto-approve Read, deny Bash
    if (toolName === "Read") {
      bridge.approveTool(sessionId, requestId, {
        behavior: "allow",
        updatedInput: toolInput,
      });
    } else if (toolName === "Bash") {
      bridge.denyTool(sessionId, requestId, "Bash not allowed");
    }
  }
});
```
