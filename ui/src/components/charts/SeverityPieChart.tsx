// Pie chart showing severity distribution

import { memo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { useTheme } from "../../contexts/ThemeContext";
import type { SeverityDistribution } from "../../types";

interface SeverityPieChartProps {
  data: SeverityDistribution[];
  title?: string;
}

export const SeverityPieChart = memo(function SeverityPieChart({
  data,
  title = "Severity Distribution",
}: SeverityPieChartProps) {
  const { theme } = useTheme();

  const isEmpty = data.length === 0 || data.every((d) => d.value === 0);

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
      {isEmpty ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 180,
            color: theme.colors.textMuted,
            fontSize: "13px",
          }}
        >
          No open alerts
        </div>
      ) : (
        <div style={{ width: "100%", height: 180 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data as unknown as Record<string, unknown>[]}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
                animationDuration={500}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: theme.colors.surfaceSecondary,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: theme.colors.text,
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconSize={10}
                iconType="circle"
                formatter={(value) => (
                  <span style={{ color: theme.colors.textSecondary, fontSize: "11px" }}>
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
});

