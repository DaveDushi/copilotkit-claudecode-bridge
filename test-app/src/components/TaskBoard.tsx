/**
 * TaskBoard — Interactive task list that Claude can manage.
 *
 * Claude can add, complete, and remove tasks through CopilotKit actions.
 * The user can also interact directly — check boxes, delete tasks, add new ones.
 * Claude sees the full task state via useCopilotReadable.
 *
 * Try: "create a plan to reorganize my photos"
 * Try: "break down the steps to deploy this app"
 * Try: "what's left on my task list?"
 */
import React, { useState } from "react";
import type { Task } from "../types";

interface TaskBoardProps {
  tasks: Task[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (title: string) => void;
}

export function TaskBoard({ tasks, onToggle, onRemove, onAdd }: TaskBoardProps) {
  const [input, setInput] = useState("");
  const done = tasks.filter((t) => t.done).length;

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
        <span style={{ fontSize: 13, fontWeight: 600 }}>Tasks</span>
        <span style={{ fontSize: 11, color: "#999" }}>
          {tasks.length > 0 ? `${done}/${tasks.length} done` : "none"}
        </span>
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {tasks.length === 0 && (
          <p style={{ textAlign: "center", color: "#bbb", fontSize: 12, marginTop: 20 }}>
            No tasks yet. Add one below or ask Claude.
          </p>
        )}
        {tasks.map((task) => (
          <div
            key={task.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "6px 12px",
              borderBottom: "1px solid #f5f5f5",
              opacity: task.done ? 0.5 : 1,
              transition: "opacity 0.2s",
            }}
          >
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => onToggle(task.id)}
              style={{ marginTop: 2, cursor: "pointer", accentColor: "#4caf50" }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                textDecoration: task.done ? "line-through" : "none",
                color: task.done ? "#999" : "#333",
              }}>
                {task.title}
              </div>
              {task.details && (
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{task.details}</div>
              )}
            </div>
            <button
              onClick={() => onRemove(task.id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#ccc",
                fontSize: 14,
                padding: "0 4px",
                lineHeight: 1,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#e53935"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#ccc"; }}
              title="Remove task"
            >
              x
            </button>
          </div>
        ))}
      </div>

      {/* Add task input */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid #e0e0e0", display: "flex", gap: 6 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              onAdd(input.trim());
              setInput("");
            }
          }}
          placeholder="Add a task..."
          style={{
            flex: 1,
            border: "1px solid #ddd",
            borderRadius: 4,
            padding: "5px 8px",
            fontSize: 12,
          }}
        />
        <button
          onClick={() => {
            if (input.trim()) {
              onAdd(input.trim());
              setInput("");
            }
          }}
          disabled={!input.trim()}
          style={{
            padding: "5px 10px",
            fontSize: 12,
            border: "none",
            borderRadius: 4,
            background: input.trim() ? "#0066cc" : "#ddd",
            color: "#fff",
            cursor: input.trim() ? "pointer" : "default",
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
