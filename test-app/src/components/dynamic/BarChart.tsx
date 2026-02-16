import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const COLORS = ["#2196f3", "#4caf50", "#ff9800", "#e91e63", "#9c27b0", "#00bcd4", "#795548"];

interface Props {
  data: {
    xKey?: string;
    yKeys?: string[];
    data?: Record<string, unknown>[];
    xLabel?: string;
    yLabel?: string;
  };
}

export function BarChartView({ data }: Props) {
  const rows = data.data ?? [];
  if (rows.length === 0) {
    return <div style={{ padding: 16, color: "#999", fontSize: 13 }}>No data to chart.</div>;
  }

  const xKey = data.xKey ?? Object.keys(rows[0])[0];
  const yKeys = data.yKeys ?? Object.keys(rows[0]).filter((k) => k !== xKey);

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey={xKey} fontSize={11} label={data.xLabel ? { value: data.xLabel, position: "insideBottom", offset: -4, fontSize: 11 } : undefined} />
          <YAxis fontSize={11} label={data.yLabel ? { value: data.yLabel, angle: -90, position: "insideLeft", fontSize: 11 } : undefined} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {yKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              fill={COLORS[i % COLORS.length]}
              radius={[3, 3, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
