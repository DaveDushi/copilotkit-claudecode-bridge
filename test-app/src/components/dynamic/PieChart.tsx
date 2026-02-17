import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd",
  "#3b82f6", "#60a5fa", "#10b981", "#34d399",
  "#f59e0b", "#fbbf24", "#ef4444", "#f87171",
];

interface Props {
  data: {
    data?: { name: string; value: number }[];
    innerRadius?: number;
  };
}

export function PieChartView({ data }: Props) {
  const items = data.data ?? [];
  const innerRadius = data.innerRadius ?? 0;

  if (items.length === 0) {
    return <div style={{ padding: 16, color: "#999", fontSize: 13 }}>No data to display.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RechartsPieChart>
        <Pie
          data={items}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={{ stroke: "#ccc" }}
        >
          {items.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => value.toLocaleString()}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid #e2e5ea",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            fontSize: 12,
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          iconType="circle"
          iconSize={8}
        />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}
