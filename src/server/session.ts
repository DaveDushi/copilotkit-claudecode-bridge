import type { ChildProcess } from "node:child_process";

export type SessionStatus =
  | "starting"
  | "connected"
  | "active"
  | "idle"
  | "disconnected"
  | "terminated"
  | { error: string };

export interface Session {
  id: string;
  status: SessionStatus;
  workingDir: string;
  /** The spawned Claude CLI process. */
  process: ChildProcess | null;
  /** Function to send messages back to CLI via WebSocket. */
  wsSend: ((data: string) => void) | null;
  /** CLI's internal session ID (from system/init), used for --resume. */
  cliSessionId: string | null;
  /** Message history for persistence. */
  messageHistory: unknown[];
  /** Timestamp when the session was created. */
  createdAt: number;
}

export function createSession(id: string, workingDir: string): Session {
  return {
    id,
    status: "starting",
    workingDir,
    process: null,
    wsSend: null,
    cliSessionId: null,
    messageHistory: [],
    createdAt: Date.now(),
  };
}
