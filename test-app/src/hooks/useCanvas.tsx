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
import type { CanvasComponent, CanvasComponentType } from "../types";

const VALID_TYPES: CanvasComponentType[] = [
  "data-table", "editable-table", "line-chart", "bar-chart",
  "json-viewer", "key-value", "progress-dashboard", "custom",
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
      '  json-viewer: any JSON object or array (pass directly as data)',
      '  key-value:  { "entries": [{"key":"Name","value":"MyProject"}] }',
      '  progress-dashboard: { "items": [{"label":"Tests","value":85,"max":100,"status":"success"}] }',
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

      setComponents((prev) => {
        const existing = prev.findIndex((c) => c.id === componentId);
        if (existing >= 0) {
          // Update in place
          const updated = [...prev];
          updated[existing] = { ...updated[existing], title, data: parsedData, timestamp: Date.now() };
          return updated;
        }
        // Add new
        return [...prev, {
          id: componentId,
          type: type as CanvasComponentType,
          title,
          data: parsedData,
          timestamp: Date.now(),
        }];
      });

      return `Visualization "${title}" (${type}) displayed on canvas.`;
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
      return "Canvas cleared.";
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
      background: "#f3e5f5",
      borderRadius: 8,
      padding: "10px 14px",
      margin: "4px 0",
      fontSize: 13,
    }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {detail && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{detail}</div>}
    </div>
  );
}
