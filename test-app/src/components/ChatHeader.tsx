import { useState, useRef, useEffect } from "react";
import { useSessionCapabilities } from "../hooks/useSessionCapabilities";
import { colors, spacing, radius, shadows, typography, transitions } from "../styles";

const MODES = [
  { value: "default", label: "Default", description: "Ask before risky actions", color: colors.textSecondary },
  { value: "plan", label: "Plan", description: "Read-only planning mode", color: colors.info },
  { value: "acceptEdits", label: "Accept Edits", description: "Auto-accept file edits", color: colors.success },
  { value: "bypassPermissions", label: "Dangerous", description: "Skip all permission checks", color: colors.error },
  { value: "dontAsk", label: "Don't Ask", description: "Never prompt for approval", color: colors.warning },
];

export function ChatHeader() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { capabilities, setPermissionMode } = useSessionCapabilities();

  const currentMode = MODES.find((m) => m.value === capabilities?.permissionMode) ?? MODES[0];

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: `${spacing.md}px ${spacing.lg}px`,
      borderBottom: `1px solid ${colors.borderLight}`,
      background: colors.surface,
      minHeight: 44,
      fontFamily: typography.fontFamily,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
        <span style={{
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.bold,
          color: colors.text,
        }}>
          Claude Code
        </span>
      </div>

      {/* Mode badge + dropdown */}
      <div ref={dropdownRef} style={{ position: "relative" }}>
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.xs,
            padding: `3px ${spacing.sm}px`,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
            fontFamily: typography.fontFamily,
            color: currentMode.color,
            background: `${currentMode.color}12`,
            border: `1px solid ${currentMode.color}30`,
            borderRadius: radius.sm,
            cursor: "pointer",
            transition: transitions.fast,
          }}
        >
          {currentMode.label}
          <span style={{ fontSize: 8, marginLeft: 2 }}>{dropdownOpen ? "\u25B2" : "\u25BC"}</span>
        </button>

        {dropdownOpen && (
          <div style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: spacing.xs,
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            boxShadow: shadows.lg,
            zIndex: 1000,
            minWidth: 220,
            overflow: "hidden",
          }}>
            <div style={{
              padding: `${spacing.sm}px ${spacing.md}px`,
              fontSize: 10,
              fontWeight: typography.weights.semibold,
              color: colors.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              borderBottom: `1px solid ${colors.borderLight}`,
              fontFamily: typography.fontFamily,
            }}>
              Permission Mode
            </div>
            {MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => {
                  setPermissionMode(mode.value);
                  setDropdownOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  border: "none",
                  background: mode.value === currentMode.value ? colors.surfaceHover : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: transitions.fast,
                  fontFamily: typography.fontFamily,
                }}
              >
                <div style={{
                  fontSize: typography.sizes.sm,
                  fontWeight: mode.value === currentMode.value ? typography.weights.bold : typography.weights.medium,
                  color: mode.color,
                }}>
                  {mode.label}
                  {mode.value === currentMode.value && (
                    <span style={{
                      marginLeft: spacing.sm,
                      fontSize: 10,
                      color: colors.textMuted,
                    }}>
                      (current)
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 10,
                  color: colors.textMuted,
                  marginTop: 1,
                }}>
                  {mode.description}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
