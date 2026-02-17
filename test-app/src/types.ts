export type CanvasComponentType =
  | "data-table"
  | "editable-table"
  | "line-chart"
  | "bar-chart"
  | "pie-chart"
  | "json-viewer"
  | "key-value"
  | "progress-dashboard"
  | "tab-container"
  | "custom";

export interface CanvasComponent {
  id: string;
  type: CanvasComponentType;
  title: string;
  data: Record<string, unknown>;
  timestamp: number;
}
