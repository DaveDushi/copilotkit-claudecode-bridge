import { EventEmitter } from "node:events";
import type { Server as HttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { v4 as uuidv4 } from "uuid";

import { AppState } from "./server/state.js";
import { createSession } from "./server/session.js";
import type { SessionCapabilities, SessionInitData } from "./server/session.js";
import { spawnClaude, monitorProcess } from "./server/process.js";
import { createWsServer } from "./server/ws-server.js";
import { createAguiServer } from "./server/agui-server.js";
import type { SessionStatus } from "./server/session.js";
import type {
  ClaudeMessage,
  ServerMessage,
  ControlRequestBody,
  PermissionMode,
  PermissionUpdate,
  McpServerConfig,
  McpServerInfo,
  AgentDefinition,
  InitializeResponse,
  McpStatusResponse,
  RewindFilesResponse,
  SetPermissionModeResponse,
  ToolApprovalResponse,
} from "./server/types.js";

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
  /** Timeout in ms for control requests. Default: 30000. */
  controlRequestTimeout?: number;
  /** Whether to auto-initialize sessions after CLI connects. Default: false. */
  autoInitialize?: boolean;
  /** System prompt to pass during initialize. */
  systemPrompt?: string;
  /** System prompt to append during initialize. */
  appendSystemPrompt?: string;
}

