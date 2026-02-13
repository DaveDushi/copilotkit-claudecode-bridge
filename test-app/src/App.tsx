/**
 * ============================================================================
 * AI WORKSPACE — CopilotKit + Claude Code Bridge Demo
 * ============================================================================
 *
 * This is not a chat wrapper. This is a demonstration of what happens when
 * you give an AI full system access (Claude Code) AND a reactive UI layer
 * (CopilotKit). The result is a two-way workspace:
 *
 *   Claude reads your scratchpad → useCopilotReadable
 *   Claude updates your task board → useCopilotAction
 *   Claude populates your file explorer → useCopilotAction
 *   Claude's tool calls render as rich cards → useRenderToolCall
 *   Suggestions adapt to your workspace → useCopilotChatSuggestions
 *   Claude asks you to choose → renderAndWaitForResponse
 *
 * No terminal-based Claude Code GUI can do any of this.
 */
import { useState, useCallback, useEffect } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

import { Scratchpad } from "./components/Scratchpad";
import { TaskBoard } from "./components/TaskBoard";
import { FileExplorer } from "./components/FileExplorer";
import { ActivityFeed } from "./components/ActivityFeed";
import { ToolRenderers } from "./components/ToolRenderers";
import {
  useWorkspaceReadables,
  useWorkspaceActions,
  useWorkspaceSuggestions,
} from "./hooks/useWorkspace";
import type { Task, FileEntry, ActivityEvent } from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════
const MGMT_API = "http://localhost:3002";
const RUNTIME_URL = "http://localhost:3000";

