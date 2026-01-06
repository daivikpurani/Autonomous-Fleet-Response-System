// Line chart showing alerts per minute over time

import { memo } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { useTheme } from "../../contexts/ThemeContext";
import type { ChartDataPoint } from "../../types";

interface AlertRateChartProps {
  data: ChartDataPoint[];
  title?: string;
}

export const AlertRateChart = memo(function AlertRateChart({
  data,
  title = "Alerts per Minute",
}: AlertRateChartProps) {
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
              <linearGradient id="alertGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={theme.colors.primary} stopOpacity={0.3} />
                <stop offset="95%" stopColor={theme.colors.primary} stopOpacity={0} />
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
            />
            <Tooltip
              contentStyle={{
                backgroundColor: theme.colors.surfaceSecondary,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: "8px",
                fontSize: "12px",
                color: theme.colors.text,
              }}
              labelStyle={{ color: theme.colors.textSecondary }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={theme.colors.primary}
              strokeWidth={2}
              fill="url(#alertGradient)"
              dot={false}
              animationDuration={300}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

