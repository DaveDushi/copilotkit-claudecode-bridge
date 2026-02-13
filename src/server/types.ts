// ============================================================
// Claude CLI -> Server (inbound NDJSON messages)
// ============================================================

/** Top-level message from Claude CLI, dispatched by `type` field. */
export type ClaudeMessage =
  | SystemMessage
  | AssistantMessage
  | ResultMessage
  | StreamEventMessage
  | ControlRequestMessage
  | ControlResponseMessage
  | ToolProgressMessage
  | ToolUseSummaryMessage
  | KeepAliveMessage
  | UserMessage
  | AuthStatusMessage;

/** Control response from CLI (response to our server-initiated requests). */
export interface ControlResponseMessage {
  type: "control_response";
  response: ControlResponseBody;
  [key: string]: unknown;
}

// ── System messages ──────────────────────────────────────────

export interface SystemMessage {
  type: "system";
  subtype: SystemSubtype;
  session_id?: string;
  /** system/init fields */
  tools?: string[];
  model?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  apiKeySource?: string;
  claude_code_version?: string;
  slash_commands?: string[];
  agents?: string[];
  skills?: string[];
  plugins?: { name: string; path: string }[];
  mcp_servers?: McpServerInfo[];
  output_style?: string;
  /** system/status fields */
  status?: "compacting" | null;
  /** system/compact_boundary fields */
  compact_metadata?: { trigger: "manual" | "auto"; pre_tokens: number };
  /** system/task_notification fields */
  task_id?: string;
  task_status?: "completed" | "failed" | "stopped";
  output_file?: string;
  summary?: string;
  /** system/files_persisted fields */
  files?: { filename: string; file_id: string }[];
  failed?: { filename: string; error: string }[];
  processed_at?: string;
  /** system/hook_* fields */
  hook_id?: string;
  hook_name?: string;
  hook_event?: string;
  stdout?: string;
  stderr?: string;
  output?: string;
  exit_code?: number;
  outcome?: "success" | "error" | "cancelled";
  /** UUID for dedup */
  uuid?: string;
  [key: string]: unknown;
}

export type SystemSubtype =
  | "init"
  | "status"
  | "compact_boundary"
  | "task_notification"
  | "files_persisted"
  | "hook_started"
  | "hook_progress"
  | "hook_response";

// ── Permission types ─────────────────────────────────────────

export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "delegate"
  | "dontAsk";

export type PermissionDestination =
  | "userSettings"
  | "projectSettings"
  | "localSettings"
  | "session"
  | "cliArg";

export type PermissionUpdate =
  | { type: "addRules"; rules: { toolName: string; ruleContent?: string }[]; behavior: "allow" | "deny" | "ask"; destination: PermissionDestination }
  | { type: "replaceRules"; rules: { toolName: string; ruleContent?: string }[]; behavior: "allow" | "deny" | "ask"; destination: PermissionDestination }
  | { type: "removeRules"; rules: { toolName: string; ruleContent?: string }[]; behavior: "allow" | "deny" | "ask"; destination: PermissionDestination }
  | { type: "setMode"; mode: string; destination: PermissionDestination }
  | { type: "addDirectories"; directories: string[]; destination: PermissionDestination }
  | { type: "removeDirectories"; directories: string[]; destination: PermissionDestination };

// ── MCP types ────────────────────────────────────────────────

export interface McpServerInfo {
  name: string;
  status: "connected" | "failed" | "disabled" | "connecting" | string;
  serverInfo?: unknown;
  error?: string;
  config?: { type: string; url?: string; command?: string; args?: string[] };
  scope?: string;
  tools?: { name: string; annotations?: { readOnly?: boolean; destructive?: boolean; openWorld?: boolean } }[];
}

