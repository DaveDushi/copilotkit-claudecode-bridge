/**
 * useCanvas — CopilotKit actions for dynamic UI spawning.
 *
 * Registers two frontend tools:
 *   spawnCanvas  — Claude creates/updates a visualization on the canvas
 *   clearCanvas  — Claude clears all canvas components
 *
 * Also exposes current canvas state via useCopilotReadable so Claude
 * knows what's already displayed.
 */
import React from "react";
import { useCopilotReadable, useCopilotAction } from "@copilotkit/react-core";
import { colors, radius, spacing, typography } from "../styles";
import type { CanvasComponent, CanvasComponentType } from "../types";

const VALID_TYPES: CanvasComponentType[] = [
  "data-table", "editable-table", "line-chart", "bar-chart", "pie-chart",
  "json-viewer", "key-value", "progress-dashboard", "tab-container", "custom",
];

export function useCanvas(
  components: CanvasComponent[],
  setComponents: React.Dispatch<React.SetStateAction<CanvasComponent[]>>,
) {
  // Let Claude see what's on the canvas
  useCopilotReadable({
    description: "Visualizations currently displayed on the user's canvas.",
    value: components.length > 0
      ? components.map((c) => `- "${c.title}" (${c.type})`).join("\n")
      : "(canvas is empty)",
  });

  // ── spawnCanvas ────────────────────────────────────────────────────
  useCopilotAction({
    name: "spawnCanvas",
    description: [
      "Spawn an interactive visualization on the user's canvas. Use this whenever data is better shown visually.",
      "",
      "Component types and their data formats:",
      '  data-table: { "columns": [{"key":"name","label":"Name"}], "rows": [{"name":"foo"}] }',
      '  editable-table: same format as data-table, but user can edit cells, add/delete rows, and AI can see + make edits via scoped actions',
      '  line-chart: { "xKey": "month", "yKeys": ["revenue"], "data": [{"month":"Jan","revenue":100}] }',
      '  bar-chart:  same format as line-chart',
      '  pie-chart:  { "data": [{"name":"Category A","value":400}], "innerRadius": 0 }',
      '  json-viewer: any JSON object or array (pass directly as data)',
      '  key-value:  { "entries": [{"key":"Name","value":"MyProject"}] }',
      '  progress-dashboard: { "items": [{"label":"Tests","value":85,"max":100,"status":"success"}] }',
      '  tab-container: { "tabs": [{"label":"Overview","type":"key-value","data":{...}}, {"label":"Data","type":"data-table","data":{...}}] }',
      '  custom: { "html": "<div>Any HTML/CSS you want — rendered in a sandboxed iframe</div>" }',
      "",
      "Use \"custom\" when none of the built-in types fit. You can include <style> tags, SVG, flexbox, grid, interactive JS — anything.",
      "",
      "Pass an id to update an existing component instead of creating a new one.",
    ].join("\n"),
    parameters: [
      {
        name: "type",
        type: "string" as const,
        description: "Component type",
        required: true,
        enum: VALID_TYPES as unknown as string[],
      },
      {
        name: "title",
        type: "string" as const,
        description: "Display title for the visualization",
        required: true,
      },
      {
        name: "data",
        type: "string" as const,
        description: "JSON string of the data payload — structure depends on component type (see description). Must be a valid JSON string.",
        required: true,
      },
      {
        name: "id",
        type: "string" as const,
        description: "Optional ID — reuse to update an existing component",
      },
    ],
    handler: async ({ type, title, data, id }: { type: string; title: string; data: string; id?: string }) => {
      // data arrives as a JSON string — parse it
      const parsedData = typeof data === "string" ? JSON.parse(data) : data;
      const componentId = id || `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // Inject table ID for editable tables so they can scope their CopilotKit actions
      if (type === "editable-table") {
        parsedData._tableId = componentId;
      }

      // Use a promise to capture the updated canvas state from the setter
      const canvasSummary = await new Promise<string>((resolve) => {
        setComponents((prev) => {
          const existing = prev.findIndex((c) => c.id === componentId);
          let next: CanvasComponent[];
          if (existing >= 0) {
            next = [...prev];
            next[existing] = { ...next[existing], title, data: parsedData, timestamp: Date.now() };
          } else {
            next = [...prev, {
              id: componentId,
              type: type as CanvasComponentType,
              title,
              data: parsedData,
              timestamp: Date.now(),
            }];
          }
          // Build summary of everything now on canvas so Claude knows full state
          const summary = next.map((c) => `  - "${c.title}" (${c.type}, id=${c.id})`).join("\n");
          resolve(summary);
          return next;
        });
      });

      return [
        `SUCCESS: "${title}" (${type}) is now displayed on the canvas.`,
        `Canvas now contains ${canvasSummary.split("\n").length} item(s):`,
        canvasSummary,
        "",
        "Do NOT re-create these — they are already visible to the user.",
      ].join("\n");
    },
    render: ({ status, args }: any) => (
      <InlineCard
        title={status === "complete" ? `Canvas: ${args?.title ?? ""}` : "Creating visualization..."}
        detail={args?.type}
      />
    ),
  });

  // ── clearCanvas ────────────────────────────────────────────────────
  useCopilotAction({
    name: "clearCanvas",
    description: "Remove all visualizations from the user's canvas.",
    parameters: [],
    handler: async () => {
      setComponents([]);
      return "Canvas cleared. Canvas is now empty (0 items).";
    },
    render: ({ status }: any) => (
      <InlineCard
        title={status === "complete" ? "Canvas cleared" : "Clearing canvas..."}
      />
    ),
  });
}

function InlineCard({ title, detail }: { title: string; detail?: string }) {
  return (
    <div style={{
      background: colors.toolCanvas,
      borderRadius: radius.md,
      padding: `${spacing.sm}px ${spacing.lg}px`,
      margin: `${spacing.xs}px 0`,
      fontSize: typography.sizes.md,
    }}>
      <div style={{ fontWeight: typography.weights.semibold, color: colors.text }}>{title}</div>
      {detail && <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 2 }}>{detail}</div>}
    </div>
  );
}
