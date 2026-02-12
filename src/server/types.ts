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
  | ToolProgressMessage
  | ToolUseSummaryMessage
  | KeepAliveMessage
  | UserMessage
  | AuthStatusMessage;

export interface SystemMessage {
  type: "system";
  subtype: string;
  session_id?: string;
  tools?: string[];
  model?: string;
  cwd?: string;
  permissionMode?: string;
  claude_code_version?: string;
  [key: string]: unknown;
}

export interface AssistantMessage {
  type: "assistant";
  message: AssistantContent;
  session_id: string;
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
  | ToolResultBlock;

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
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface ResultMessage {
  type: "result";
  result?: string;
  subtype?: string;
  session_id?: string;
  [key: string]: unknown;
}

export interface StreamEventMessage {
  type: "stream_event";
  event: StreamEventPayload;
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

export interface ControlRequestMessage {
  type: "control_request";
  request: ControlRequestBody;
  [key: string]: unknown;
}

export interface ControlRequestBody {
  subtype: string;
  request_id?: string;
  tool_name?: string;
  tool_use_id?: string;
  input?: unknown;
  [key: string]: unknown;
}

export interface ToolProgressMessage {
  type: "tool_progress";
  [key: string]: unknown;
}

export interface ToolUseSummaryMessage {
  type: "tool_use_summary";
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
  [key: string]: unknown;
}

// ============================================================
// Server -> Claude CLI (outbound NDJSON messages)
// ============================================================

export type ServerMessage =
  | ServerUserMessage
  | ServerControlResponse
  | ServerKeepAlive;

export interface ServerUserMessage {
  type: "user";
  message: { role: "user"; content: string };
  parent_tool_use_id: string | null;
  session_id: string;
}

export interface ServerControlResponse {
  type: "control_response";
  response: ControlResponseBody;
}

export interface ServerKeepAlive {
  type: "keep_alive";
}

export interface ControlResponseBody {
  subtype: string;
  request_id: string;
  response: {
    behavior: string;
    updatedInput?: unknown;
  };
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