// ═══════════════════════════════════════════════════════════════════════════
// Session types (from management API)
// ═══════════════════════════════════════════════════════════════════════════
interface SessionInfo {
  id: string;
  workingDir: string;
  status: string;
  active: boolean;
  capabilities: { model: string; permissionMode: string; tools: string[]; claudeCodeVersion: string } | null;
  totalCostUsd: number;
  numTurns: number;
  isCompacting: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Workspace — The inner component that has access to CopilotKit context
// ═══════════════════════════════════════════════════════════════════════════
//
// This component is rendered INSIDE CopilotKit, so it can use all the hooks.
// The parent App component handles session management outside of CopilotKit.

function Workspace({ session }: { session: SessionInfo }) {
  // ── Workspace state ────────────────────────────────────────────────
  // These are the shared mutable surfaces that BOTH the user AND Claude
  // can read and write to. This is the key differentiator.
  const [scratchpad, setScratchpad] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  // Which panel is focused in the tab bar
  const [activePanel, setActivePanel] = useState<"scratchpad" | "tasks" | "files" | "activity">("scratchpad");

  // ── CopilotKit Hooks ───────────────────────────────────────────────

  // 1. READABLE: Claude can see all workspace state automatically.
  //    No copy-pasting, no "here's my task list" — Claude just knows.
  useWorkspaceReadables(scratchpad, tasks, files);

  // 2. ACTIONS: Claude can modify the workspace through frontend tools.
  //    These are abilities that ONLY exist in the browser.
  useWorkspaceActions(
    setScratchpad as any,
    setTasks as any,
    setFiles as any,
  );

  // 3. SUGGESTIONS: Smart prompts based on current workspace state.
  useWorkspaceSuggestions(scratchpad, tasks, files);

  // 4. TOOL RENDERERS: Rich cards for Claude's built-in tools (registered via component below).

  // ── Task board handlers ────────────────────────────────────────────
  const handleToggleTask = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }, []);

  const handleRemoveTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleAddTask = useCallback((title: string) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setTasks((prev) => [...prev, { id, title, done: false }]);
  }, []);

  // ── Layout ─────────────────────────────────────────────────────────
  // Tabbed workspace panels with CopilotSidebar providing the chat.

  return (
    <CopilotSidebar
      defaultOpen={true}
      instructions={[
        "You are an AI workspace assistant powered by Claude Code. You have full access to the user's filesystem, can run any command, and can read/write files.",
        "",
        "IMPORTANT: You have special workspace abilities through frontend tools:",
        "- updateScratchpad: Write notes, drafts, summaries to the user's scratchpad",
        "- addTask / completeTask / removeTask: Manage the user's task board",
        "- showFiles: Display files you find/create in the file explorer panel",
        "- presentChoices: Ask the user to choose between options",
        "",
        "ALWAYS use these tools to make your work visible. Don't just describe what you did — show it:",
        "- When you find files, use showFiles to display them",
        "- When you create a plan, use addTask for each step",
        "- When you summarize or draft, use updateScratchpad",
        "- When you need a decision, use presentChoices",
        "",
        "Think beyond coding. You can help organize files, draft documents, plan projects, research topics, manage tasks — anything a capable assistant would do.",
      ].join("\n")}
      labels={{
        title: "Claude Code",
        initial: `Connected to ${session.workingDir}. I can see your scratchpad, tasks, and files — and I can update them too. Try asking me to do something!`,
      }}
    >
      {/* Register tool renderers (they just call hooks, no visible output) */}
      <ToolRenderers />

      <div style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
        background: "#f8f9fa",
      }}>
        {/* ── Header ───────────────────────────────────────────────── */}
        <header style={{
          padding: "10px 16px",
          borderBottom: "1px solid #e0e0e0",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>AI Workspace</h1>
          <span style={{ fontSize: 12, color: "#888", fontFamily: "monospace" }}>
            {session.workingDir.replace(/\\/g, "/").split("/").pop()}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {session.capabilities && (
              <>
                <StatusBadge
                  label={session.capabilities.model.includes("sonnet") ? "Sonnet" : session.capabilities.model.includes("opus") ? "Opus" : "Haiku"}
                  color="#e3f2fd"
                />
                <StatusBadge label={session.capabilities.permissionMode} color="#fff3e0" />
                <StatusBadge label={`${session.capabilities.tools.length} tools`} color="#e8f5e9" />
              </>
            )}
            {session.totalCostUsd > 0 && (
              <StatusBadge label={`$${session.totalCostUsd.toFixed(4)}`} color="#f3e5f5" />
            )}
            {session.isCompacting && (
              <StatusBadge label="compacting..." color="#fff3e0" />
            )}
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: session.status === "active" ? "#2196f3" : session.status === "idle" || session.status === "connected" ? "#4caf50" : "#ff9800",
            }} />
          </div>
        </header>

        {/* ── Panel tabs ───────────────────────────────────────────── */}
        <div style={{
          display: "flex",
          borderBottom: "1px solid #e0e0e0",
          background: "#fff",
          flexShrink: 0,
        }}>
          {([
            { key: "scratchpad" as const, label: "Scratchpad", count: scratchpad.length > 0 ? `${scratchpad.split("\n").length}L` : "" },
            { key: "tasks" as const, label: "Tasks", count: tasks.length > 0 ? `${tasks.filter((t) => !t.done).length}` : "" },
            { key: "files" as const, label: "Files", count: files.length > 0 ? `${files.length}` : "" },
            { key: "activity" as const, label: "Activity", count: activity.length > 0 ? `${activity.length}` : "" },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActivePanel(tab.key)}
              style={{
                flex: 1,
                padding: "8px 0",
                fontSize: 12,
                fontWeight: activePanel === tab.key ? 600 : 400,
                background: "transparent",
                border: "none",
                borderBottom: activePanel === tab.key ? "2px solid #0066cc" : "2px solid transparent",
                cursor: "pointer",
                color: activePanel === tab.key ? "#0066cc" : "#666",
              }}
            >
              {tab.label}
              {tab.count && (
                <span style={{
                  marginLeft: 4,
                  fontSize: 10,
                  background: activePanel === tab.key ? "#e3f2fd" : "#f0f0f0",
                  padding: "1px 5px",
                  borderRadius: 8,
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Active panel ─────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activePanel === "scratchpad" && (
            <Scratchpad value={scratchpad} onChange={setScratchpad} />
          )}
          {activePanel === "tasks" && (
            <TaskBoard
              tasks={tasks}
              onToggle={handleToggleTask}
              onRemove={handleRemoveTask}
              onAdd={handleAddTask}
            />
          )}
          {activePanel === "files" && (
            <FileExplorer files={files} onClear={() => setFiles([])} />
          )}
          {activePanel === "activity" && (
            <ActivityFeed events={activity} onClear={() => setActivity([])} />
          )}
        </div>
      </div>
    </CopilotSidebar>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// App — Session management + CopilotKit provider
// ═══════════════════════════════════════════════════════════════════════════

export default function App() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSession = sessions.find((s) => s.active) ?? null;

  // ── Poll sessions ──────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${MGMT_API}/api/sessions`);
      const data = await res.json();
      setSessions(data.sessions);
    } catch { /* server not up yet */ }
  }, []);

  useEffect(() => {
    fetchSessions();
    const iv = setInterval(fetchSessions, 3000);
    return () => clearInterval(iv);
  }, [fetchSessions]);

  // ── Create session ─────────────────────────────────────────────────
  const createSession = useCallback(async () => {
    const dir = newFolder.trim();
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
      if (!res.ok) { setError(data.error); return; }
      setNewFolder("");
      await fetchSessions();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [newFolder, fetchSessions]);

  // ── Switch session ─────────────────────────────────────────────────
  const activateSession = useCallback(async (id: string) => {
    try {
      await fetch(`${MGMT_API}/api/sessions/${id}/activate`, { method: "PUT" });
      await fetchSessions();
    } catch (err: any) { setError(err.message); }
  }, [fetchSessions]);

  // ── Delete session ─────────────────────────────────────────────────
  const deleteSession = useCallback(async (id: string) => {
    try {
      await fetch(`${MGMT_API}/api/sessions/${id}`, { method: "DELETE" });
      await fetchSessions();
    } catch (err: any) { setError(err.message); }
  }, [fetchSessions]);

  // ═════════════════════════════════════════════════════════════════════
  // No session yet — show the welcome / session picker
  // ═════════════════════════════════════════════════════════════════════
  if (!activeSession) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#f8f9fa",
      }}>
        <div style={{ width: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>AI Workspace</h1>
          <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
            CopilotKit + Claude Code — not just a chat interface.
          </p>

          {/* Existing sessions */}
          {sessions.length > 0 && (
            <div style={{ marginBottom: 20, textAlign: "left" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 8 }}>SESSIONS</div>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    marginBottom: 4,
                    borderRadius: 6,
                    border: "1px solid #e0e0e0",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                  onClick={() => activateSession(s.id)}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.status === "connected" || s.status === "idle" ? "#4caf50" : "#ff9800" }} />
                  <span style={{ flex: 1, fontSize: 13, fontFamily: "monospace" }}>
                    {s.workingDir.replace(/\\/g, "/").split("/").pop()}
                  </span>
                  <span style={{ fontSize: 11, color: "#999" }}>{s.status}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 14 }}
                  >x</button>
                </div>
              ))}
            </div>
          )}

          {/* New session */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createSession(); }}
              placeholder="Enter folder path..."
              style={{
                flex: 1,
                padding: "10px 12px",
                fontSize: 13,
                border: "1px solid #ddd",
                borderRadius: 6,
                fontFamily: "monospace",
              }}
              disabled={loading}
            />
            <button
              onClick={createSession}
              disabled={loading || !newFolder.trim()}
              style={{
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 600,
                background: loading ? "#999" : "#0066cc",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "..." : "Start"}
            </button>
          </div>
          {error && <p style={{ color: "#c62828", fontSize: 12, marginTop: 8 }}>{error}</p>}
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  // Active session — CopilotKit wraps the workspace
  // ═════════════════════════════════════════════════════════════════════
  return (
    <CopilotKit
      key={activeSession.id}
      runtimeUrl={RUNTIME_URL}
      agent="default"
    >
      <Workspace session={activeSession} />
    </CopilotKit>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tiny UI components
// ═══════════════════════════════════════════════════════════════════════════

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 11,
      padding: "2px 7px",
      borderRadius: 4,
      background: color,
      color: "#333",
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}
