import { useState, useCallback } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

const MGMT_API = "http://localhost:3002";

export default function App() {
  const [folder, setFolder] = useState("");
  const [activeDir, setActiveDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFolder = useCallback(async () => {
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

      if (!res.ok) {
        setError(data.error || "Failed to spawn session");
        return;
      }

      setActiveDir(data.workingDir);
    } catch (err: any) {
      setError(err.message || "Failed to connect to management API");
    } finally {
      setLoading(false);
    }
  }, [folder]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid #e0e0e0",
          background: "#f8f9fa",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "18px" }}>
          CopilotKit + Claude Bridge Test
        </h1>

        <div
          style={{
            marginTop: "8px",
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadFolder();
            }}
            placeholder="Enter folder path, e.g. /home/user/my-project"
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: "14px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              fontFamily: "monospace",
            }}
            disabled={loading}
          />
          <button
            onClick={loadFolder}
            disabled={loading || !folder.trim()}
            style={{
              padding: "6px 16px",
              fontSize: "14px",
              background: loading ? "#999" : "#0066cc",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: loading || !folder.trim() ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Loading..." : "Load Folder"}
          </button>
        </div>

        {activeDir && (
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#2e7d32" }}>
            Working directory: <code>{activeDir}</code>
          </p>
        )}
        {error && (
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#c62828" }}>
            Error: {error}
          </p>
        )}
      </header>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <CopilotKit runtimeUrl="http://localhost:3000" agent="default">
          <CopilotChat
            instructions="You are a helpful coding assistant powered by Claude Code."
            labels={{
              title: "Claude Code Agent",
              initial: activeDir
                ? `Working in ${activeDir}. Ask me anything about this codebase.`
                : "Hi! Enter a folder path above and click Load Folder to get started.",
            }}
          />
        </CopilotKit>
      </div>
    </div>
  );
}