export interface BridgeEvents {
  "session:status": (sessionId: string, status: SessionStatus) => void;
  "session:message": (sessionId: string, message: ClaudeMessage) => void;
  "session:capabilities": (sessionId: string, capabilities: SessionCapabilities) => void;
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
      controlRequestTimeout: config.controlRequestTimeout ?? 30_000,
      autoInitialize: config.autoInitialize ?? false,
      systemPrompt: config.systemPrompt ?? "",
      appendSystemPrompt: config.appendSystemPrompt ?? "",
    };
    this.state = new AppState();

    // Forward events from state to the bridge
    this.state.on("session:status", (sessionId: string, status: string) => {
      this.emit("session:status", sessionId, status);

      // Auto-initialize on first connect if configured
      if (status === "connected" && this.config.autoInitialize) {
        const session = this.state.sessions.get(sessionId);
        if (session && !session.initialized) {
          this.sendInitialize(sessionId).catch((err) => {
            console.error(`[bridge] Auto-initialize failed for session ${sessionId.slice(0, 8)}: ${err.message}`);
          });
        }
      }
    });
    this.state.on("session:message", (sessionId: string, message: unknown) => {
      this.emit("session:message", sessionId, message);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════
  // Session Management
  // ═══════════════════════════════════════════════════════════

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

    // Auto-activate the first session, or any newly spawned session
    this.state.activeSessionId = sessionId;

    return sessionId;
  }

  /**
   * Set the active session that AG-UI run requests are routed to.
   */
  setActiveSession(sessionId: string): void {
    if (!this.state.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} not found`);
    }
    this.state.activeSessionId = sessionId;
  }

  /**
   * Get the current active session ID.
   */
  get activeSessionId(): string | null {
    return this.state.activeSessionId;
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

    // Clean up pending requests
    for (const [reqId, pending] of session.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Session terminated"));
      session.pendingRequests.delete(reqId);
    }

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
    if (this.state.activeSessionId === sessionId) {
      // Auto-activate another session if available
      const next = this.state.sessions.keys().next();
      this.state.activeSessionId = next.done ? null : next.value;
    }
    this.state.emitSessionStatus(sessionId, "terminated");
  }

  // ═══════════════════════════════════════════════════════════
  // Messaging
  // ═══════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════
  // Tool Approval (can_use_tool response)
  // ═══════════════════════════════════════════════════════════

  /**
   * Approve or deny a tool use request.
   *
   * When approving, `updatedInput` is mandatory — it replaces the tool's input.
   * Pass the original input unchanged if no modifications are needed.
   * Optionally include `updatedPermissions` to save rules for future requests.
   */
  async approveTool(
    sessionId: string,
    requestId: string,
    response: ToolApprovalResponse,
  ): Promise<void> {
    const session = this.state.sessions.get(sessionId);
    if (!session?.wsSend) {
      throw new Error(`No active WebSocket for session ${sessionId}`);
    }

    const msg: ServerMessage = {
      type: "control_response",
      response: {
        subtype: "success",
        request_id: requestId,
        response,
      },
    };

    session.wsSend(`${JSON.stringify(msg)}\n`);
  }

  /**
   * Convenience: approve a tool with original input unchanged.
   */
  async approveToolSimple(
    sessionId: string,
    requestId: string,
    originalInput: unknown,
  ): Promise<void> {
    return this.approveTool(sessionId, requestId, {
      behavior: "allow",
      updatedInput: originalInput,
    });
  }

  /**
   * Convenience: deny a tool with a message.
   */
  async denyTool(
    sessionId: string,
    requestId: string,
    message = "Tool use denied by user",
    interrupt = false,
  ): Promise<void> {
    return this.approveTool(sessionId, requestId, {
      behavior: "deny",
      message,
      interrupt,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Control Requests (Server → CLI)
  // ═══════════════════════════════════════════════════════════

  /**
   * Send a control request to Claude CLI and wait for the response.
   * Uses request_id correlation for async request/response matching.
   */
  async sendControlRequest<T = unknown>(
    sessionId: string,
    request: Omit<ControlRequestBody, "subtype"> & { subtype: string },
    timeoutMs?: number,
  ): Promise<T> {
    const session = this.state.sessions.get(sessionId);
    if (!session?.wsSend) {
      throw new Error(`No active WebSocket for session ${sessionId}`);
    }

    const requestId = uuidv4();
    const timeout = timeoutMs ?? this.config.controlRequestTimeout;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pendingRequests.delete(requestId);
        reject(new Error(`Control request "${request.subtype}" timed out after ${timeout}ms`));
      }, timeout);

      session.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      const msg = JSON.stringify({
        type: "control_request",
        request_id: requestId,
        request,
      });

      session.wsSend!(`${msg}\n`);
    });
  }

  /**
   * Send the `initialize` control request. Must be called before first user message.
   * Registers hooks, MCP servers, agents, system prompt, etc.
   * Returns commands, models, and account info.
   */
  async sendInitialize(
    sessionId: string,
    options?: {
      hooks?: Record<string, { matcher?: string; hookCallbackIds: string[]; timeout?: number }[]>;
      sdkMcpServers?: string[];
      jsonSchema?: Record<string, unknown>;
      systemPrompt?: string;
      appendSystemPrompt?: string;
      agents?: Record<string, AgentDefinition>;
    },
  ): Promise<InitializeResponse> {
    const session = this.state.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.initialized) throw new Error("Session already initialized");

    const result = await this.sendControlRequest<InitializeResponse>(sessionId, {
      subtype: "initialize",
      hooks: options?.hooks,
      sdkMcpServers: options?.sdkMcpServers,
      jsonSchema: options?.jsonSchema,
      systemPrompt: options?.systemPrompt ?? (this.config.systemPrompt || undefined),
      appendSystemPrompt: options?.appendSystemPrompt ?? (this.config.appendSystemPrompt || undefined),
      agents_config: options?.agents,
    });

    session.initialized = true;
    session.initData = {
      commands: result.commands ?? [],
      models: result.models ?? [],
      account: result.account ?? {},
      outputStyle: result.output_style ?? "",
      availableOutputStyles: result.available_output_styles ?? [],
      fastMode: result.fast_mode,
    };

    console.log(
      `[bridge] Session ${sessionId.slice(0, 8)} initialized: ` +
      `${session.initData.commands.length} commands, ${session.initData.models.length} models`,
    );

    this.emit("session:capabilities", sessionId, session.capabilities);

    return result;
  }

  /**
   * Interrupt the current agent turn.
   */
  async interrupt(sessionId: string): Promise<void> {
    await this.sendControlRequest(sessionId, { subtype: "interrupt" });
  }

  /**
   * Change the model at runtime.
   * Pass "default" to reset to the default model.
   */
  async setModel(sessionId: string, model: string): Promise<void> {
    await this.sendControlRequest(sessionId, {
      subtype: "set_model",
      model,
    });

    // Update local capabilities
    const session = this.state.sessions.get(sessionId);
    if (session?.capabilities) {
      session.capabilities.model = model;
    }
  }

  /**
   * Change the permission mode at runtime.
   */
  async setPermissionMode(sessionId: string, mode: PermissionMode): Promise<SetPermissionModeResponse> {
    const result = await this.sendControlRequest<SetPermissionModeResponse>(sessionId, {
      subtype: "set_permission_mode",
      mode,
    });

    // Update local capabilities
    const session = this.state.sessions.get(sessionId);
    if (session?.capabilities) {
      session.capabilities.permissionMode = result.mode ?? mode;
    }

    return result;
  }

  /**
   * Set the maximum thinking tokens budget.
   * Pass null to remove the limit.
   */
  async setMaxThinkingTokens(sessionId: string, maxThinkingTokens: number | null): Promise<void> {
    await this.sendControlRequest(sessionId, {
      subtype: "set_max_thinking_tokens",
      max_thinking_tokens: maxThinkingTokens,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // MCP Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Get the status of all MCP servers.
   */
  async getMcpStatus(sessionId: string): Promise<McpStatusResponse> {
    return this.sendControlRequest<McpStatusResponse>(sessionId, {
      subtype: "mcp_status",
    });
  }

  /**
   * Reconnect an MCP server by name.
   */
  async mcpReconnect(sessionId: string, serverName: string): Promise<void> {
    await this.sendControlRequest(sessionId, {
      subtype: "mcp_reconnect",
      serverName,
    });
  }

  /**
   * Enable or disable an MCP server.
   */
  async mcpToggle(sessionId: string, serverName: string, enabled: boolean): Promise<void> {
    await this.sendControlRequest(sessionId, {
      subtype: "mcp_toggle",
      serverName,
      enabled,
    });
  }

  /**
   * Configure MCP servers (set the full server configuration).
   */
  async mcpSetServers(sessionId: string, servers: Record<string, McpServerConfig>): Promise<void> {
    await this.sendControlRequest(sessionId, {
      subtype: "mcp_set_servers",
      servers,
    });
  }

  /**
   * Send a JSON-RPC message to an MCP server.
   */
  async mcpMessage(sessionId: string, serverName: string, message: unknown): Promise<unknown> {
    return this.sendControlRequest(sessionId, {
      subtype: "mcp_message",
      server_name: serverName,
      message,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // File Operations
  // ═══════════════════════════════════════════════════════════

  /**
   * Rewind files to a checkpoint (undo changes made after a specific message).
   */
  async rewindFiles(
    sessionId: string,
    userMessageId: string,
    dryRun = false,
  ): Promise<RewindFilesResponse> {
    return this.sendControlRequest<RewindFilesResponse>(sessionId, {
      subtype: "rewind_files",
      user_message_id: userMessageId,
      dry_run: dryRun,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Environment
  // ═══════════════════════════════════════════════════════════

  /**
   * Update environment variables in the CLI process.
   */
  async updateEnvironmentVariables(sessionId: string, variables: Record<string, string>): Promise<void> {
    const session = this.state.sessions.get(sessionId);
    if (!session?.wsSend) {
      throw new Error(`No active WebSocket for session ${sessionId}`);
    }

    const msg = JSON.stringify({
      type: "update_environment_variables",
      variables,
    });

    session.wsSend(`${msg}\n`);
  }

  // ═══════════════════════════════════════════════════════════
  // Session Info Getters
  // ═══════════════════════════════════════════════════════════

  /**
   * Get capabilities for a session (populated after system/init).
   */
  getCapabilities(sessionId: string): SessionCapabilities | null {
    return this.state.sessions.get(sessionId)?.capabilities ?? null;
  }

  /**
   * Get init data for a session (populated after sendInitialize).
   */
  getInitData(sessionId: string): SessionInitData | null {
    return this.state.sessions.get(sessionId)?.initData ?? null;
  }

  /**
   * Get all session IDs.
   */
  getSessionIds(): string[] {
    return Array.from(this.state.sessions.keys());
  }

  /**
   * Get session info (for API responses).
   */
  getSessionInfo(sessionId: string): {
    id: string;
    status: string;
    workingDir: string;
    active: boolean;
    capabilities: SessionCapabilities | null;
    initData: SessionInitData | null;
    isCompacting: boolean;
    totalCostUsd: number;
    numTurns: number;
  } | null {
    const session = this.state.sessions.get(sessionId);
    if (!session) return null;

    return {
      id: session.id,
      status: typeof session.status === "string" ? session.status : "error",
      workingDir: session.workingDir,
      active: this.state.activeSessionId === sessionId,
      capabilities: session.capabilities,
      initData: session.initData,
      isCompacting: session.isCompacting,
      totalCostUsd: session.totalCostUsd,
      numTurns: session.numTurns,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // HTTP Handler
  // ═══════════════════════════════════════════════════════════

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
