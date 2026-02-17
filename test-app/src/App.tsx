/**
 * File Analysis Studio — CopilotKit + Claude Code showcase.
 *
 * Three-panel layout: File Tree | Canvas | CopilotKit Chat Sidebar
 * Features: interactive generative UI, canvas visualizations, file browsing,
 * state persistence, and polished demo-quality UI.
 */
import { useState, useCallback, useEffect } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

import { StudioLayout } from "./components/StudioLayout";
import { FullscreenOverlay } from "./components/DynamicCanvas";
import { ToolRenderers } from "./components/ToolRenderers";
import { ChatInput } from "./components/ChatInput";
import { ChatHeader } from "./components/ChatHeader";
import { useCanvas } from "./hooks/useCanvas";
import { useInteractiveActions } from "./hooks/useInteractiveActions";
import { useStatePersistence } from "./hooks/useStatePersistence";
import { useToolApproval } from "./hooks/useToolApproval";
import { ToolApprovalContext } from "./contexts/ToolApprovalContext";
import { colors, spacing, radius, shadows, typography, transitions } from "./styles";
import type { CanvasComponent } from "./types";
import type { TodoItem } from "./components/ToolRenderers";

const RUNTIME_URL = "http://localhost:3000";
const MGMT_API = "http://localhost:3002";

// ═══════════════════════════════════════════════════════════════════════════
// System prompt for Claude — instructs use of interactive UI + canvas
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = [
  "You are Claude Code running in the File Analysis Studio.",
  "",
  "== INTERACTIVE UI (renders inline in chat) ==",
  "You have actions that create interactive UI directly in the chat:",
  "  - confirmAction: Ask user to confirm/cancel before proceeding",
  "  - chooseOption: Present options for user to pick from",
  "  - collectInput: Show a form for user to fill in",
  "  - reviewAndEdit: Present draft content for user to review/edit",
  "  - showProgress: Display a live progress tracker",
  "",
  "ALWAYS use these when you need user input rather than asking in plain text.",
  "Examples:",
  "  - Need to confirm deleting files? Use confirmAction",
  "  - User should pick between analysis approaches? Use chooseOption",
  "  - Creating a product listing or config? Use collectInput for structured fields,",
  "    then reviewAndEdit to let them polish the result",
  "  - Running a multi-step analysis? Use showProgress to track steps",
  "",
  "== CANVAS (persistent visualizations) ==",
  "Use spawnCanvas for data visualizations on the canvas:",
  "  data-table, editable-table, line-chart, bar-chart, pie-chart,",
  "  json-viewer, key-value, progress-dashboard, tab-container, custom",
  "",
  "For collaborative data editing, use editable-table — user can double-click to edit,",
  "and you can modify cells via scoped actions.",
  "",
  "For grouped analysis, use tab-container to combine multiple views in tabs.",
  "",
  "For custom layouts, diagrams, or anything not covered, use type \"custom\" with HTML.",
  "",
  "== FILE CONTEXT ==",
  "When files are selected in the left sidebar, you'll see them in your context.",
  "Proactively analyze selected files and show results on the canvas.",
  "",
  "== SKILLS ==",
  "Before responding to a user request, ALWAYS check your available skills and actions first.",
  "If a skill or action matches what the user is asking for, use it instead of doing the task manually.",
  "Skills extend your capabilities — prefer them over raw tool calls when available.",
  "",
  "== AVOIDING REDUNDANT WORK ==",
  "CRITICAL: Before analyzing files or creating visualizations, ALWAYS check the current canvas state first.",
  "If the work is already done and visible on the canvas, DO NOT redo it.",
  "If the user sends the same or similar message again, treat it as 'is this done?' — respond with a summary",
  "of what's already on screen and ask what they'd like to change. NEVER clear + rebuild unless explicitly asked.",
  "If spawnCanvas returns an error like 'No such tool', ignore it — the visualization was still created.",
  "",
  "== STRATEGY ==",
  "1. Check skills/actions first — use them when they match",
  "2. Interactive UI for user decisions, forms, and reviews",
  "3. Canvas for data visualization and persistent displays",
  "4. Text for explanations and conversation",
  "5. Prefer visual output over text whenever possible",
  "6. Don't just describe data — show it on the canvas",
  "7. Check canvas state before re-doing any work",
].join("\n");

// ═══════════════════════════════════════════════════════════════════════════
// Inner workspace — has access to CopilotKit context
// ═══════════════════════════════════════════════════════════════════════════

