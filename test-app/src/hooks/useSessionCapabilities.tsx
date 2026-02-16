import { useState, useEffect, useCallback } from "react";

const MGMT_API = "http://localhost:3002";

interface Command {
  name: string;
  description: string;
  argumentHint?: string;
}

interface Model {
  value: string;
  displayName: string;
  description: string;
}

export interface SessionCapabilitiesData {
  sessionId: string;
  commands: Command[];
  slashCommands: string[];
  skills: string[];
  models: Model[];
  permissionMode: string;
  model: string;
}

export function useSessionCapabilities() {
  const [capabilities, setCapabilities] = useState<SessionCapabilitiesData | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${MGMT_API}/api/sessions`);
      const data = await res.json();
      if (data.sessions?.length > 0) {
        const session = data.sessions[0];
        setCapabilities({
          sessionId: session.id,
          commands: session.initData?.commands ?? [],
          slashCommands: session.capabilities?.slashCommands ?? [],
          skills: session.capabilities?.skills ?? [],
          models: session.initData?.models ?? [],
          permissionMode: session.capabilities?.permissionMode ?? "default",
          model: session.capabilities?.model ?? "",
        });
      }
    } catch {
      // Ignore fetch errors
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  const setPermissionMode = useCallback(async (mode: string) => {
    if (!capabilities?.sessionId) return;
    try {
      await fetch(`${MGMT_API}/api/sessions/${capabilities.sessionId}/permission-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      setCapabilities((prev) => prev ? { ...prev, permissionMode: mode } : prev);
    } catch (err) {
      console.error("Failed to set permission mode:", err);
    }
  }, [capabilities?.sessionId]);

  return { capabilities, setPermissionMode, refresh };
}
