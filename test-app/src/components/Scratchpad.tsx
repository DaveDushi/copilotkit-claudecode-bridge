/**
 * Scratchpad — A shared notepad between you and Claude.
 *
 * This is one of the key demos: Claude can READ what you've written
 * (via useCopilotReadable) and WRITE to this pad (via the updateScratchpad
 * action). No other Claude Code GUI has a shared mutable canvas like this.
 *
 * Try: "summarize the README into my scratchpad"
 * Try: "draft a project plan in my notes"
 * Try: "what did I write in my scratchpad?"
 */
import React from "react";

interface ScratchpadProps {
  value: string;
  onChange: (value: string) => void;
}

export function Scratchpad({ value, onChange }: ScratchpadProps) {
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
        <span style={{ fontSize: 13, fontWeight: 600 }}>Scratchpad</span>
        <span style={{ fontSize: 11, color: "#999" }}>
          {value.length > 0 ? `${value.split("\n").length} lines` : "empty"}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"Type notes here, or ask Claude to write something...\n\nTry: \"summarize the README into my scratchpad\""}
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          resize: "none",
          padding: "12px",
          fontSize: 13,
          fontFamily: "system-ui, sans-serif",
          lineHeight: 1.6,
          background: "#fefefe",
        }}
      />
    </div>
  );
}
