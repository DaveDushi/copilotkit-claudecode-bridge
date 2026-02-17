import { useState } from "react";
import type { CanvasComponentType } from "../../types";
import { colors, spacing, typography, transitions } from "../../styles";

// Import leaf components directly to avoid circular dependency with registry.ts
import { DataTable } from "./DataTable";
import { EditableTable } from "./EditableTable";
import { LineChartView } from "./LineChart";
import { BarChartView } from "./BarChart";
import { PieChartView } from "./PieChart";
import { JsonViewer } from "./JsonViewer";
import { KeyValueGrid } from "./KeyValueGrid";
import { ProgressDashboard } from "./ProgressDashboard";
import { CustomHtml } from "./CustomHtml";

const TAB_COMPONENTS: Partial<Record<CanvasComponentType, React.FC<{ data: any }>>> = {
  "data-table": DataTable,
  "editable-table": EditableTable,
  "line-chart": LineChartView,
  "bar-chart": BarChartView,
  "pie-chart": PieChartView,
  "json-viewer": JsonViewer,
  "key-value": KeyValueGrid,
  "progress-dashboard": ProgressDashboard,
  "custom": CustomHtml,
  // "tab-container" deliberately omitted to avoid self-nesting
};

interface Tab {
  label: string;
  type: CanvasComponentType;
  data: Record<string, unknown>;
}

interface Props {
  data: {
    tabs?: Tab[];
  };
}

export function TabbedContainer({ data }: Props) {
  const tabs = data.tabs ?? [];
  const [activeTab, setActiveTab] = useState(0);

  if (tabs.length === 0) {
    return <div style={{ padding: 16, color: "#999", fontSize: 13 }}>No tabs to display.</div>;
  }

  const current = tabs[activeTab];
  const Component = current ? TAB_COMPONENTS[current.type] : null;

  return (
    <div>
      {/* Tab bar */}
      <div style={{
        display: "flex",
        gap: 0,
        borderBottom: `1px solid ${colors.borderLight}`,
        marginBottom: spacing.md,
      }}>
        {tabs.map((tab, i) => {
          const isActive = i === activeTab;
          return (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              style={{
                padding: `${spacing.sm}px ${spacing.lg}px`,
                fontSize: typography.sizes.sm,
                fontWeight: isActive ? typography.weights.semibold : typography.weights.normal,
                fontFamily: typography.fontFamily,
                color: isActive ? colors.accent : colors.textSecondary,
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${isActive ? colors.accent : "transparent"}`,
                cursor: "pointer",
                transition: transitions.fast,
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      {Component && current && (
        <Component data={current.data} />
      )}
    </div>
  );
}
