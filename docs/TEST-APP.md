# Test App — Claude Code Canvas Documentation

## Overview

The test app is a **Claude Code Canvas** — a web-based workspace where Claude Code can chat with the user via a sidebar and spawn interactive visualizations (tables, charts, dashboards, custom HTML) on a canvas area. It demonstrates the bridge library's capabilities including dynamic UI spawning, tool approval (human-in-the-loop), collaborative editing, and rich tool rendering.

This is not a simple chat wrapper. It's a full workspace app that shows how CopilotKit + the bridge can power a real AI development environment.

### Port Allocation

| Port | Service | Description |
|------|---------|-------------|
| 3000 | AG-UI HTTP | CopilotKit connects here (bridge library) |
| 3001 | WebSocket | Claude CLI connects here (bridge library) |
| 3002 | Management API | Session CRUD, tool approval SSE + REST (test-app server) |
| 5173 | Vite Dev Server | React frontend |

---

## Architecture

```
Browser (http://localhost:5173)
  |
  +-- App (folder picker → CopilotKit wrapper)
  |     |
  |     +-- CopilotKit (runtimeUrl=http://localhost:3000, agent="default")
  |           |
  |           +-- Workspace
  |                 |
  |                 +-- CopilotSidebar (chat + instructions)
  |                 |     |
  |                 |     +-- ToolRenderers (hook-only: useRenderToolCall for Bash/Read/Write/Edit/Glob/Grep)
  |                 |
  |                 +-- Header ("Claude Code Canvas" + component count)
  |                 |
  |                 +-- ToolApprovalBanner (pending tool requests from SSE)
  |                 |
  |                 +-- DynamicCanvas (renders spawned components)
  |                       |
  |                       +-- DataTable, EditableTable, LineChart, BarChart,
  |                           JsonViewer, KeyValueGrid, ProgressDashboard, CustomHtml
  |
  +-- SSE: GET http://localhost:3002/api/events
  |     (tool_approval_request events)
  |
  +-- REST: POST http://localhost:3002/api/sessions/:id/tool-approval
        (allow/deny responses)


Server (npx tsx src/server.ts)
  |
  +-- CopilotKitClaudeBridge (ports 3000 + 3001)
  |
  +-- Management HTTP Server (:3002)
        |
        +-- GET  /api/events        (SSE: tool approval requests)
        +-- GET  /api/sessions      (list sessions)
        +-- POST /api/sessions      (create session)
        +-- POST /api/sessions/:id/tool-approval (approve/deny)
```

---

## File Tree

```
test-app/
  src/
    App.tsx                          Main shell: folder picker → CopilotKit → Workspace
    main.tsx                         React entry point (Vite)
    types.ts                         CanvasComponent + CanvasComponentType
    server.ts                        Management API server (session CRUD + tool approval)
    hooks/
      useCanvas.tsx                  CopilotKit actions: spawnCanvas, clearCanvas + readable context
      useToolApproval.tsx            SSE subscription + tool approval state management
    components/
      DynamicCanvas.tsx              Canvas container rendering components from registry
      ToolRenderers.tsx              Rich inline rendering for Claude Code's native tools
      dynamic/
        registry.ts                  Component type → React component mapping
        DataTable.tsx                Read-only sortable/filterable table
        EditableTable.tsx            Collaborative editable table with CopilotKit actions
        LineChart.tsx                Recharts line chart
        BarChart.tsx                 Recharts bar chart
        JsonViewer.tsx               Collapsible recursive JSON tree
        KeyValueGrid.tsx             Key-value metadata grid
        ProgressDashboard.tsx        Status cards with progress bars
        CustomHtml.tsx               Sandboxed iframe for arbitrary HTML/CSS/JS
  data/
    NicheDetailsProductsTab_8_18_2025.csv  Sample data file
  package.json
  vite.config.ts
  tsconfig.json
```

---

## User Flow

### 1. Session Creation

1. User opens `http://localhost:5173`
2. App checks for existing sessions: `GET /api/sessions`
3. If no sessions exist, shows folder picker UI
4. User enters a workspace folder path and clicks "Start"
5. App calls `POST /api/sessions` with `{ workingDir: "/path/to/folder" }`
6. Server calls `bridge.spawnSession(workingDir)` — starts Claude CLI process
7. Once session is ready, App renders the CopilotKit workspace
8. On page refresh, step 2 finds the existing session and skips the picker

### 2. Canvas Spawning

