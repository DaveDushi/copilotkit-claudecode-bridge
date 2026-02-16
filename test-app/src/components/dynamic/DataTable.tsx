import { useState, useMemo } from "react";

interface Column { key: string; label: string }

interface Props {
  data: {
    columns?: Column[];
    rows?: Record<string, unknown>[];
  };
}

export function DataTable({ data }: Props) {
  const columns: Column[] = data.columns ?? (data.rows?.[0] ? Object.keys(data.rows[0]).map((k) => ({ key: k, label: k })) : []);
  const rows = data.rows ?? [];

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => String(row[col.key] ?? "").toLowerCase().includes(q)),
    );
  }, [rows, columns, filter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortKey, sortAsc]);

  const handleSort = (key: string) => {
    if (sortKey === key) { setSortAsc(!sortAsc); }
    else { setSortKey(key); setSortAsc(true); }
  };

  if (columns.length === 0) {
    return <div style={{ padding: 16, color: "#999", fontSize: 13 }}>No data to display.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter rows..."
        style={{
          padding: "6px 10px",
          fontSize: 12,
          border: "1px solid #ddd",
          borderRadius: 4,
          outline: "none",
        }}
      />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderBottom: "2px solid #e0e0e0",
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                    background: "#fafafa",
                    fontWeight: 600,
                  }}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span style={{ marginLeft: 4, fontSize: 10 }}>{sortAsc ? "\u25B2" : "\u25BC"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={i}
                style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#e3f2fd"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "#fff" : "#f9f9f9"; }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: "6px 10px",
                      borderBottom: "1px solid #f0f0f0",
                      maxWidth: 300,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatCell(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "#999" }}>
        {sorted.length} row{sorted.length !== 1 ? "s" : ""}
        {filter && ` (filtered from ${rows.length})`}
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
