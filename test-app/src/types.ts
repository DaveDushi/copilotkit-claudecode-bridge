export type CanvasComponentType =
  | "data-table"
  | "editable-table"
  | "line-chart"
  | "bar-chart"
  | "json-viewer"
  | "key-value"
  | "progress-dashboard";

export interface CanvasComponent {
  id: string;
  type: CanvasComponentType;
  title: string;
  data: Record<string, unknown>;
  timestamp: number;
}
