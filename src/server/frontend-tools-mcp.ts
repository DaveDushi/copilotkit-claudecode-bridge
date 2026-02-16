/**
 * Lightweight MCP (Model Context Protocol) HTTP server that exposes
 * CopilotKit frontend actions as real tools to Claude CLI.
 *
 * Problem: CopilotKit registers frontend actions (addTask, updateScratchpad, etc.)
 * that Claude should be able to call. But Claude CLI only knows about its built-in
 * tools and MCP tools — it rejects unknown tool_use blocks with "No such tool".
 *
 * Solution: We run a small HTTP MCP server, register it with Claude CLI via
 * mcp_set_servers, and expose the CopilotKit actions as MCP tools. When Claude
 * calls a frontend tool, Claude CLI routes it through MCP to us. We return an
 * immediate acknowledgment. Meanwhile, the bridge's streaming pipeline already
 * sends the tool call to CopilotKit as AG-UI TOOL_CALL events, so the frontend
 * action executes in the browser.
 *
 * The MCP server implements the Streamable HTTP transport (JSON-RPC over HTTP POST).
 */
import { createServer, type Server as HttpServer } from "node:http";

/** A registered frontend tool from CopilotKit */
export interface FrontendTool {
  name: string;
  description: string;
  /** JSON Schema for the tool's parameters */
  inputSchema: Record<string, unknown>;
}

/**
 * Manages a lightweight MCP server for CopilotKit frontend tools.
 */
export class FrontendToolsMcp {
  private server: HttpServer | null = null;
  private port = 0;
  private tools = new Map<string, FrontendTool>();
  /** Server name registered with Claude CLI */
  readonly serverName = "copilotkit-frontend";

  /**
   * Start the MCP HTTP server on a random port.
   */
  async start(host = "127.0.0.1"): Promise<number> {
    this.server = createServer((req, res) => {
      // CORS for any origin (local only)
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method !== "POST") {
        res.writeHead(405);
        res.end("Method Not Allowed");
        return;
      }

      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", () => {
        this.handleJsonRpc(body, res);
      });
    });

    return new Promise((resolve, reject) => {
      this.server!.on("error", reject);
      this.server!.listen(0, host, () => {
        const addr = this.server!.address();
        this.port = typeof addr === "object" && addr ? addr.port : 0;
        console.log(`[bridge] Frontend tools MCP server on port ${this.port}`);
        resolve(this.port);
      });
    });
  }

  /**
   * Stop the MCP server.
   */
  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.close(() => resolve());
      this.server = null;
    });
  }

  /**
   * Get the actual port the server is listening on.
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Update the set of available frontend tools.
   * Called each time CopilotKit sends an agent/run with a tools array.
   */
  updateTools(tools: Array<Record<string, unknown>>): void {
    // Don't clear — accumulate tools across requests.
    // CopilotKit may send different subsets on different calls.
    for (const t of tools) {
      const name = typeof t.name === "string" ? t.name : null;
      if (!name) continue;

      const description = typeof t.description === "string"
        ? t.description
        : "CopilotKit frontend action";

      // Extract JSON schema — CopilotKit uses jsonSchema or parameters
      const schema = (t.jsonSchema ?? t.parameters ?? {}) as Record<string, unknown>;

      this.tools.set(name, { name, description, inputSchema: schema });
    }
  }

  /**
   * Check if a tool name is a registered frontend tool.
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get the MCP server config to register with Claude CLI.
   */
  getMcpConfig(): { type: "http"; url: string } {
    return {
      type: "http",
      url: `http://127.0.0.1:${this.port}`,
    };
  }

  // ── JSON-RPC handler ─────────────────────────────────────────

  private handleJsonRpc(body: string, res: import("node:http").ServerResponse): void {
    let request: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
    try {
      request = JSON.parse(body);
    } catch {
      this.sendJsonRpcError(res, null, -32700, "Parse error");
      return;
    }

    const method = request.method ?? "";
    const id = request.id;

    switch (method) {
      case "initialize":
        this.sendJsonRpcResult(res, id, {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: this.serverName,
            version: "1.0.0",
          },
        });
        break;

      case "notifications/initialized":
        // Notification — no response needed, but we must respond to the HTTP request
        res.writeHead(204);
        res.end();
        break;

      case "tools/list":
        this.sendJsonRpcResult(res, id, {
          tools: Array.from(this.tools.values()).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: {
              type: "object",
              ...t.inputSchema,
            },
          })),
        });
        break;

      case "tools/call": {
        const params = request.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        const toolName = params?.name ?? "unknown";
        const toolArgs = params?.arguments ?? {};

        if (!this.tools.has(toolName)) {
          this.sendJsonRpcError(res, id, -32602, `Unknown tool: ${toolName}`);
          break;
        }

        // Return an immediate acknowledgment.
        // The actual execution happens on the CopilotKit frontend via AG-UI TOOL_CALL events.
        // Claude sees this success result and continues without error.
        const argsSummary = Object.entries(toolArgs)
          .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join(", ");

        this.sendJsonRpcResult(res, id, {
          content: [
            {
              type: "text",
              text: `Action "${toolName}" executed successfully. ${argsSummary ? `(${argsSummary})` : ""}`,
            },
          ],
        });
        break;
      }

      default:
        this.sendJsonRpcError(res, id, -32601, `Method not found: ${method}`);
        break;
    }
  }

  private sendJsonRpcResult(
    res: import("node:http").ServerResponse,
    id: unknown,
    result: unknown,
  ): void {
    const body = JSON.stringify({ jsonrpc: "2.0", id, result });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  }

  private sendJsonRpcError(
    res: import("node:http").ServerResponse,
    id: unknown,
    code: number,
    message: string,
  ): void {
    const body = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  }
}
