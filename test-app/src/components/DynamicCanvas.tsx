import { useState, useEffect } from "react";
import type { CanvasComponent } from "../types";
import { CANVAS_REGISTRY } from "./dynamic/registry";
import { colors, spacing, radius, shadows, typography, transitions } from "../styles";

interface Props {
  components: CanvasComponent[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onExpand?: (id: string) => void;
}

export function DynamicCanvas({ components, onRemove, onClear, onExpand }: Props) {
  if (components.length === 0) {
    return (
      <div style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: spacing.lg,
        padding: 40,
        background: colors.bg,
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: radius.xl,
          background: `linear-gradient(135deg, ${colors.accentLight}, ${colors.toolCanvas})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
          opacity: 0.8,
        }}>
          &#9671;
        </div>
        <div style={{
          fontSize: typography.sizes.xl,
          fontWeight: typography.weights.semibold,
          color: colors.text,
          fontFamily: typography.fontFamily,
        }}>
          Canvas
        </div>
        <div style={{
          fontSize: typography.sizes.md,
          textAlign: "center",
          maxWidth: 400,
          lineHeight: 1.7,
          color: colors.textSecondary,
          fontFamily: typography.fontFamily,
        }}>
          Ask Claude to analyze data, explore files, or build something.
          Visualizations will appear here automatically.
        </div>
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: spacing.sm,
          marginTop: spacing.sm,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          fontFamily: typography.fontFamily,
        }}>
          <span>"Show me the files in this project as a table"</span>
          <span>"Analyze package.json and show key details"</span>
          <span>"Create a progress dashboard for project setup"</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      height: "100%",
      overflowY: "auto",
      padding: spacing.lg,
      background: colors.bg,
    }}>
      {/* Clear all button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: spacing.md }}>
        <button
          onClick={onClear}
          style={{
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.medium,
            padding: `${spacing.xs}px ${spacing.md}px`,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            background: colors.surface,
            cursor: "pointer",
            color: colors.textSecondary,
            transition: transitions.fast,
            fontFamily: typography.fontFamily,
          }}
        >
          Clear all
        </button>
      </div>

      {/* Responsive grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
        gap: spacing.md,
        alignContent: "start",
      }}>
        {[...components].reverse().map((comp) => (
          <CanvasCard
            key={comp.id}
            component={comp}
            onRemove={onRemove}
            onExpand={onExpand}
          />
        ))}
      </div>
    </div>
  );
}

function CanvasCard({
  component: comp,
  onRemove,
  onExpand,
}: {
  component: CanvasComponent;
  onRemove: (id: string) => void;
  onExpand?: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const entry = CANVAS_REGISTRY[comp.type];
  if (!entry) return null;
  const Component = entry.component;

  return (
    <div
      className="canvas-card-enter"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        overflow: "hidden",
        boxShadow: hovered ? shadows.md : shadows.sm,
        transition: transitions.normal,
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: spacing.sm,
        padding: `${spacing.md}px ${spacing.lg}px`,
        borderBottom: `1px solid ${colors.borderLight}`,
        background: colors.surface,
        height: 44,
      }}>
        <span
          onClick={() => onExpand?.(comp.id)}
          style={{
            fontSize: typography.sizes.md,
            fontWeight: typography.weights.semibold,
            flex: 1,
            color: colors.text,
            fontFamily: typography.fontFamily,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            cursor: onExpand ? "pointer" : "default",
          }}
          title="Click to view fullscreen"
        >
          {comp.title}
        </span>
        <span style={{
          fontSize: typography.sizes.xs,
          padding: `2px ${spacing.sm}px`,
          borderRadius: 10,
          background: entry.color,
          color: colors.text,
          fontWeight: typography.weights.medium,
          fontFamily: typography.fontFamily,
        }}>
          {entry.label}
        </span>
        {/* Expand button */}
        {onExpand && (
          <button
            onClick={() => onExpand(comp.id)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: hovered ? colors.textSecondary : "transparent",
              fontSize: 14,
              lineHeight: 1,
              padding: "0 2px",
              transition: transitions.fast,
            }}
            title="View fullscreen"
          >
            &#x26F6;
          </button>
        )}
        <button
          onClick={() => onRemove(comp.id)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: hovered ? colors.textSecondary : "transparent",
            fontSize: 16,
            lineHeight: 1,
            padding: "0 2px",
            transition: transitions.fast,
          }}
          title="Remove"
        >
          &times;
        </button>
      </div>

      {/* Component body */}
      <div style={{ padding: spacing.md }}>
        <Component data={comp.data} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Fullscreen overlay for expanded canvas component
// ═══════════════════════════════════════════════════════════════════════════

export function FullscreenOverlay({
  component,
  onClose,
}: {
  component: CanvasComponent;
  onClose: () => void;
}) {
  const entry = CANVAS_REGISTRY[component.type];
  if (!entry) return null;
  const Component = entry.component;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.xxl,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="canvas-card-enter"
        style={{
          background: colors.surface,
          borderRadius: radius.xl,
          boxShadow: shadows.xl,
          width: "90vw",
          maxWidth: 1200,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: spacing.sm,
          padding: `${spacing.lg}px ${spacing.xl}px`,
          borderBottom: `1px solid ${colors.borderLight}`,
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.semibold,
            flex: 1,
            color: colors.text,
            fontFamily: typography.fontFamily,
          }}>
            {component.title}
          </span>
          <span style={{
            fontSize: typography.sizes.xs,
            padding: `2px ${spacing.sm}px`,
            borderRadius: 10,
            background: entry.color,
            color: colors.text,
            fontWeight: typography.weights.medium,
            fontFamily: typography.fontFamily,
          }}>
            {entry.label}
          </span>
          <span style={{
            fontSize: typography.sizes.xs,
            color: colors.textMuted,
            fontFamily: typography.fontFamily,
          }}>
            {new Date(component.timestamp).toLocaleTimeString()}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: colors.textSecondary,
              fontSize: 20,
              lineHeight: 1,
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: radius.sm,
              transition: transitions.fast,
            }}
            title="Close (Esc)"
          >
            &times;
          </button>
        </div>

        {/* Body — scrollable */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: spacing.xl,
        }}>
          <Component data={component.data} />
        </div>
      </div>
    </div>
  );
}
