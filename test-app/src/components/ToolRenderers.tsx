/**
 * ToolRenderers — Rich inline rendering for Claude Code's tool calls.
 *
 * When Claude uses tools like Bash, Edit, Write, Read, Glob, or Grep,
 * instead of showing raw JSON in the chat, we render styled cards.
 *
 * This uses CopilotKit's useRenderToolCall hook — each tool name gets
 * a custom React component that renders during and after execution.
 *
 * useDefaultTool is the catch-all for any tool we haven't explicitly handled.
 */
import React from "react";
import { useRenderToolCall, useDefaultTool } from "@copilotkit/react-core";

export function ToolRenderers() {
  // ── Bash — terminal card with command ────────────────────────────
  useRenderToolCall({
    name: "Bash",
    description: "Shell command execution",
    parameters: [
      { name: "command", type: "string" as const, description: "The command to run" },
      { name: "description", type: "string" as const, description: "What the command does" },
    ],
    render: ({ status, args }: any) => (
      <ToolCard
        icon="$"
        title={status === "complete" ? "Command ran" : "Running command..."}
        bg="#263238"
        fg="#e0e0e0"
        mono
      >
        {args?.description && (
          <div style={{ color: "#78909c", fontSize: 11, marginBottom: 4 }}>{args.description}</div>
        )}
        {args?.command && (
          <div style={{ color: "#80cbc4", fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            $ {args.command}
          </div>
        )}
        {status === "inProgress" && <Spinner />}
      </ToolCard>
    ),
  });

  // ── Edit — file edit with old/new preview ────────────────────────
  useRenderToolCall({
    name: "Edit",
    description: "File edit operation",
    parameters: [
      { name: "file_path", type: "string" as const },
      { name: "old_string", type: "string" as const },
      { name: "new_string", type: "string" as const },
    ],
    render: ({ status, args }: any) => (
      <ToolCard icon="~" title={status === "complete" ? "File edited" : "Editing file..."} bg="#e8f5e9">
        {args?.file_path && <FilePath path={args.file_path} />}
        {args?.old_string && (
          <DiffBlock label="removed" content={args.old_string} color="#ffcdd2" />
        )}
        {args?.new_string && (
          <DiffBlock label="added" content={args.new_string} color="#c8e6c9" />
        )}
      </ToolCard>
    ),
  });

  // ── Write — file creation ────────────────────────────────────────
  useRenderToolCall({
    name: "Write",
    description: "File write operation",
    parameters: [
      { name: "file_path", type: "string" as const },
      { name: "content", type: "string" as const },
    ],
    render: ({ status, args }: any) => {
      const lines = (args?.content ?? "").split("\n").length;
      return (
        <ToolCard icon="+" title={status === "complete" ? "File written" : "Writing file..."} bg="#e3f2fd">
          {args?.file_path && <FilePath path={args.file_path} />}
          <div style={{ fontSize: 11, color: "#666" }}>{lines} line(s)</div>
        </ToolCard>
      );
    },
  });

  // ── Read — file read ─────────────────────────────────────────────
  useRenderToolCall({
    name: "Read",
    description: "File read operation",
    parameters: [
      { name: "file_path", type: "string" as const },
    ],
    render: ({ status, args }: any) => (
      <ToolCard icon=">" title={status === "complete" ? "File read" : "Reading file..."} bg="#f5f5f5">
        {args?.file_path && <FilePath path={args.file_path} />}
      </ToolCard>
    ),
  });

  // ── Glob — file search ───────────────────────────────────────────
  useRenderToolCall({
    name: "Glob",
    description: "File pattern search",
    parameters: [
      { name: "pattern", type: "string" as const },
      { name: "path", type: "string" as const },
    ],
    render: ({ status, args }: any) => (
      <ToolCard icon="*" title={status === "complete" ? "Files found" : "Searching files..."} bg="#fff3e0">
        {args?.pattern && (
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#e65100" }}>{args.pattern}</div>
        )}
        {args?.path && <div style={{ fontSize: 11, color: "#888" }}>in {args.path}</div>}
      </ToolCard>
    ),
  });

  // ── Grep — content search ────────────────────────────────────────
  useRenderToolCall({
    name: "Grep",
    description: "Content search in files",
    parameters: [
      { name: "pattern", type: "string" as const },
      { name: "path", type: "string" as const },
      { name: "glob", type: "string" as const },
    ],
    render: ({ status, args }: any) => (
      <ToolCard icon="/" title={status === "complete" ? "Search complete" : "Searching contents..."} bg="#fce4ec">
        {args?.pattern && (
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#c62828" }}>/{args.pattern}/</div>
        )}
        {(args?.path || args?.glob) && (
          <div style={{ fontSize: 11, color: "#888" }}>
            {args.path && `in ${args.path}`}{args.glob && ` (${args.glob})`}
          </div>
        )}
      </ToolCard>
    ),
  });

  // ── TodoWrite — task management ──────────────────────────────────
  useRenderToolCall({
    name: "TodoWrite",
    description: "Task management",
    parameters: [],
    render: ({ status }: any) => (
      <ToolCard icon="v" title={status === "complete" ? "Tasks updated" : "Updating tasks..."} bg="#f3e5f5" />
    ),
  });

  // ── Default catch-all for any other tool ─────────────────────────
  useDefaultTool({
    render: ({ name, status, args }: any) => (
      <ToolCard
        icon="?"
        title={status === "complete" ? `${name} complete` : `Running ${name}...`}
        bg="#f5f5f5"
      >
        {status === "inProgress" && <Spinner />}
      </ToolCard>
    ),
  });

  return null; // This component just registers hooks — no visible output
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared UI pieces for tool cards
// ═══════════════════════════════════════════════════════════════════════════

function ToolCard({
  icon,
  title,
  bg,
  fg,
  mono,
  children,
}: {
  icon: string;
  title: string;
  bg: string;
  fg?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={{
      background: bg,
      color: fg ?? "#333",
      borderRadius: 8,
      padding: "10px 14px",
      margin: "4px 0",
      fontSize: 13,
      fontFamily: mono ? "monospace" : "inherit",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: children ? 6 : 0 }}>
        <span style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          background: fg ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "monospace",
          flexShrink: 0,
        }}>
          {icon}
        </span>
        <span style={{ fontWeight: 600 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function FilePath({ path }: { path: string }) {
  const name = path.replace(/\\/g, "/").split("/").pop() ?? path;
  return (
    <div style={{ fontSize: 12, fontFamily: "monospace", marginBottom: 2 }} title={path}>
      <span style={{ color: "#888" }}>{path.replace(/\\/g, "/").slice(0, -name.length)}</span>
      <span style={{ fontWeight: 600 }}>{name}</span>
    </div>
  );
}

function DiffBlock({ label, content, color }: { label: string; content: string; color: string }) {
  const preview = content.length > 150 ? content.slice(0, 150) + "..." : content;
  return (
    <div style={{
      background: color,
      borderRadius: 4,
      padding: "4px 8px",
      marginTop: 4,
      fontSize: 11,
      fontFamily: "monospace",
      whiteSpace: "pre-wrap",
      maxHeight: 80,
      overflow: "auto",
    }}>
      <span style={{ fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{label}: </span>
      {preview}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ marginTop: 4, fontSize: 11, color: "#888" }}>
      Working...
    </div>
  );
}
