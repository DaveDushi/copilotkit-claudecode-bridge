// ============================================================
// AG-UI event types (Server -> CopilotKit frontend via SSE)
//
// CopilotKit uses the AG-UI protocol from @ag-ui/core.
// Event type discriminator values are SCREAMING_SNAKE_CASE.
// Field names use camelCase.
// ============================================================

export type AguiEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | StateSnapshotEvent
  | CustomEvent;

export interface RunStartedEvent {
  type: "RUN_STARTED";
  threadId: string;
  runId: string;
}

export interface RunFinishedEvent {
  type: "RUN_FINISHED";
  threadId: string;
  runId: string;
}

export interface RunErrorEvent {
  type: "RUN_ERROR";
  threadId: string;
  runId: string;
  message: string;
}

export interface TextMessageStartEvent {
  type: "TEXT_MESSAGE_START";
  messageId: string;
  role: string;
}

export interface TextMessageContentEvent {
  type: "TEXT_MESSAGE_CONTENT";
  messageId: string;
  delta: string;
}

export interface TextMessageEndEvent {
  type: "TEXT_MESSAGE_END";
  messageId: string;
}

export interface ToolCallStartEvent {
  type: "TOOL_CALL_START";
  toolCallId: string;
  toolCallName: string;
  parentMessageId?: string;
}

export interface ToolCallArgsEvent {
  type: "TOOL_CALL_ARGS";
  toolCallId: string;
  delta: string;
}

export interface ToolCallEndEvent {
  type: "TOOL_CALL_END";
  toolCallId: string;
}

export interface StateSnapshotEvent {
  type: "STATE_SNAPSHOT";
  snapshot: unknown;
}

export interface CustomEvent {
  type: "CUSTOM";
  name: string;
  value: unknown;
}

// ============================================================
// AG-UI input (CopilotKit frontend -> Server via POST)
// ============================================================

export interface RunAgentInput {
  threadId?: string;
  runId?: string;
  messages?: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  state?: unknown;
  context?: Array<Record<string, unknown>>;
  forwardedProps?: unknown;
}
