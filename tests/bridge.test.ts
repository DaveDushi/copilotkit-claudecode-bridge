import { describe, it, expect, beforeEach } from "vitest";
import { BridgeState, translateClaudeMessage } from "../src/server/bridge.js";
import type { ClaudeMessage } from "../src/server/types.js";
import type { AguiEvent } from "../src/server/agui-events.js";

describe("translateClaudeMessage", () => {
  let bridge: BridgeState;
  const threadId = "thread-1";
  const runId = "run-1";

  beforeEach(() => {
    bridge = new BridgeState();
  });

  it("translates system/init to STATE_SNAPSHOT", () => {
    const msg: ClaudeMessage = {
      type: "system",
      subtype: "init",
      session_id: "sess-1",
      model: "claude-sonnet-4-5-20250514",
      tools: ["Read", "Write"],
      cwd: "/home/user",
    };

    const events = translateClaudeMessage(msg, threadId, runId, bridge);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "STATE_SNAPSHOT",
      snapshot: {
        model: "claude-sonnet-4-5-20250514",
        tools: ["Read", "Write"],
        sessionId: "sess-1",
        cwd: "/home/user",
      },
    });
  });

  it("ignores non-init system messages", () => {
    const msg: ClaudeMessage = {
      type: "system",
      subtype: "other",
    };

    const events = translateClaudeMessage(msg, threadId, runId, bridge);
    expect(events).toHaveLength(0);
  });

  it("translates streaming text block lifecycle", () => {
    // content_block_start (text)
    const start: ClaudeMessage = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text" },
      },
    };
    let events = translateClaudeMessage(start, threadId, runId, bridge);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "TEXT_MESSAGE_START",
      messageId: "run-1-msg-0",
      role: "assistant",
    });
    expect(bridge.hasStreamedText).toBe(true);

    // content_block_delta (text_delta)
    const delta: ClaudeMessage = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello " },
      },
    };
    events = translateClaudeMessage(delta, threadId, runId, bridge);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "run-1-msg-0",
      delta: "Hello ",
    });

    // content_block_stop
    const stop: ClaudeMessage = {
      type: "stream_event",
      event: { type: "content_block_stop", index: 0 },
    };
    events = translateClaudeMessage(stop, threadId, runId, bridge);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "TEXT_MESSAGE_END",
      messageId: "run-1-msg-0",
    });
  });

  it("translates streaming tool_use block lifecycle", () => {
    // content_block_start (tool_use)
    const start: ClaudeMessage = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "tool-123", name: "Read" },
      },
    };
    let events = translateClaudeMessage(start, threadId, runId, bridge);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "TOOL_CALL_START",
      toolCallId: "tool-123",
      toolCallName: "Read",
    });
    expect(bridge.streamedToolIds.has("tool-123")).toBe(true);

    // content_block_delta (input_json_delta)
    const delta: ClaudeMessage = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"file":' },
      },
    };
    events = translateClaudeMessage(delta, threadId, runId, bridge);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "TOOL_CALL_ARGS",
      toolCallId: "tool-123",
      delta: '{"file":',
    });

    // content_block_stop
    const stop: ClaudeMessage = {
      type: "stream_event",
      event: { type: "content_block_stop", index: 1 },
    };
    events = translateClaudeMessage(stop, threadId, runId, bridge);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "TOOL_CALL_END",
      toolCallId: "tool-123",
    });
  });

  it("emits full text from non-streamed assistant message", () => {
    const msg: ClaudeMessage = {
      type: "assistant",
      message: {
        id: "msg-1",
        role: "assistant",
        model: "claude-sonnet-4-5-20250514",
        content: [{ type: "text", text: "Hello world" }],
      },
      session_id: "sess-1",
    };

    const events = translateClaudeMessage(msg, threadId, runId, bridge);
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("TEXT_MESSAGE_START");
    expect(events[1]).toEqual({
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "msg-1",
      delta: "Hello world",
    });
    expect(events[2].type).toBe("TEXT_MESSAGE_END");
  });

  it("skips text from assistant message if already streamed", () => {
    bridge.hasStreamedText = true;

    const msg: ClaudeMessage = {
      type: "assistant",
      message: {
        id: "msg-1",
        role: "assistant",
        model: "claude-sonnet-4-5-20250514",
        content: [{ type: "text", text: "Hello world" }],
      },
      session_id: "sess-1",
    };

    const events = translateClaudeMessage(msg, threadId, runId, bridge);
    expect(events).toHaveLength(0);
  });

  it("emits tool call from non-streamed assistant message", () => {
    const msg: ClaudeMessage = {
      type: "assistant",
      message: {
        id: "msg-1",
        role: "assistant",
        model: "claude-sonnet-4-5-20250514",
        content: [
          {
            type: "tool_use",
            id: "tool-456",
            name: "Write",
            input: { file: "test.ts", content: "hello" },
          },
        ],
      },
      session_id: "sess-1",
    };

    const events = translateClaudeMessage(msg, threadId, runId, bridge);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      type: "TOOL_CALL_START",
      toolCallId: "tool-456",
      toolCallName: "Write",
      parentMessageId: "msg-1",
    });
    expect(events[1].type).toBe("TOOL_CALL_ARGS");
    expect(events[2]).toEqual({
      type: "TOOL_CALL_END",
      toolCallId: "tool-456",
    });
  });

  it("skips tool call if already streamed", () => {
    bridge.streamedToolIds.add("tool-456");

    const msg: ClaudeMessage = {
      type: "assistant",
      message: {
        id: "msg-1",
        role: "assistant",
        model: "claude-sonnet-4-5-20250514",
        content: [
          { type: "tool_use", id: "tool-456", name: "Write", input: {} },
        ],
      },
      session_id: "sess-1",
    };

    const events = translateClaudeMessage(msg, threadId, runId, bridge);
    expect(events).toHaveLength(0);
  });

  it("translates control_request (can_use_tool) to CUSTOM", () => {
    const msg: ClaudeMessage = {
      type: "control_request",
      request: {
        subtype: "can_use_tool",
        request_id: "req-1",
        tool_name: "Write",
        tool_use_id: "tool-789",
        input: { file: "test.ts" },
      },
    };

    const events = translateClaudeMessage(msg, threadId, runId, bridge);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "CUSTOM",
      name: "tool_approval_request",
      value: {
        requestId: "req-1",
        toolName: "Write",
        toolInput: { file: "test.ts" },
        toolUseId: "tool-789",
      },
    });
  });

  it("translates result to RUN_FINISHED", () => {
    const msg: ClaudeMessage = {
      type: "result",
      result: "done",
    };

    const events = translateClaudeMessage(msg, threadId, runId, bridge);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "RUN_FINISHED",
      threadId: "thread-1",
      runId: "run-1",
    });
  });

  it("ignores keep_alive messages", () => {
    const msg: ClaudeMessage = { type: "keep_alive" };
    const events = translateClaudeMessage(msg, threadId, runId, bridge);
    expect(events).toHaveLength(0);
  });

  it("ignores user echo messages", () => {
    const msg: ClaudeMessage = { type: "user" };
    const events = translateClaudeMessage(msg, threadId, runId, bridge);
    expect(events).toHaveLength(0);
  });

  it("ignores auth_status messages", () => {
    const msg: ClaudeMessage = { type: "auth_status" };
    const events = translateClaudeMessage(msg, threadId, runId, bridge);
    expect(events).toHaveLength(0);
  });
});
