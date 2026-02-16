import { useState, useRef, useEffect } from "react";
import { useSessionCapabilities } from "../hooks/useSessionCapabilities";

const MODES = [
  { value: "default", label: "Default", description: "Ask before risky actions", color: "#666" },
  { value: "plan", label: "Plan", description: "Read-only planning mode", color: "#0066cc" },
  { value: "acceptEdits", label: "Accept Edits", description: "Auto-accept file edits", color: "#2e7d32" },
  { value: "bypassPermissions", label: "Dangerous", description: "Skip all permission checks", color: "#c62828" },
  { value: "dontAsk", label: "Don't Ask", description: "Never prompt for approval", color: "#e65100" },
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
      padding: "10px 14px",
      borderBottom: "1px solid #e8e8e8",
      background: "#fff",
      minHeight: 44,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>Claude Code</span>
      </div>

      {/* Mode badge + dropdown */}
      <div ref={dropdownRef} style={{ position: "relative" }}>
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            fontSize: 11,
            fontWeight: 600,
            color: currentMode.color,
            background: `${currentMode.color}12`,
            border: `1px solid ${currentMode.color}30`,
            borderRadius: 4,
            cursor: "pointer",
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
            marginTop: 4,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            zIndex: 1000,
            minWidth: 200,
            overflow: "hidden",
          }}>
            <div style={{ padding: "6px 10px", fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", borderBottom: "1px solid #f0f0f0" }}>
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
                  padding: "8px 10px",
                  border: "none",
                  background: mode.value === currentMode.value ? "#f5f5f5" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{
                  fontSize: 12,
                  fontWeight: mode.value === currentMode.value ? 700 : 500,
                  color: mode.color,
                }}>
                  {mode.label}
                  {mode.value === currentMode.value && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: "#999" }}>(current)</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>
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
