// Metrics calculation hook for real-time KPIs and historical data

import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../services/api";
import { useWebSocket } from "./useWebSocket";
import type {
  Alert,
  Vehicle,
  MetricSnapshot,
  WebSocketMessage,
  ChartDataPoint,
  SeverityDistribution,
  VehicleStateDistribution,
} from "../types";

const MAX_HISTORY_POINTS = 60; // 5 minutes at 5-second intervals
const UPDATE_INTERVAL_MS = 5000; // Update every 5 seconds

export interface MetricsData {
  current: MetricSnapshot;
  history: ChartDataPoint[];
  severityDistribution: SeverityDistribution[];
  vehicleStateDistribution: VehicleStateDistribution[];
  alertsTimeline: ChartDataPoint[];
  responseTimeHistory: ChartDataPoint[];
  isConnected: boolean;
  loading: boolean;
  error: string | null;
}

export function useMetrics(): MetricsData {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [history, setHistory] = useState<ChartDataPoint[]>([]);
  const [responseTimeHistory, setResponseTimeHistory] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WebSocket for real-time updates
  const { isConnected } = useWebSocket({
    onMessage: useCallback((message: WebSocketMessage) => {
      if (message.type === "vehicle_updated") {
        const updatedVehicle = message.data as Vehicle;
        setVehicles((prev) => {
          const index = prev.findIndex((v) => v.vehicle_id === updatedVehicle.vehicle_id);
          if (index >= 0) {
            const newVehicles = [...prev];
            newVehicles[index] = updatedVehicle;
            return newVehicles;
          }
          return [...prev, updatedVehicle];
        });
      } else if (message.type === "alert_created" || message.type === "alert_updated") {
        const alertData = message.data as Alert;
        setAlerts((prev) => {
          const index = prev.findIndex((a) => a.id === alertData.id);
          if (index >= 0) {
            const newAlerts = [...prev];
            newAlerts[index] = alertData;
            return newAlerts;
          }
          return [alertData, ...prev];
        });
      }
    }, []),
  });

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const [fetchedVehicles, fetchedAlerts] = await Promise.all([
          api.getVehicles(),
          api.getAlerts(),
        ]);
        setVehicles(fetchedVehicles);
        setAlerts(fetchedAlerts);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Calculate current metrics
  const current = useMemo((): MetricSnapshot => {
    const openAlerts = alerts.filter((a) => a.status === "OPEN");
    const acknowledgedAlerts = alerts.filter((a) => a.status === "ACKNOWLEDGED");
    
    // Alerts per minute (last 60 seconds)
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const recentAlerts = alerts.filter(
      (a) => new Date(a.created_at) >= oneMinuteAgo
    );
    const alertsPerMinute = recentAlerts.length;

    // Average response time (time to acknowledge)
    const acknowledgedWithTime = acknowledgedAlerts.filter(
      (a) => a.created_at && a.updated_at
    );
    const avgResponseTimeMs = acknowledgedWithTime.length > 0
      ? acknowledgedWithTime.reduce((sum, a) => {
          const created = new Date(a.created_at).getTime();
          const updated = new Date(a.updated_at).getTime();
          return sum + (updated - created);
        }, 0) / acknowledgedWithTime.length
      : 0;

    // Vehicle states
    const normalVehicles = vehicles.filter((v) => v.state === "NORMAL").length;
    const alertingVehicles = vehicles.filter((v) => v.state === "ALERTING").length;
    const interventionVehicles = vehicles.filter((v) => v.state === "UNDER_INTERVENTION").length;
    const totalVehicles = vehicles.length;

    // Fleet health percentage
    const fleetHealthPercent = totalVehicles > 0
      ? (normalVehicles / totalVehicles) * 100
      : 100;

    // Severity counts
    const criticalCount = openAlerts.filter((a) => a.severity === "CRITICAL").length;
    const warningCount = openAlerts.filter((a) => a.severity === "WARNING").length;
    const infoCount = openAlerts.filter((a) => a.severity === "INFO").length;

    return {
      timestamp: new Date(),
      alertsPerMinute,
      avgResponseTimeMs,
      fleetHealthPercent,
      criticalCount,
      warningCount,
      infoCount,
      totalAlerts: openAlerts.length,
      normalVehicles,
      alertingVehicles,
      interventionVehicles,
      totalVehicles,
    };
  }, [alerts, vehicles]);

  // Update history periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const label = new Date(now).toLocaleTimeString("en-US", {
        hour12: false,
        minute: "2-digit",
        second: "2-digit",
      });

      // Add to alerts history
      setHistory((prev) => {
        const newPoint: ChartDataPoint = {
          timestamp: now,
          label,
          value: current.alertsPerMinute,
        };
        const updated = [...prev, newPoint];
        return updated.slice(-MAX_HISTORY_POINTS);
      });

      // Add to response time history
      setResponseTimeHistory((prev) => {
        const newPoint: ChartDataPoint = {
          timestamp: now,
          label,
          value: current.avgResponseTimeMs / 1000, // Convert to seconds
        };
        const updated = [...prev, newPoint];
        return updated.slice(-MAX_HISTORY_POINTS);
      });
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [current.alertsPerMinute, current.avgResponseTimeMs]);

  // Severity distribution for pie chart
  const severityDistribution = useMemo((): SeverityDistribution[] => {
    const openAlerts = alerts.filter((a) => a.status === "OPEN");
    return [
      { name: "Critical", value: openAlerts.filter((a) => a.severity === "CRITICAL").length, color: "#ef4444" },
      { name: "Warning", value: openAlerts.filter((a) => a.severity === "WARNING").length, color: "#f59e0b" },
      { name: "Info", value: openAlerts.filter((a) => a.severity === "INFO").length, color: "#3b82f6" },
    ].filter((d) => d.value > 0);
  }, [alerts]);

  // Vehicle state distribution for bar chart
  const vehicleStateDistribution = useMemo((): VehicleStateDistribution[] => {
    return [
      { name: "Normal", value: vehicles.filter((v) => v.state === "NORMAL").length, color: "#22c55e" },
      { name: "Alerting", value: vehicles.filter((v) => v.state === "ALERTING").length, color: "#f59e0b" },
      { name: "Intervention", value: vehicles.filter((v) => v.state === "UNDER_INTERVENTION").length, color: "#ef4444" },
    ];
  }, [vehicles]);

  // Alerts timeline (last 30 alerts with creation time)
  const alertsTimeline = useMemo((): ChartDataPoint[] => {
    return alerts
      .slice(0, 30)
      .map((a) => {
        const created = new Date(a.created_at);
        return {
          timestamp: created.getTime(),
          label: created.toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          value: a.severity === "CRITICAL" ? 3 : a.severity === "WARNING" ? 2 : 1,
        };
      })
      .reverse();
  }, [alerts]);

  return {
    current,
    history,
    severityDistribution,
    vehicleStateDistribution,
    alertsTimeline,
    responseTimeHistory,
    isConnected,
    loading,
    error,
  };
}