function Workspace({ onNewSession }: { onNewSession: () => void }) {
  const [components, setComponents] = useState<CanvasComponent[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const toolApproval = useToolApproval();

  // Register canvas actions + readable with CopilotKit
  useCanvas(components, setComponents);

  // Register interactive generative UI actions
  useInteractiveActions();

  // State persistence (save/load snapshots)
  const { snapshots, handleSave, handleLoad, handleDelete } = useStatePersistence(
    components,
    setComponents,
  );

  const handleRemove = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleClear = useCallback(() => setComponents([]), []);

  const expandedComponent = expandedId ? components.find((c) => c.id === expandedId) : null;

  return (
    <ToolApprovalContext.Provider value={toolApproval}>
      <CopilotSidebar
        defaultOpen={true}
        clickOutsideToClose={false}
        hitEscapeToClose={false}
        Input={ChatInput}
        Header={ChatHeader}
        instructions={SYSTEM_PROMPT}
        labels={{
          title: "Claude Code",
          initial: "I can run commands, read files, and show results visually. I'll use interactive UI for decisions and the canvas for data visualization. What would you like to explore?",
        }}
      >
        {/* Hook-only components (no visible output) */}
        <ToolRenderers onTodosUpdate={setTodos} />

        <StudioLayout
          components={components}
          onRemove={handleRemove}
          onClear={handleClear}
          snapshots={snapshots}
          onSaveSnapshot={handleSave}
          onLoadSnapshot={handleLoad}
          onDeleteSnapshot={handleDelete}
          onNewSession={onNewSession}
          onExpandComponent={setExpandedId}
          todos={todos}
        />

        {/* Fullscreen overlay */}
        {expandedComponent && (
          <FullscreenOverlay
            component={expandedComponent}
            onClose={() => setExpandedId(null)}
          />
        )}
      </CopilotSidebar>
    </ToolApprovalContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// App shell — folder picker → CopilotKit workspace
// ═══════════════════════════════════════════════════════════════════════════

export default function App() {
  const [sessionReady, setSessionReady] = useState(false);
  const [folder, setFolder] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // On mount, check if server already has a session (e.g. page refresh)
  useEffect(() => {
    fetch(`${MGMT_API}/api/sessions`)
      .then((r) => r.json())
      .then((data) => {
        if (data.sessions?.length > 0) setSessionReady(true);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const createSession = useCallback(async () => {
    const dir = folder.trim();
    if (!dir) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${MGMT_API}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workingDir: dir }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create session"); return; }
      setSessionReady(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [folder]);

  const handleNewSession = useCallback(() => {
    setSessionReady(false);
    setFolder("");
    setError(null);
  }, []);

  if (checking) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: typography.fontFamily,
        background: colors.bg,
      }}>
        <span className="pulse" style={{ color: colors.textMuted, fontSize: typography.sizes.lg }}>
          Connecting...
        </span>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: typography.fontFamily,
        background: colors.bg,
      }}>
        <div style={{
          width: 480,
          textAlign: "center",
          background: colors.surface,
          borderRadius: radius.xl,
          padding: `${spacing.xxl + 8}px ${spacing.xxl}px`,
          boxShadow: shadows.lg,
          border: `1px solid ${colors.borderLight}`,
        }}>
          {/* Logo */}
          <div style={{
            width: 48,
            height: 48,
            borderRadius: radius.lg,
            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentHover})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 22,
            fontWeight: 700,
            margin: "0 auto 16px",
          }}>
            &#9671;
          </div>

          <h1 style={{
            fontSize: typography.sizes.xxl,
            fontWeight: typography.weights.bold,
            color: colors.text,
            marginBottom: spacing.xs,
          }}>
            File Analysis Studio
          </h1>
          <p style={{
            color: colors.textSecondary,
            marginBottom: spacing.xl,
            fontSize: typography.sizes.lg,
            lineHeight: 1.5,
          }}>
            Choose a workspace folder to get started
          </p>

          {/* Branding */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.sm,
            marginBottom: spacing.xl,
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
          }}>
            <span>Powered by</span>
            <span style={{ fontWeight: typography.weights.semibold, color: colors.accent }}>CopilotKit</span>
            <span>+</span>
            <span style={{ fontWeight: typography.weights.semibold, color: colors.textSecondary }}>Claude Code</span>
          </div>

          <div style={{ display: "flex", gap: spacing.sm }}>
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createSession(); }}
              placeholder="Enter folder path..."
              style={{
                flex: 1,
                padding: `${spacing.md}px ${spacing.lg}px`,
                fontSize: typography.sizes.md,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.md,
                fontFamily: typography.mono,
                outline: "none",
                background: colors.surface,
                color: colors.text,
                transition: transitions.fast,
              }}
              disabled={loading}
              autoFocus
            />
            <button
              onClick={createSession}
              disabled={loading || !folder.trim()}
              style={{
                padding: `${spacing.md}px ${spacing.xl}px`,
                fontSize: typography.sizes.md,
                fontWeight: typography.weights.semibold,
                fontFamily: typography.fontFamily,
                background: loading ? colors.textMuted : colors.accent,
                color: "#fff",
                border: "none",
                borderRadius: radius.md,
                cursor: loading ? "not-allowed" : "pointer",
                transition: transitions.fast,
              }}
            >
              {loading ? "Connecting..." : "Start"}
            </button>
          </div>
          {error && (
            <p style={{
              color: colors.error,
              fontSize: typography.sizes.sm,
              marginTop: spacing.sm,
            }}>
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <CopilotKit runtimeUrl={RUNTIME_URL} agent="default">
      <Workspace onNewSession={handleNewSession} />
    </CopilotKit>
  );
}
