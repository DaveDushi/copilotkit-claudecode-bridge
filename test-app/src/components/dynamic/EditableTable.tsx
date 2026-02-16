import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useCopilotReadable, useCopilotAction } from "@copilotkit/react-core";

interface Column { key: string; label: string }

interface Props {
  data: {
    columns?: Column[];
    rows?: Record<string, unknown>[];
    _tableId?: string;
  };
}

export function EditableTable({ data }: Props) {
  const tableId = data._tableId ?? "default";
  const columns: Column[] = data.columns ?? (data.rows?.[0] ? Object.keys(data.rows[0]).map((k) => ({ key: k, label: k })) : []);

  // Local mutable rows — seeded from data.rows
  const [rows, setRows] = useState<Record<string, unknown>[]>(
    () => (data.rows ?? []).map((r) => ({ ...r })),
  );

  // Re-sync when Claude re-spawns the table with new data
  const dataRowsRef = useRef(data.rows);
  useEffect(() => {
    if (data.rows !== dataRowsRef.current) {
      dataRowsRef.current = data.rows;
      setRows((data.rows ?? []).map((r) => ({ ...r })));
    }
  }, [data.rows]);

  // Sort + filter (same as DataTable)
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState("");

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Row selection
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // ── Derived data ──────────────────────────────────────────────────
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
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  // ── Inline editing ────────────────────────────────────────────────
  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const { rowIndex, colKey } = editingCell;
    setRows((prev) => {
      const updated = [...prev];
      const original = updated[rowIndex][colKey];
      let newValue: unknown = editValue;
      if (typeof original === "number") {
        const parsed = Number(editValue);
        if (!isNaN(parsed)) newValue = parsed;
      }
      updated[rowIndex] = { ...updated[rowIndex], [colKey]: newValue };
      return updated;
    });
    setEditingCell(null);
  }, [editingCell, editValue]);

  // ── Row operations ────────────────────────────────────────────────
  const handleAddRow = useCallback(() => {
    const empty: Record<string, unknown> = {};
    for (const col of columns) empty[col.key] = "";
    setRows((prev) => [...prev, empty]);
  }, [columns]);

  const handleDeleteSelected = useCallback(() => {
    setRows((prev) => prev.filter((_, i) => !selectedRows.has(i)));
    setSelectedRows(new Set());
  }, [selectedRows]);

  const toggleSelect = useCallback((index: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedRows.size === rows.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(rows.map((_, i) => i)));
  }, [selectedRows.size, rows.length]);

  // ── CopilotKit: expose current state ──────────────────────────────
  useCopilotReadable({
    description: `Current rows of editable table "${tableId}". Reflects all user and AI edits.`,
    value: JSON.stringify({
      tableId,
      columnKeys: columns.map((c) => c.key),
      rowCount: rows.length,
      rows: rows.slice(0, 50),
    }),
  });

  // ── CopilotKit: edit cells action ─────────────────────────────────
  useCopilotAction({
    name: `editTableCells_${tableId}`,
    description: `Edit cells in editable table "${tableId}". Provide a JSON array of edits.`,
    parameters: [
      {
        name: "edits",
        type: "string" as const,
        description: 'JSON array: [{"rowIndex": 0, "column": "name", "value": "new"}]',
        required: true,
      },
    ],
    handler: async ({ edits }: { edits: string }) => {
      const parsed: { rowIndex: number; column: string; value: unknown }[] = JSON.parse(edits);
      setRows((prev) => {
        const updated = [...prev];
        for (const edit of parsed) {
          if (edit.rowIndex >= 0 && edit.rowIndex < updated.length) {
            updated[edit.rowIndex] = { ...updated[edit.rowIndex], [edit.column]: edit.value };
          }
        }
        return updated;
      });
      return `Updated ${parsed.length} cell(s).`;
    },
  });

  // ── CopilotKit: add rows action ───────────────────────────────────
  useCopilotAction({
    name: `addTableRows_${tableId}`,
    description: `Add rows to editable table "${tableId}".`,
    parameters: [
      {
        name: "newRows",
        type: "string" as const,
        description: 'JSON array of row objects to append.',
        required: true,
      },
    ],
    handler: async ({ newRows }: { newRows: string }) => {
      const parsed: Record<string, unknown>[] = JSON.parse(newRows);
      setRows((prev) => [...prev, ...parsed]);
      return `Added ${parsed.length} row(s).`;
    },
  });

  // ── CopilotKit: delete rows action ────────────────────────────────
  useCopilotAction({
    name: `deleteTableRows_${tableId}`,
    description: `Delete rows from editable table "${tableId}" by indices.`,
    parameters: [
      {
        name: "rowIndices",
        type: "string" as const,
        description: 'JSON array of 0-based row indices to delete.',
        required: true,
      },
    ],
    handler: async ({ rowIndices }: { rowIndices: string }) => {
      const indices: number[] = JSON.parse(rowIndices);
      const indexSet = new Set(indices);
      setRows((prev) => prev.filter((_, i) => !indexSet.has(i)));
      return `Deleted ${indices.length} row(s).`;
    },
  });

  // ── Render ────────────────────────────────────────────────────────
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
        style={{ padding: "6px 10px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, outline: "none" }}
      />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={checkboxHeaderStyle}>
                <input
                  type="checkbox"
                  checked={selectedRows.size === rows.length && rows.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              {columns.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)} style={headerStyle}>
                  {col.label}
                  {sortKey === col.key && (
                    <span style={{ marginLeft: 4, fontSize: 10 }}>{sortAsc ? "\u25B2" : "\u25BC"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, displayIndex) => {
              const actualIndex = rows.indexOf(row);
              const isSelected = selectedRows.has(actualIndex);
              const bgBase = displayIndex % 2 === 0 ? "#fff" : "#f9f9f9";
              const bg = isSelected ? "#e8eaf6" : bgBase;

              return (
                <tr
                  key={actualIndex}
                  style={{ background: bg }}
                  onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#e3f2fd"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = bg; }}
                >
                  <td style={checkboxCellStyle}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(actualIndex)} />
                  </td>
                  {columns.map((col) => {
                    const isEditing = editingCell?.rowIndex === actualIndex && editingCell?.colKey === col.key;

                    return (
                      <td
                        key={col.key}
                        onDoubleClick={() => {
                          setEditingCell({ rowIndex: actualIndex, colKey: col.key });
                          setEditValue(String(row[col.key] ?? ""));
                        }}
                        style={cellStyle}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                            style={editInputStyle}
                          />
                        ) : (
                          formatCell(row[col.key])
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
        <button onClick={handleAddRow} style={addBtnStyle}>+ Add Row</button>
        {selectedRows.size > 0 && (
          <button onClick={handleDeleteSelected} style={deleteBtnStyle}>
            Delete Selected ({selectedRows.size})
          </button>
        )}
        <span style={{ color: "#999", marginLeft: "auto" }}>
          {sorted.length} row{sorted.length !== 1 ? "s" : ""}
          {filter && ` (filtered from ${rows.length})`}
          {" \u00B7 double-click to edit"}
        </span>
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ── Styles ──────────────────────────────────────────────────────────
const headerStyle: React.CSSProperties = {
  textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e0e0e0",
  cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", background: "#fafafa", fontWeight: 600,
};

const checkboxHeaderStyle: React.CSSProperties = {
  width: 32, padding: "8px 6px", borderBottom: "2px solid #e0e0e0",
  background: "#fafafa", textAlign: "center",
};

const checkboxCellStyle: React.CSSProperties = {
  width: 32, padding: "6px 6px", borderBottom: "1px solid #f0f0f0", textAlign: "center",
};

const cellStyle: React.CSSProperties = {
  padding: "6px 10px", borderBottom: "1px solid #f0f0f0",
  maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "default",
};

const editInputStyle: React.CSSProperties = {
  width: "100%", padding: "2px 4px", fontSize: 12,
  border: "1px solid #5c6bc0", borderRadius: 2, outline: "none", background: "#e8eaf6",
};

const addBtnStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: "3px 10px",
  border: "1px solid #c5cae9", borderRadius: 4, background: "#e8eaf6",
  color: "#283593", cursor: "pointer",
};

const deleteBtnStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, padding: "3px 10px",
  border: "1px solid #ef9a9a", borderRadius: 4, background: "#ffebee",
  color: "#c62828", cursor: "pointer",
};
