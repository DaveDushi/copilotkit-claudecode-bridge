import { useState, useRef, useEffect } from "react";
import { colors, spacing, radius, typography, shadows, transitions } from "../styles";
import type { TodoItem } from "./ToolRenderers";

interface Props {
  componentCount: number;
  onNewSession?: () => void;
  todos?: TodoItem[];
}

export function StudioHeader({ componentCount, onNewSession, todos = [] }: Props) {
  const [showTasks, setShowTasks] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showTasks) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTasks(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTasks]);

  const done = todos.filter((t) => t.status === "completed").length;
  const inProgress = todos.filter((t) => t.status === "in_progress").length;
  const total = todos.length;
  return (
    <header style={{
      height: 48,
      padding: `0 ${spacing.xl}px`,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surface,
      display: "flex",
      alignItems: "center",
      gap: spacing.md,
      flexShrink: 0,
      boxShadow: shadows.sm,
      zIndex: 10,
    }}>
      {/* Branding */}
      <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
        <div style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentHover})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
        }}>
          &#9671;
        </div>
        <span style={{
          fontSize: typography.sizes.xl,
          fontWeight: typography.weights.semibold,
          fontFamily: typography.fontFamily,
          color: colors.text,
          letterSpacing: "-0.01em",
        }}>
          File Analysis Studio
        </span>
      </div>

      {/* Component count badge */}
      {componentCount > 0 && (
        <span style={{
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.medium,
          color: colors.accentText,
          background: colors.accentLight,
          padding: "2px 10px",
          borderRadius: 10,
        }}>
          {componentCount} panel{componentCount !== 1 ? "s" : ""}
        </span>
      )}

      {/* Task list button + dropdown */}
      {total > 0 && (
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowTasks((p) => !p)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: spacing.xs,
              padding: `${spacing.xs}px ${spacing.md}px`,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.medium,
              fontFamily: typography.fontFamily,
              color: inProgress > 0 ? colors.accent : done === total ? colors.success : colors.textSecondary,
              background: inProgress > 0 ? colors.accentLight : done === total ? colors.successLight : "transparent",
              border: `1px solid ${inProgress > 0 ? colors.accent + "40" : done === total ? colors.success + "40" : colors.border}`,
              borderRadius: radius.sm,
              cursor: "pointer",
              transition: transitions.fast,
            }}
          >
            {inProgress > 0 && <span className="pulse" style={{ width: 6, height: 6, borderRadius: 3, background: colors.accent, display: "inline-block" }} />}
            {done === total ? "\u2713 " : ""}Tasks {done}/{total}
          </button>

          {showTasks && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              minWidth: 280,
              maxWidth: 360,
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              boxShadow: shadows.lg,
              padding: spacing.md,
              zIndex: 100,
            }} className="fade-in">
              <div style={{
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                color: colors.text,
                marginBottom: spacing.sm,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <span>Task Progress</span>
                <span style={{
                  fontSize: typography.sizes.xs,
                  color: colors.textMuted,
                  fontWeight: typography.weights.normal,
                }}>
                  {done}/{total} done
                </span>
              </div>

              {/* Progress bar */}
              <div style={{
                height: 4,
                background: colors.borderLight,
                borderRadius: 2,
                marginBottom: spacing.md,
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${total > 0 ? (done / total) * 100 : 0}%`,
                  background: done === total ? colors.success : colors.accent,
                  borderRadius: 2,
                  transition: transitions.normal,
                }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {todos.map((todo, i) => {
                  const icon = todo.status === "completed" ? "\u2713"
                    : todo.status === "in_progress" ? "\u25CF"
                    : "\u25CB";
                  const iconColor = todo.status === "completed" ? colors.success
                    : todo.status === "in_progress" ? colors.accent
                    : colors.textMuted;
                  return (
                    <div key={i} style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: spacing.sm,
                      fontSize: typography.sizes.sm,
                      padding: `3px 0`,
                      color: todo.status === "completed" ? colors.textMuted : colors.text,
                    }}>
                      <span style={{
                        color: iconColor,
                        fontSize: 10,
                        width: 14,
                        textAlign: "center",
                        flexShrink: 0,
                        marginTop: 2,
                      }}>{icon}</span>
                      <span style={{
                        textDecoration: todo.status === "completed" ? "line-through" : "none",
                        fontWeight: todo.status === "in_progress" ? typography.weights.medium : typography.weights.normal,
                      }}>
                        {todo.status === "in_progress" ? todo.activeForm : todo.content}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Open Folder button */}
      {onNewSession && (
        <button
          onClick={onNewSession}
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.xs,
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.medium,
            fontFamily: typography.fontFamily,
            color: colors.textSecondary,
            background: "transparent",
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            cursor: "pointer",
            transition: transitions.fast,
          }}
        >
          Open Folder
        </button>
      )}

      {/* Powered by badge */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: spacing.xs,
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
      }}>
        <span>Powered by</span>
        <span style={{ fontWeight: typography.weights.semibold, color: colors.textSecondary }}>
          CopilotKit
        </span>
        <span style={{ color: colors.border }}>+</span>
        <span style={{ fontWeight: typography.weights.semibold, color: colors.textSecondary }}>
          Claude Code
        </span>
      </div>
    </header>
  );
}
