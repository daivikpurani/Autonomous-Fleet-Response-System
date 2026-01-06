// Bar chart showing vehicle state distribution

import { memo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useTheme } from "../../contexts/ThemeContext";
import type { VehicleStateDistribution } from "../../types";

interface VehicleStateChartProps {
  data: VehicleStateDistribution[];
  title?: string;
}

export const VehicleStateChart = memo(function VehicleStateChart({
  data,
  title = "Vehicle States",
}: VehicleStateChartProps) {
  const { theme } = useTheme();

  return (
    <div
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: "12px",
        padding: "16px",
        border: `1px solid ${theme.colors.border}`,
        height: "100%",
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
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={theme.colors.borderSubtle}
              vertical={false}
            />
            <XAxis
              dataKey="name"
              stroke={theme.colors.textMuted}
              fontSize={11}
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
              cursor={{ fill: theme.colors.hover }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={500}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