1. User asks Claude to visualize data (e.g., "show package.json as a key-value grid")
2. Claude calls the `spawnCanvas` frontend action with `type`, `title`, and `data` (JSON string)
3. `useCanvas` hook's handler parses the JSON, creates a `CanvasComponent` object
4. Component is added to the `components[]` state array
5. `DynamicCanvas` renders the new component using the registry lookup
6. Component appears on canvas with a header card (title, type badge, timestamp, remove button)
7. Claude can update an existing component by passing its `id`

### 3. Tool Approval

1. Claude wants to use a native tool (Bash, Write, Edit, etc.)
2. Bridge emits `control_request(can_use_tool)` via WebSocket
3. Server's SSE handler forwards it as a `tool_approval_request` event to the frontend
4. `useToolApproval` hook receives the SSE event, adds to `pending` state
5. `ToolApprovalBanner` renders with tool name, formatted input, Allow/Deny buttons
6. User clicks Allow → `approve()` → `POST /api/sessions/:id/tool-approval { behavior: "allow", updatedInput }`
7. Server calls `bridge.approveTool()` → sends response to Claude CLI via WebSocket
8. Claude receives approval and executes the tool

### 4. Collaborative Table Editing

1. Claude spawns an `editable-table` component
2. `EditableTable` registers scoped CopilotKit actions: `editTableCells_{tableId}`, `addTableRows_{tableId}`, `deleteTableRows_{tableId}`
3. `EditableTable` also exposes current rows via `useCopilotReadable`
4. User can double-click cells to edit, add rows, delete selected rows
5. Claude can also modify the table via the scoped actions
6. Both see live updates immediately

---

## File-by-File Reference

### `src/App.tsx`

**Purpose**: Main application shell with two states — folder picker and CopilotKit workspace.

**Components**:

- **`App`** (default export): Root component
  - On mount, checks `GET /api/sessions` for existing sessions
  - If no session: renders folder picker (text input + Start button)
  - If session exists: renders `<CopilotKit runtimeUrl="http://localhost:3000" agent="default"><Workspace /></CopilotKit>`

- **`Workspace`**: Inner component (inside CopilotKit context)
  - State: `components: CanvasComponent[]` (canvas visualizations)
  - Hooks: `useCanvas(components, setComponents)`, `useToolApproval()`
  - Layout: `CopilotSidebar` wrapping `ToolRenderers` (hook-only) + header + `ToolApprovalBanner` + `DynamicCanvas`
  - Instructions: Multi-line string teaching Claude about canvas types, when to use each, and the "visual first" approach

- **`ToolApprovalBanner`**: Renders pending tool approval requests
  - Shows count badge ("N tools waiting for approval")
  - "Allow All" button when multiple requests pending
  - Per-request card: tool name (monospace, orange), formatted input (truncated), Allow/Deny buttons
  - `formatToolInput()` helper formats display based on tool name:
    - Bash → shows `command`
    - Read/Write/Edit → shows `file_path`
    - Glob → shows `pattern`
    - Grep → shows `/pattern/ in path`
    - Default → truncated JSON

### `src/types.ts`

**Purpose**: Core type definitions for the canvas component system.

```typescript
type CanvasComponentType =
  | "data-table"          // Read-only sortable table
  | "editable-table"      // Collaborative editable table
  | "line-chart"          // Time series chart
  | "bar-chart"           // Category comparison chart
  | "json-viewer"         // Collapsible JSON tree
  | "key-value"           // Metadata key-value grid
  | "progress-dashboard"  // Status cards with progress bars
  | "custom";             // Sandboxed arbitrary HTML/CSS/JS

interface CanvasComponent {
  id: string;                       // Unique identifier
  type: CanvasComponentType;        // Which component to render
  title: string;                    // Display title
  data: Record<string, unknown>;    // Component-specific data payload
  timestamp: number;                // Creation/update time
}
```

### `src/server.ts`

**Purpose**: Management API server. Runs alongside the bridge on port 3002.

**Setup**: Creates a `CopilotKitClaudeBridge` on ports 3000/3001 and a separate Node.js HTTP server on port 3002.

