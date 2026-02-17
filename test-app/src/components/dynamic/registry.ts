import type { CanvasComponentType } from "../../types";
import { DataTable } from "./DataTable";
import { EditableTable } from "./EditableTable";
import { LineChartView } from "./LineChart";
import { BarChartView } from "./BarChart";
import { PieChartView } from "./PieChart";
import { JsonViewer } from "./JsonViewer";
import { KeyValueGrid } from "./KeyValueGrid";
import { ProgressDashboard } from "./ProgressDashboard";
import { TabbedContainer } from "./TabbedContainer";
import { CustomHtml } from "./CustomHtml";

export const CANVAS_REGISTRY: Record<
  CanvasComponentType,
  { component: React.FC<{ data: any }>; label: string; color: string }
> = {
  "data-table": { component: DataTable, label: "Table", color: "#e3f2fd" },
  "editable-table": { component: EditableTable, label: "Editable", color: "#e8eaf6" },
  "line-chart": { component: LineChartView, label: "Line Chart", color: "#e8f5e9" },
  "bar-chart": { component: BarChartView, label: "Bar Chart", color: "#fff3e0" },
  "pie-chart": { component: PieChartView, label: "Pie Chart", color: "#f5f3ff" },
  "json-viewer": { component: JsonViewer, label: "JSON", color: "#f3e5f5" },
  "key-value": { component: KeyValueGrid, label: "Key-Value", color: "#fce4ec" },
  "progress-dashboard": { component: ProgressDashboard, label: "Dashboard", color: "#e0f2f1" },
  "tab-container": { component: TabbedContainer, label: "Tabs", color: "#eef2ff" },
  "custom": { component: CustomHtml, label: "Custom", color: "#e8eaf6" },
};
