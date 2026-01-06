// Main operations dashboard with map, alerts, and vehicle details

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../services/api";
import { useWebSocket } from "../hooks/useWebSocket";
import { useTheme } from "../contexts/ThemeContext";
import { MapView } from "../components/MapView";
import { AlertList } from "../components/AlertList";
import { VehicleDetail } from "../components/VehicleDetail";
import { IncidentPanel } from "../components/IncidentPanel";
import { ActionButtons } from "../components/ActionButtons";
import { FleetStatusBar } from "../components/FleetStatusBar";
import type { Vehicle, Alert, WebSocketMessage } from "../types";

interface MainDashboardProps {
  demoMode: boolean;
}

export function MainDashboard({ demoMode }: MainDashboardProps) {
  const { theme } = useTheme();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ x: number; y: number } | null>(null);

  // Track demo mode actions to prevent duplicate triggers
  const demoEgoSelectedRef = useRef(false);

  // WebSocket connection status
  const { isConnected } = useWebSocket({
    onMessage: useCallback((message: WebSocketMessage) => {
      console.log("[MainDashboard] WebSocket message received:", message.type, message.data);
      
      if (message.type === "vehicle_updated") {
        const updatedVehicle = message.data as Vehicle;
        setVehicles((prev) => {
          const index = prev.findIndex((v) => v.vehicle_id === updatedVehicle.vehicle_id);
          if (index >= 0) {
            const newVehicles = [...prev];
            newVehicles[index] = updatedVehicle;
            return newVehicles;
          } else {
            return [...prev, updatedVehicle];
          }
        });

        // Demo mode: auto-select ego vehicle
        if (
          demoMode &&
          !demoEgoSelectedRef.current &&
          (updatedVehicle.vehicle_type === "Autonomous Vehicle" || updatedVehicle.vehicle_id.includes("ego"))
        ) {
          setSelectedVehicleId(updatedVehicle.vehicle_id);
          demoEgoSelectedRef.current = true;
        }
      } else if (message.type === "alert_created" || message.type === "alert_updated") {
        const alertData = message.data as Alert;
        console.log("[MainDashboard] Alert update:", alertData.incident_id || alertData.id, alertData.severity);
        setAlerts((prev) => {
          const index = prev.findIndex((a) => a.id === alertData.id);
          if (index >= 0) {
            const newAlerts = [...prev];
            newAlerts[index] = alertData;
            console.log("[MainDashboard] Updated existing alert, total alerts:", newAlerts.length);
            return newAlerts;
          } else {
            const newAlerts = [alertData, ...prev];
            console.log("[MainDashboard] Added new alert, total alerts:", newAlerts.length);
            return newAlerts;
          }
        });
      }
    }, [demoMode]),
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

        // Set map center from first ego vehicle
        const egoVehicle = fetchedVehicles.find(
          (v) => v.vehicle_type === "Autonomous Vehicle" || v.vehicle_id.includes("ego")
        );
        if (egoVehicle && egoVehicle.last_position_x != null && egoVehicle.last_position_y != null) {
          setMapCenter({
            x: egoVehicle.last_position_x,
            y: egoVehicle.last_position_y,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);


  const handleAlertClick = (alert: Alert) => {
    setSelectedAlert(alert);
    // Find and select the vehicle for this alert
    const vehicle = vehicles.find((v) => v.vehicle_id === alert.vehicle_id);
    if (vehicle) {
      setSelectedVehicleId(vehicle.vehicle_id);
    }
  };

  const handleVehicleClick = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
  };

  const handleActionComplete = () => {
    // Refresh data after action
    Promise.all([
      api.getVehicles().then(setVehicles),
      api.getAlerts().then(setAlerts),
    ]).catch(console.error);
  };

  const selectedVehicle = vehicles.find((v) => v.vehicle_id === selectedVehicleId) || null;

  return (
    <>
      {/* Fleet Status Bar */}
      <FleetStatusBar 
        vehicles={vehicles} 
        alerts={alerts} 
        isConnected={isConnected} 
      />

      {/* Main Content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Column: Alert List */}
        <div
          style={{
            width: "320px",
            borderRight: `1px solid ${theme.colors.border}`,
            display: "flex",
            flexDirection: "column",
            backgroundColor: theme.colors.surface,
          }}
        >
          <AlertList alerts={alerts} onAlertClick={handleAlertClick} demoMode={demoMode} />
        </div>

        {/* Center Column: Map */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                fontSize: "14px",
                color: theme.colors.textMuted,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    border: `3px solid ${theme.colors.border}`,
                    borderTopColor: theme.colors.primary,
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                    margin: "0 auto 16px",
                  }}
                />
                Initializing fleet telemetry...
              </div>
            </div>
          ) : error ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                fontSize: "14px",
                color: theme.colors.error,
                gap: "8px",
                padding: "20px",
              }}
            >
              <div style={{ fontSize: "24px" }}>⚠️</div>
              <div>Connection Error</div>
              <div style={{ fontSize: "13px", color: theme.colors.textSecondary }}>
                {error}
              </div>
            </div>
          ) : (
            <MapView
              vehicles={vehicles}
              alerts={alerts}
              selectedVehicleId={selectedVehicleId}
              onVehicleClick={handleVehicleClick}
              mapCenter={mapCenter}
            />
          )}
        </div>

        {/* Right Column: Vehicle Detail, Incident Panel, Actions */}
        <div
          style={{
            width: "380px",
            borderLeft: `1px solid ${theme.colors.border}`,
            display: "flex",
            flexDirection: "column",
            backgroundColor: theme.colors.surface,
            overflowY: "auto",
          }}
        >
          <VehicleDetail vehicle={selectedVehicle} />
          <div style={{ borderTop: `1px solid ${theme.colors.border}` }}>
            <IncidentPanel alert={selectedAlert} />
          </div>
          <div style={{ borderTop: `1px solid ${theme.colors.border}`, marginTop: "auto" }}>
            <ActionButtons
              alert={selectedAlert}
              vehicle={selectedVehicle}
              onActionComplete={handleActionComplete}
            />
          </div>
        </div>
      </div>
    </>
  );
}