**Endpoints**:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/events` | SSE stream of tool approval requests |
| `GET` | `/api/sessions` | List all sessions (id, status, capabilities) |
| `POST` | `/api/sessions` | Create session. Body: `{ workingDir: string }` |
| `POST` | `/api/sessions/:id/tool-approval` | Approve/deny tool. Body: `{ requestId, behavior, updatedInput?, message? }` |

**SSE stream** (`/api/events`):
- Listens to `bridge.on("session:message", ...)` events
- Filters for `control_request` with `subtype: "can_use_tool"`
- Emits `event: tool_approval_request` with `{ sessionId, requestId, toolName, toolInput, toolUseId, description }`
- 15-second heartbeat keeps the connection alive

**Tool approval** (`/api/sessions/:id/tool-approval`):
- If `behavior === "deny"`: calls `bridge.denyTool(sessionId, requestId, message, false)`
- Otherwise: calls `bridge.approveTool(sessionId, requestId, { behavior: "allow", updatedInput })`
- `updatedInput` falls back to `body.toolInput` if not provided

### `src/hooks/useCanvas.tsx`

**Purpose**: Registers CopilotKit actions and readable context for the canvas system.

**Hook**: `useCanvas(components, setComponents)`

**CopilotKit readable context**:
```typescript
useCopilotReadable({
  description: "Visualizations currently displayed on the user's canvas.",
  value: components.length > 0
    ? components.map(c => `- "${c.title}" (${c.type})`).join("\n")
    : "(canvas is empty)",
});
```

**Action: `spawnCanvas`**:
- Parameters: `type` (enum), `title` (string), `data` (JSON string), `id` (optional string)
- Handler:
  1. Parses `data` from JSON string to object
  2. For `editable-table` type, injects `_tableId` into parsed data
  3. If `id` matches existing component → updates in place
  4. Otherwise → appends new component
- Returns: `'Visualization "{title}" ({type}) displayed on canvas.'`
- Render: Shows inline card in chat with title and type

**Action: `clearCanvas`**:
- Parameters: none
- Handler: `setComponents([])`
- Returns: `"Canvas cleared."`

**Data format per type** (documented in action description):

| Type | Data Shape |
|------|-----------|
| `data-table` | `{ columns: [{key, label}], rows: [{key: value}] }` |
| `editable-table` | Same as data-table (gets `_tableId` injected) |
| `line-chart` | `{ xKey: string, yKeys: string[], data: [{...}] }` |
| `bar-chart` | Same as line-chart |
| `json-viewer` | Any JSON object or array |
| `key-value` | `{ entries: [{key, value}] }` |
| `progress-dashboard` | `{ items: [{label, value, max?, status?}] }` |
| `custom` | `{ html: "<div>...</div>" }` |

**Design note**: `data` is a JSON string parameter (not an object) because CopilotKit's action parameter system has issues with nested object types. The handler parses it.

### `src/hooks/useToolApproval.tsx`

**Purpose**: Subscribes to SSE events from the management API and manages tool approval state.

**Hook**: `useToolApproval()` returns `{ pending, approve, deny, approveAll }`

**Types**:
```typescript
interface ToolApprovalRequest {
  sessionId: string;
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId?: string;
  description?: string;
  timestamp: number;
}
```

**SSE subscription**:
- Connects to `GET http://localhost:3002/api/events` via `EventSource`
- Listens for `tool_approval_request` events
- Parses data and adds to `pending` state with timestamp
- Auto-reconnects on error (built-in EventSource behavior)
- Cleanup on unmount

**Actions**:

- **`approve(request)`**: Removes from queue, POSTs to `/api/sessions/:id/tool-approval` with `{ requestId, behavior: "allow", updatedInput: toolInput }`
- **`deny(request, reason?)`**: Removes from queue, POSTs with `{ requestId, behavior: "deny", message: reason || "Denied by user" }`
- **`approveAll()`**: Clears entire queue, sends parallel approval POSTs for all pending requests (failures silently caught)

### `src/components/DynamicCanvas.tsx`

**Purpose**: Container that renders canvas components from the registry.

**Props**: `{ components: CanvasComponent[], onRemove: (id) => void, onClear: () => void }`

**Layout**:
- Empty state: centered message with example prompts
- Non-empty: "Clear all" button + components rendered newest-first (reversed)

**Component card structure**:
```
+-- Card -------------------------------------------+
| Header: Title | TypeBadge(color) | Timestamp | [x] |
+---------------------------------------------------+
| Body: <RegisteredComponent data={component.data}/> |
+---------------------------------------------------+
```

**Registry lookup**: `CANVAS_REGISTRY[component.type]` → `{ component, label, color }`

**Empty state prompts** (guidance for users):
- "Show me the files in this project as a table"
- "Analyze package.json and show key details"
- "Create a progress dashboard for project setup"

