import type { AguiEvent } from "./agui-events.js";
import type { ClaudeMessage } from "./types.js";

/**
 * Tracks state across streaming events within a single run.
 * Created once per AG-UI request in the handler loop.
 */
export class BridgeState {
  /** Maps content_block index to block type ("text" or "tool_use") */
  blockTypes = new Map<number, string>();
  /** Maps content_block index to tool_use ID (for tool blocks) */
  blockToolIds = new Map<number, string>();
  /** Whether we've received any streaming text events */
  hasStreamedText = false;
  /** Tool IDs that were already streamed */
  streamedToolIds = new Set<string>();
}

/**
 * Translates a Claude CLI NDJSON message into zero or more AG-UI events.
 *
 * This is the central translation layer between Claude Code's protocol
 * and the AG-UI protocol that CopilotKit's frontend understands.
 *
 * Message lifecycle from Claude CLI:
 *   1. stream_event(content_block_start)  — new text or tool_use block
 *   2. stream_event(content_block_delta)  — token-by-token text or partial JSON
 *   3. stream_event(content_block_stop)   — block finished
 *   4. assistant                          — final complete message (all blocks)
 *   5. result                             — turn complete
 *
 * We emit AG-UI events from streaming events for real-time display.
 * The final `assistant` message is used only for tool_use blocks
 * that weren't already streamed.
 */
export function translateClaudeMessage(
  msg: ClaudeMessage,
  threadId: string,
  runId: string,
  bridge: BridgeState,
): AguiEvent[] {
  const events: AguiEvent[] = [];

  switch (msg.type) {
    case "system": {
      if (msg.subtype === "init") {
        events.push({
          type: "STATE_SNAPSHOT",
          snapshot: {
            model: msg.model,
            tools: msg.tools,
            sessionId: msg.session_id,
            cwd: msg.cwd,
          },
        });
      }
      break;
    }

    case "stream_event": {
      const { event } = msg;
      const index = event.index ?? 0;

      switch (event.type) {
        case "content_block_start": {
          const contentBlock = event.content_block;
          const blockType = contentBlock?.type ?? "text";
          bridge.blockTypes.set(index, blockType);

          if (blockType === "text") {
            const msgId = `${runId}-msg-${index}`;
            events.push({
              type: "TEXT_MESSAGE_START",
              messageId: msgId,
              role: "assistant",
            });
            bridge.hasStreamedText = true;
          } else if (blockType === "tool_use") {
            const toolId = contentBlock?.id ?? "unknown";
            const toolName = contentBlock?.name ?? "unknown";

            bridge.blockToolIds.set(index, toolId);
            bridge.streamedToolIds.add(toolId);

            events.push({
              type: "TOOL_CALL_START",
              toolCallId: toolId,
              toolCallName: toolName,
            });
          }
          break;
        }

        case "content_block_delta": {
          const delta = event.delta;
          if (!delta) break;

          if (delta.type === "text_delta") {
            if (delta.text != null) {
              const msgId = `${runId}-msg-${index}`;
              events.push({
                type: "TEXT_MESSAGE_CONTENT",
                messageId: msgId,
                delta: delta.text,
              });
            }
          } else if (delta.type === "input_json_delta") {
            if (delta.partial_json != null) {
              const toolId =
                bridge.blockToolIds.get(index) ?? `${runId}-tool-${index}`;
              events.push({
                type: "TOOL_CALL_ARGS",
                toolCallId: toolId,
                delta: delta.partial_json,
              });
            }
          }
          break;
        }

        case "content_block_stop": {
          const blockType = bridge.blockTypes.get(index);

          if (blockType === "text") {
            const msgId = `${runId}-msg-${index}`;
            events.push({
              type: "TEXT_MESSAGE_END",
              messageId: msgId,
            });
          } else if (blockType === "tool_use") {
            const toolId =
              bridge.blockToolIds.get(index) ?? `${runId}-tool-${index}`;
            events.push({
              type: "TOOL_CALL_END",
              toolCallId: toolId,
            });
          } else {
            // Unknown block type — emit text end as safe fallback
            const msgId = `${runId}-msg-${index}`;
            events.push({
              type: "TEXT_MESSAGE_END",
              messageId: msgId,
            });
          }
          break;
        }

        default:
          // message_start, message_stop, message_delta, etc.
          break;
      }
      break;
    }

    case "assistant": {
      // Final assistant message: skip blocks that were already streamed.
      for (const block of msg.message.content) {
        if (block.type === "text") {
          if (!bridge.hasStreamedText) {
            // No streaming happened — emit full text as single message
            const msgId = msg.message.id;
            events.push({
              type: "TEXT_MESSAGE_START",
              messageId: msgId,
              role: "assistant",
            });
            events.push({
              type: "TEXT_MESSAGE_CONTENT",
              messageId: msgId,
              delta: block.text,
            });
            events.push({
              type: "TEXT_MESSAGE_END",
              messageId: msgId,
            });
          }
        } else if (block.type === "tool_use") {
          if (!bridge.streamedToolIds.has(block.id)) {
            // Tool wasn't streamed — emit complete tool call
            events.push({
              type: "TOOL_CALL_START",
              toolCallId: block.id,
              toolCallName: block.name,
              parentMessageId: msg.message.id,
            });
            events.push({
              type: "TOOL_CALL_ARGS",
              toolCallId: block.id,
              delta: JSON.stringify(block.input),
            });
            events.push({
              type: "TOOL_CALL_END",
              toolCallId: block.id,
            });
          }
        }
        // tool_result blocks are skipped
      }
      break;
    }

    case "control_request": {
      if (msg.request.subtype === "can_use_tool") {
        events.push({
          type: "CUSTOM",
          name: "tool_approval_request",
          value: {
            requestId: msg.request.request_id,
            toolName: msg.request.tool_name,
            toolInput: msg.request.input,
            toolUseId: msg.request.tool_use_id,
          },
        });
      }
      break;
    }

    case "result": {
      events.push({
        type: "RUN_FINISHED",
        threadId,
        runId,
      });
      break;
    }

    default:
      // keep_alive, user, auth_status, tool_progress, tool_use_summary — ignored
      break;
  }

  return events;
}
