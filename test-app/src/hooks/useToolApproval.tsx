/**
 * useToolApproval — Subscribes to the management API's SSE stream for
 * tool approval requests and provides approve/deny actions.
 *
 * When Claude Code wants to use a native tool (Bash, Read, Write, Edit, etc.)
 * it sends a control_request to the bridge. The bridge emits this as a
 * "tool_approval_request" SSE event on GET /api/events. This hook:
 *   1. Subscribes to that SSE stream
 *   2. Maintains a queue of pending approval requests
 *   3. Provides approve() and deny() functions that call POST /api/sessions/:id/tool-approval
 *   4. Auto-removes requests from the queue once resolved
 */
import { useState, useEffect, useCallback, useRef } from "react";

const MGMT_API = "http://localhost:3002";

export interface ToolApprovalRequest {
  sessionId: string;
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId?: string;
  description?: string;
  timestamp: number;
}

export function useToolApproval() {
  const [pending, setPending] = useState<ToolApprovalRequest[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE stream
  useEffect(() => {
    const es = new EventSource(`${MGMT_API}/api/events`);
    eventSourceRef.current = es;

    es.addEventListener("tool_approval_request", (e) => {
      try {
        const data = JSON.parse(e.data);
        const request: ToolApprovalRequest = {
          sessionId: data.sessionId,
          requestId: data.requestId,
          toolName: data.toolName,
          toolInput: data.toolInput ?? {},
          toolUseId: data.toolUseId,
          description: data.description,
          timestamp: Date.now(),
        };
        setPending((prev) => [...prev, request]);
      } catch {
        // Ignore malformed events
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects, no action needed
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  const removeRequest = useCallback((requestId: string) => {
    setPending((prev) => prev.filter((r) => r.requestId !== requestId));
  }, []);

  const approve = useCallback(
    async (request: ToolApprovalRequest) => {
      removeRequest(request.requestId);
      try {
        await fetch(
          `${MGMT_API}/api/sessions/${request.sessionId}/tool-approval`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: request.requestId,
              behavior: "allow",
              updatedInput: request.toolInput,
            }),
          },
        );
      } catch (err) {
        console.error("Failed to approve tool:", err);
      }
    },
    [removeRequest],
  );

  const deny = useCallback(
    async (request: ToolApprovalRequest, reason?: string) => {
      removeRequest(request.requestId);
      try {
        await fetch(
          `${MGMT_API}/api/sessions/${request.sessionId}/tool-approval`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: request.requestId,
              behavior: "deny",
              message: reason || "Denied by user",
            }),
          },
        );
      } catch (err) {
        console.error("Failed to deny tool:", err);
      }
    },
    [removeRequest],
  );

  const approveAll = useCallback(async () => {
    const current = [...pending];
    setPending([]);
    await Promise.all(
      current.map((req) =>
        fetch(`${MGMT_API}/api/sessions/${req.sessionId}/tool-approval`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: req.requestId,
            behavior: "allow",
            updatedInput: req.toolInput,
          }),
        }).catch(() => {}),
      ),
    );
  }, [pending]);

  return { pending, approve, deny, approveAll };
}
