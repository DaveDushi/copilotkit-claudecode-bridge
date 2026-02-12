# copilotkit-claude-bridge

Bridge between [CopilotKit](https://copilotkit.ai) (AG-UI protocol) and [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code).

This library spawns Claude Code CLI in SDK mode, translates its streaming NDJSON protocol into AG-UI events, and serves an HTTP endpoint that CopilotKit connects to — giving you a Claude Code-powered AI agent in any CopilotKit React app.

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

**Methods:**

| Method | Description |
|--------|-------------|
| `start()` | Start WS + HTTP servers. Returns `{ wsPort, httpPort }` |
| `stop()` | Stop all servers and kill all sessions |
| `spawnSession(workingDir, initialPrompt?)` | Spawn Claude CLI. Returns session ID |
| `killSession(sessionId)` | Kill a session |
| `sendMessage(sessionId, content)` | Send a user message to Claude |
| `approveTool(sessionId, requestId, approved)` | Approve/deny a tool use request |
| `getRequestHandler()` | Returns `(req, res) => void` for Express/Hono embedding |

**Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `session:status` | `(sessionId, status)` | Session status changed |
| `session:message` | `(sessionId, message)` | Claude message received |
| `ports` | `(wsPort, httpPort)` | Servers started |

### `useClaudeBridge` (React hook)

Optional helper for advanced use cases (custom agent IDs, etc.). For most setups, you don't need this — just pass `runtimeUrl` directly to `<CopilotKit>`.

```ts
import { useClaudeBridge } from "copilotkit-claude-bridge/react";

const { runtimeUrl, agents, agentId } = useClaudeBridge({
  runtimeUrl: "http://localhost:3000",
  agentId: "default", // optional
});
```

Requires `@ag-ui/client` and `react` as peer dependencies.

## Protocol Details

### Single-Endpoint Transport

CopilotKit v1.51+ sends all requests to the `runtimeUrl` as POST with a JSON envelope:

```json
{ "method": "info" }
{ "method": "agent/connect", "params": { "agentId": "default" }, "body": { ... } }
{ "method": "agent/run", "params": { "agentId": "default" }, "body": { "messages": [...], "tools": [...] } }
{ "method": "agent/stop", "params": { "agentId": "default" }, "body": { ... } }
```

The bridge also supports REST-style endpoints (`GET /info`, `POST /agent/{id}/run`, etc.) for direct testing.

### Translation Map

The bridge translates Claude's NDJSON streaming protocol into AG-UI events:

| Claude NDJSON | AG-UI Event(s) |
|---------------|----------------|
| `system` (init) | `STATE_SNAPSHOT` |
| `stream_event` (content_block_start, text) | `TEXT_MESSAGE_START` |
| `stream_event` (content_block_delta, text_delta) | `TEXT_MESSAGE_CONTENT` |
| `stream_event` (content_block_stop, text) | `TEXT_MESSAGE_END` |
| `stream_event` (content_block_start, tool_use) | `TOOL_CALL_START` |
| `stream_event` (content_block_delta, input_json_delta) | `TOOL_CALL_ARGS` |
| `stream_event` (content_block_stop, tool_use) | `TOOL_CALL_END` |
| `assistant` (non-streamed text) | `TEXT_MESSAGE_START` / `CONTENT` / `END` |
| `assistant` (non-streamed tool_use) | `TOOL_CALL_START` / `ARGS` / `END` |
| `control_request` (can_use_tool) | `CUSTOM` (tool_approval_request) |
| `result` | `RUN_FINISHED` |

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

## Testing End-to-End

A complete test project is included in `test-app/`.

### Step 1: Build the library

```bash
npm install
npm run build
```

### Step 2: Install test-app dependencies

```bash
cd test-app
npm install
```

### Step 3: Start the bridge server

```bash
cd test-app
npx tsx src/server.ts
```

You should see:

```
  AG-UI server:     http://localhost:3000
  WebSocket server: ws://localhost:3001
  Spawned session:  <uuid>
  Open http://localhost:5173 in your browser to chat!
```

### Step 4: Start the React frontend

In a second terminal:

```bash
cd test-app
npx vite
```

### Step 5: Open the browser

Go to `http://localhost:5173`. Type a message in the chat UI. The flow is:

1. CopilotKit POSTs to `http://localhost:3000` with `{ method: "agent/run", body: { messages } }`
2. Bridge extracts the user message and sends it to Claude CLI via WebSocket
3. Claude CLI streams NDJSON responses back through the WebSocket
4. Bridge translates each NDJSON message into AG-UI SSE events
5. CopilotKit renders the streaming text in the chat UI

### Quick smoke test (no frontend)

```bash
# Start the server
cd test-app && npx tsx src/server.ts

# In another terminal — test info endpoint
curl -X POST http://localhost:3000 -H "Content-Type: application/json" -d '{"method":"info"}'
# -> {"agents":{"default":{"description":"Claude Code AI agent"}},"version":"1.0.0"}

# REST-style also works:
curl http://localhost:3000/info
```

### Troubleshooting

- **"Claude CLI not found"** — Make sure `claude` is in your PATH, or set `claudeCliPath` in the config.
- **"No active Claude session"** — The CLI hasn't connected via WebSocket yet. Wait a few seconds after starting the server. Check terminal for `Session <id>: connected`.
- **No response from agent** — Check that the server logs show `Single transport: method="agent/run"` when you send a message. If you only see `method="info"` and `method="agent/connect"`, the agent connected successfully but may need a message to trigger a run.
- **CORS errors** — The bridge defaults to `corsOrigins: ["*"]`. If you changed it, ensure your frontend origin is included.

## Development

```bash
npm install
npm run build        # Build ESM + CJS + types
npm test             # Run tests (19 tests)
npm run typecheck    # Type check without emitting
```

## License

MIT
