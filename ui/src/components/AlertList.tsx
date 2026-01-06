// Alert list component with vehicle grouping for clean demo presentations

import { useState, useMemo, useEffect, useRef } from "react";
import type { Alert, AlertStatus, Severity } from "../types";
import { useTheme } from "../contexts/ThemeContext";

interface AlertListProps {
  alerts: Alert[];
  onAlertClick: (alert: Alert) => void;
  demoMode?: boolean;
}

// Interface for grouped vehicle alerts
interface VehicleAlertGroup {
  vehicleId: string;
  vehicleDisplayId: string;
  vehicleType: string;
  highestSeverity: Severity;
  alertCount: number;
  openCount: number;
  uniqueRuleNames: string[];
  latestAlert: Alert;
  alerts: Alert[];
  lastUpdated: string;
}

// Severity priority for comparison (higher = more severe)
const SEVERITY_PRIORITY: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  INFO: 1,
};

// Helper to get relative time string
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleDateString();
}

// Format rule name for display
function formatRuleName(ruleName: string): string {
  return ruleName
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace("Sudden Deceleration", "Hard Brake")
    .replace("Perception Instability", "Perception")
    .replace("Dropout Proxy", "Sensor Gap");
}

export function AlertList({ alerts: allAlerts, onAlertClick, demoMode = false }: AlertListProps) {
  const { theme } = useTheme();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    status?: AlertStatus;
    severity?: Severity;
    vehicleId?: string;
  }>({});

  // Store the latest onAlertClick callback in a ref
  const onAlertClickRef = useRef(onAlertClick);
  useEffect(() => {
    onAlertClickRef.current = onAlertClick;
  }, [onAlertClick]);

  // Filter alerts first
  const filteredAlerts = useMemo(() => {
    let result = allAlerts;

    if (filters.status) {
      result = result.filter((alert) => alert.status === filters.status);
    }

    if (filters.severity) {
      result = result.filter((alert) => alert.severity === filters.severity);
    }

    if (filters.vehicleId) {
      const searchTerm = filters.vehicleId.toLowerCase();
      result = result.filter((alert) =>
        alert.vehicle_id.toLowerCase().includes(searchTerm) ||
        (alert.vehicle_display_id && alert.vehicle_display_id.toLowerCase().includes(searchTerm))
      );
    }

    return result;
  }, [allAlerts, filters]);

  // Group alerts by vehicle
  const vehicleGroups = useMemo(() => {
    const groupMap = new Map<string, VehicleAlertGroup>();

    for (const alert of filteredAlerts) {
      const vehicleId = alert.vehicle_id;
      
      if (!groupMap.has(vehicleId)) {
        // Determine vehicle type from display ID
        const displayId = alert.vehicle_display_id || vehicleId;
        const isAV = displayId.startsWith("AV-") || vehicleId.includes("ego");
        
        groupMap.set(vehicleId, {
          vehicleId,
          vehicleDisplayId: displayId,
          vehicleType: isAV ? "Autonomous Vehicle" : "Tracked Vehicle",
          highestSeverity: alert.severity,
          alertCount: 0,
          openCount: 0,
          uniqueRuleNames: [],
          latestAlert: alert,
          alerts: [],
          lastUpdated: alert.last_seen_event_time,
        });
      }

      const group = groupMap.get(vehicleId)!;
      group.alerts.push(alert);
      group.alertCount++;
      
      if (alert.status === "OPEN") {
        group.openCount++;
      }

      // Update highest severity
      if (SEVERITY_PRIORITY[alert.severity] > SEVERITY_PRIORITY[group.highestSeverity]) {
        group.highestSeverity = alert.severity;
      }

      // Track unique rule names
      const ruleName = alert.rule_display_name || alert.rule_name;
      if (!group.uniqueRuleNames.includes(ruleName)) {
        group.uniqueRuleNames.push(ruleName);
      }

      // Update latest alert if newer
      if (new Date(alert.last_seen_event_time) > new Date(group.lastUpdated)) {
        group.lastUpdated = alert.last_seen_event_time;
        group.latestAlert = alert;
      }
    }

    // Convert to array and sort by severity (highest first), then by last updated
    return Array.from(groupMap.values()).sort((a, b) => {
      const severityDiff = SEVERITY_PRIORITY[b.highestSeverity] - SEVERITY_PRIORITY[a.highestSeverity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    });
  }, [filteredAlerts]);

  // Demo mode: auto-select first vehicle with CRITICAL alert
  useEffect(() => {
    if (demoMode && vehicleGroups.length > 0 && !selectedVehicleId) {
      const criticalGroup = vehicleGroups.find((g) => g.highestSeverity === "CRITICAL");
      const targetGroup = criticalGroup || vehicleGroups[0];
      setSelectedVehicleId(targetGroup.vehicleId);
      onAlertClickRef.current(targetGroup.latestAlert);
    }
  }, [demoMode, vehicleGroups, selectedVehicleId]);

  const handleStatusChange = (status: AlertStatus | "") => {
    setFilters((prev) => ({ ...prev, status: status || undefined }));
  };

  const handleSeverityChange = (severity: Severity | "") => {
    setFilters((prev) => ({ ...prev, severity: severity || undefined }));
  };

  const handleVehicleIdChange = (vehicleId: string) => {
    setFilters((prev) => ({ ...prev, vehicleId: vehicleId || undefined }));
  };

  const handleGroupClick = (group: VehicleAlertGroup) => {
    setSelectedVehicleId(group.vehicleId);
    onAlertClick(group.latestAlert);
    
    // Toggle expansion on second click
    if (selectedVehicleId === group.vehicleId) {
      setExpandedVehicleId(expandedVehicleId === group.vehicleId ? null : group.vehicleId);
    }
  };

  const handleAlertClick = (alert: Alert, e: React.MouseEvent) => {
    e.stopPropagation();
    onAlertClick(alert);
  };

  const getSeverityConfig = (severity: Severity) => {
    switch (severity) {
      case "CRITICAL":
        return { 
          color: theme.colors.critical, 
          bg: theme.colors.criticalMuted,
          label: "CRIT"
        };
      case "WARNING":
        return { 
          color: theme.colors.warning, 
          bg: theme.colors.warningMuted,
          label: "WARN"
        };
      case "INFO":
        return { 
          color: theme.colors.info, 
          bg: theme.colors.infoMuted,
          label: "INFO"
        };
      default:
        return { color: theme.colors.textMuted, bg: theme.colors.surfaceSecondary, label: "?" };
    }
  };

  // Count total alerts by severity
  const alertCounts = useMemo(() => {
    const openAlerts = filteredAlerts.filter((a) => a.status === "OPEN");
    return {
      critical: openAlerts.filter((a) => a.severity === "CRITICAL").length,
      warning: openAlerts.filter((a) => a.severity === "WARNING").length,
      info: openAlerts.filter((a) => a.severity === "INFO").length,
      total: openAlerts.length,
      vehicleCount: vehicleGroups.length,
    };
  }, [filteredAlerts, vehicleGroups]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "16px", borderBottom: `1px solid ${theme.colors.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <h2 style={{ 
            margin: 0, 
            fontSize: "14px", 
            fontWeight: 700, 
            color: theme.colors.text,
            letterSpacing: "0.5px",
          }}>
            VEHICLES WITH ALERTS
          </h2>
          <span
            style={{
              fontSize: "12px",
              fontFamily: theme.fonts.mono,
              fontWeight: 600,
              color: alertCounts.vehicleCount > 0 ? theme.colors.warning : theme.colors.textMuted,
              padding: "2px 8px",
              backgroundColor: alertCounts.vehicleCount > 0 ? theme.colors.warningMuted : theme.colors.surfaceSecondary,
              borderRadius: "4px",
            }}
          >
            {alertCounts.vehicleCount}
          </span>
        </div>

        {/* Quick Stats */}
        {alertCounts.total > 0 && (
          <div style={{ 
            display: "flex", 
            gap: "8px", 
            marginBottom: "12px",
            flexWrap: "wrap",
          }}>
            {alertCounts.critical > 0 && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: theme.colors.criticalMuted,
                  color: theme.colors.critical,
                }}
              >
                {alertCounts.critical} Critical
              </span>
            )}
            {alertCounts.warning > 0 && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: theme.colors.warningMuted,
                  color: theme.colors.warning,
                }}
              >
                {alertCounts.warning} Warning
              </span>
            )}
            {alertCounts.info > 0 && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: theme.colors.infoMuted,
                  color: theme.colors.info,
                }}
              >
                {alertCounts.info} Info
              </span>
            )}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <select
              value={filters.status || ""}
              onChange={(e) => handleStatusChange(e.target.value as AlertStatus | "")}
              style={{
                flex: 1,
                padding: "6px 8px",
                backgroundColor: theme.colors.surfaceSecondary,
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: "6px",
                fontSize: "12px",
              }}
            >
              <option value="">All Status</option>
              <option value="OPEN">Open</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
              <option value="RESOLVED">Resolved</option>
            </select>

            <select
              value={filters.severity || ""}
              onChange={(e) => handleSeverityChange(e.target.value as Severity | "")}
              style={{
                flex: 1,
                padding: "6px 8px",
                backgroundColor: theme.colors.surfaceSecondary,
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: "6px",
                fontSize: "12px",
              }}
            >
              <option value="">All Severity</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARNING">Warning</option>
              <option value="INFO">Info</option>
            </select>
          </div>

          <input
            type="text"
            value={filters.vehicleId || ""}
            onChange={(e) => handleVehicleIdChange(e.target.value)}
            placeholder="Search vehicle..."
            style={{
              width: "100%",
              padding: "6px 10px",
              backgroundColor: theme.colors.surfaceSecondary,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: "6px",
              fontSize: "12px",
            }}
          />
        </div>
      </div>

      {/* Vehicle Alert Groups */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px",
        }}
      >
        {vehicleGroups.length === 0 ? (
          <div style={{ 
            padding: "40px 20px", 
            textAlign: "center", 
            color: theme.colors.textMuted,
          }}>
            <div style={{ fontSize: "24px", marginBottom: "8px" }}>✓</div>
            <div style={{ fontSize: "13px" }}>All vehicles nominal</div>
          </div>
        ) : (
          vehicleGroups.map((group, index) => {
            const isSelected = selectedVehicleId === group.vehicleId;
            const isExpanded = expandedVehicleId === group.vehicleId;
            const severityConfig = getSeverityConfig(group.highestSeverity);
            const isNew = index === 0 && Date.now() - new Date(group.lastUpdated).getTime() < 5000;
            const isAV = group.vehicleType === "Autonomous Vehicle";

            return (
              <div key={group.vehicleId}>
                {/* Vehicle Group Card */}
                <div
                  onClick={() => handleGroupClick(group)}
                  style={{
                    padding: "12px",
                    marginBottom: isExpanded ? "0" : "8px",
                    borderRadius: isExpanded ? "8px 8px 0 0" : "8px",
                    cursor: "pointer",
                    backgroundColor: isSelected 
                      ? theme.colors.selected 
                      : theme.colors.surfaceSecondary,
                    border: `2px solid ${isSelected 
                      ? theme.colors.primary 
                      : group.highestSeverity === "CRITICAL" && group.openCount > 0
                        ? theme.colors.critical
                        : theme.colors.borderSubtle}`,
                    borderBottom: isExpanded ? "none" : undefined,
                    transition: "all 0.2s",
                    animation: isNew ? "slideIn 0.3s ease-out" : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = theme.colors.hover;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = theme.colors.surfaceSecondary;
                    }
                  }}
                >
                  {/* Top Row: Vehicle ID & Severity */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div
                        style={{
                          fontFamily: theme.fonts.mono,
                          fontSize: "14px",
                          fontWeight: 700,
                          color: theme.colors.text,
                        }}
                      >
                        {group.vehicleDisplayId}
                      </div>
                      {isAV && (
                        <span
                          style={{
                            fontSize: "9px",
                            fontWeight: 700,
                            padding: "2px 5px",
                            borderRadius: "3px",
                            backgroundColor: theme.colors.primaryMuted,
                            color: theme.colors.primary,
                            letterSpacing: "0.5px",
                          }}
                        >
                          AV
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        padding: "3px 10px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 700,
                        backgroundColor: severityConfig.bg,
                        color: severityConfig.color,
                        letterSpacing: "0.5px",
                      }}
                    >
                      {severityConfig.label}
                    </div>
                  </div>

                  {/* Rule Types Summary */}
                  <div
                    style={{
                      fontSize: "11px",
                      color: theme.colors.textSecondary,
                      marginBottom: "8px",
                      lineHeight: "1.4",
                    }}
                  >
                    {group.uniqueRuleNames.slice(0, 3).map(formatRuleName).join(" • ")}
                    {group.uniqueRuleNames.length > 3 && ` +${group.uniqueRuleNames.length - 3} more`}
                  </div>

                  {/* Bottom Row: Incident Count & Time */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                          backgroundColor: group.openCount > 0 
                            ? theme.colors.errorMuted 
                            : theme.colors.successMuted,
                          color: group.openCount > 0 
                            ? theme.colors.error 
                            : theme.colors.success,
                        }}
                      >
                        {group.openCount > 0 
                          ? `${group.openCount} open` 
                          : "resolved"}
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 500,
                          color: theme.colors.textMuted,
                          fontFamily: theme.fonts.mono,
                        }}
                      >
                        {group.alertCount} total
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ 
                        color: theme.colors.textMuted, 
                        fontFamily: theme.fonts.mono,
                        fontSize: "10px",
                      }}>
                        {getRelativeTime(group.lastUpdated)}
                      </span>
                      <span style={{ 
                        fontSize: "10px", 
                        color: theme.colors.textMuted,
                        transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.2s",
                      }}>
                        ▼
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Alerts List */}
                {isExpanded && (
                  <div
                    style={{
                      backgroundColor: theme.colors.surfaceSecondary,
                      border: `2px solid ${isSelected ? theme.colors.primary : theme.colors.borderSubtle}`,
                      borderTop: "none",
                      borderRadius: "0 0 8px 8px",
                      marginBottom: "8px",
                      padding: "8px",
                      maxHeight: "200px",
                      overflowY: "auto",
                    }}
                  >
                    {group.alerts
                      .sort((a, b) => SEVERITY_PRIORITY[b.severity] - SEVERITY_PRIORITY[a.severity])
                      .map((alert) => {
                        const alertSeverity = getSeverityConfig(alert.severity);
                        return (
                          <div
                            key={alert.id}
                            onClick={(e) => handleAlertClick(alert, e)}
                            style={{
                              padding: "8px 10px",
                              marginBottom: "4px",
                              borderRadius: "4px",
                              backgroundColor: theme.colors.surface,
                              border: `1px solid ${theme.colors.borderSubtle}`,
                              cursor: "pointer",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              transition: "background-color 0.15s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = theme.colors.hover;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = theme.colors.surface;
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span
                                style={{
                                  width: "6px",
                                  height: "6px",
                                  borderRadius: "50%",
                                  backgroundColor: alertSeverity.color,
                                }}
                              />
                              <span style={{ 
                                fontSize: "11px", 
                                fontFamily: theme.fonts.mono,
                                color: theme.colors.text,
                              }}>
                                {alert.incident_id || `INC-${alert.id.slice(0, 5).toUpperCase()}`}
                              </span>
                              <span style={{ 
                                fontSize: "10px", 
                                color: theme.colors.textSecondary,
                              }}>
                                {formatRuleName(alert.rule_display_name || alert.rule_name)}
                              </span>
                            </div>
                            <span style={{ 
                              fontSize: "9px", 
                              color: theme.colors.textMuted,
                              fontFamily: theme.fonts.mono,
                            }}>
                              {getRelativeTime(alert.last_seen_event_time)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
