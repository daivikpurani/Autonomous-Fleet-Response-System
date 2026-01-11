// Metrics dashboard with KPIs and real-time charts

import { useTheme } from "../contexts/ThemeContext";
import { useMetrics } from "../hooks/useMetrics";
import {
  AlertRateChart,
  SeverityPieChart,
  VehicleStateChart,
  ResponseTimeChart,
  AlertTimelineChart,
} from "../components/charts";

// KPI Card Component
function KPICard({
  label,
  value,
  unit,
  color,
  icon,
  subtext,
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  icon?: string;
  subtext?: string;
}) {
  const { theme } = useTheme();

  return (
    <div
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: "12px",
        padding: "20px",
        border: `1px solid ${theme.colors.border}`,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: theme.colors.textSecondary,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {label}
        </span>
        {icon && <span style={{ fontSize: "18px" }}>{icon}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
        <span
          style={{
            fontSize: "32px",
            fontWeight: 700,
            fontFamily: theme.fonts.mono,
            color: color || theme.colors.text,
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: theme.colors.textMuted,
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {subtext && (
        <span
          style={{
            fontSize: "11px",
            color: theme.colors.textMuted,
          }}
        >
          {subtext}
        </span>
      )}
    </div>
  );
}

// Status Indicator
function StatusIndicator({ isConnected }: { isConnected: boolean }) {
  const { theme } = useTheme();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 16px",
        borderRadius: "8px",
        backgroundColor: isConnected
          ? theme.colors.successMuted
          : theme.colors.errorMuted,
      }}
    >
      <span
        style={{
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          backgroundColor: isConnected ? theme.colors.success : theme.colors.error,
          animation: isConnected ? undefined : "pulse 1s infinite",
        }}
      />
      <span
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: isConnected ? theme.colors.success : theme.colors.error,
        }}
      >
        {isConnected ? "LIVE DATA" : "CONNECTING..."}
      </span>
    </div>
  );
}

export function MetricsDashboard() {
  const { theme } = useTheme();
  const {
    current,
    history,
    severityDistribution,
    vehicleStateDistribution,
    alertsTimeline,
    responseTimeHistory,
    isConnected,
    loading,
    error,
  } = useMetrics();

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              border: `3px solid ${theme.colors.border}`,
              borderTopColor: theme.colors.primary,
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <div style={{ color: theme.colors.textMuted, fontSize: "14px" }}>
            Loading analytics...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <div style={{ textAlign: "center", color: theme.colors.error }}>
          <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            Failed to load metrics
          </div>
          <div style={{ fontSize: "13px", color: theme.colors.textSecondary }}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        padding: "24px",
        backgroundColor: theme.colors.background,
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <div>
          <h2
            style={{
              margin: "0 0 4px 0",
              fontSize: "24px",
              fontWeight: 700,
              color: theme.colors.text,
            }}
          >
            Fleet Analytics
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: theme.colors.textSecondary,
            }}
          >
            Real-time operational metrics and performance indicators
          </p>
        </div>
        <StatusIndicator isConnected={isConnected} />
      </div>

      {/* KPI Cards Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <KPICard
          label="Alerts / Minute"
          value={current.alertsPerMinute}
          color={current.alertsPerMinute > 10 ? theme.colors.warning : theme.colors.text}
          subtext="Rolling 60-second window"
        />
        <KPICard
          label="Avg Response Time"
          value={(current.avgResponseTimeMs / 1000).toFixed(1)}
          unit="sec"
          color={
            current.avgResponseTimeMs > 30000
              ? theme.colors.error
              : current.avgResponseTimeMs > 10000
              ? theme.colors.warning
              : theme.colors.success
          }
          subtext="Time to acknowledge"
        />
        <KPICard
          label="Fleet Health"
          value={current.fleetHealthPercent.toFixed(0)}
          unit="%"
          color={
            current.fleetHealthPercent >= 90
              ? theme.colors.success
              : current.fleetHealthPercent >= 70
              ? theme.colors.warning
              : theme.colors.error
          }
          subtext={`${current.normalVehicles} / ${current.totalVehicles} vehicles nominal`}
        />
        <KPICard
          label="Open Alerts"
          value={current.totalAlerts}
          color={current.totalAlerts > 0 ? theme.colors.warning : theme.colors.success}
          subtext={
            current.criticalCount > 0
              ? `${current.criticalCount} critical`
              : "All clear"
          }
        />
        <KPICard
          label="Critical Incidents"
          value={current.criticalCount}
          color={current.criticalCount > 0 ? theme.colors.critical : theme.colors.success}
          subtext={current.criticalCount > 0 ? "Requires attention" : "None active"}
        />
      </div>

      {/* Charts Row 1 - Full Width */}
      <div style={{ marginBottom: "16px" }}>
        <AlertRateChart data={history} title="Alert Rate Over Time (Alerts/min)" />
      </div>

      {/* Charts Row 2 - Two Columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "16px",
          marginBottom: "16px",
        }}
      >
        <SeverityPieChart
          data={severityDistribution}
          title="Alert Severity Distribution"
        />
        <VehicleStateChart
          data={vehicleStateDistribution}
          title="Vehicle State Distribution"
        />
      </div>

      {/* Charts Row 3 - Full Width */}
      <div style={{ marginBottom: "16px" }}>
        <ResponseTimeChart
          data={responseTimeHistory}
          title="Response Time Trend (seconds)"
        />
      </div>

      {/* Charts Row 4 - Full Width */}
      <div>
        <AlertTimelineChart data={alertsTimeline} title="Recent Alerts Timeline" />
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