### `src/components/ToolRenderers.tsx`

**Purpose**: Rich inline rendering for Claude Code's native tools in the chat sidebar.

Uses CopilotKit's `useRenderToolCall` hook to customize how tool calls appear in chat. This is a hook-only component (renders nothing visible itself, just registers renderers).

**Rendered tools**:

| Tool | Icon | Theme Color | Display Format |
|------|------|-------------|----------------|
| Bash | `$` | Cyan (#80cbc4 on #263238) | Description + monospace command |
| Edit | `~` | Green/Red | File path + red old_string / green new_string diff |
| Write | `+` | Blue (#e3f2fd) | File path + line count |
| Read | `>` | Gray (#f5f5f5) | File path |
| Glob | `*` | Orange (#fff3e0) | Pattern (monospace) + search path |
| Grep | `/` | Pink (#fce4ec) | Pattern in `/pattern/` format + path + glob filter |
| TodoWrite | `v` | Purple (#f3e5f5) | Status indicator |
| spawnCanvas | `◇` | Purple (#f3e5f5) | Title and type |

**Default renderer** (`useDefaultTool`): Catch-all for any unrecognized tool — shows tool name and status in a gray card.

**Shared UI**: `ToolCard` (colored card with icon badge), `FilePath` (path with highlighted filename), `DiffBlock` (red/green syntax-highlighted diff), `Spinner` ("Working..." text).

### `src/components/dynamic/registry.ts`

**Purpose**: Central mapping from `CanvasComponentType` to React component, label, and color.

```typescript
const CANVAS_REGISTRY: Record<CanvasComponentType, {
  component: React.FC<{ data: any }>;
  label: string;
  color: string;
}> = {
  "data-table":          { component: DataTable,          label: "Table",     color: "#e3f2fd" },
  "editable-table":      { component: EditableTable,      label: "Editable",  color: "#e8eaf6" },
  "line-chart":          { component: LineChartView,      label: "Line Chart",color: "#e8f5e9" },
  "bar-chart":           { component: BarChartView,       label: "Bar Chart", color: "#fff3e0" },
  "json-viewer":         { component: JsonViewer,         label: "JSON",      color: "#f3e5f5" },
  "key-value":           { component: KeyValueGrid,       label: "Key-Value", color: "#fce4ec" },
  "progress-dashboard":  { component: ProgressDashboard,  label: "Dashboard", color: "#e0f2f1" },
  "custom":              { component: CustomHtml,         label: "Custom",    color: "#e8eaf6" },
};
```

**Extension pattern**: To add a new component type, add it to `CanvasComponentType` in `types.ts`, create the component in `dynamic/`, and add an entry here.

### `src/components/dynamic/DataTable.tsx`

**Purpose**: Read-only table with sorting and filtering.

**Data format**: `{ columns?: [{key, label}], rows: [{key: value}] }`

**Features**:
- Auto-generates columns from first row if `columns` not provided
- Click column headers to sort (ascending ↔ descending toggle)
- Filter input searches all columns (case-insensitive substring match)
- Zebra striping with hover highlight (#e3f2fd)
- Row count display with filter info
- Max cell width 300px with ellipsis overflow

**Cell formatting**: `null`/`undefined` → empty, objects → JSON.stringify, everything else → String()

**Sort logic**: Detects number vs string, sorts null values to bottom.

### `src/components/dynamic/EditableTable.tsx`

**Purpose**: Collaborative table where both user and Claude can edit data.

**Extends DataTable functionality with**:
- Inline cell editing (double-click to edit, Enter/blur to commit, Escape to cancel)
- Row selection checkboxes + Select All
- Add Row / Delete Selected buttons
- CopilotKit actions for AI collaboration

**Local state**: `rows` (mutable copy of `data.rows`), `editingCell`, `editValue`, `selectedRows`

**Type coercion on edit**: If original value was a number, tries `Number(editValue)`, falls back to string.

**CopilotKit integration** (scoped per table instance):

```typescript
// Readable: current table state
useCopilotReadable({
  description: `Current rows of editable table "${tableId}"`,
  value: JSON.stringify({ tableId, columnKeys, rowCount, rows: rows.slice(0, 50) }),
});

// Action: edit cells
useCopilotAction({ name: `editTableCells_${tableId}`, ... });
// Params: { edits: string } → JSON array of { rowIndex, column, value }

// Action: add rows
useCopilotAction({ name: `addTableRows_${tableId}`, ... });
// Params: { newRows: string } → JSON array of row objects

// Action: delete rows
useCopilotAction({ name: `deleteTableRows_${tableId}`, ... });
// Params: { rowIndices: string } → JSON array of row index numbers
```

**Scoped actions pattern**: Action names include the table ID (e.g., `editTableCells_canvas-1234`) so multiple editable tables can coexist without collision. Each table manages its own state and registers its own actions.

**Data re-sync**: A `useEffect` watches `data.rows` and re-initializes local state if Claude re-spawns the table with new data.

### `src/components/dynamic/LineChart.tsx`

**Purpose**: Time series line chart using [Recharts](https://recharts.org/).

**Data format**: `{ xKey?: string, yKeys?: string[], data: [{...}], xLabel?: string, yLabel?: string }`

- `xKey` defaults to first key of first data row
- `yKeys` defaults to all keys except `xKey`

**Features**: Responsive container (100% width, 300px height), multiple Y-series with color coding, grid lines, tooltips, legend (if >1 series), smooth monotone curves.

**Color palette**: `["#2196f3", "#4caf50", "#ff9800", "#e91e63", "#9c27b0", "#00bcd4", "#795548"]`

### `src/components/dynamic/BarChart.tsx`

**Purpose**: Category comparison bar chart using Recharts.

Same data format and configuration as LineChart, but uses `<BarChart>` and `<Bar>` components with rounded top corners.

### `src/components/dynamic/JsonViewer.tsx`

**Purpose**: Collapsible recursive JSON tree viewer.

**Data format**: Any JSON object or array.

**Features**:
- Recursive `JsonNode` component handles nesting
- Click to expand/collapse objects and arrays
- Default: collapsed after depth 2
- Syntax highlighting by type:
  - `null`/`undefined` → gray (#999)
  - `boolean` → orange (#e65100)
  - `number` → blue (#1565c0)
  - `string` → green (#2e7d32)
  - Object keys → red (#c62828)
- Strings >200 chars → truncated
- Collapsed shows item/key count (e.g., "Object {3}")

### `src/components/dynamic/KeyValueGrid.tsx`

**Purpose**: Metadata display in a clean key-value format.

**Data format** (flexible):
```typescript
// Explicit entries
{ entries: [{ key: "Name", value: "MyProject" }] }

// Or flat object (auto-converted)
{ Name: "MyProject", Version: "1.0.0" }
```

**Features**:
- CSS Grid with `auto 1fr` columns
- Bold keys (right-padded, nowrap), values styled by type
- `null`/`undefined` → em-dash (—)
- `boolean` → "Yes" / "No"
- `Array` → comma-separated
- `Object` → JSON.stringify
- Monospace for numbers, objects, and UUID/hash-like strings

### `src/components/dynamic/ProgressDashboard.tsx`

**Purpose**: Status cards with colored progress bars.

**Data format**:
```typescript
{
  items: [{
    label: string;
    value: number;
    max?: number;          // default 100
    status?: "success" | "warning" | "error" | "pending";
  }]
}
```

**Status colors**:
- `success`: green (#4caf50)
- `warning`: orange (#ff9800)
- `error`: red (#f44336)
- `pending`: blue (#2196f3)

**Layout**: Responsive grid (`auto-fill, minmax(200px, 1fr)`), each card has colored background, status badge, progress bar with CSS transition animation.

### `src/components/dynamic/CustomHtml.tsx`

**Purpose**: Renders arbitrary HTML/CSS/JS in a sandboxed iframe.

**Data format**: `{ html: "<div>...any HTML...</div>" }`

**Security**: Renders in `<iframe sandbox="allow-scripts">`, which prevents:
- Access to parent DOM
- Cookies and localStorage
- Same-origin requests
- Top-level navigation

**Auto-resize**:
- Injects a resize observer script into the iframe
- Sends `postMessage` with content height
- Parent listens and updates iframe height dynamically
- Monitors: DOM mutations, load, resize events
- Height clamped: 100px min, 800px max

**Template**: Wraps user HTML in a full HTML document with box-sizing reset and base body styles.

**Use cases**: Custom layouts, SVG diagrams, interactive widgets, styled reports — anything that doesn't fit the built-in component types.

---

## CopilotKit Integration Points

### Actions (useCopilotAction)

| Action Name | Source | Purpose |
|-------------|--------|---------|
| `spawnCanvas` | `useCanvas` | Create/update canvas visualization |
| `clearCanvas` | `useCanvas` | Remove all canvas visualizations |
| `editTableCells_{tableId}` | `EditableTable` | Edit cells in a specific table |
| `addTableRows_{tableId}` | `EditableTable` | Add rows to a specific table |
| `deleteTableRows_{tableId}` | `EditableTable` | Delete rows from a specific table |

### Readable Context (useCopilotReadable)

| Description | Source | Content |
|-------------|--------|---------|
| Canvas state | `useCanvas` | List of visualization titles and types |
| Table rows | `EditableTable` | Column keys + first 50 rows as JSON |

### Tool Rendering (useRenderToolCall)

| Tool | Source | Display |
|------|--------|---------|
| Bash, Edit, Write, Read, Glob, Grep, TodoWrite, spawnCanvas | `ToolRenderers` | Themed inline cards with icons |
| All others | `ToolRenderers` (default) | Generic gray card |

### System Instructions

Provided via `CopilotSidebar`'s `instructions` prop. Teaches Claude:
- It has a canvas with `spawnCanvas` for visual output
- When to use each component type (data-table, line-chart, bar-chart, etc.)
- Editable-table features (scoped actions, user editing)
- Custom type for anything that doesn't fit built-in types
- "Don't just describe data in text. Show it on the canvas."

---

## Patterns

### 1. Component Registry

New canvas component types are added in three places:
1. `types.ts` — add to `CanvasComponentType` union
2. `dynamic/YourComponent.tsx` — implement the component (receives `{ data: any }`)
3. `dynamic/registry.ts` — add entry with component, label, and color

### 2. Scoped Actions

Stateful components (like EditableTable) register CopilotKit actions scoped to their instance using the component ID as a suffix: `actionName_{componentId}`. This allows multiple instances to coexist without collision.

### 3. JSON String Parameters

CopilotKit action parameters pass complex data as JSON strings (not objects). The handler parses them. This works around CopilotKit's parameter type limitations for deeply nested objects.

### 4. SSE for Real-Time Tool Approval

The management API uses Server-Sent Events (not polling) for tool approval requests. The frontend subscribes once on mount via `EventSource`, which auto-reconnects. The server sends heartbeats every 15 seconds.

### 5. Sandboxed Custom HTML

Custom HTML runs in an iframe with `sandbox="allow-scripts"`. This provides security isolation while still allowing JavaScript execution. The auto-resize mechanism uses `postMessage` to communicate the content height back to the parent, keeping the iframe sized appropriately.

### 6. Visual-First Instructions

The CopilotSidebar instructions explicitly tell Claude to prefer visual output (canvas) over text whenever showing data. This is key to the canvas UX — without it, Claude would default to describing data in text.

---

## Running the Test App

### Prerequisites

- Node.js >= 18
- Claude Code CLI installed and authenticated (`npm install -g @anthropic-ai/claude-code`)
- The bridge library built (`npm install && npm run build` from project root)

### Steps

```bash
# 1. Build the bridge library (from project root)
npm install
npm run build

# 2. Install test-app dependencies
cd test-app
npm install

# 3. Start the server (terminal 1)
npx tsx src/server.ts

# 4. Start the frontend (terminal 2)
cd test-app
npx vite

# 5. Open http://localhost:5173
```

### What Happens

1. Server starts bridge on ports 3000 (AG-UI) + 3001 (WebSocket) + 3002 (management API)
2. Vite serves the React app on port 5173
3. User enters a folder path → session is created → Claude CLI spawns
4. CopilotKit connects to `http://localhost:3000` and discovers the "default" agent
5. User chats with Claude → Claude reads files, runs commands, spawns visualizations
6. Tool approval requests appear as banners in the UI

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@copilotkit/react-core` | ^1.51.0 | CopilotKit core (actions, readable, hooks) |
| `@copilotkit/react-ui` | ^1.51.0 | CopilotKit UI (CopilotSidebar) |
| `@ag-ui/client` | ^0.0.45 | AG-UI protocol client |
| `copilotkit-claude-bridge` | `file:..` | The bridge library (local link) |
| `react` | ^19.0.0 | React framework |
| `react-dom` | ^19.0.0 | React DOM renderer |
| `recharts` | ^2.15.0 | Charts (LineChart, BarChart) |

Dev: `vite`, `@vitejs/plugin-react`, `tsx` (for server), `concurrently` (for `npm run dev`).
