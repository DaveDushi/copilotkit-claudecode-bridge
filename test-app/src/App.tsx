/**
 * Claude Code Canvas — Dynamic UI spawning demo.
 *
 * Chat sidebar (CopilotKit) + Canvas area (where Claude spawns visualizations).
 * Tool approval banner for human-in-the-loop control.
 * That's it. Nothing else.
 */
import { useState, useCallback } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

import { DynamicCanvas } from "./components/DynamicCanvas";
import { ToolRenderers } from "./components/ToolRenderers";
import { useCanvas } from "./hooks/useCanvas";
import { useToolApproval } from "./hooks/useToolApproval";
import type { ToolApprovalRequest } from "./hooks/useToolApproval";
import type { CanvasComponent } from "./types";

const RUNTIME_URL = "http://localhost:3000";

// ═══════════════════════════════════════════════════════════════════════════
// Inner workspace — has access to CopilotKit context
// ═══════════════════════════════════════════════════════════════════════════

function Workspace() {
  const [components, setComponents] = useState<CanvasComponent[]>([]);
  const { pending, approve, deny, approveAll } = useToolApproval();

  // Register canvas actions + readable with CopilotKit
  useCanvas(components, setComponents);

  const handleRemove = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleClear = useCallback(() => setComponents([]), []);

  return (
    <CopilotSidebar
      defaultOpen={true}
      instructions={[
        "You are Claude Code with full system access, running in a web workspace.",
        "You have a special ability: the spawnCanvas tool lets you render interactive",
        "visualizations (tables, charts, JSON viewers, dashboards) on the user's canvas.",
        "",
        "ALWAYS prefer visual output over text when showing data:",
        "  - Rows of data -> spawnCanvas type \"data-table\"",
        "  - Trends / time series -> spawnCanvas type \"line-chart\"",
        "  - Comparisons / categories -> spawnCanvas type \"bar-chart\"",
        "  - JSON / config objects -> spawnCanvas type \"json-viewer\"",
        "  - Summary stats / metadata -> spawnCanvas type \"key-value\"",
        "  - Status / progress -> spawnCanvas type \"progress-dashboard\"",
        "",
        "For collaborative data editing, use type \"editable-table\" instead of \"data-table\".",
        "  - User can double-click cells to edit, add rows, and delete rows",
        "  - You can see live table state via readable context and edit via editTableCells_<id>, addTableRows_<id>, deleteTableRows_<id>",
        "",
        "Don't just describe data in text. Show it on the canvas.",
      ].join("\n")}
      labels={{
        title: "Claude Code",
        initial: "I can run commands, read files, and show results visually on your canvas. What would you like to explore?",
      }}
    >
      {/* Hook-only components (no visible output) */}
      <ToolRenderers />

      <div style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
        background: "#f8f9fa",
      }}>
        {/* Header */}
        <header style={{
          padding: "10px 16px",
          borderBottom: "1px solid #e0e0e0",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Claude Code Canvas</h1>
          <span style={{ fontSize: 12, color: "#999" }}>
            {components.length > 0 ? `${components.length} visualization${components.length !== 1 ? "s" : ""}` : ""}
          </span>
        </header>

        {/* Tool approval banner */}
        {pending.length > 0 && (
          <ToolApprovalBanner
            requests={pending}
            onApprove={approve}
            onDeny={deny}
            onApproveAll={approveAll}
          />
        )}

        {/* Canvas */}
        <DynamicCanvas
          components={components}
          onRemove={handleRemove}
          onClear={handleClear}
        />
      </div>
    </CopilotSidebar>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// App shell — CopilotKit provider
// ═══════════════════════════════════════════════════════════════════════════

export default function App() {
  return (
    <CopilotKit runtimeUrl={RUNTIME_URL} agent="default">
      <Workspace />
    </CopilotKit>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tool approval banner
// ═══════════════════════════════════════════════════════════════════════════

function ToolApprovalBanner({
  requests,
  onApprove,
  onDeny,
  onApproveAll,
}: {
  requests: ToolApprovalRequest[];
  onApprove: (req: ToolApprovalRequest) => void;
  onDeny: (req: ToolApprovalRequest, reason?: string) => void;
  onApproveAll: () => void;
}) {
  return (
    <div style={{
      background: "#fff8e1",
      borderBottom: "1px solid #ffe082",
      padding: "8px 16px",
      flexShrink: 0,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: requests.length > 1 ? 6 : 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#f57f17" }}>
          {requests.length} tool{requests.length > 1 ? "s" : ""} waiting for approval
        </span>
        {requests.length > 1 && (
          <button onClick={onApproveAll} style={approveAllStyle}>
            Allow All
          </button>
        )}
      </div>
      {requests.map((req) => (
        <div key={req.requestId} style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          marginTop: 4,
          background: "#fff",
          borderRadius: 6,
          border: "1px solid #ffe082",
          fontSize: 12,
        }}>
          <span style={{ fontWeight: 700, fontFamily: "monospace", color: "#e65100", minWidth: 50 }}>
            {req.toolName}
          </span>
          <span style={{
            flex: 1,
            fontFamily: "monospace",
            fontSize: 11,
            color: "#555",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {formatToolInput(req.toolName, req.toolInput)}
          </span>
          <button onClick={() => onApprove(req)} style={allowBtnStyle}>Allow</button>
          <button onClick={() => onDeny(req)} style={denyBtnStyle}>Deny</button>
        </div>
      ))}
    </div>
  );
}

function formatToolInput(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Bash": return (input.command as string) ?? JSON.stringify(input);
    case "Read": case "Write": return (input.file_path as string) ?? JSON.stringify(input);
    case "Edit": return (input.file_path as string) ?? JSON.stringify(input);
    case "Glob": return (input.pattern as string) ?? JSON.stringify(input);
    case "Grep": return `/${input.pattern ?? ""}/ ${input.path ? `in ${input.path}` : ""}`;
    default: return JSON.stringify(input).slice(0, 120);
  }
}

const approveAllStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, background: "#4caf50", color: "#fff",
  border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer",
};
const allowBtnStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, background: "#4caf50", color: "#fff",
  border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer",
};
const denyBtnStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, background: "transparent", color: "#c62828",
  border: "1px solid #ef9a9a", borderRadius: 4, padding: "2px 8px", cursor: "pointer",
};
