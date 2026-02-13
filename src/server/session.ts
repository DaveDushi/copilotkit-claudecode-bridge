import type { ChildProcess } from "node:child_process";
import type { PermissionMode, McpServerInfo, InitializeResponse } from "./types.js";

export type SessionStatus =
  | "starting"
  | "connected"
  | "active"
  | "idle"
  | "disconnected"
  | "terminated"
  | { error: string };

/**
 * Capabilities reported by Claude CLI in the system/init message.
 * Populated once the CLI connects and sends its first message.
 */
export interface SessionCapabilities {
  tools: string[];
  model: string;
  permissionMode: PermissionMode;
  cwd: string;
  claudeCodeVersion: string;
  slashCommands: string[];
  agents: string[];
  skills: string[];
  mcpServers: McpServerInfo[];
  plugins: { name: string; path: string }[];
  outputStyle: string;
  apiKeySource: string;
}

/**
 * Data returned from the initialize control request.
 * Available after sendInitialize() is called.
 */
export interface SessionInitData {
  commands: { name: string; description: string; argumentHint?: string }[];
  models: { value: string; displayName: string; description: string }[];
  account: {
    email?: string;
    organization?: string;
    subscriptionType?: string;
    apiKeySource?: string;
  };
  outputStyle: string;
  availableOutputStyles: string[];
  fastMode?: boolean;
}

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
  /** Capabilities reported by system/init. Null until CLI connects. */
  capabilities: SessionCapabilities | null;
  /** Data from initialize control request. Null until initialize is called. */
  initData: SessionInitData | null;
  /** Whether the initialize control request has been sent. */
  initialized: boolean;
  /** Pending control requests awaiting response, keyed by request_id. */
  pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>;
  /** Whether context is currently being compacted. */
  isCompacting: boolean;
  /** Cumulative cost in USD across all turns. */
  totalCostUsd: number;
  /** Cumulative number of turns. */
  numTurns: number;
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
    capabilities: null,
    initData: null,
    initialized: false,
    pendingRequests: new Map(),
    isCompacting: false,
    totalCostUsd: 0,
    numTurns: 0,
  };
}
