/**
 * ToolRenderers — Rich inline rendering for Claude Code's tool calls.
 *
 * When Claude uses tools like Bash, Edit, Write, Read, Glob, or Grep,
 * instead of showing raw JSON in the chat, we render styled cards.
 *
 * Uses design tokens from styles.ts for consistent, polished appearance.
 */
import React from "react";
import { useRenderToolCall, useDefaultTool } from "@copilotkit/react-core";
import { colors, spacing, radius, shadows, typography, transitions } from "../styles";

/** Shape of a single todo item from TodoWrite */
export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
}

export function ToolRenderers({ onTodosUpdate }: { onTodosUpdate?: (todos: TodoItem[]) => void }) {
  // ── Bash — terminal card with command ────────────────────────────
  useRenderToolCall({
    name: "Bash",
    description: "Shell command execution",
    parameters: [
      { name: "command", type: "string" as const, description: "The command to run" },
      { name: "description", type: "string" as const, description: "What the command does" },
    ],
    render: ({ status, args }: any) => (
      <ToolCard accent={colors.toolBash} dark>
        <ToolHeader
          icon="$"
          title={status === "complete" ? "Command ran" : "Running command..."}
          status={status}
          dark
        />
        {args?.description && (
          <div style={{ color: "#94a3b8", fontSize: typography.sizes.xs, marginTop: spacing.xs }}>
            {args.description}
          </div>
        )}
        {args?.command && (
          <div style={{
            color: "#67e8f9",
            fontFamily: typography.mono,
            fontSize: typography.sizes.sm,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            marginTop: spacing.xs,
          }}>
            $ {args.command}
          </div>
        )}
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
      <ToolCard accent={colors.success}>
        <ToolHeader icon="~" title={status === "complete" ? "File edited" : "Editing file..."} status={status} />
        {args?.file_path && <FilePath path={args.file_path} />}
        {args?.old_string && <DiffBlock label="removed" content={args.old_string} variant="remove" />}
        {args?.new_string && <DiffBlock label="added" content={args.new_string} variant="add" />}
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
        <ToolCard accent={colors.info}>
          <ToolHeader icon="+" title={status === "complete" ? "File written" : "Writing file..."} status={status} />
          {args?.file_path && <FilePath path={args.file_path} />}
          <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing.xs }}>
            {lines} line{lines !== 1 ? "s" : ""}
          </div>
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
      <ToolCard accent={colors.textMuted}>
        <ToolHeader icon=">" title={status === "complete" ? "File read" : "Reading file..."} status={status} />
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
      <ToolCard accent={colors.warning}>
        <ToolHeader icon="*" title={status === "complete" ? "Files found" : "Searching files..."} status={status} />
        {args?.pattern && (
          <div style={{ fontFamily: typography.mono, fontSize: typography.sizes.sm, color: "#d97706", marginTop: spacing.xs }}>
            {args.pattern}
          </div>
        )}
        {args?.path && <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 2 }}>in {args.path}</div>}
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
      <ToolCard accent={colors.error}>
        <ToolHeader icon="/" title={status === "complete" ? "Search complete" : "Searching contents..."} status={status} />
        {args?.pattern && (
          <div style={{ fontFamily: typography.mono, fontSize: typography.sizes.sm, color: "#dc2626", marginTop: spacing.xs }}>
            /{args.pattern}/
          </div>
        )}
        {(args?.path || args?.glob) && (
          <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
            {args.path && `in ${args.path}`}{args.glob && ` (${args.glob})`}
          </div>
        )}
      </ToolCard>
    ),
  });

  // ── TodoWrite — task management with full list rendering ─────────
  useRenderToolCall({
    name: "TodoWrite",
    description: "Task management",
    parameters: [
      { name: "todos", type: "string" as const, description: "JSON array of todo items" },
    ],
    render: ({ status, args }: any) => {
      let todos: TodoItem[] = [];
      try {
        const raw = args?.todos;
        if (Array.isArray(raw)) todos = raw;
        else if (typeof raw === "string") todos = JSON.parse(raw);
      } catch { /* ignore parse errors */ }

      // Report todos to parent for the persistent task panel
      if (todos.length > 0 && status === "complete" && onTodosUpdate) {
        // Use setTimeout to avoid setState during render
        setTimeout(() => onTodosUpdate(todos), 0);
      }

      const done = todos.filter((t) => t.status === "completed").length;
      const total = todos.length;

      return (
        <ToolCard accent={colors.accent}>
          <ToolHeader
            icon={"\u2713"}
            title={status === "complete" ? `Tasks (${done}/${total})` : "Updating tasks..."}
            status={status}
          />
          {todos.length > 0 && (
            <div style={{ marginTop: spacing.sm, display: "flex", flexDirection: "column", gap: 3 }}>
              {todos.map((todo, i) => {
                const icon = todo.status === "completed" ? "\u2713"
                  : todo.status === "in_progress" ? "\u25CF"
                  : "\u25CB";
                const iconColor = todo.status === "completed" ? colors.success
                  : todo.status === "in_progress" ? colors.accent
                  : colors.textMuted;
                return (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing.sm,
                    fontSize: typography.sizes.sm,
                    color: todo.status === "completed" ? colors.textMuted : colors.text,
                    textDecoration: todo.status === "completed" ? "line-through" : "none",
                  }}>
                    <span style={{
                      color: iconColor,
                      fontSize: 10,
                      width: 14,
                      textAlign: "center",
                      flexShrink: 0,
                    }}>{icon}</span>
                    <span>{todo.status === "in_progress" ? todo.activeForm : todo.content}</span>
                  </div>
                );
              })}
            </div>
          )}
        </ToolCard>
      );
    },
  });

  // ── spawnCanvas — dynamic visualization ──────────────────────────
  useRenderToolCall({
    name: "spawnCanvas",
    description: "Canvas visualization",
    parameters: [
      { name: "type", type: "string" as const },
      { name: "title", type: "string" as const },
    ],
    render: ({ status, args }: any) => (
      <ToolCard accent={colors.accent}>
        <ToolHeader
          icon="&#9671;"
          title={status === "complete" ? `Canvas: ${args?.title ?? ""}` : "Creating visualization..."}
          status={status}
        />
        {args?.type && <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing.xs }}>{args.type}</div>}
      </ToolCard>
    ),
  });

  // ── Default catch-all for any other tool ─────────────────────────
  useDefaultTool({
    render: ({ name, status, args }: any) => (
      <ToolCard accent={colors.textMuted}>
        <ToolHeader
          icon="?"
          title={status === "complete" ? `${name} complete` : `Running ${name}...`}
          status={status}
        />
      </ToolCard>
    ),
  });

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared UI pieces
// ═══════════════════════════════════════════════════════════════════════════

