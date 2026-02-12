# copilotkit-claude-bridge

Bridge between [CopilotKit](https://copilotkit.ai) (AG-UI protocol) and [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code).

This library spawns Claude Code CLI, translates its streaming NDJSON protocol into AG-UI events, and serves SSE endpoints that CopilotKit connects to — giving you a Claude Code-powered AI agent in any CopilotKit React app.

## How It Works

```
CopilotKit React UI
        │
        │  POST /agent/default/run (SSE)
        ▼
┌─────────────────┐
│  AG-UI HTTP      │  ← translates AG-UI events via SSE
│  Server (:3000)  │
└────────┬────────┘
         │
    BridgeState
   translateClaudeMessage()
         │
┌────────┴────────┐
│  WebSocket       │  ← receives NDJSON from Claude CLI
│  Server (:3001)  │
└────────┬────────┘
         │  ws://127.0.0.1:3001/ws/cli/{sessionId}
         ▼
   Claude Code CLI
   (spawned with --sdk-url)
```

## Prerequisites

- **Node.js** >= 18
- **Claude Code CLI** installed and authenticated (`npm install -g @anthropic-ai/claude-code`)
- Verify it works: `claude --help` should show `--sdk-url` in the output

## Installation

```bash
npm install copilotkit-claude-bridge
```

## Quick Start — Standalone Server

```ts
import { CopilotKitClaudeBridge } from "copilotkit-claude-bridge";

const bridge = new CopilotKitClaudeBridge({ httpPort: 3000 });
const { wsPort, httpPort } = await bridge.start();

// Spawn a Claude session targeting your project directory
await bridge.spawnSession("./my-project");

console.log(`CopilotKit runtime URL: http://localhost:${httpPort}`);
// Connect your CopilotKit React app to this URL
```

## Quick Start — React Frontend

```tsx
import { useClaudeBridge } from "copilotkit-claude-bridge/react";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";

function App() {
  const { runtimeUrl, agents } = useClaudeBridge({
    runtimeUrl: "http://localhost:3000",
  });

  return (
    <CopilotKit
      runtimeUrl={runtimeUrl}
      agent="default"
      agents__unsafe_dev_only={agents}
    >
      <CopilotChat />
    </CopilotKit>
  );
}
```

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

```ts
import { useClaudeBridge } from "copilotkit-claude-bridge/react";

const { runtimeUrl, agents, agentId } = useClaudeBridge({
  runtimeUrl: "http://localhost:3000",
  agentId: "default", // optional
});
```

Requires `@ag-ui/client` as a peer dependency.

## Translation Map

The bridge translates Claude's NDJSON protocol into AG-UI events:

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

## Testing It End-to-End

A complete test project is included in `test-app/`. It has a Node.js server (bridge) and a React frontend (CopilotKit chat UI).

### Step 1: Build the library

```bash
# From the repo root
npm install
npm run build
```

### Step 2: Install test-app dependencies

```bash
cd test-app
npm install
```

### Step 3: Start the bridge server

Open a terminal:

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

This spawns Claude Code CLI connected to the bridge. You'll see status updates like `Session <id>: connected` once Claude CLI connects via WebSocket.

### Step 4: Start the React frontend

Open a second terminal:

```bash
cd test-app
npx vite
```

### Step 5: Open the browser

Go to `http://localhost:5173`. You'll see a CopilotKit chat UI. Type a message — it goes through:

1. CopilotKit frontend -> POST to `http://localhost:3000/agent/default/run` (SSE)
2. Bridge extracts the user message, sends it to Claude CLI via WebSocket
3. Claude CLI streams NDJSON responses back through the WebSocket
4. Bridge translates each NDJSON message into AG-UI events
5. AG-UI events stream back to CopilotKit as SSE
6. CopilotKit renders the streaming text and tool calls

### Quick smoke test (no React needed)

You can verify the bridge works without the frontend:

```bash
# Start just the server
cd test-app
npx tsx src/server.ts

# In another terminal, check the /info endpoint
curl http://localhost:3000/info
# → {"agents":{"default":{"description":"Claude Code AI agent"}},"version":"1.0.0"}
```

### Troubleshooting

- **"Claude CLI not found"** — Make sure `claude` is in your PATH. Or set `claudeCliPath` in the config to the full path.
- **"No active Claude session"** — The CLI hasn't connected yet. Wait a few seconds after starting the server. Check the terminal for `Session <id>: connected`.
- **CORS errors in browser** — The bridge defaults to `corsOrigins: ["*"]`. If you changed it, make sure your frontend origin is included.

## Development

```bash
npm install
npm run build        # Build ESM + CJS + types
npm test             # Run tests
npm run typecheck    # Type check without emitting
```

## License

MIT
