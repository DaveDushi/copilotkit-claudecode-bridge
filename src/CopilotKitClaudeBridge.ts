import { EventEmitter } from "node:events";
import type { Server as HttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { v4 as uuidv4 } from "uuid";

import { AppState } from "./server/state.js";
import { createSession } from "./server/session.js";
import { spawnClaude, monitorProcess } from "./server/process.js";
import { createWsServer } from "./server/ws-server.js";
import { createAguiServer } from "./server/agui-server.js";
import type { SessionStatus } from "./server/session.js";
import type { ClaudeMessage, ServerMessage } from "./server/types.js";

export interface BridgeConfig {
  /** WebSocket server port. Default: 0 (random). */
  wsPort?: number;
  /** HTTP (AG-UI) server port. Default: 0 (random). */
  httpPort?: number;
  /** Host to bind to. Default: "127.0.0.1". */
  host?: string;
  /** Agent ID for AG-UI discovery. Default: "default". */
  agentId?: string;
  /** Agent description for AG-UI discovery. Default: "Claude Code AI agent". */
  agentDescription?: string;
  /** Path to the Claude CLI binary. Default: "claude" (from PATH). */
  claudeCliPath?: string;
  /** CORS origins for the HTTP server. Default: ["*"]. */
  corsOrigins?: string[];
}

export interface BridgeEvents {
  "session:status": (sessionId: string, status: SessionStatus) => void;
  "session:message": (sessionId: string, message: ClaudeMessage) => void;
  ports: (wsPort: number, httpPort: number) => void;
}

/**
 * Main facade class that ties everything together.
 *
 * Usage:
 * ```ts
 * const bridge = new CopilotKitClaudeBridge({ httpPort: 3000 });
 * const { wsPort, httpPort } = await bridge.start();
 * await bridge.spawnSession("./my-project");
 * ```
 */
export class CopilotKitClaudeBridge extends EventEmitter {
  private config: Required<BridgeConfig>;
  private state: AppState;
  private wsHttpServer: HttpServer | null = null;
  private aguiServer: HttpServer | null = null;
  private actualWsPort = 0;
  private actualHttpPort = 0;

  constructor(config: BridgeConfig = {}) {
    super();
    this.config = {
      wsPort: config.wsPort ?? 0,
      httpPort: config.httpPort ?? 0,
      host: config.host ?? "127.0.0.1",
      agentId: config.agentId ?? "default",
      agentDescription: config.agentDescription ?? "Claude Code AI agent",
      claudeCliPath: config.claudeCliPath ?? "claude",
      corsOrigins: config.corsOrigins ?? ["*"],
    };
    this.state = new AppState();

    // Forward events from state to the bridge
    this.state.on("session:status", (sessionId: string, status: string) => {
      this.emit("session:status", sessionId, status);
    });
    this.state.on("session:message", (sessionId: string, message: unknown) => {
      this.emit("session:message", sessionId, message);
    });
  }

  /**
   * Start the WebSocket and HTTP servers.
   * Returns the actual ports they bound to.
   */
  async start(): Promise<{ wsPort: number; httpPort: number }> {
    const { host } = this.config;

    // Start WebSocket server
    const { httpServer: wsHttpServer } = createWsServer(this.state);
    this.wsHttpServer = wsHttpServer;

    await new Promise<void>((resolve, reject) => {
      wsHttpServer.on("error", reject);
      wsHttpServer.listen(this.config.wsPort, host, () => resolve());
    });

    const wsAddr = wsHttpServer.address();
    this.actualWsPort = typeof wsAddr === "object" && wsAddr ? wsAddr.port : 0;
    console.log(`[bridge] WebSocket server listening on port ${this.actualWsPort}`);

    // Start AG-UI HTTP server
    this.aguiServer = createAguiServer(this.state, {
      agentId: this.config.agentId,
      agentDescription: this.config.agentDescription,
      corsOrigins: this.config.corsOrigins,
    });

    await new Promise<void>((resolve, reject) => {
      this.aguiServer!.on("error", reject);
      this.aguiServer!.listen(this.config.httpPort, host, () => resolve());
    });

    const httpAddr = this.aguiServer.address();
    this.actualHttpPort = typeof httpAddr === "object" && httpAddr ? httpAddr.port : 0;
    console.log(`[bridge] AG-UI server listening on port ${this.actualHttpPort}`);

    this.emit("ports", this.actualWsPort, this.actualHttpPort);

    return { wsPort: this.actualWsPort, httpPort: this.actualHttpPort };
  }

  /**
   * Stop all servers and kill all sessions.
   */
  async stop(): Promise<void> {
    // Kill all sessions
    for (const [sessionId] of this.state.sessions) {
      await this.killSession(sessionId);
    }

    // Close servers
    await new Promise<void>((resolve) => {
      if (this.wsHttpServer) {
        this.wsHttpServer.close(() => resolve());
      } else {
        resolve();
      }
    });

    await new Promise<void>((resolve) => {
      if (this.aguiServer) {
        this.aguiServer.close(() => resolve());
      } else {
        resolve();
      }
    });

    this.wsHttpServer = null;
    this.aguiServer = null;
    console.log("[bridge] All servers stopped");
  }

  /**
   * Spawn a new Claude CLI session.
   * Returns the session ID once the CLI has connected via WebSocket.
   * Waits up to 30s for the connection (Claude CLI can take a while to start).
   */
  async spawnSession(workingDir: string, initialPrompt?: string): Promise<string> {
    const sessionId = uuidv4();
    const session = createSession(sessionId, workingDir);
    this.state.sessions.set(sessionId, session);

    const child = spawnClaude({
      wsPort: this.actualWsPort,
      sessionId,
      workingDir,
      initialPrompt,
      claudeCliPath: this.config.claudeCliPath,
    });

    session.process = child;
    monitorProcess(this.state, sessionId, child);

    // Wait for CLI to connect via WebSocket (or fail)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        // Don't reject — the CLI might still connect later
        console.warn(`[bridge] Session ${sessionId.slice(0, 8)} CLI did not connect within 30s — continuing anyway`);
        resolve();
      }, 30_000);

      const checkInterval = setInterval(() => {
        const s = this.state.sessions.get(sessionId);
        if (s?.wsSend) {
          cleanup();
          resolve();
        }
      }, 200);

      const onExit = (code: number | null) => {
        cleanup();
        reject(new Error(`Claude CLI exited immediately with code ${code}. Check that 'claude' is on PATH and supports --sdk-url.`));
      };

      child.on("exit", onExit);

      const cleanup = () => {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        child.off("exit", onExit);
      };
    });

    return sessionId;
  }

  /**
   * Kill a session and its Claude CLI process.
   * Waits for the process to actually exit before returning.
   */
  async killSession(sessionId: string): Promise<void> {
    const session = this.state.sessions.get(sessionId);
    if (!session) return;

    session.wsSend = null;
    session.status = "terminated";

    if (session.process && !session.process.killed) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if SIGTERM didn't work after 5s
          try { session.process?.kill("SIGKILL"); } catch {}
          resolve();
        }, 5_000);

        session.process!.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });

        session.process!.kill("SIGTERM");
      });
    }

    this.state.sessions.delete(sessionId);
    this.state.emitSessionStatus(sessionId, "terminated");
  }

  /**
   * Send a user message to a session via WebSocket.
   */
  async sendMessage(sessionId: string, content: string): Promise<void> {
    const session = this.state.sessions.get(sessionId);
    if (!session?.wsSend) {
      throw new Error(`No active WebSocket for session ${sessionId}`);
    }

    const msg: ServerMessage = {
      type: "user",
      message: { role: "user", content },
      parent_tool_use_id: null,
      session_id: session.cliSessionId ?? "",
    };

    session.wsSend(`${JSON.stringify(msg)}\n`);
  }

  /**
   * Approve or deny a tool use request.
   */
  async approveTool(
    sessionId: string,
    requestId: string,
    approved: boolean,
  ): Promise<void> {
    const session = this.state.sessions.get(sessionId);
    if (!session?.wsSend) {
      throw new Error(`No active WebSocket for session ${sessionId}`);
    }

    const msg: ServerMessage = {
      type: "control_response",
      response: {
        subtype: "can_use_tool",
        request_id: requestId,
        response: {
          behavior: approved ? "allow" : "deny",
        },
      },
    };

    session.wsSend(`${JSON.stringify(msg)}\n`);
  }

  /**
   * Returns a request handler function for embedding in Express/Hono/etc.
   *
   * Usage with Express:
   * ```ts
   * app.use(bridge.getRequestHandler());
   * ```
   */
  getRequestHandler(): (req: IncomingMessage, res: ServerResponse) => void {
    const server = createAguiServer(this.state, {
      agentId: this.config.agentId,
      agentDescription: this.config.agentDescription,
      corsOrigins: this.config.corsOrigins,
    });

    return (req: IncomingMessage, res: ServerResponse) => {
      server.emit("request", req, res);
    };
  }

  /** Get the actual WebSocket port. */
  get wsPort(): number {
    return this.actualWsPort;
  }

  /** Get the actual HTTP port. */
  get httpPort(): number {
    return this.actualHttpPort;
  }

  /** Get the runtime URL for CopilotKit. */
  get runtimeUrl(): string {
    return `http://${this.config.host}:${this.actualHttpPort}`;
  }
}
