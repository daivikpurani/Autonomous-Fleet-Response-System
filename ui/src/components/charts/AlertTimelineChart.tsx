// Scatter plot showing alert timeline

import { memo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useTheme } from "../../contexts/ThemeContext";
import type { ChartDataPoint } from "../../types";

interface AlertTimelineChartProps {
  data: ChartDataPoint[];
  title?: string;
}

const severityLabels = ["", "Info", "Warning", "Critical"];
const severityColors = ["", "#3b82f6", "#f59e0b", "#ef4444"];

export const AlertTimelineChart = memo(function AlertTimelineChart({
  data,
  title = "Alert Timeline",
}: AlertTimelineChartProps) {
  const { theme } = useTheme();

  return (
    <div
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: "12px",
        padding: "16px",
        border: `1px solid ${theme.colors.border}`,
      }}
    >
      <h3
        style={{
          margin: "0 0 16px 0",
          fontSize: "14px",
          fontWeight: 600,
          color: theme.colors.text,
        }}
      >
        {title}
      </h3>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={theme.colors.borderSubtle}
            />
            <XAxis
              dataKey="label"
              type="category"
              stroke={theme.colors.textMuted}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              allowDuplicatedCategory={false}
            />
            <YAxis
              dataKey="value"
              type="number"
              stroke={theme.colors.textMuted}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={60}
              domain={[0, 4]}
              ticks={[1, 2, 3]}
              tickFormatter={(v) => severityLabels[v] || ""}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: theme.colors.surfaceSecondary,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: "8px",
                fontSize: "12px",
                color: theme.colors.text,
              }}
              formatter={(value) => [severityLabels[value as number] || "", "Severity"]}
            />
            <Scatter data={data} animationDuration={300}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={severityColors[entry.value] || theme.colors.textMuted}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

