import { useState } from "react";
import { colors, spacing, typography, radius, shadows } from "../styles";
import type { WorkspaceSnapshot } from "../hooks/useStatePersistence";

interface Props {
  snapshots: WorkspaceSnapshot[];
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}

export function StatusBar({ snapshots, onSave, onLoad, onDelete }: Props) {
  const [showSave, setShowSave] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [saveName, setSaveName] = useState("");

  const handleSave = () => {
    if (!saveName.trim()) return;
    onSave(saveName.trim());
    setSaveName("");
    setShowSave(false);
  };

  return (
    <div style={{
      height: 36,
      padding: `0 ${spacing.lg}px`,
      borderTop: `1px solid ${colors.borderLight}`,
      background: colors.surface,
      display: "flex",
      alignItems: "center",
      gap: spacing.lg,
      flexShrink: 0,
      fontSize: typography.sizes.xs,
      color: colors.textMuted,
      fontFamily: typography.fontFamily,
    }}>
      {/* Left: session info */}
      <span style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
        <span style={{
          width: 6, height: 6, borderRadius: 3,
          background: colors.success,
          display: "inline-block",
        }} />
        Connected
      </span>

      <div style={{ flex: 1 }} />

      {/* Save snapshot */}
      <div style={{ position: "relative" }}>
        {showSave ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.xs,
          }}>
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") { setShowSave(false); setSaveName(""); }
              }}
              placeholder="Snapshot name..."
              style={{
                padding: "2px 8px",
                fontSize: typography.sizes.xs,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                outline: "none",
                width: 140,
                fontFamily: typography.fontFamily,
              }}
            />
            <button onClick={handleSave} style={smallBtn}>Save</button>
            <button onClick={() => { setShowSave(false); setSaveName(""); }} style={smallBtnGhost}>
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setShowSave(true)} style={smallBtnGhost}>
            Save Snapshot
          </button>
        )}
      </div>

      {/* Load snapshot */}
      {snapshots.length > 0 && (
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowLoad(!showLoad)}
            style={smallBtnGhost}
          >
            Load ({snapshots.length})
          </button>
          {showLoad && (
            <div style={{
              position: "absolute",
              bottom: "100%",
              right: 0,
              marginBottom: spacing.xs,
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              boxShadow: shadows.lg,
              minWidth: 200,
              overflow: "hidden",
              zIndex: 100,
            }}>
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing.sm,
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    borderBottom: `1px solid ${colors.borderLight}`,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.surfaceHover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div
                    style={{ flex: 1, fontSize: typography.sizes.xs }}
                    onClick={() => { onLoad(snap.id); setShowLoad(false); }}
                  >
                    <div style={{ fontWeight: typography.weights.medium, color: colors.text }}>
                      {snap.name}
                    </div>
                    <div style={{ color: colors.textMuted, fontSize: 10 }}>
                      {new Date(snap.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(snap.id); }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: colors.textMuted,
                      fontSize: 14,
                      padding: "0 2px",
                    }}
                    title="Delete snapshot"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 10px",
  border: "none",
  borderRadius: 4,
  background: colors.accent,
  color: "#fff",
  cursor: "pointer",
};

const smallBtnGhost: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  padding: "2px 10px",
  border: `1px solid ${colors.border}`,
  borderRadius: 4,
  background: "transparent",
  color: colors.textSecondary,
  cursor: "pointer",
};
