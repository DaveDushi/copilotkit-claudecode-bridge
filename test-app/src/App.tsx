import { useState, useEffect, useCallback } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

const MGMT_API = "http://localhost:3002";

interface McpServer {
  name: string;
  status: string;
}

interface SessionCapabilities {
  tools: string[];
  model: string;
  permissionMode: string;
  cwd: string;
  claudeCodeVersion: string;
  slashCommands: string[];
  agents: string[];
  skills: string[];
  mcpServers: McpServer[];
}

interface SessionInfo {
  id: string;
  workingDir: string;
  status: string;
  active: boolean;
  capabilities: SessionCapabilities | null;
  isCompacting: boolean;
  totalCostUsd: number;
  numTurns: number;
}

const MODES = [
  { value: "default", label: "Default" },
  { value: "plan", label: "Plan" },
  { value: "acceptEdits", label: "Accept Edits" },
  { value: "bypassPermissions", label: "Bypass" },
  { value: "dontAsk", label: "Don't Ask" },
];

export default function App() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSession = sessions.find((s) => s.active) ?? null;
  const caps = activeSession?.capabilities ?? null;

  // ── Fetch sessions ──────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${MGMT_API}/api/sessions`);
      const data = await res.json();
      setSessions(data.sessions);
    } catch {
      // server might not be up yet
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const iv = setInterval(fetchSessions, 3000);
    return () => clearInterval(iv);
  }, [fetchSessions]);

  // ── Create session ──────────────────────────────────────────────
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

  // ── Activate session ────────────────────────────────────────────
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

  // ── Delete session ──────────────────────────────────────────────
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

  // ── Set model ───────────────────────────────────────────────────
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

  // ── Set permission mode ─────────────────────────────────────────
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

  // ── Interrupt ───────────────────────────────────────────────────
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

  // ── Folder name from path ───────────────────────────────────────
  const folderName = (path: string) => {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] || path;
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "connected":
      case "idle":
        return "#4caf50";
      case "active":
        return "#2196f3";
      case "starting":
        return "#ff9800";
      default:
        return "#bdbdbd";
    }
  };

  return (
    <div style={{ height: "100vh", display: "flex" }}>
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        style={{
          width: 280,
          minWidth: 280,
          borderRight: "1px solid #e0e0e0",
          background: "#f8f9fa",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid #e0e0e0",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>
            Sessions
          </h2>
        </div>

        {/* Session list */}
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
                  {s.capabilities?.model ? ` | ${s.capabilities.model.split("-").slice(-1)[0]}` : ""}
                  {s.numTurns > 0 ? ` | ${s.numTurns}t` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* New session form */}
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
      </aside>

      {/* ── Main chat area ──────────────────────────────────────── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* ── Header with controls ────────────────────────────── */}
        <header
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid #e0e0e0",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "15px", whiteSpace: "nowrap" }}>
            CopilotKit + Claude Bridge
          </h1>

          {activeSession && caps && (
            <>
              {/* Model selector */}
              <select
                value={caps.model}
                onChange={(e) => setModel(e.target.value)}
                style={{
                  fontSize: "12px",
                  padding: "3px 6px",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  background: "#fff",
                }}
                title="Model"
              >
                <option value={caps.model}>{caps.model}</option>
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

              {/* Mode selector */}
              <select
                value={caps.permissionMode}
                onChange={(e) => setMode(e.target.value)}
                style={{
                  fontSize: "12px",
                  padding: "3px 6px",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  background: "#fff",
                }}
                title="Permission Mode"
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              {/* Interrupt button */}
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
                title="Interrupt current operation"
              >
                Stop
              </button>

              {/* Compacting indicator */}
              {activeSession.isCompacting && (
                <span style={{ fontSize: "11px", color: "#ff9800", fontWeight: 600 }}>
                  Compacting...
                </span>
              )}

              {/* Capabilities badges */}
              <div style={{ display: "flex", gap: 4, marginLeft: "auto", flexWrap: "wrap" }}>
                {caps.tools.length > 0 && (
                  <Badge label={`${caps.tools.length} tools`} title={caps.tools.join(", ")} />
                )}
                {caps.slashCommands.length > 0 && (
                  <Badge
                    label={`${caps.slashCommands.length} commands`}
                    title={caps.slashCommands.join(", ")}
                  />
                )}
                {caps.skills.length > 0 && (
                  <Badge label={`${caps.skills.length} skills`} title={caps.skills.join(", ")} />
                )}
                {caps.agents.length > 0 && (
                  <Badge label={`${caps.agents.length} agents`} title={caps.agents.join(", ")} />
                )}
                {caps.mcpServers.length > 0 && (
                  <Badge
                    label={`${caps.mcpServers.length} MCP`}
                    title={caps.mcpServers.map((s) => `${s.name} (${s.status})`).join(", ")}
                    color={caps.mcpServers.every((s) => s.status === "connected") ? "#e8f5e9" : "#fff3e0"}
                  />
                )}
                {activeSession.totalCostUsd > 0 && (
                  <Badge
                    label={`$${activeSession.totalCostUsd.toFixed(4)}`}
                    title={`Total cost: $${activeSession.totalCostUsd.toFixed(4)}`}
                    color="#f3e5f5"
                  />
                )}
              </div>
            </>
          )}
        </header>

        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeSession ? (
            // key= forces CopilotKit to remount when switching sessions.
            // The chat UI resets but Claude's backend session retains full
            // conversation history, so context is preserved server-side.
            <CopilotKit
              key={activeSession.id}
              runtimeUrl="http://localhost:3000"
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
              Create a session in the sidebar to get started.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

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
