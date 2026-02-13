import { useState, useEffect, useCallback } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

const MGMT_API = "http://localhost:3002";

interface SessionInfo {
  id: string;
  workingDir: string;
  status: string;
  active: boolean;
}

export default function App() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSession = sessions.find((s) => s.active) ?? null;

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

  // ── Folder name from path ───────────────────────────────────────
  const folderName = (path: string) => {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] || path;
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
                  ×
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background:
                      s.status === "connected" || s.status === "idle"
                        ? "#4caf50"
                        : s.status === "active"
                          ? "#2196f3"
                          : s.status === "starting"
                            ? "#ff9800"
                            : "#bdbdbd",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: "12px",
                    color: "#888",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={s.workingDir}
                >
                  {s.workingDir}
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
        <header
          style={{
            padding: "10px 20px",
            borderBottom: "1px solid #e0e0e0",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <h1 style={{ margin: 0, fontSize: "16px" }}>
            CopilotKit + Claude Bridge
          </h1>
          {activeSession && (
            <span
              style={{
                fontSize: "13px",
                color: "#555",
                fontFamily: "monospace",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {activeSession.workingDir}
            </span>
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
