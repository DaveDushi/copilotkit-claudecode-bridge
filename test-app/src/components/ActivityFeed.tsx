/**
 * ActivityFeed — Live stream of what Claude is doing.
 *
 * Shows tool calls, file operations, cost, and system events in real-time.
 * This gives visibility into Claude's actions beyond what you see in chat —
 * a live dashboard of an AI operating on your system.
 */
import React from "react";
import type { ActivityEvent } from "../types";

interface ActivityFeedProps {
  events: ActivityEvent[];
  onClear: () => void;
}

const typeColors: Record<string, string> = {
  tool: "#e3f2fd",
  file: "#e8f5e9",
  system: "#f5f5f5",
  cost: "#f3e5f5",
};

const typeDots: Record<string, string> = {
  tool: "#2196f3",
  file: "#4caf50",
  system: "#9e9e9e",
  cost: "#9c27b0",
};

export function ActivityFeed({ events, onClear }: ActivityFeedProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid #e0e0e0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Activity</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#999" }}>{events.length} events</span>
          {events.length > 0 && (
            <button
              onClick={onClear}
              style={{
                fontSize: 10,
                padding: "2px 6px",
                border: "1px solid #ddd",
                borderRadius: 3,
                background: "#fff",
                cursor: "pointer",
                color: "#888",
              }}
            >
              clear
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0 && (
          <p style={{ textAlign: "center", color: "#bbb", fontSize: 12, marginTop: 20 }}>
            Activity will appear here when Claude starts working.
          </p>
        )}
        {/* Show newest first */}
        {[...events].reverse().map((ev) => (
          <div
            key={ev.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "6px 12px",
              borderBottom: "1px solid #f8f8f8",
              fontSize: 12,
            }}
          >
            <span style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: typeDots[ev.type] ?? "#999",
              flexShrink: 0,
              marginTop: 4,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: "#333" }}>{ev.title}</span>
              {ev.detail && (
                <div style={{
                  color: "#999",
                  fontSize: 11,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {ev.detail}
                </div>
              )}
            </div>
            <span style={{ fontSize: 10, color: "#ccc", flexShrink: 0, whiteSpace: "nowrap" }}>
              {formatTime(ev.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
