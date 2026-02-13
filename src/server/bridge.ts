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
            permissionMode: msg.permissionMode,
            claudeCodeVersion: msg.claude_code_version,
            slashCommands: msg.slash_commands,
            agents: msg.agents,
            skills: msg.skills,
            mcpServers: msg.mcp_servers,
          },
        });
      } else if (msg.subtype === "status") {
        events.push({
          type: "CUSTOM",
          name: "system_status",
          value: {
            status: msg.status,
            permissionMode: msg.permissionMode,
          },
        });
      } else if (msg.subtype === "task_notification") {
        events.push({
          type: "CUSTOM",
          name: "task_notification",
          value: {
            taskId: msg.task_id,
            status: msg.task_status,
            outputFile: msg.output_file,
            summary: msg.summary,
          },
        });
      } else if (msg.subtype === "compact_boundary") {
        events.push({
          type: "CUSTOM",
          name: "compact_boundary",
          value: {
            trigger: msg.compact_metadata?.trigger,
            preTokens: msg.compact_metadata?.pre_tokens,
          },
        });
      } else if (msg.subtype === "hook_started" || msg.subtype === "hook_progress" || msg.subtype === "hook_response") {
        events.push({
          type: "CUSTOM",
          name: msg.subtype,
          value: {
            hookId: msg.hook_id,
            hookName: msg.hook_name,
            hookEvent: msg.hook_event,
            output: msg.output,
            stdout: msg.stdout,
            stderr: msg.stderr,
            exitCode: msg.exit_code,
            outcome: msg.outcome,
          },
        });
      } else if (msg.subtype === "files_persisted") {
        events.push({
          type: "CUSTOM",
          name: "files_persisted",
          value: {
            files: msg.files,
            failed: msg.failed,
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
        // tool_result and thinking blocks are skipped
      }
      break;
    }

    case "control_request": {
      if (msg.request.subtype === "can_use_tool") {
        events.push({
          type: "CUSTOM",
          name: "tool_approval_request",
          value: {
            requestId: msg.request.request_id ?? (msg as Record<string, unknown>).request_id,
            toolName: msg.request.tool_name,
            toolInput: msg.request.input,
            toolUseId: msg.request.tool_use_id,
            description: msg.request.description,
            permissionSuggestions: msg.request.permission_suggestions,
            agentId: msg.request.agent_id,
          },
        });
      } else if (msg.request.subtype === "hook_callback") {
        events.push({
          type: "CUSTOM",
          name: "hook_callback",
          value: {
            requestId: msg.request.request_id ?? (msg as Record<string, unknown>).request_id,
            callbackId: msg.request.callback_id,
            input: msg.request.input,
            toolUseId: msg.request.tool_use_id,
          },
        });
      }
      break;
    }

    case "tool_progress": {
      events.push({
        type: "CUSTOM",
        name: "tool_progress",
        value: {
          toolUseId: msg.tool_use_id,
          toolName: msg.tool_name,
          elapsedTimeSeconds: msg.elapsed_time_seconds,
          parentToolUseId: msg.parent_tool_use_id,
        },
      });
      break;
    }

    case "tool_use_summary": {
      events.push({
        type: "CUSTOM",
        name: "tool_use_summary",
        value: {
          summary: msg.summary,
          precedingToolUseIds: msg.preceding_tool_use_ids,
        },
      });
      break;
    }

    case "auth_status": {
      events.push({
        type: "CUSTOM",
        name: "auth_status",
        value: {
          isAuthenticating: msg.isAuthenticating,
          output: msg.output,
          error: msg.error,
        },
      });
      break;
    }

    case "result": {
      // Emit result stats as a custom event before RUN_FINISHED
      events.push({
        type: "CUSTOM",
        name: "result_stats",
        value: {
          subtype: msg.subtype,
          isError: msg.is_error,
          durationMs: msg.duration_ms,
          numTurns: msg.num_turns,
          totalCostUsd: msg.total_cost_usd,
          usage: msg.usage,
          errors: msg.errors,
          totalLinesAdded: msg.total_lines_added,
          totalLinesRemoved: msg.total_lines_removed,
        },
      });

      events.push({
        type: "RUN_FINISHED",
        threadId,
        runId,
      });
      break;
    }

    default:
      // keep_alive, user — ignored
      break;
  }

  return events;
}
