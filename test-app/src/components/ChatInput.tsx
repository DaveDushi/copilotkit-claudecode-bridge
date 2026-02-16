import { useState, useRef, useEffect, useMemo } from "react";
import { useToolApprovalContext } from "../contexts/ToolApprovalContext";
import { useSessionCapabilities } from "../hooks/useSessionCapabilities";
import type { ToolApprovalRequest } from "../hooks/useToolApproval";

interface AutocompleteItem {
  type: "command" | "skill";
  name: string;
  description: string;
  value: string; // what gets sent
}

export function ChatInput({
  inProgress,
  onSend,
  onStop,
}: {
  inProgress: boolean;
  onSend: (text: string) => Promise<any>;
  isVisible?: boolean;
  onStop?: () => void;
  onUpload?: () => void;
  hideStopButton?: boolean;
  chatReady?: boolean;
}) {
  const [value, setValue] = useState("");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  const { pending, approve, deny, approveAll } = useToolApprovalContext();
  const { capabilities } = useSessionCapabilities();

  // Build autocomplete items from capabilities
  const allItems = useMemo<AutocompleteItem[]>(() => {
    const items: AutocompleteItem[] = [];

    // Commands from initData (have descriptions)
    if (capabilities?.commands) {
      for (const cmd of capabilities.commands) {
        items.push({
          type: "command",
          name: cmd.name.startsWith("/") ? cmd.name : `/${cmd.name}`,
          description: cmd.description,
          value: cmd.name.startsWith("/") ? cmd.name : `/${cmd.name}`,
        });
      }
    }

    // Skills
    if (capabilities?.skills) {
      for (const skill of capabilities.skills) {
        items.push({
          type: "skill",
          name: `/${skill}`,
          description: "Skill",
          value: `/${skill}`,
        });
      }
    }

    return items;
  }, [capabilities]);

  // Filter items based on current input
  const filteredItems = useMemo(() => {
    if (!value.startsWith("/")) return [];
    const query = value.toLowerCase();
    return allItems.filter((item) => item.name.toLowerCase().startsWith(query));
  }, [value, allItems]);

  // Show/hide autocomplete
  useEffect(() => {
    setShowAutocomplete(value.startsWith("/") && filteredItems.length > 0);
    setSelectedIndex(0);
  }, [value, filteredItems.length]);

  const selectItem = (item: AutocompleteItem) => {
    onSend(item.value);
    setValue("");
    setShowAutocomplete(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showAutocomplete && filteredItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        selectItem(filteredItems[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowAutocomplete(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !inProgress) {
      e.preventDefault();
      if (value.trim()) {
        onSend(value);
        setValue("");
      }
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* ── Approval panel ──────────────────────────────── */}
      {pending.length > 0 && (
        <div style={{
          background: "#fff8e1",
          borderRadius: "8px 8px 0 0",
          border: "1px solid #ffe082",
          borderBottom: "none",
          padding: "8px 10px",
          maxHeight: 200,
          overflowY: "auto",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: pending.length > 1 ? 6 : 0,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#f57f17" }}>
              {pending.length} tool{pending.length > 1 ? "s" : ""} awaiting approval
            </span>
            {pending.length > 1 && (
              <button onClick={approveAll} style={approveAllBtn}>Allow All</button>
            )}
          </div>
          {pending.map((req) => (
            <ApprovalCard key={req.requestId} req={req} onApprove={approve} onDeny={deny} />
          ))}
        </div>
      )}

      {/* ── Autocomplete dropdown ───────────────────────── */}
      {showAutocomplete && (
        <div ref={autocompleteRef} style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 4,
          maxHeight: 220,
          overflowY: "auto",
          boxShadow: "0 -4px 12px rgba(0,0,0,0.08)",
        }}>
          {filteredItems.map((item, i) => (
            <div
              key={item.name}
              onClick={() => selectItem(item)}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                background: i === selectedIndex ? "#f0f4ff" : "transparent",
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderBottom: i < filteredItems.length - 1 ? "1px solid #f0f0f0" : "none",
              }}
            >
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                color: item.type === "command" ? "#0066cc" : "#2e7d32",
                background: item.type === "command" ? "#e3f2fd" : "#e8f5e9",
                padding: "1px 5px",
                borderRadius: 3,
                minWidth: 36,
                textAlign: "center",
              }}>
                {item.type}
              </span>
              <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "#333" }}>
                {item.name}
              </span>
              <span style={{ fontSize: 11, color: "#888", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.description}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Input row ───────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 6,
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: pending.length > 0 ? "0 0 8px 8px" : 8,
        padding: "8px 10px",
      }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={inProgress ? "Claude is working..." : "Message Claude Code... (/ for commands)"}
          disabled={inProgress}
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            border: "none",
            outline: "none",
            fontSize: 13,
            fontFamily: "system-ui, sans-serif",
            lineHeight: 1.4,
            background: "transparent",
            color: "#333",
            padding: 0,
          }}
        />
        {inProgress && onStop ? (
          <button onClick={onStop} style={stopBtn}>Stop</button>
        ) : (
          <button
            onClick={() => {
              if (value.trim()) {
                onSend(value);
                setValue("");
              }
            }}
            disabled={!value.trim()}
            style={{
              ...sendBtn,
              opacity: value.trim() ? 1 : 0.4,
              cursor: value.trim() ? "pointer" : "default",
            }}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Approval card — compact version for sidebar
// ═══════════════════════════════════════════════════════════════

function ApprovalCard({
  req,
  onApprove,
  onDeny,
}: {
  req: ToolApprovalRequest;
  onApprove: (req: ToolApprovalRequest) => void;
  onDeny: (req: ToolApprovalRequest, reason?: string) => void;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "5px 8px",
      marginTop: 4,
      background: "#fff",
      borderRadius: 6,
      border: "1px solid #ffe082",
      fontSize: 11,
    }}>
      <span style={{
        fontWeight: 700,
        fontFamily: "monospace",
        color: "#e65100",
        flexShrink: 0,
      }}>
        {req.toolName}
      </span>
      <span style={{
        flex: 1,
        fontFamily: "monospace",
        fontSize: 10,
        color: "#555",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {formatToolInput(req.toolName, req.toolInput)}
      </span>
      <button onClick={() => onApprove(req)} style={allowBtn}>Allow</button>
      <button onClick={() => onDeny(req)} style={denyBtn}>Deny</button>
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
    default: return JSON.stringify(input).slice(0, 100);
  }
}

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════

const approveAllBtn: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, background: "#4caf50", color: "#fff",
  border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer",
};
const allowBtn: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, background: "#4caf50", color: "#fff",
  border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer", flexShrink: 0,
};
const denyBtn: React.CSSProperties = {
  fontSize: 10, fontWeight: 500, background: "transparent", color: "#c62828",
  border: "1px solid #ef9a9a", borderRadius: 4, padding: "1px 6px", cursor: "pointer", flexShrink: 0,
};
const sendBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, background: "#0066cc", color: "#fff",
  border: "none", borderRadius: 6, padding: "5px 14px", cursor: "pointer", flexShrink: 0,
};
const stopBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, background: "#c62828", color: "#fff",
  border: "none", borderRadius: 6, padding: "5px 14px", cursor: "pointer", flexShrink: 0,
};
