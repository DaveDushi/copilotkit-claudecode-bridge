# copilotkit-claude-bridge

Bridge between [CopilotKit](https://copilotkit.ai) (AG-UI protocol) and [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code).

This library spawns Claude Code CLI in SDK mode, translates its streaming NDJSON protocol into AG-UI events, and serves an HTTP endpoint that CopilotKit connects to — giving you a Claude Code-powered AI agent in any CopilotKit React app with full access to Claude Code's features: tool approval, model switching, permission modes, MCP servers, slash commands, skills, agents, and more.

## How It Works

```
CopilotKit React UI
        |
        |  POST http://localhost:3000
        |  { method: "agent/run", body: { messages, tools, context } }
        v
+-------------------+
|  AG-UI HTTP       |  <- single-endpoint transport
|  Server (:3000)   |     handles info / connect / run / stop
+--------+----------+
         |
    BridgeState
   translateClaudeMessage()
         |
+--------+----------+
|  WebSocket         |  <- receives NDJSON from Claude CLI
|  Server (:3001)    |
+--------+-----------+
         |  ws://127.0.0.1:3001/ws/cli/{sessionId}
         v
   Claude Code CLI
   (spawned with --sdk-url)
```

CopilotKit v1.51+ uses **single-endpoint transport** — all requests (info, connect, run, stop) are POSTed to the `runtimeUrl` with a `{ method, params, body }` JSON envelope. The bridge unwraps these and routes them to the correct handler.

## Prerequisites

- **Node.js** >= 18
- **Claude Code CLI** installed and authenticated (`npm install -g @anthropic-ai/claude-code`)
- Verify it supports SDK mode: `claude --help` should show `--sdk-url` in the output

## Installation

```bash
npm install copilotkit-claude-bridge
```

## Quick Start

### 1. Server (Node.js)

```ts
import { CopilotKitClaudeBridge } from "copilotkit-claude-bridge";

const bridge = new CopilotKitClaudeBridge({ httpPort: 3000 });
const { wsPort, httpPort } = await bridge.start();

// Spawn a Claude session targeting your project directory
await bridge.spawnSession("./my-project");

console.log(`CopilotKit runtime URL: http://localhost:${httpPort}`);
```

### 2. Frontend (React)

```tsx
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

function App() {
  return (
    <CopilotKit runtimeUrl="http://localhost:3000" agent="default">
      <CopilotChat />
    </CopilotKit>
  );
}
```

That's it. CopilotKit auto-discovers the agent via the bridge's `/info` response and routes all messages through it.

## API

### `CopilotKitClaudeBridge`

Main facade class. Extends `EventEmitter`.

```ts
const bridge = new CopilotKitClaudeBridge(config?: BridgeConfig);
```

**BridgeConfig:**

| Option             | Default              | Description                        |
|--------------------|----------------------|------------------------------------|
| `wsPort`           | `0` (random)         | WebSocket server port              |
| `httpPort`         | `0` (random)         | HTTP (AG-UI) server port           |
| `host`             | `"127.0.0.1"`        | Host to bind to                    |
| `agentId`          | `"default"`          | Agent ID for AG-UI discovery       |
| `agentDescription` | `"Claude Code AI agent"` | Agent description              |
| `claudeCliPath`    | `"claude"`           | Path to Claude CLI binary          |
| `corsOrigins`      | `["*"]`              | CORS origins for HTTP server       |
| `controlRequestTimeout` | `30000`         | Timeout for control requests (ms)  |
| `autoInitialize`   | `false`              | Auto-call initialize on CLI connect |
| `systemPrompt`     | `""`                 | System prompt for initialize       |
| `appendSystemPrompt` | `""`               | Append to system prompt            |

### Session Management

| Method | Description |
|--------|-------------|
| `start()` | Start WS + HTTP servers. Returns `{ wsPort, httpPort }` |
| `stop()` | Stop all servers and kill all sessions |
| `spawnSession(workingDir, initialPrompt?)` | Spawn Claude CLI. Returns session ID. Waits for CLI to connect |
| `killSession(sessionId)` | Kill a session and wait for process exit |
| `setActiveSession(sessionId)` | Set which session receives AG-UI run requests |
| `activeSessionId` | Get the current active session ID (getter) |
| `sendMessage(sessionId, content)` | Send a user message to Claude |

### Tool Approval

| Method | Description |
|--------|-------------|
| `approveTool(sessionId, requestId, response)` | Approve/deny tool with full response (updatedInput, updatedPermissions) |
| `approveToolSimple(sessionId, requestId, originalInput)` | Approve with original input unchanged |
| `denyTool(sessionId, requestId, message?, interrupt?)` | Deny tool use with optional message |

The `updatedInput` field is mandatory when approving — it replaces the tool's input entirely. You can pass the original input unchanged, or modify it (e.g., sanitize commands, restrict file access).

### Control Requests (Claude Code Features)

| Method | Description |
|--------|-------------|
| `sendInitialize(sessionId, options?)` | Register hooks, MCP, agents, system prompt. Returns commands, models, account info |
| `interrupt(sessionId)` | Abort the current agent turn |
| `setModel(sessionId, model)` | Change model at runtime (e.g., "claude-opus-4-6", "default") |
| `setPermissionMode(sessionId, mode)` | Change mode: default, plan, acceptEdits, bypassPermissions, dontAsk |
| `setMaxThinkingTokens(sessionId, tokens)` | Set thinking budget (null to remove limit) |
| `updateEnvironmentVariables(sessionId, vars)` | Update CLI environment variables |
| `rewindFiles(sessionId, messageId, dryRun?)` | Undo file changes to a checkpoint |

### MCP Management

| Method | Description |
|--------|-------------|
| `getMcpStatus(sessionId)` | Get status of all MCP servers |
| `mcpReconnect(sessionId, serverName)` | Reconnect an MCP server |
| `mcpToggle(sessionId, serverName, enabled)` | Enable/disable an MCP server |
| `mcpSetServers(sessionId, servers)` | Configure MCP servers |
| `mcpMessage(sessionId, serverName, message)` | Send JSON-RPC message to an MCP server |

### Session Info

| Method | Description |
|--------|-------------|
| `getCapabilities(sessionId)` | Get session capabilities (tools, model, commands, skills, agents, MCP) |
| `getInitData(sessionId)` | Get data from initialize (available models, account info) |
| `getSessionIds()` | Get all session IDs |
| `getSessionInfo(sessionId)` | Full session info for API responses |
| `getRequestHandler()` | Returns `(req, res) => void` for Express/Hono embedding |

**Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `session:status` | `(sessionId, status)` | Session status changed |
| `session:message` | `(sessionId, message)` | Claude message received |
| `session:capabilities` | `(sessionId, capabilities)` | Session capabilities available |
| `ports` | `(wsPort, httpPort)` | Servers started |

### Multi-Session Support

```ts
const bridge = new CopilotKitClaudeBridge({ httpPort: 3000 });
await bridge.start();

// Spawn sessions for different projects
const s1 = await bridge.spawnSession("/path/to/frontend");
const s2 = await bridge.spawnSession("/path/to/backend");

// Switch between them
bridge.setActiveSession(s1);
bridge.setActiveSession(s2);

// Kill a session — next available auto-activates
await bridge.killSession(s1);
```

### Protocol Translation Map

| Claude NDJSON | AG-UI Event(s) |
|---------------|----------------|
| `system/init` | `STATE_SNAPSHOT` (with full capabilities) |
| `system/status` | `CUSTOM` (system_status) |
| `system/task_notification` | `CUSTOM` (task_notification) |
| `system/compact_boundary` | `CUSTOM` (compact_boundary) |
| `system/hook_*` | `CUSTOM` (hook_started/progress/response) |
| `stream_event` (text) | `TEXT_MESSAGE_START/CONTENT/END` |
| `stream_event` (tool_use) | `TOOL_CALL_START/ARGS/END` |
| `assistant` (non-streamed) | `TEXT_MESSAGE_*` or `TOOL_CALL_*` |
| `control_request` (can_use_tool) | `CUSTOM` (tool_approval_request) |
| `control_request` (hook_callback) | `CUSTOM` (hook_callback) |
| `tool_progress` | `CUSTOM` (tool_progress) |
| `tool_use_summary` | `CUSTOM` (tool_use_summary) |
| `auth_status` | `CUSTOM` (auth_status) |
| `result` | `CUSTOM` (result_stats) + `RUN_FINISHED` |

### Capabilities exposed via STATE_SNAPSHOT

On `agent/connect`, the bridge sends a `STATE_SNAPSHOT` event with:

```json
{
  "agentId": "default",
  "status": "connected",
  "model": "claude-sonnet-4-5-20250929",
  "permissionMode": "default",
  "tools": ["Task", "Bash", "Glob", "Grep", "Read", "Edit", "Write", ...],
  "cwd": "/path/to/project",
  "claudeCodeVersion": "2.1.37",
  "slashCommands": ["bug", "commit", "compact", ...],
  "agents": ["task"],
  "skills": ["pdf", "commit", ...],
  "mcpServers": [{ "name": "my-server", "status": "connected" }],
  "commands": [...],  // from initialize
  "models": [...],    // available models from initialize
  "isCompacting": false,
  "totalCostUsd": 0,
  "numTurns": 0
}
```

## Embedding in Express

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

## Test App

A complete test project with a full-featured UI is included in `test-app/`.

### Features

- **Sidebar session manager** — create, switch between, and delete sessions
- **Model picker** — switch between Sonnet, Opus, and Haiku at runtime
- **Mode switcher** — change permission mode (Default, Plan, Accept Edits, Bypass, Don't Ask)
- **Interrupt button** — stop the current operation
- **Capability badges** — shows tool count, slash commands, skills, agents, MCP servers
- **Cost tracking** — displays cumulative cost per session
- **Compacting indicator** — shows when context is being compacted
- **Status indicators** — green (connected/idle), blue (active), orange (starting), grey (disconnected)

### Running the test app

**Step 1: Build the library**

```bash
npm install
npm run build
```

**Step 2: Install test-app dependencies**

```bash
cd test-app
npm install
```

**Step 3: Start the bridge server**

```bash
cd test-app
npx tsx src/server.ts
```

**Step 4: Start the React frontend**

In a second terminal:

```bash
cd test-app
npx vite
```

**Step 5: Open the browser**

Go to `http://localhost:5173`.

### Management API

The test app exposes a management API on port 3002:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions` | List all sessions with status, capabilities, and active flag |
| `POST` | `/api/sessions` | Create session. Body: `{ "workingDir": "/path" }` |
| `PUT` | `/api/sessions/:id/activate` | Switch the active session |
| `PUT` | `/api/sessions/:id/model` | Change model. Body: `{ "model": "claude-opus-4-6" }` |
| `PUT` | `/api/sessions/:id/mode` | Change mode. Body: `{ "mode": "plan" }` |
| `POST` | `/api/sessions/:id/interrupt` | Interrupt current operation |
| `POST` | `/api/sessions/:id/initialize` | Send initialize control request |
| `GET` | `/api/sessions/:id/capabilities` | Get session capabilities and init data |
| `GET` | `/api/sessions/:id/mcp` | Get MCP server status |
| `DELETE` | `/api/sessions/:id` | Kill and remove a session |

### Troubleshooting

- **"Claude CLI not found"** — Make sure `claude` is in your PATH, or set `claudeCliPath` in the config.
- **"No active Claude session"** — The CLI hasn't connected via WebSocket yet. Wait a few seconds after starting the server. Check terminal for `Session <id>: connected`.
- **No response from agent** — Check that the server logs show `Single transport: method="agent/run"` when you send a message.
- **CORS errors** — The bridge defaults to `corsOrigins: ["*"]`. If you changed it, ensure your frontend origin is included.
- **Session shows "starting" indefinitely** — Claude CLI may have failed to start. Check the server terminal for `[bridge][stderr:...]` messages.
- **Control request timed out** — Default timeout is 30s. Increase with `controlRequestTimeout` config option.

## Development

```bash
npm install
npm run build        # Build ESM + CJS + types
npm test             # Run tests
npm run typecheck    # Type check without emitting
```

## License

MIT
