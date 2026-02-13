/**
 * ============================================================================
 * TEST APP — Full-featured UI showcasing ALL CopilotKit Claude Bridge features
 * ============================================================================
 *
 * This React application demonstrates every capability of the
 * copilotkit-claude-bridge library through an interactive UI.
 *
 * Layout:
 *   ┌──────────┬────────────────────────────────────────────┐
 *   │          │  Header (model, mode, controls, badges)    │
 *   │ Sidebar  ├────────────────────────────────────────────┤
 *   │ (sessions│  CopilotChat (AG-UI powered chat)          │
 *   │  + caps) │                                            │
 *   │          ├────────────────────────────────────────────┤
 *   │          │  Bottom Panel (MCP, tools, details)        │
 *   └──────────┴────────────────────────────────────────────┘
 *
 * Features demonstrated:
 *   1.  Multi-session management (create, switch, delete)
 *   2.  Model switching (Sonnet, Opus, Haiku) at runtime
 *   3.  Permission mode switching (Default, Plan, Accept Edits, etc.)
 *   4.  Interrupt/abort current operation
 *   5.  Context compaction indicator
 *   6.  Tool count, slash commands, skills, agents badges
 *   7.  MCP server status with reconnect/toggle controls
 *   8.  Cost tracking per session
 *   9.  Turn count display
 *  10.  Initialize control request
 *  11.  Max thinking tokens control
 *  12.  Full capabilities inspector panel
 *  13.  Session status indicators (color-coded)
 *  14.  Working directory display
 *  15.  Claude Code version display
 */
import { useState, useEffect, useCallback } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Management API base URL — the test server (server.ts) runs on port 3002.
// This is separate from the AG-UI server (port 3000) which CopilotKit talks to.
const MGMT_API = "http://localhost:3002";

// AG-UI runtime URL — CopilotKit's single-endpoint transport POSTs here.
// All requests (info, connect, run, stop) go to this single URL with a
// { method, params, body } JSON envelope.
const RUNTIME_URL = "http://localhost:3000";

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// MCP (Model Context Protocol) server info from Claude CLI's system/init.
// MCP servers expose external tools (databases, APIs, etc.) to Claude.
interface McpServer {
  name: string;
  status: string;
}

// Session capabilities — populated from the system/init message that Claude
// CLI sends when it first connects via WebSocket. These reflect the CLI's
// current configuration and available features.
interface SessionCapabilities {
  tools: string[];           // Available tools (Bash, Read, Write, Edit, Glob, Grep, etc.)
  model: string;             // Current model ID (e.g., "claude-sonnet-4-5-20250929")
  permissionMode: string;    // Current permission mode (default, plan, acceptEdits, etc.)
  cwd: string;               // Working directory the CLI is operating in
  claudeCodeVersion: string; // Version of Claude Code CLI
  slashCommands: string[];   // Available slash commands (commit, bug, compact, etc.)
  agents: string[];          // Available sub-agents (e.g., "task")
  skills: string[];          // Available skills (e.g., "pdf", "commit")
  mcpServers: McpServer[];   // Configured MCP servers with their connection status
}

// Init data — populated from the initialize control request response.
// Only available after sendInitialize() is called on a session.
interface SessionInitData {
  commands: { name: string; description: string; argumentHint?: string }[];
  models: { value: string; displayName: string; description: string }[];
  account: {
    email?: string;
    organization?: string;
    subscriptionType?: string;
  };
}

// Full session info as returned by the management API.
// This is the primary data structure for each Claude Code session.
interface SessionInfo {
  id: string;                           // Unique session UUID
  workingDir: string;                   // Filesystem path for the session
  status: string;                       // starting | connected | active | idle | disconnected | terminated
  active: boolean;                      // True if this session receives AG-UI requests
  capabilities: SessionCapabilities | null;  // From system/init (null until CLI connects)
  initData: SessionInitData | null;     // From initialize request (null until called)
  isCompacting: boolean;                // True when context window is being compacted
  totalCostUsd: number;                 // Cumulative API cost in USD
  numTurns: number;                     // Total conversation turns
}

// ═══════════════════════════════════════════════════════════════════════════
// PERMISSION MODES
// ═══════════════════════════════════════════════════════════════════════════
//
// Claude Code's permission modes control how tool use is handled:
//   default          — Ask user permission for dangerous tools (bash, write, etc.)
//   plan             — Claude plans but does NOT execute tools
//   acceptEdits      — Auto-approve file edits, still ask for bash/others
//   bypassPermissions — Auto-approve ALL tools (use with caution!)
//   dontAsk          — Like bypass but also skips all confirmations
//   delegate         — Delegate decisions to sub-agents
const MODES = [
  { value: "default", label: "Default", desc: "Ask for permission on dangerous ops" },
  { value: "plan", label: "Plan", desc: "Claude plans but doesn't execute" },
  { value: "acceptEdits", label: "Accept Edits", desc: "Auto-approve file edits" },
  { value: "bypassPermissions", label: "Bypass", desc: "Auto-approve everything" },
  { value: "dontAsk", label: "Don't Ask", desc: "Bypass + skip confirmations" },
];

