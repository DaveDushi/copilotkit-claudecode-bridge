import type { CanvasComponentType } from "../../types";
import { DataTable } from "./DataTable";
import { LineChartView } from "./LineChart";
import { BarChartView } from "./BarChart";
import { JsonViewer } from "./JsonViewer";
import { KeyValueGrid } from "./KeyValueGrid";
import { ProgressDashboard } from "./ProgressDashboard";

export const CANVAS_REGISTRY: Record<
  CanvasComponentType,
  { component: React.FC<{ data: any }>; label: string; color: string }
> = {
  "data-table": { component: DataTable, label: "Table", color: "#e3f2fd" },
  "line-chart": { component: LineChartView, label: "Line Chart", color: "#e8f5e9" },
  "bar-chart": { component: BarChartView, label: "Bar Chart", color: "#fff3e0" },
  "json-viewer": { component: JsonViewer, label: "JSON", color: "#f3e5f5" },
  "key-value": { component: KeyValueGrid, label: "Key-Value", color: "#fce4ec" },
  "progress-dashboard": { component: ProgressDashboard, label: "Dashboard", color: "#e0f2f1" },
};
