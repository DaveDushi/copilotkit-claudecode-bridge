import { useState, useRef, useEffect, useMemo } from "react";
import { useToolApprovalContext } from "../contexts/ToolApprovalContext";
import { useSessionCapabilities } from "../hooks/useSessionCapabilities";
import { colors, spacing, radius, shadows, typography, transitions } from "../styles";
import type { ToolApprovalRequest } from "../hooks/useToolApproval";

interface AutocompleteItem {
  type: "command" | "skill";
  name: string;
  description: string;
  value: string;
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
          background: colors.warningLight,
          borderRadius: `${radius.md}px ${radius.md}px 0 0`,
          border: `1px solid ${colors.warning}33`,
          borderBottom: "none",
          padding: `${spacing.sm}px ${spacing.md}px`,
          maxHeight: 200,
          overflowY: "auto",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: pending.length > 1 ? spacing.sm : 0,
          }}>
            <span style={{
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              color: "#b45309",
              fontFamily: typography.fontFamily,
            }}>
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
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          marginBottom: spacing.xs,
          maxHeight: 220,
          overflowY: "auto",
          boxShadow: shadows.lg,
        }}>
          {filteredItems.map((item, i) => (
            <div
              key={item.name}
              onClick={() => selectItem(item)}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                padding: `${spacing.sm}px ${spacing.md}px`,
                cursor: "pointer",
                background: i === selectedIndex ? colors.accentLight : "transparent",
                display: "flex",
                alignItems: "center",
                gap: spacing.sm,
                borderBottom: i < filteredItems.length - 1 ? `1px solid ${colors.borderLight}` : "none",
                transition: transitions.fast,
              }}
            >
              <span style={{
                fontSize: 9,
                fontWeight: typography.weights.bold,
                textTransform: "uppercase",
                color: item.type === "command" ? colors.info : colors.success,
                background: item.type === "command" ? colors.infoLight : colors.successLight,
                padding: "1px 5px",
                borderRadius: 3,
                minWidth: 36,
                textAlign: "center",
                fontFamily: typography.fontFamily,
              }}>
                {item.type}
              </span>
              <span style={{
                fontFamily: typography.mono,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                color: colors.text,
              }}>
                {item.name}
              </span>
              <span style={{
                fontSize: typography.sizes.xs,
                color: colors.textMuted,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
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
        gap: spacing.sm,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: pending.length > 0 ? `0 0 ${radius.md}px ${radius.md}px` : radius.md,
        padding: `${spacing.sm}px ${spacing.md}px`,
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
            fontSize: typography.sizes.md,
            fontFamily: typography.fontFamily,
            lineHeight: 1.4,
            background: "transparent",
            color: colors.text,
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
      gap: spacing.sm,
      padding: `${spacing.xs + 1}px ${spacing.sm}px`,
      marginTop: spacing.xs,
      background: colors.surface,
      borderRadius: radius.sm,
      border: `1px solid ${colors.warning}33`,
      fontSize: typography.sizes.xs,
      fontFamily: typography.fontFamily,
    }}>
      <span style={{
        fontWeight: typography.weights.bold,
        fontFamily: typography.mono,
        color: "#c2410c",
        flexShrink: 0,
      }}>
        {req.toolName}
      </span>
      <span style={{
        flex: 1,
        fontFamily: typography.mono,
        fontSize: 10,
        color: colors.textSecondary,
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
  fontSize: 10,
  fontWeight: typography.weights.semibold,
  background: colors.success,
  color: "#fff",
  border: "none",
  borderRadius: radius.sm,
  padding: "2px 8px",
  cursor: "pointer",
  fontFamily: typography.fontFamily,
};

const allowBtn: React.CSSProperties = {
  fontSize: 10,
  fontWeight: typography.weights.semibold,
  background: colors.success,
  color: "#fff",
  border: "none",
  borderRadius: radius.sm,
  padding: "2px 8px",
  cursor: "pointer",
  flexShrink: 0,
  fontFamily: typography.fontFamily,
};

const denyBtn: React.CSSProperties = {
  fontSize: 10,
  fontWeight: typography.weights.medium,
  background: "transparent",
  color: colors.error,
  border: `1px solid ${colors.error}40`,
  borderRadius: radius.sm,
  padding: "1px 6px",
  cursor: "pointer",
  flexShrink: 0,
  fontFamily: typography.fontFamily,
};

const sendBtn: React.CSSProperties = {
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
  background: colors.accent,
  color: "#fff",
  border: "none",
  borderRadius: radius.sm,
  padding: `${spacing.xs + 1}px ${spacing.lg}px`,
  cursor: "pointer",
  flexShrink: 0,
  fontFamily: typography.fontFamily,
  transition: transitions.fast,
};

const stopBtn: React.CSSProperties = {
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
  background: colors.error,
  color: "#fff",
  border: "none",
  borderRadius: radius.sm,
  padding: `${spacing.xs + 1}px ${spacing.lg}px`,
  cursor: "pointer",
  flexShrink: 0,
  fontFamily: typography.fontFamily,
  transition: transitions.fast,
};