export interface McpServerConfig {
  type: "stdio" | "sse" | "http" | "sdk";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

// ── Assistant messages ───────────────────────────────────────

export interface AssistantMessage {
  type: "assistant";
  message: AssistantContent;
  parent_tool_use_id?: string | null;
  error?: "authentication_failed" | "billing_error" | "rate_limit" | "invalid_request" | "server_error" | "unknown" | string;
  session_id: string;
  uuid?: string;
  [key: string]: unknown;
}

export interface AssistantContent {
  id: string;
  role: string;
  model: string;
  content: ContentBlock[];
  stop_reason?: string;
  usage?: Usage;
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  budget_tokens?: number;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests?: number;
  costUSD: number;
  contextWindow: number;
  maxOutputTokens: number;
}

// ── Result messages ──────────────────────────────────────────

export interface ResultMessage {
  type: "result";
  subtype?: "success" | "error_during_execution" | "error_max_turns" | "error_max_budget_usd" | "error_max_structured_output_retries";
  is_error?: boolean;
  result?: string;
  errors?: string[];
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
  stop_reason?: string | null;
  usage?: Usage;
  modelUsage?: Record<string, ModelUsage>;
  permission_denials?: { tool_name: string; tool_use_id: string; tool_input: Record<string, unknown> }[];
  total_lines_added?: number;
  total_lines_removed?: number;
  session_id?: string;
  uuid?: string;
  [key: string]: unknown;
}

// ── Stream event messages ────────────────────────────────────

export interface StreamEventMessage {
  type: "stream_event";
  event: StreamEventPayload;
  parent_tool_use_id?: string | null;
  uuid?: string;
  session_id?: string;
  [key: string]: unknown;
}

export interface StreamEventPayload {
  type: string;
  delta?: StreamDelta;
  index?: number;
  content_block?: ContentBlockInfo;
  [key: string]: unknown;
}

export interface ContentBlockInfo {
  type: string;
  id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface StreamDelta {
  type: string;
  text?: string;
  partial_json?: string;
}

// ── Control request/response messages ────────────────────────

export interface ControlRequestMessage {
  type: "control_request";
  request_id?: string;
  request: ControlRequestBody;
  [key: string]: unknown;
}

export interface ControlRequestBody {
  subtype: ControlRequestSubtype;
  request_id?: string;
  /** can_use_tool fields */
  tool_name?: string;
  tool_use_id?: string;
  input?: unknown;
  permission_suggestions?: PermissionUpdate[];
  blocked_path?: string;
  decision_reason?: string;
  agent_id?: string;
  description?: string;
  /** hook_callback fields */
  callback_id?: string;
  /** interrupt — no additional fields */
  /** set_permission_mode */
  mode?: PermissionMode;
  /** set_model */
  model?: string;
  /** set_max_thinking_tokens */
  max_thinking_tokens?: number | null;
  /** mcp_message */
  server_name?: string;
  message?: unknown;
  /** mcp_reconnect / mcp_toggle */
  serverName?: string;
  enabled?: boolean;
  /** mcp_set_servers */
  servers?: Record<string, McpServerConfig>;
  /** mcp_status — no additional fields */
  /** rewind_files */
  user_message_id?: string;
  dry_run?: boolean;
  /** initialize */
  hooks?: Record<string, { matcher?: string; hookCallbackIds: string[]; timeout?: number }[]>;
  sdkMcpServers?: string[];
  jsonSchema?: Record<string, unknown>;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  agents_config?: Record<string, AgentDefinition>;
  [key: string]: unknown;
}

export type ControlRequestSubtype =
  | "can_use_tool"
  | "initialize"
  | "interrupt"
  | "set_permission_mode"
  | "set_model"
  | "set_max_thinking_tokens"
  | "mcp_status"
  | "mcp_message"
  | "mcp_reconnect"
  | "mcp_toggle"
  | "mcp_set_servers"
  | "rewind_files"
  | "hook_callback";

export interface AgentDefinition {
  name?: string;
  description?: string;
  prompt?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  model?: string;
}

// ── Tool progress/summary ────────────────────────────────────

export interface ToolProgressMessage {
  type: "tool_progress";
  tool_use_id?: string;
  tool_name?: string;
  parent_tool_use_id?: string | null;
  elapsed_time_seconds?: number;
  uuid?: string;
  session_id?: string;
  [key: string]: unknown;
}

export interface ToolUseSummaryMessage {
  type: "tool_use_summary";
  summary?: string;
  preceding_tool_use_ids?: string[];
  uuid?: string;
  session_id?: string;
  [key: string]: unknown;
}

export interface KeepAliveMessage {
  type: "keep_alive";
}

export interface UserMessage {
  type: "user";
  [key: string]: unknown;
}

export interface AuthStatusMessage {
  type: "auth_status";
  isAuthenticating?: boolean;
  output?: string[];
  error?: string;
  uuid?: string;
  session_id?: string;
  [key: string]: unknown;
}

// ============================================================
// Server -> Claude CLI (outbound NDJSON messages)
// ============================================================

export type ServerMessage =
  | ServerUserMessage
  | ServerControlRequest
  | ServerControlResponse
  | ServerControlCancelRequest
  | ServerKeepAlive
  | ServerUpdateEnvironmentVariables;

export interface ServerUserMessage {
  type: "user";
  message: { role: "user"; content: string | ContentBlock[] };
  parent_tool_use_id: string | null;
  session_id: string;
  uuid?: string;
  isSynthetic?: boolean;
}

/** Server-initiated control request (e.g., initialize, interrupt, set_model) */
export interface ServerControlRequest {
  type: "control_request";
  request_id: string;
  request: ControlRequestBody;
}

export interface ServerControlResponse {
  type: "control_response";
  response: ControlResponseBody;
}

export interface ServerControlCancelRequest {
  type: "control_cancel_request";
  request_id: string;
}

export interface ServerKeepAlive {
  type: "keep_alive";
}

export interface ServerUpdateEnvironmentVariables {
  type: "update_environment_variables";
  variables: Record<string, string>;
}

export interface ControlResponseBody {
  subtype: "success" | "error" | "can_use_tool";
  request_id: string;
  response?: ToolApprovalResponse | Record<string, unknown>;
  error?: string;
  pending_permission_requests?: ControlRequestMessage[];
}

/** Response payload for can_use_tool approval */
export interface ToolApprovalResponse {
  behavior: "allow" | "deny";
  /** Required when behavior is "allow" — the (possibly modified) tool input */
  updatedInput?: unknown;
  /** Save permission rules for future requests */
  updatedPermissions?: PermissionUpdate[];
  /** Message when denying */
  message?: string;
  /** Abort the entire session on deny */
  interrupt?: boolean;
  toolUseID?: string;
}

/** Response payload from initialize control request */
export interface InitializeResponse {
  commands: { name: string; description: string; argumentHint?: string }[];
  output_style: string;
  available_output_styles: string[];
  models: { value: string; displayName: string; description: string }[];
  account: {
    email?: string;
    organization?: string;
    subscriptionType?: string;
    apiKeySource?: string;
  };
  fast_mode?: boolean;
}

/** Response payload from mcp_status control request */
export interface McpStatusResponse {
  mcpServers: McpServerInfo[];
}

/** Response payload from rewind_files control request */
export interface RewindFilesResponse {
  canRewind: boolean;
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
}

/** Response payload from set_permission_mode control request */
export interface SetPermissionModeResponse {
  mode: PermissionMode;
}

// ============================================================
// Internal event bus type
// ============================================================

export interface WsEvent {
  session_id: string;
  message: ClaudeMessage;
}

// ============================================================
// Helpers
// ============================================================

/** Parse a single NDJSON line into a ClaudeMessage. Returns null on failure. */
export function parseClaudeMessage(line: string): ClaudeMessage | null {
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed.type === "string") {
      return parsed as ClaudeMessage;
    }
    return null;
  } catch {
    return null;
  }
}
