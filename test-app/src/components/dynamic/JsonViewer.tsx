import { useState } from "react";

interface Props {
  data: unknown;
}

export function JsonViewer({ data }: Props) {
  return (
    <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
      <JsonNode value={data} depth={0} />
    </div>
  );
}

function JsonNode({ value, depth }: { value: unknown; depth: number }) {
  const [collapsed, setCollapsed] = useState(depth > 2);

  if (value === null) return <span style={{ color: "#999" }}>null</span>;
  if (value === undefined) return <span style={{ color: "#999" }}>undefined</span>;
  if (typeof value === "boolean") return <span style={{ color: "#e65100" }}>{String(value)}</span>;
  if (typeof value === "number") return <span style={{ color: "#1565c0" }}>{value}</span>;
  if (typeof value === "string") {
    if (value.length > 200) {
      return <span style={{ color: "#2e7d32" }}>"{value.slice(0, 200)}..."</span>;
    }
    return <span style={{ color: "#2e7d32" }}>"{value}"</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: "#888" }}>[]</span>;
    return (
      <span>
        <Toggler collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <span style={{ color: "#888" }}>[</span>
        {collapsed ? (
          <span
            style={{ color: "#999", cursor: "pointer" }}
            onClick={() => setCollapsed(false)}
          >
            {` ${value.length} items `}
          </span>
        ) : (
          <div style={{ paddingLeft: 16 }}>
            {value.map((item, i) => (
              <div key={i}>
                <JsonNode value={item} depth={depth + 1} />
                {i < value.length - 1 && <span style={{ color: "#888" }}>,</span>}
              </div>
            ))}
          </div>
        )}
        <span style={{ color: "#888" }}>]</span>
      </span>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span style={{ color: "#888" }}>{"{}"}</span>;
    return (
      <span>
        <Toggler collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <span style={{ color: "#888" }}>{"{"}</span>
        {collapsed ? (
          <span
            style={{ color: "#999", cursor: "pointer" }}
            onClick={() => setCollapsed(false)}
          >
            {` ${entries.length} keys `}
          </span>
        ) : (
          <div style={{ paddingLeft: 16 }}>
            {entries.map(([key, val], i) => (
              <div key={key}>
                <span style={{ color: "#c62828" }}>"{key}"</span>
                <span style={{ color: "#888" }}>: </span>
                <JsonNode value={val} depth={depth + 1} />
                {i < entries.length - 1 && <span style={{ color: "#888" }}>,</span>}
              </div>
            ))}
          </div>
        )}
        <span style={{ color: "#888" }}>{"}"}</span>
      </span>
    );
  }

  return <span>{String(value)}</span>;
}

function Toggler({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <span
      onClick={onToggle}
      style={{
        cursor: "pointer",
        display: "inline-block",
        width: 14,
        textAlign: "center",
        color: "#888",
        userSelect: "none",
        fontSize: 10,
      }}
    >
      {collapsed ? "\u25B6" : "\u25BC"}
    </span>
  );
}
