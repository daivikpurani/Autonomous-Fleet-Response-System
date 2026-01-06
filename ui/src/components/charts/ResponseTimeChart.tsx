// Area chart showing average response time trend

import { memo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTheme } from "../../contexts/ThemeContext";
import type { ChartDataPoint } from "../../types";

interface ResponseTimeChartProps {
  data: ChartDataPoint[];
  title?: string;
}

export const ResponseTimeChart = memo(function ResponseTimeChart({
  data,
  title = "Avg Response Time (seconds)",
}: ResponseTimeChartProps) {
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
          <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="responseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={theme.colors.borderSubtle}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              stroke={theme.colors.textMuted}
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke={theme.colors.textMuted}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={30}
              tickFormatter={(v) => `${v.toFixed(1)}s`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: theme.colors.surfaceSecondary,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: "8px",
                fontSize: "12px",
                color: theme.colors.text,
              }}
              formatter={(value) => [`${(value as number).toFixed(2)}s`, "Response Time"]}
              labelStyle={{ color: theme.colors.textSecondary }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#responseGradient)"
              dot={false}
              animationDuration={300}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