// ═══════════════════════════════════════════════════════════════════════════
// THINKING TOKEN PRESETS
// ═══════════════════════════════════════════════════════════════════════════
//
// Extended thinking allows Claude to "think" before responding, producing
// more thorough analysis. Higher values = more thinking = better results
// but more tokens used. null = no limit.
const THINKING_PRESETS = [
  { value: "null", label: "Unlimited", tokens: null },
  { value: "4096", label: "4K", tokens: 4096 },
  { value: "8192", label: "8K", tokens: 8192 },
  { value: "16384", label: "16K", tokens: 16384 },
  { value: "32768", label: "32K", tokens: 32768 },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── State ───────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which sidebar panel is visible: "sessions" or "details"
  const [sidebarTab, setSidebarTab] = useState<"sessions" | "details">("sessions");

  // Whether the bottom panel (MCP/capabilities inspector) is open
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<"mcp" | "tools" | "commands" | "info">("mcp");

  // ── Derived state ──────────────────────────────────────────────────────
  // The "active" session is the one that receives AG-UI requests from CopilotKit.
  const activeSession = sessions.find((s) => s.active) ?? null;
  const caps = activeSession?.capabilities ?? null;

  // ═════════════════════════════════════════════════════════════════════════
  // API CALLS — Each function calls the management API (port 3002)
  // ═════════════════════════════════════════════════════════════════════════

  // ── Fetch all sessions (polled every 3 seconds) ────────────────────────
  // The management API's GET /api/sessions returns all sessions with their
  // full state including capabilities, cost, turn count, etc.
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${MGMT_API}/api/sessions`);
      const data = await res.json();
      setSessions(data.sessions);
    } catch {
      // Server might not be up yet — silently retry on next interval
    }
  }, []);

  // Poll sessions every 3 seconds for real-time status updates.
  // This keeps the UI in sync with session status changes (active/idle/compacting),
  // model changes, cost tracking, and turn counts.
  useEffect(() => {
    fetchSessions();
    const iv = setInterval(fetchSessions, 3000);
    return () => clearInterval(iv);
  }, [fetchSessions]);

  // ── Create a new session ───────────────────────────────────────────────
  // POST /api/sessions with { workingDir } spawns a Claude CLI process.
  // The CLI connects back via WebSocket and the session becomes active.
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
      if (!res.ok) {
        setError(data.error || "Failed to create session");
        return;
      }
      setNewFolder("");
      await fetchSessions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [newFolder, fetchSessions]);

  // ── Activate (switch to) a session ─────────────────────────────────────
  // PUT /api/sessions/:id/activate makes this session the "active" one.
  // Only the active session receives AG-UI run requests from CopilotKit.
  const activateSession = useCallback(
    async (id: string) => {
      if (activeSession?.id === id) return;
      try {
        await fetch(`${MGMT_API}/api/sessions/${id}/activate`, {
          method: "PUT",
        });
        await fetchSessions();
      } catch (err: any) {
        setError(err.message);
      }
    },
    [fetchSessions, activeSession?.id],
  );

  // ── Delete (kill) a session ────────────────────────────────────────────
  // DELETE /api/sessions/:id kills the CLI process and removes the session.
  // If this was the active session, another is auto-activated.
  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await fetch(`${MGMT_API}/api/sessions/${id}`, { method: "DELETE" });
        await fetchSessions();
      } catch (err: any) {
        setError(err.message);
      }
    },
    [fetchSessions],
  );

  // ── Change model ───────────────────────────────────────────────────────
  // PUT /api/sessions/:id/model sends a set_model control request.
  // The model change takes effect on the NEXT turn.
  const setModel = useCallback(
    async (model: string) => {
      if (!activeSession) return;
      try {
        await fetch(`${MGMT_API}/api/sessions/${activeSession.id}/model`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model }),
        });
        await fetchSessions();
      } catch (err: any) {
        setError(err.message);
      }
    },
    [activeSession, fetchSessions],
  );

  // ── Change permission mode ─────────────────────────────────────────────
  // PUT /api/sessions/:id/mode sends a set_permission_mode control request.
  const setMode = useCallback(
    async (mode: string) => {
      if (!activeSession) return;
      try {
        await fetch(`${MGMT_API}/api/sessions/${activeSession.id}/mode`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        await fetchSessions();
      } catch (err: any) {
        setError(err.message);
      }
    },
    [activeSession, fetchSessions],
  );

  // ── Interrupt current operation ────────────────────────────────────────
  // POST /api/sessions/:id/interrupt sends an interrupt control request.
  // Stops whatever Claude is currently doing mid-generation.
  const interrupt = useCallback(async () => {
    if (!activeSession) return;
    try {
      await fetch(`${MGMT_API}/api/sessions/${activeSession.id}/interrupt`, {
        method: "POST",
      });
    } catch (err: any) {
      setError(err.message);
    }
  }, [activeSession]);

  // ── Set max thinking tokens ────────────────────────────────────────────
  // PUT /api/sessions/:id/thinking sends a set_max_thinking_tokens request.
  // Controls how many tokens Claude can use for "thinking" (extended reasoning).
  const setThinking = useCallback(
    async (maxTokens: number | null) => {
      if (!activeSession) return;
      try {
        await fetch(`${MGMT_API}/api/sessions/${activeSession.id}/thinking`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxTokens }),
        });
      } catch (err: any) {
        setError(err.message);
      }
    },
    [activeSession],
  );

  // ── Initialize session ─────────────────────────────────────────────────
  // POST /api/sessions/:id/initialize sends the initialize control request.
  // This registers hooks, MCP servers, and system prompts, and returns
  // available commands, models, and account info.
  const initializeSession = useCallback(async () => {
    if (!activeSession) return;
    try {
      await fetch(`${MGMT_API}/api/sessions/${activeSession.id}/initialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await fetchSessions();
    } catch (err: any) {
      setError(err.message);
    }
  }, [activeSession, fetchSessions]);

  // ── Reconnect an MCP server ────────────────────────────────────────────
  // POST /api/sessions/:id/mcp/:name/reconnect sends mcp_reconnect request.
  const reconnectMcp = useCallback(
    async (serverName: string) => {
      if (!activeSession) return;
      try {
        await fetch(
          `${MGMT_API}/api/sessions/${activeSession.id}/mcp/${encodeURIComponent(serverName)}/reconnect`,
          { method: "POST" },
        );
        await fetchSessions();
      } catch (err: any) {
        setError(err.message);
      }
    },
    [activeSession, fetchSessions],
  );

  // ── Toggle an MCP server on/off ────────────────────────────────────────
  // PUT /api/sessions/:id/mcp/:name/toggle sends mcp_toggle request.
  const toggleMcp = useCallback(
    async (serverName: string, enabled: boolean) => {
      if (!activeSession) return;
      try {
        await fetch(
          `${MGMT_API}/api/sessions/${activeSession.id}/mcp/${encodeURIComponent(serverName)}/toggle`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled }),
          },
        );
        await fetchSessions();
      } catch (err: any) {
        setError(err.message);
      }
    },
    [activeSession, fetchSessions],
  );

  // ═════════════════════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═════════════════════════════════════════════════════════════════════════

  // Extract just the folder name from a full path (works on both / and \)
  const folderName = (path: string) => {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] || path;
  };

  // Map session status to a color for the status indicator dot.
  // Green = ready, Blue = working, Orange = starting, Grey = offline
  const statusColor = (status: string) => {
    switch (status) {
      case "connected":
      case "idle":
        return "#4caf50"; // Green — ready to accept messages
      case "active":
        return "#2196f3"; // Blue — currently processing
      case "starting":
        return "#ff9800"; // Orange — CLI is launching
      default:
        return "#bdbdbd"; // Grey — disconnected or terminated
    }
  };

  // Get a friendly short name for a model ID
  const shortModelName = (model: string) => {
    if (model.includes("sonnet")) return "Sonnet";
    if (model.includes("opus")) return "Opus";
    if (model.includes("haiku")) return "Haiku";
    return model.split("-").pop() ?? model;
  };

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height: "100vh", display: "flex", fontFamily: "system-ui, sans-serif" }}>

      {/* ══════════════════════════════════════════════════════════════════
          SIDEBAR — Session list + Capabilities detail panel
          ══════════════════════════════════════════════════════════════════ */}
      <aside
        style={{
          width: 300,
          minWidth: 300,
          borderRight: "1px solid #e0e0e0",
          background: "#f8f9fa",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Sidebar tab switcher ──────────────────────────────────────
            Two tabs: "Sessions" shows the session list, "Details" shows
            full capabilities for the active session. */}
        <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0" }}>
          {(["sessions", "details"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSidebarTab(tab)}
              style={{
                flex: 1,
                padding: "10px 0",
                fontSize: "12px",
                fontWeight: sidebarTab === tab ? 600 : 400,
                background: sidebarTab === tab ? "#fff" : "transparent",
                border: "none",
                borderBottom: sidebarTab === tab ? "2px solid #0066cc" : "2px solid transparent",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── Sessions tab content ──────────────────────────────────── */}
        {sidebarTab === "sessions" && (
          <>
            {/* Session list — each session shows folder name, status dot,
                model abbreviation, and turn count */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
              {sessions.length === 0 && (
                <p style={{ fontSize: "13px", color: "#888", textAlign: "center", marginTop: 24 }}>
                  No sessions yet
                </p>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => activateSession(s.id)}
                  style={{
                    padding: "10px 12px",
                    marginBottom: 4,
                    borderRadius: 6,
                    cursor: "pointer",
                    background: s.active ? "#e3f2fd" : "transparent",
                    border: s.active ? "1px solid #90caf9" : "1px solid transparent",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!s.active)
                      (e.currentTarget as HTMLDivElement).style.background = "#eee";
                  }}
                  onMouseLeave={(e) => {
                    if (!s.active)
                      (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    {/* Session name (last folder in path) with full path as tooltip */}
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: s.active ? 600 : 400,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                      title={s.workingDir}
                    >
                      {folderName(s.workingDir)}
                    </span>
                    {/* Delete button — kills the CLI process and removes the session */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(s.id);
                      }}
                      title="Delete session"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "16px",
                        color: "#999",
                        padding: "0 4px",
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "#c62828";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "#999";
                      }}
                    >
                      x
                    </button>
                  </div>
                  {/* Status line: colored dot + status text + model + turns */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: statusColor(s.status),
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#888",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.status}
                      {s.capabilities?.model ? ` | ${shortModelName(s.capabilities.model)}` : ""}
                      {s.numTurns > 0 ? ` | ${s.numTurns}t` : ""}
                      {s.totalCostUsd > 0 ? ` | $${s.totalCostUsd.toFixed(4)}` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── New session form ──────────────────────────────────────
                Enter a folder path and click "+ New Session" to spawn a
                Claude CLI session targeting that directory. */}
            <div
              style={{
                padding: "12px",
                borderTop: "1px solid #e0e0e0",
              }}
            >
              <input
                type="text"
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createSession();
                }}
                placeholder="Folder path..."
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "13px",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  fontFamily: "monospace",
                  boxSizing: "border-box",
                }}
                disabled={loading}
              />
              <button
                onClick={createSession}
                disabled={loading || !newFolder.trim()}
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "6px 0",
                  fontSize: "13px",
                  background: loading ? "#999" : "#0066cc",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: loading || !newFolder.trim() ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Creating..." : "+ New Session"}
              </button>
              {error && (
                <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#c62828" }}>
                  {error}
                </p>
              )}
            </div>
          </>
        )}

        {/* ── Details tab content ───────────────────────────────────── */}
        {/* Shows full capabilities for the active session — this panel
            provides a deep view into everything Claude CLI reported in
            its system/init message and initialize response. */}
        {sidebarTab === "details" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "12px", fontSize: "12px" }}>
            {!activeSession ? (
              <p style={{ color: "#888", textAlign: "center", marginTop: 24 }}>
                No active session
              </p>
            ) : !caps ? (
              <p style={{ color: "#888", textAlign: "center", marginTop: 24 }}>
                Waiting for CLI to connect...
              </p>
            ) : (
              <>
                {/* ── Session Overview ─────────────────────────────── */}
                <SectionHeader>Session</SectionHeader>
                <DetailRow label="ID" value={activeSession.id.slice(0, 8)} />
                <DetailRow label="Status" value={activeSession.status} />
                <DetailRow label="Working Dir" value={caps.cwd} mono />
                <DetailRow label="Claude Code" value={caps.claudeCodeVersion} />
                <DetailRow label="Model" value={caps.model} mono />
                <DetailRow label="Mode" value={caps.permissionMode} />
                <DetailRow label="Turns" value={String(activeSession.numTurns)} />
                <DetailRow label="Cost" value={`$${activeSession.totalCostUsd.toFixed(4)}`} />
                {activeSession.isCompacting && (
                  <DetailRow label="Compacting" value="Yes" />
                )}

                {/* ── Tools ────────────────────────────────────────── */}
                <SectionHeader>Tools ({caps.tools.length})</SectionHeader>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {caps.tools.map((t) => (
                    <MiniTag key={t} label={t} />
                  ))}
                </div>

                {/* ── Slash Commands ────────────────────────────────── */}
                {caps.slashCommands.length > 0 && (
                  <>
                    <SectionHeader>Slash Commands ({caps.slashCommands.length})</SectionHeader>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {caps.slashCommands.map((c) => (
                        <MiniTag key={c} label={`/${c}`} color="#fff3e0" />
                      ))}
                    </div>
                  </>
                )}

                {/* ── Skills ────────────────────────────────────────── */}
                {caps.skills.length > 0 && (
                  <>
                    <SectionHeader>Skills ({caps.skills.length})</SectionHeader>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {caps.skills.map((s) => (
                        <MiniTag key={s} label={s} color="#e8f5e9" />
                      ))}
                    </div>
                  </>
                )}

                {/* ── Agents ────────────────────────────────────────── */}
                {caps.agents.length > 0 && (
                  <>
                    <SectionHeader>Agents ({caps.agents.length})</SectionHeader>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {caps.agents.map((a) => (
                        <MiniTag key={a} label={a} color="#f3e5f5" />
                      ))}
                    </div>
                  </>
                )}

                {/* ── MCP Servers ───────────────────────────────────── */}
                {caps.mcpServers.length > 0 && (
                  <>
                    <SectionHeader>MCP Servers ({caps.mcpServers.length})</SectionHeader>
                    {caps.mcpServers.map((s) => (
                      <div
                        key={s.name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 0",
                        }}
                      >
                        {/* Status dot: green=connected, red=disconnected */}
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: s.status === "connected" ? "#4caf50" : "#f44336",
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ flex: 1 }}>{s.name}</span>
                        <span style={{ color: "#888" }}>{s.status}</span>
                        {/* Reconnect button for this MCP server */}
                        <button
                          onClick={() => reconnectMcp(s.name)}
                          style={{
                            fontSize: "10px",
                            padding: "1px 4px",
                            border: "1px solid #ccc",
                            borderRadius: 3,
                            background: "#fff",
                            cursor: "pointer",
                          }}
                          title="Reconnect this MCP server"
                        >
                          reconnect
                        </button>
                        {/* Toggle button to enable/disable */}
                        <button
                          onClick={() => toggleMcp(s.name, s.status !== "connected")}
                          style={{
                            fontSize: "10px",
                            padding: "1px 4px",
                            border: "1px solid #ccc",
                            borderRadius: 3,
                            background: "#fff",
                            cursor: "pointer",
                          }}
                          title={s.status === "connected" ? "Disable" : "Enable"}
                        >
                          {s.status === "connected" ? "disable" : "enable"}
                        </button>
                      </div>
                    ))}
                  </>
                )}

                {/* ── Init Data (from initialize request) ──────────── */}
                {activeSession.initData && (
                  <>
                    <SectionHeader>Initialize Data</SectionHeader>

                    {/* Account info */}
                    {activeSession.initData.account?.email && (
                      <DetailRow label="Account" value={activeSession.initData.account.email} />
                    )}
                    {activeSession.initData.account?.organization && (
                      <DetailRow label="Org" value={activeSession.initData.account.organization} />
                    )}

                    {/* Available models from initialize */}
                    {activeSession.initData.models.length > 0 && (
                      <>
                        <div style={{ marginTop: 6, fontWeight: 600, fontSize: "11px", color: "#555" }}>
                          Available Models:
                        </div>
                        {activeSession.initData.models.map((m) => (
                          <div key={m.value} style={{ padding: "2px 0", color: "#555" }}>
                            {m.displayName} <span style={{ color: "#999" }}>({m.value})</span>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Available commands from initialize */}
                    {activeSession.initData.commands.length > 0 && (
                      <>
                        <div style={{ marginTop: 6, fontWeight: 600, fontSize: "11px", color: "#555" }}>
                          Commands:
                        </div>
                        {activeSession.initData.commands.map((c) => (
                          <div key={c.name} style={{ padding: "2px 0", color: "#555" }}>
                            /{c.name}
                            {c.argumentHint ? ` ${c.argumentHint}` : ""}{" "}
                            <span style={{ color: "#999" }}> — {c.description}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}

                {/* ── Initialize button (if not yet initialized) ───── */}
                {!activeSession.initData && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={initializeSession}
                      style={{
                        width: "100%",
                        padding: "6px 0",
                        fontSize: "12px",
                        background: "#0066cc",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                    >
                      Send Initialize
                    </button>
                    <p style={{ fontSize: "11px", color: "#888", marginTop: 4 }}>
                      Sends the initialize control request to get commands, models, and account info.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </aside>

      {/* ══════════════════════════════════════════════════════════════════
          MAIN CONTENT AREA — Header + Chat + Bottom Panel
          ══════════════════════════════════════════════════════════════════ */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── Header bar with all controls ─────────────────────────────
            The header shows controls that map to Claude Code features:
            model picker, mode picker, thinking budget, interrupt, etc. */}
        <header
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid #e0e0e0",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "15px", whiteSpace: "nowrap" }}>
            CopilotKit + Claude
          </h1>

          {activeSession && caps && (
            <>
              {/* ── Model selector ────────────────────────────────────
                  Sends set_model control request to switch between
                  Sonnet (balanced), Opus (most capable), Haiku (fastest) */}
              <select
                value={caps.model}
                onChange={(e) => setModel(e.target.value)}
                style={selectStyle}
                title="Model — switch between Sonnet, Opus, and Haiku"
              >
                <option value={caps.model}>{shortModelName(caps.model)}</option>
                {caps.model !== "claude-sonnet-4-5-20250929" && (
                  <option value="claude-sonnet-4-5-20250929">Sonnet 4.5</option>
                )}
                {caps.model !== "claude-opus-4-6" && (
                  <option value="claude-opus-4-6">Opus 4.6</option>
                )}
                {caps.model !== "claude-haiku-4-5-20251001" && (
                  <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
                )}
              </select>

              {/* ── Permission mode selector ──────────────────────────
                  Sends set_permission_mode control request. Controls how
                  Claude handles tool approval (ask/auto-approve/plan-only) */}
              <select
                value={caps.permissionMode}
                onChange={(e) => setMode(e.target.value)}
                style={selectStyle}
                title={`Permission Mode — ${MODES.find((m) => m.value === caps.permissionMode)?.desc ?? ""}`}
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              {/* ── Thinking tokens selector ──────────────────────────
                  Sends set_max_thinking_tokens control request. Controls
                  the extended thinking budget for deeper reasoning. */}
              <select
                onChange={(e) => {
                  const val = e.target.value;
                  setThinking(val === "null" ? null : Number(val));
                }}
                style={selectStyle}
                title="Max Thinking Tokens — controls extended reasoning budget"
                defaultValue="null"
              >
                {THINKING_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    Think: {p.label}
                  </option>
                ))}
              </select>

              {/* ── Interrupt button ──────────────────────────────────
                  Only enabled when status is "active" (Claude is working).
                  Sends the interrupt control request to abort mid-turn. */}
              <button
                onClick={interrupt}
                disabled={activeSession.status !== "active"}
                style={{
                  fontSize: "12px",
                  padding: "3px 8px",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  background: activeSession.status === "active" ? "#ffebee" : "#f5f5f5",
                  color: activeSession.status === "active" ? "#c62828" : "#999",
                  cursor: activeSession.status === "active" ? "pointer" : "not-allowed",
                }}
                title="Interrupt — abort current operation (sends interrupt control request)"
              >
                Stop
              </button>

              {/* ── Toggle bottom panel ───────────────────────────────
                  Opens a panel showing MCP servers, tools list, etc. */}
              <button
                onClick={() => setBottomPanelOpen(!bottomPanelOpen)}
                style={{
                  fontSize: "12px",
                  padding: "3px 8px",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  background: bottomPanelOpen ? "#e3f2fd" : "#f5f5f5",
                  cursor: "pointer",
                }}
                title="Toggle capabilities panel"
              >
                {bottomPanelOpen ? "Hide Panel" : "Show Panel"}
              </button>

              {/* ── Compacting indicator ──────────────────────────────
                  Shows when the CLI is compacting its context window.
                  Context compaction happens when the conversation gets
                  too long and Claude needs to summarize earlier messages. */}
              {activeSession.isCompacting && (
                <span style={{ fontSize: "11px", color: "#ff9800", fontWeight: 600 }}>
                  Compacting...
                </span>
              )}

              {/* ── Capability badges ────────────────────────────────
                  Quick-glance indicators showing available features.
                  Hover for details (full list in tooltip). */}
              <div style={{ display: "flex", gap: 4, marginLeft: "auto", flexWrap: "wrap" }}>
                {/* Tool count — hover to see all tool names */}
                {caps.tools.length > 0 && (
                  <Badge label={`${caps.tools.length} tools`} title={caps.tools.join(", ")} />
                )}
                {/* Slash command count — hover for command list */}
                {caps.slashCommands.length > 0 && (
                  <Badge
                    label={`${caps.slashCommands.length} cmds`}
                    title={caps.slashCommands.map((c) => `/${c}`).join(", ")}
                    color="#fff3e0"
                  />
                )}
                {/* Skills count — hover for skill list */}
                {caps.skills.length > 0 && (
                  <Badge label={`${caps.skills.length} skills`} title={caps.skills.join(", ")} color="#e8f5e9" />
                )}
                {/* Sub-agents count — hover for agent list */}
                {caps.agents.length > 0 && (
                  <Badge label={`${caps.agents.length} agents`} title={caps.agents.join(", ")} color="#f3e5f5" />
                )}
                {/* MCP server count — green if all connected, orange if any disconnected */}
                {caps.mcpServers.length > 0 && (
                  <Badge
                    label={`${caps.mcpServers.length} MCP`}
                    title={caps.mcpServers.map((s) => `${s.name} (${s.status})`).join(", ")}
                    color={caps.mcpServers.every((s) => s.status === "connected") ? "#e8f5e9" : "#fff3e0"}
                  />
                )}
                {/* Cost tracker — shows cumulative USD cost for this session */}
                {activeSession.totalCostUsd > 0 && (
                  <Badge
                    label={`$${activeSession.totalCostUsd.toFixed(4)}`}
                    title={`Total API cost: $${activeSession.totalCostUsd.toFixed(4)} across ${activeSession.numTurns} turns`}
                    color="#f3e5f5"
                  />
                )}
                {/* Claude Code version badge */}
                {caps.claudeCodeVersion && (
                  <Badge
                    label={`v${caps.claudeCodeVersion}`}
                    title={`Claude Code CLI version ${caps.claudeCodeVersion}`}
                    color="#f5f5f5"
                  />
                )}
              </div>
            </>
          )}
        </header>

        {/* ── Chat area ────────────────────────────────────────────────
            The CopilotChat component connects to the AG-UI HTTP server
            (port 3000) via CopilotKit's single-endpoint transport.

            key={activeSession.id} forces a remount when switching
            sessions — the chat UI resets but Claude's backend retains
            full conversation history, so context is preserved server-side.

            The agent="default" prop routes to the bridge's default agent.
        */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeSession ? (
            <CopilotKit
              key={activeSession.id}
              runtimeUrl={RUNTIME_URL}
              agent="default"
            >
              <CopilotChat
                instructions="You are a helpful coding assistant powered by Claude Code."
                labels={{
                  title: "Claude Code Agent",
                  initial: `Working in ${activeSession.workingDir}. Ask me anything about this codebase.`,
                }}
              />
            </CopilotKit>
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
              <h2 style={{ fontWeight: 400 }}>Welcome to CopilotKit + Claude Bridge</h2>
              <p>Create a session in the sidebar to get started.</p>
              <p style={{ fontSize: "13px", color: "#aaa" }}>
                Enter a folder path and click "+ New Session" to spawn a Claude Code session.
              </p>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            BOTTOM PANEL — Detailed view of MCP servers, tools, commands
            ══════════════════════════════════════════════════════════════
            This collapsible panel provides a deeper look at the session's
            capabilities, organized into tabs. */}
        {bottomPanelOpen && activeSession && caps && (
          <div
            style={{
              height: 250,
              borderTop: "1px solid #e0e0e0",
              background: "#fafafa",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* ── Panel tab bar ───────────────────────────────────── */}
            <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0", background: "#fff" }}>
              {(["mcp", "tools", "commands", "info"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setBottomTab(tab)}
                  style={{
                    padding: "6px 16px",
                    fontSize: "12px",
                    fontWeight: bottomTab === tab ? 600 : 400,
                    background: "transparent",
                    border: "none",
                    borderBottom: bottomTab === tab ? "2px solid #0066cc" : "2px solid transparent",
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {tab === "mcp" ? `MCP (${caps.mcpServers.length})` :
                   tab === "tools" ? `Tools (${caps.tools.length})` :
                   tab === "commands" ? `Commands (${caps.slashCommands.length})` :
                   "Info"}
                </button>
              ))}
            </div>

            {/* ── Panel content ────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px", fontSize: "12px" }}>

              {/* ── MCP Servers tab ────────────────────────────────
                  Shows all configured MCP servers with their status
                  and provides reconnect/toggle controls. MCP servers
                  expose external tools (APIs, databases, etc.) to Claude. */}
              {bottomTab === "mcp" && (
                caps.mcpServers.length === 0 ? (
                  <p style={{ color: "#888" }}>No MCP servers configured</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid #e0e0e0" }}>
                        <th style={{ padding: "4px 8px" }}>Server</th>
                        <th style={{ padding: "4px 8px" }}>Status</th>
                        <th style={{ padding: "4px 8px" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caps.mcpServers.map((s) => (
                        <tr key={s.name} style={{ borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{s.name}</td>
                          <td style={{ padding: "6px 8px" }}>
                            <span style={{
                              color: s.status === "connected" ? "#4caf50" : "#f44336",
                              fontWeight: 600,
                            }}>
                              {s.status}
                            </span>
                          </td>
                          <td style={{ padding: "6px 8px", display: "flex", gap: 4 }}>
                            <button
                              onClick={() => reconnectMcp(s.name)}
                              style={smallBtnStyle}
                              title="Send mcp_reconnect control request"
                            >
                              Reconnect
                            </button>
                            <button
                              onClick={() => toggleMcp(s.name, s.status !== "connected")}
                              style={smallBtnStyle}
                              title="Send mcp_toggle control request"
                            >
                              {s.status === "connected" ? "Disable" : "Enable"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {/* ── Tools tab ─────────────────────────────────────
                  Lists all tools available to Claude in this session.
                  Tools include: Bash, Read, Write, Edit, Glob, Grep,
                  Task, TodoWrite, WebFetch, WebSearch, etc. */}
              {bottomTab === "tools" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {caps.tools.map((t) => (
                    <span
                      key={t}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 4,
                        background: "#e3f2fd",
                        fontSize: "12px",
                        fontFamily: "monospace",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* ── Commands tab ──────────────────────────────────
                  Shows slash commands and skills available to Claude.
                  Slash commands: /commit, /bug, /compact, /review, etc.
                  Skills: specialized capabilities like PDF processing. */}
              {bottomTab === "commands" && (
                <>
                  {caps.slashCommands.length > 0 && (
                    <>
                      <h4 style={{ margin: "0 0 8px", fontSize: "12px" }}>Slash Commands</h4>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                        {caps.slashCommands.map((c) => (
                          <span
                            key={c}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 4,
                              background: "#fff3e0",
                              fontSize: "12px",
                              fontFamily: "monospace",
                            }}
                          >
                            /{c}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {caps.skills.length > 0 && (
                    <>
                      <h4 style={{ margin: "0 0 8px", fontSize: "12px" }}>Skills</h4>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                        {caps.skills.map((s) => (
                          <span
                            key={s}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 4,
                              background: "#e8f5e9",
                              fontSize: "12px",
                              fontFamily: "monospace",
                            }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {caps.agents.length > 0 && (
                    <>
                      <h4 style={{ margin: "0 0 8px", fontSize: "12px" }}>Sub-Agents</h4>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {caps.agents.map((a) => (
                          <span
                            key={a}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 4,
                              background: "#f3e5f5",
                              fontSize: "12px",
                              fontFamily: "monospace",
                            }}
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {caps.slashCommands.length === 0 && caps.skills.length === 0 && caps.agents.length === 0 && (
                    <p style={{ color: "#888" }}>No commands, skills, or agents available</p>
                  )}
                </>
              )}

              {/* ── Info tab ──────────────────────────────────────
                  Shows session metadata and init data including
                  account info, available models from initialize, etc. */}
              {bottomTab === "info" && (
                <>
                  <DetailRow label="Session ID" value={activeSession.id} mono />
                  <DetailRow label="CLI Version" value={caps.claudeCodeVersion} />
                  <DetailRow label="Working Dir" value={caps.cwd} mono />
                  <DetailRow label="Permission Mode" value={caps.permissionMode} />
                  <DetailRow label="Turns" value={String(activeSession.numTurns)} />
                  <DetailRow label="Cost" value={`$${activeSession.totalCostUsd.toFixed(6)}`} />
                  <DetailRow label="Compacting" value={activeSession.isCompacting ? "Yes" : "No"} />
                  <DetailRow label="Initialized" value={activeSession.initData ? "Yes" : "No"} />

                  {activeSession.initData && (
                    <>
                      <SectionHeader>Account</SectionHeader>
                      {activeSession.initData.account?.email && (
                        <DetailRow label="Email" value={activeSession.initData.account.email} />
                      )}
                      {activeSession.initData.account?.organization && (
                        <DetailRow label="Org" value={activeSession.initData.account.organization} />
                      )}
                      {activeSession.initData.account?.subscriptionType && (
                        <DetailRow label="Plan" value={activeSession.initData.account.subscriptionType} />
                      )}

                      <SectionHeader>Available Models ({activeSession.initData.models.length})</SectionHeader>
                      {activeSession.initData.models.map((m) => (
                        <div key={m.value} style={{ padding: "3px 0", fontSize: "12px" }}>
                          <strong>{m.displayName}</strong>
                          <span style={{ color: "#888", marginLeft: 8 }}>{m.value}</span>
                          {m.description && <div style={{ color: "#999", fontSize: "11px" }}>{m.description}</div>}
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REUSABLE UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

// Shared style for select dropdowns in the header
const selectStyle: React.CSSProperties = {
  fontSize: "12px",
  padding: "3px 6px",
  border: "1px solid #ccc",
  borderRadius: 4,
  background: "#fff",
};

// Shared style for small action buttons in the MCP table
const smallBtnStyle: React.CSSProperties = {
  fontSize: "11px",
  padding: "2px 6px",
  border: "1px solid #ccc",
  borderRadius: 3,
  background: "#fff",
  cursor: "pointer",
};

/**
 * Badge — compact pill-shaped indicator used in the header.
 * Shows a count or value with an optional tooltip for details.
 * Color-coded to help distinguish different capability types.
 */
function Badge({
  label,
  title,
  color = "#e3f2fd",
}: {
  label: string;
  title?: string;
  color?: string;
}) {
  return (
    <span
      title={title}
      style={{
        fontSize: "11px",
        padding: "2px 6px",
        borderRadius: 3,
        background: color,
        color: "#333",
        whiteSpace: "nowrap",
        cursor: title ? "help" : "default",
      }}
    >
      {label}
    </span>
  );
}

/**
 * SectionHeader — divider label for the details sidebar panel.
 * Used to visually separate groups of capability information.
 */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 14,
        marginBottom: 6,
        fontSize: "11px",
        fontWeight: 700,
        color: "#333",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        borderBottom: "1px solid #e0e0e0",
        paddingBottom: 3,
      }}
    >
      {children}
    </div>
  );
}

/**
 * DetailRow — key-value row for the details panel.
 * Shows a label on the left and a value on the right.
 * Optional `mono` flag uses monospace font for technical values.
 */
function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "3px 0",
        fontSize: "12px",
        gap: 8,
      }}
    >
      <span style={{ color: "#666", flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: "#333",
          fontFamily: mono ? "monospace" : "inherit",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textAlign: "right",
        }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * MiniTag — tiny colored tag for lists of items (tools, commands, skills).
 * Used in the details sidebar to display arrays of capabilities compactly.
 */
function MiniTag({
  label,
  color = "#e3f2fd",
}: {
  label: string;
  color?: string;
}) {
  return (
    <span
      style={{
        fontSize: "11px",
        padding: "1px 5px",
        borderRadius: 3,
        background: color,
        color: "#333",
        whiteSpace: "nowrap",
        fontFamily: "monospace",
      }}
    >
      {label}
    </span>
  );
}
