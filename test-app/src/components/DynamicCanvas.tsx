import type { CanvasComponent } from "../types";
import { CANVAS_REGISTRY } from "./dynamic/registry";

interface Props {
  components: CanvasComponent[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function DynamicCanvas({ components, onRemove, onClear }: Props) {
  if (components.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        color: "#999",
        padding: 40,
      }}>
        <div style={{ fontSize: 48, opacity: 0.3 }}>&#9671;</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: "#666" }}>Canvas</div>
        <div style={{ fontSize: 13, textAlign: "center", maxWidth: 360, lineHeight: 1.6 }}>
          Ask Claude to analyze data, explore files, or build something.
          Visualizations will appear here automatically.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, fontSize: 12, color: "#aaa" }}>
          <span>Try: "Show me the files in this project as a table"</span>
          <span>Try: "Analyze package.json and show key details"</span>
          <span>Try: "Create a progress dashboard for project setup"</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Clear all button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={onClear}
          style={{
            fontSize: 11,
            padding: "3px 10px",
            border: "1px solid #ddd",
            borderRadius: 4,
            background: "#fff",
            cursor: "pointer",
            color: "#888",
          }}
        >
          Clear all
        </button>
      </div>

      {/* Components, newest first */}
      {[...components].reverse().map((comp) => {
        const entry = CANVAS_REGISTRY[comp.type];
        if (!entry) return null;
        const Component = entry.component;

        return (
          <div
            key={comp.id}
            style={{
              background: "#fff",
              border: "1px solid #e0e0e0",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: "1px solid #f0f0f0",
              background: "#fafafa",
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{comp.title}</span>
              <span style={{
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 4,
                background: entry.color,
                color: "#333",
                fontWeight: 500,
              }}>
                {entry.label}
              </span>
              <span style={{ fontSize: 10, color: "#bbb" }}>
                {new Date(comp.timestamp).toLocaleTimeString()}
              </span>
              <button
                onClick={() => onRemove(comp.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#ccc",
                  fontSize: 16,
                  lineHeight: 1,
                  padding: "0 2px",
                }}
                title="Remove"
              >
                &times;
              </button>
            </div>

            {/* Component body */}
            <div style={{ padding: 12 }}>
              <Component data={comp.data} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
