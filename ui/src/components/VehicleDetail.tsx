// Vehicle detail panel component

import type { Vehicle, VehicleState } from "../types";
import { useTheme } from "../contexts/ThemeContext";

interface VehicleDetailProps {
  vehicle: Vehicle | null;
}

export function VehicleDetail({ vehicle }: VehicleDetailProps) {
  const { theme } = useTheme();

  if (!vehicle) {
    return (
      <div style={{ padding: "16px", color: theme.colors.textMuted, textAlign: "center" }}>
        Select a vehicle to view details
      </div>
    );
  }

  const getStateColor = (state: VehicleState): string => {
    switch (state) {
      case "NORMAL":
        return "#4caf50";
      case "ALERTING":
        return "#ff6b35";
      case "UNDER_INTERVENTION":
        return "#d32f2f";
      default:
        return "#888";
    }
  };

  return (
    <div style={{ padding: "16px" }}>
      <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", color: theme.colors.text }}>
        Vehicle Details
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <div
            style={{ fontSize: "12px", color: theme.colors.textSecondary, marginBottom: "4px" }}
          >
            Vehicle ID
          </div>
          <div style={{ fontSize: "14px", fontWeight: "bold", color: theme.colors.text }}>
            {vehicle.vehicle_id}
          </div>
        </div>

        <div>
          <div
            style={{ fontSize: "12px", color: theme.colors.textSecondary, marginBottom: "4px" }}
          >
            State
          </div>
          <div
            style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: "bold",
              backgroundColor: getStateColor(vehicle.state),
              color: "#fff",
            }}
          >
            {vehicle.state}
          </div>
        </div>

        {vehicle.assigned_operator && (
          <div>
            <div
              style={{ fontSize: "12px", color: theme.colors.textSecondary, marginBottom: "4px" }}
            >
              Assigned Operator
            </div>
            <div style={{ fontSize: "14px", color: theme.colors.text }}>
              {vehicle.assigned_operator}
            </div>
          </div>
        )}

        <div>
          <div
            style={{ fontSize: "12px", color: theme.colors.textSecondary, marginBottom: "4px" }}
          >
            Open Alerts
          </div>
          <div style={{ fontSize: "14px", fontWeight: "bold", color: theme.colors.text }}>
            {vehicle.open_alerts_count}
          </div>
        </div>

        {vehicle.last_position_x !== null && vehicle.last_position_y !== null && (
          <div>
            <div
              style={{ fontSize: "12px", color: theme.colors.textSecondary, marginBottom: "4px" }}
            >
              Position
            </div>
            <div style={{ fontSize: "12px", fontFamily: "monospace", color: theme.colors.text }}>
              X: {vehicle.last_position_x.toFixed(2)} m
              <br />
              Y: {vehicle.last_position_y.toFixed(2)} m
            </div>
          </div>
        )}

        <div>
          <div
            style={{ fontSize: "12px", color: theme.colors.textSecondary, marginBottom: "4px" }}
          >
            Last Updated
          </div>
          <div style={{ fontSize: "12px", color: theme.colors.text }}>
            {new Date(vehicle.updated_at).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
