import { spawn, type ChildProcess } from "node:child_process";
import type { AppState } from "./state.js";

export interface SpawnOptions {
  wsPort: number;
  sessionId: string;
  workingDir: string;
  initialPrompt?: string;
  claudeCliPath?: string;
}

/**
 * Spawns a Claude CLI process connected to our WebSocket server.
 *
 * With `--sdk-url`, Claude CLI opens a WebSocket back to us for all communication.
 * The `-p` flag provides the initial prompt to start a conversation turn.
 * Subsequent messages are sent via the WebSocket (ServerMessage::User).
 */
export function spawnClaude(options: SpawnOptions): ChildProcess {
  const {
    wsPort,
    sessionId,
    workingDir,
    initialPrompt,
    claudeCliPath = "claude",
  } = options;

  // Embed session ID in the URL path so the WS server can identify the session
  const wsUrl = `ws://127.0.0.1:${wsPort}/ws/cli/${sessionId}`;

  const args = [
    "--sdk-url", wsUrl,
    "--print",
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--verbose",
  ];

  // If an initial prompt is provided, use -p to kick off the first turn.
  // Otherwise pass -p "" as a required placeholder for headless/SDK mode.
  if (initialPrompt != null) {
    args.push("-p", initialPrompt);
  } else {
    args.push("-p", "");
  }

  console.log(`[bridge] Spawning Claude CLI: ${claudeCliPath} ${args.join(" ")}`);

  const child = spawn(claudeCliPath, args, {
    cwd: workingDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Log stderr for debugging
  child.stderr?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      console.error(`[bridge][stderr:${sessionId.slice(0, 8)}] ${line}`);
    }
  });

  // Log stdout for debugging
  child.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      console.log(`[bridge][stdout:${sessionId.slice(0, 8)}] ${line}`);
    }
  });

  console.log(`[bridge] Spawned Claude CLI for session ${sessionId} in ${workingDir}`);

  return child;
}

/**
 * Monitors a Claude CLI process and updates session status when it exits.
 */
export function monitorProcess(
  state: AppState,
  sessionId: string,
  child: ChildProcess,
): void {
  child.on("exit", (code, signal) => {
    const session = state.sessions.get(sessionId);
    if (!session) return;

    if (code === 0 || signal === null) {
      session.status = "terminated";
    } else {
      session.status = { error: `Process exited with code ${code ?? signal}` };
    }
    session.wsSend = null;

    console.log(
      `[bridge] Claude CLI for session ${sessionId} exited: code=${code}, signal=${signal}`,
    );

    state.emitSessionStatus(sessionId, typeof session.status === "string" ? session.status : "error");
  });
}

/**
 * Check if the Claude CLI is available and supports --sdk-url.
 */
export async function checkClaudeCli(
  claudeCliPath = "claude",
): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(claudeCliPath, ["--help"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    child.on("error", () => resolve(false));
    child.on("close", () => {
      resolve(output.includes("sdk-url"));
    });
  });
}
