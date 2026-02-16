interface Props {
  data: {
    entries?: { key: string; value: unknown }[];
  } & Record<string, unknown>;
}

export function KeyValueGrid({ data }: Props) {
  // Support both { entries: [...] } and flat { key: value } formats
  const entries: { key: string; value: unknown }[] = data.entries ?? Object.entries(data)
    .filter(([k]) => k !== "entries")
    .map(([key, value]) => ({ key, value }));

  if (entries.length === 0) {
    return <div style={{ padding: 16, color: "#999", fontSize: 13 }}>No data to display.</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 0, fontSize: 13 }}>
      {entries.map(({ key, value }, i) => (
        <div key={key} style={{ display: "contents" }}>
          <div
            style={{
              padding: "8px 16px 8px 0",
              fontWeight: 600,
              color: "#333",
              borderBottom: i < entries.length - 1 ? "1px solid #f0f0f0" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {key}
          </div>
          <div
            style={{
              padding: "8px 0",
              color: "#555",
              borderBottom: i < entries.length - 1 ? "1px solid #f0f0f0" : "none",
              fontFamily: needsMono(value) ? "monospace" : "inherit",
              fontSize: needsMono(value) ? 12 : 13,
              wordBreak: "break-word",
            }}
          >
            {formatValue(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value == null) return "\u2014";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function needsMono(value: unknown): boolean {
  if (typeof value === "number") return true;
  if (typeof value === "object" && value !== null) return true;
  if (typeof value === "string" && /^[a-f0-9-]{8,}$/i.test(value)) return true;
  return false;
}
