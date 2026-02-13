// Main server exports
export { CopilotKitClaudeBridge } from "./CopilotKitClaudeBridge.js";
export type { BridgeConfig } from "./CopilotKitClaudeBridge.js";

// Bridge translator
export { BridgeState, translateClaudeMessage } from "./server/bridge.js";

// AG-UI event types
export type {
  AguiEvent,
  RunAgentInput,
  RunStartedEvent,
  RunFinishedEvent,
  RunErrorEvent,
  TextMessageStartEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  ToolCallStartEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  StateSnapshotEvent,
  CustomEvent,
} from "./server/agui-events.js";

// Claude protocol types
export type {
  ClaudeMessage,
  SystemMessage,
  SystemSubtype,
  AssistantMessage,
  AssistantContent,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  ResultMessage,
  StreamEventMessage,
  StreamEventPayload,
  StreamDelta,
  ControlRequestMessage,
  ControlRequestBody,
  ControlRequestSubtype,
  ServerMessage,
  ServerUserMessage,
  ServerControlRequest,
  ServerControlResponse,
  ServerControlCancelRequest,
  ServerUpdateEnvironmentVariables,
  ControlResponseBody,
  ToolApprovalResponse,
  InitializeResponse,
  McpStatusResponse,
  RewindFilesResponse,
  SetPermissionModeResponse,
  WsEvent,
  // Permission types
  PermissionMode,
  PermissionDestination,
  PermissionUpdate,
  // MCP types
  McpServerInfo,
  McpServerConfig,
  // Agent types
  AgentDefinition,
  // Usage types
  Usage,
  ModelUsage,
} from "./server/types.js";

export { parseClaudeMessage } from "./server/types.js";

// Session types
export type {
  Session,
  SessionStatus,
  SessionCapabilities,
  SessionInitData,
} from "./server/session.js";
export { createSession } from "./server/session.js";

// Process utilities
export { spawnClaude, monitorProcess, checkClaudeCli } from "./server/process.js";
export type { SpawnOptions } from "./server/process.js";

// Server components (for advanced usage)
export { createWsServer } from "./server/ws-server.js";
export { createAguiServer } from "./server/agui-server.js";
export type { AguiServerConfig } from "./server/agui-server.js";
export { AppState } from "./server/state.js";
