interface ProgressItem {
  label: string;
  value: number;
  max?: number;
  status?: "success" | "warning" | "error" | "pending";
}

interface Props {
  data: {
    items?: ProgressItem[];
  };
}

const STATUS_COLORS: Record<string, { bg: string; fg: string; bar: string }> = {
  success: { bg: "#e8f5e9", fg: "#2e7d32", bar: "#4caf50" },
  warning: { bg: "#fff3e0", fg: "#e65100", bar: "#ff9800" },
  error: { bg: "#ffebee", fg: "#c62828", bar: "#f44336" },
  pending: { bg: "#e3f2fd", fg: "#1565c0", bar: "#2196f3" },
};

export function ProgressDashboard({ data }: Props) {
  const items = data.items ?? [];

  if (items.length === 0) {
    return <div style={{ padding: 16, color: "#999", fontSize: 13 }}>No items to display.</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
      {items.map((item, i) => {
        const status = item.status ?? "pending";
        const colors = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
        const max = item.max ?? 100;
        const pct = max > 0 ? Math.min(100, (item.value / max) * 100) : 0;

        return (
          <div
            key={i}
            style={{
              background: colors.bg,
              borderRadius: 8,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{item.label}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: colors.bar,
                  color: "#fff",
                  textTransform: "uppercase",
                }}
              >
                {status}
              </span>
            </div>

            <div style={{ background: "rgba(0,0,0,0.08)", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: colors.bar,
                  borderRadius: 4,
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            <div style={{ fontSize: 11, color: colors.fg }}>
              {item.value}{max !== 100 ? ` / ${max}` : "%"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