function ToolCard({
  accent,
  dark,
  children,
}: {
  accent: string;
  dark?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={{
      background: dark ? colors.toolBash : colors.surface,
      color: dark ? colors.toolBashFg : colors.text,
      borderRadius: radius.md,
      padding: `${spacing.sm}px ${spacing.lg}px`,
      margin: `${spacing.xs}px 0`,
      fontSize: typography.sizes.md,
      fontFamily: dark ? typography.mono : typography.fontFamily,
      borderLeft: `4px solid ${accent}`,
      boxShadow: shadows.sm,
      transition: transitions.fast,
    }}>
      {children}
    </div>
  );
}

function ToolHeader({
  icon,
  title,
  status,
  dark,
}: {
  icon: string;
  title: string;
  status: string;
  dark?: boolean;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: spacing.sm,
    }}>
      <span style={{
        width: 20,
        height: 20,
        borderRadius: radius.sm,
        background: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.bold,
        fontFamily: typography.mono,
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.md }}>
        {title}
      </span>
      {status === "inProgress" && (
        <span
          className="pulse"
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: colors.accent,
            display: "inline-block",
            marginLeft: spacing.xs,
          }}
        />
      )}
    </div>
  );
}

function FilePath({ path }: { path: string }) {
  const normalized = path.replace(/\\/g, "/");
  const name = normalized.split("/").pop() ?? path;
  const dir = normalized.slice(0, -name.length);
  return (
    <div style={{
      fontSize: typography.sizes.sm,
      fontFamily: typography.mono,
      marginTop: spacing.xs,
    }} title={path}>
      <span style={{ color: colors.textMuted }}>{dir}</span>
      <span style={{ fontWeight: typography.weights.semibold, color: colors.text }}>{name}</span>
    </div>
  );
}

function DiffBlock({
  label,
  content,
  variant,
}: {
  label: string;
  content: string;
  variant: "add" | "remove";
}) {
  const preview = content.length > 200 ? content.slice(0, 200) + "..." : content;
  const bg = variant === "add" ? colors.successLight : colors.errorLight;
  const labelColor = variant === "add" ? colors.success : colors.error;

  return (
    <div style={{
      background: bg,
      borderRadius: radius.sm,
      padding: `${spacing.xs}px ${spacing.sm}px`,
      marginTop: spacing.xs,
      fontSize: typography.sizes.xs,
      fontFamily: typography.mono,
      whiteSpace: "pre-wrap",
      maxHeight: 80,
      overflow: "auto",
    }}>
      <span style={{
        fontWeight: typography.weights.bold,
        fontSize: 10,
        textTransform: "uppercase",
        color: labelColor,
      }}>
        {label}:{" "}
      </span>
      {preview}
    </div>
  );
}
