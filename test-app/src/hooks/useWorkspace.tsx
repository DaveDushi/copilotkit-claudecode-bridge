/**
 * useWorkspace — The core CopilotKit integration hooks.
 *
 * This is where the magic happens. These hooks create a TWO-WAY bridge
 * between the React UI and Claude Code:
 *
 *   useCopilotReadable  → Claude can SEE your workspace state
 *   useCopilotAction    → Claude can CHANGE your workspace state
 *   useCopilotChatSuggestions → Smart suggestions based on context
 *
 * No other Claude Code GUI does this. Terminal UIs are one-way —
 * you type, Claude responds. Here, Claude is aware of your entire
 * workspace and can manipulate it like a collaborator sitting next to you.
 */
import React from "react";
import { useCopilotReadable, useCopilotAction } from "@copilotkit/react-core";
import { useCopilotChatSuggestions } from "@copilotkit/react-ui";
import type { Task, FileEntry } from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// useCopilotReadable — Share workspace state with Claude
// ═══════════════════════════════════════════════════════════════════════════
//
// These hooks make Claude AWARE of what's happening in the UI.
// When you type notes in the scratchpad, Claude knows. When you check
// off a task, Claude knows. This is automatic — no copy-pasting needed.

export function useWorkspaceReadables(
  scratchpad: string,
  tasks: Task[],
  files: FileEntry[],
) {
  // Claude can see the scratchpad contents at all times.
  // Try: "what did I write in my notes?" — Claude already knows.
  useCopilotReadable({
    description: "The user's scratchpad / notepad contents. They may have written notes, drafts, ideas, or pasted content here.",
    value: scratchpad || "(empty)",
  });

  // Claude can see all tasks and their completion status.
  // Try: "what's left on my task list?" — Claude reads it directly.
  useCopilotReadable({
    description: "The user's task board. Each task has a title, done status, and optional details.",
    value: tasks.length > 0
      ? tasks.map((t, i) => `${i + 1}. [${t.done ? "x" : " "}] ${t.title}${t.details ? ` — ${t.details}` : ""}`).join("\n")
      : "(no tasks)",
  });

  // Claude can see files the user has been looking at.
  useCopilotReadable({
    description: "Files currently visible in the user's file explorer panel.",
    value: files.length > 0
      ? files.map((f) => `${f.path} (${f.type}, ${f.size})`).join("\n")
      : "(no files loaded)",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// useCopilotAction — Let Claude CHANGE your workspace
// ═══════════════════════════════════════════════════════════════════════════
//
// These give Claude new abilities that ONLY EXIST IN THE BROWSER.
// A terminal Claude Code can't update a notepad. It can't check off tasks
// in a visual board. It can't display file thumbnails. This can.

export function useWorkspaceActions(
  setScratchpad: (fn: (prev: string) => string) => void,
  setTasks: (fn: (prev: Task[]) => Task[]) => void,
  setFiles: (fn: (prev: FileEntry[]) => FileEntry[]) => void,
) {
  // ── Scratchpad Actions ─────────────────────────────────────────────

  // Claude can write to the user's scratchpad.
  // Use case: "summarize that file into my notes", "draft an email",
  //           "take notes on what you find", "write up a plan"
  useCopilotAction({
    name: "updateScratchpad",
    description: "Write or update content in the user's scratchpad/notepad. Use 'replace' to overwrite, 'append' to add to the end, 'prepend' to add to the beginning.",
    parameters: [
      { name: "content", type: "string" as const, description: "The text to write", required: true },
      { name: "mode", type: "string" as const, description: "How to update: 'replace', 'append', or 'prepend'", required: true, enum: ["replace", "append", "prepend"] },
    ],
    handler: async ({ content, mode }: { content: string; mode: string }) => {
      setScratchpad((prev: string) => {
        switch (mode) {
          case "replace": return content;
          case "append": return prev + (prev ? "\n" : "") + content;
          case "prepend": return content + (prev ? "\n" : "") + prev;
          default: return content;
        }
      });
      return `Scratchpad updated (${mode})`;
    },
    render: ({ status, args }: any) => {
      const preview = ((args?.content as string) ?? "").slice(0, 200);
      return (
        <InlineCard
          bg="#e3f2fd"
          title={status === "complete" ? `Scratchpad ${args?.mode ?? "updated"}` : "Writing to scratchpad..."}
          body={status !== "inProgress" ? (preview + (preview.length >= 200 ? "..." : "")) : undefined}
        />
      );
    },
  });

  // ── Task Board Actions ─────────────────────────────────────────────

  // Claude can add tasks to the board.
  // Use case: "make a plan for deploying this", "create a packing list",
  //           "break down what needs to happen to ship this feature"
  useCopilotAction({
    name: "addTask",
    description: "Add a new task to the user's task board.",
    parameters: [
      { name: "title", type: "string" as const, description: "Short task title", required: true },
      { name: "details", type: "string" as const, description: "Optional details or subtask info" },
    ],
    handler: async ({ title, details }: { title: string; details?: string }) => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      setTasks((prev: Task[]) => [...prev, { id, title, details, done: false }]);
      return `Task added: ${title}`;
    },
    render: ({ status, args }: any) => (
      <InlineCard
        bg="#fff3e0"
        title={status === "complete" ? "Task added" : "Adding task..."}
        body={args?.title}
      />
    ),
  });

  // Claude can mark tasks as done.
  useCopilotAction({
    name: "completeTask",
    description: "Mark a task as completed by its title (partial match ok).",
    parameters: [
      { name: "title", type: "string" as const, description: "Task title to complete (partial match)", required: true },
    ],
    handler: async ({ title }: { title: string }) => {
      let found = false;
      setTasks((prev: Task[]) =>
        prev.map((t: Task) => {
          if (!t.done && t.title.toLowerCase().includes(title.toLowerCase())) {
            found = true;
            return { ...t, done: true };
          }
          return t;
        }),
      );
      return found ? `Completed: ${title}` : `No matching task found for: ${title}`;
    },
    render: ({ status, args }: any) => (
      <InlineCard bg="#e8f5e9" title={status === "complete" ? "Task completed" : "Completing..."} body={args?.title} />
    ),
  });

  // Claude can remove tasks.
  useCopilotAction({
    name: "removeTask",
    description: "Remove a task from the board by its title (partial match ok).",
    parameters: [
      { name: "title", type: "string" as const, description: "Task title to remove", required: true },
    ],
    handler: async ({ title }: { title: string }) => {
      setTasks((prev: Task[]) => prev.filter((t: Task) => !t.title.toLowerCase().includes(title.toLowerCase())));
      return `Removed: ${title}`;
    },
  });

  // ── File Explorer Actions ──────────────────────────────────────────

  // Claude can push files into the visual explorer.
  // Use case: "show me what's in my Downloads", "find all images",
  //           "what's eating disk space?", "what files did you just create?"
  useCopilotAction({
    name: "showFiles",
    description: "Display files in the user's file explorer panel. Use this to show the user files you've found, created, or want to highlight. Always use this when listing, discovering, or referencing files.",
    parameters: [
      {
        name: "files",
        type: "object[]" as const,
        description: "Array of files to display",
        required: true,
        attributes: [
          { name: "path", type: "string" as const, description: "File path", required: true },
          { name: "type", type: "string" as const, description: "file, directory, image, pdf, code, or text", required: true },
          { name: "size", type: "string" as const, description: "Human-readable size like '4.2 KB'" },
          { name: "preview", type: "string" as const, description: "Short preview of contents" },
        ],
      },
      { name: "mode", type: "string" as const, description: "'replace' the list or 'append'", enum: ["replace", "append"] },
    ],
    handler: async ({ files, mode }: { files: any[]; mode?: string }) => {
      const entries: FileEntry[] = (files ?? []).map((f: any) => ({
        path: f.path,
        name: f.path.replace(/\\/g, "/").split("/").pop() ?? f.path,
        type: f.type ?? "file",
        size: f.size ?? "",
        preview: f.preview ?? "",
      }));
      if (mode === "replace" || !mode) {
        setFiles(() => entries);
      } else {
        setFiles((prev: FileEntry[]) => [...prev, ...entries]);
      }
      return `Showing ${entries.length} file(s) in explorer`;
    },
    render: ({ status, args }: any) => {
      const count = (args?.files ?? []).length;
      return (
        <InlineCard
          bg="#f3e5f5"
          title={status === "complete" ? `${count} file(s) loaded` : "Finding files..."}
        />
      );
    },
  });

  // ── Human in the Loop: Choices ─────────────────────────────────────

  // Claude can present choices and WAIT for user to pick.
  // Use case: "should I use TypeScript or JavaScript?",
  //           "which folder should I organize first?",
  //           "pick a color scheme"
  useCopilotAction({
    name: "presentChoices",
    description: "Present the user with choices and wait for them to pick one. Use this when you need the user's decision before proceeding.",
    parameters: [
      { name: "question", type: "string" as const, description: "The question to ask", required: true },
      { name: "choices", type: "string[]" as const, description: "Array of choice labels", required: true },
    ],
    renderAndWaitForResponse: ({ args, respond, status }: any) => {
      if (status === "complete") {
        return <InlineCard bg="#e8f5e9" title="Choice made" />;
      }
      return (
        <div style={{ background: "#fff3e0", borderRadius: 8, padding: "12px 14px", margin: "4px 0" }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>{args?.question ?? "Choose one:"}</div>
          {(args?.choices ?? []).map((c: string, i: number) => (
            <button
              key={i}
              onClick={() => respond?.(c)}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 12px",
                marginBottom: 4,
                border: "1px solid #e0e0e0",
                borderRadius: 6,
                background: "#fff",
                cursor: respond ? "pointer" : "default",
                textAlign: "left",
                fontSize: 13,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = "#fff8e1"; }}
              onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = "#fff"; }}
            >
              {c}
            </button>
          ))}
        </div>
      );
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Smart Suggestions
// ═══════════════════════════════════════════════════════════════════════════

export function useWorkspaceSuggestions(
  scratchpad: string,
  tasks: Task[],
  files: FileEntry[],
) {
  useCopilotChatSuggestions({
    instructions: [
      "Suggest 2 helpful next actions based on the workspace state.",
      scratchpad ? "The user has notes in their scratchpad." : "The scratchpad is empty — suggest writing something.",
      tasks.length > 0
        ? `There are ${tasks.length} tasks (${tasks.filter((t) => t.done).length} done).`
        : "No tasks yet — suggest making a plan.",
      files.length > 0
        ? `${files.length} files visible in explorer.`
        : "No files in explorer — suggest exploring the filesystem.",
      "Think beyond coding: organizing files, drafting documents, planning, researching.",
    ].join(" "),
    minSuggestions: 1,
    maxSuggestions: 2,
  }, [scratchpad.length > 0, tasks.length, files.length]);
}

// ═══════════════════════════════════════════════════════════════════════════
// InlineCard — Rendered inside the chat when Claude uses workspace actions
// ═══════════════════════════════════════════════════════════════════════════

function InlineCard({ bg, title, body }: { bg: string; title: string; body?: string }) {
  return (
    <div style={{ background: bg, borderRadius: 8, padding: "10px 14px", margin: "4px 0", fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: body ? 4 : 0 }}>{title}</div>
      {body && <div style={{ color: "#555", whiteSpace: "pre-wrap", fontSize: 12, maxHeight: 120, overflow: "auto" }}>{body}</div>}
    </div>
  );
}
