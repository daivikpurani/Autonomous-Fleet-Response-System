// MapboxGL map component with enhanced vehicle visualization and heat map overlay

import { useEffect, useRef, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTheme } from "../contexts/ThemeContext";
import type { Vehicle, VehicleState, Alert } from "../types";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

// Coordinate transformation constants
// This is a visualization mapping, not real geography
const COORD_SCALE = 1e-5; // Scale factor for x,y to lng,lat conversion
const LNG_BASE = -122.4194; // San Francisco as base
const LAT_BASE = 37.7749;

interface MapViewProps {
  vehicles: Vehicle[];
  alerts?: Alert[];
  selectedVehicleId: string | null;
  onVehicleClick: (vehicleId: string) => void;
  mapCenter?: { x: number; y: number } | null;
}

export function MapView({
  vehicles,
  alerts = [],
  selectedVehicleId,
  onVehicleClick,
  mapCenter,
}: MapViewProps) {
  const { theme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [initialCenter, setInitialCenter] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [showHeatMap, setShowHeatMap] = useState(false);
  const heatMapInitialized = useRef(false);

  // Generate heat map GeoJSON from alerts
  const heatMapData = useMemo(() => {
    const openAlerts = alerts.filter((a) => a.status === "OPEN");
    
    // Find vehicle positions for alerts
    const vehiclePositions = new Map<string, { x: number; y: number }>();
    vehicles.forEach((v) => {
      if (v.last_position_x != null && v.last_position_y != null) {
        vehiclePositions.set(v.vehicle_id, {
          x: v.last_position_x,
          y: v.last_position_y,
        });
      }
    });

    // Create GeoJSON features for alerts with positions
    const features = openAlerts
      .filter((alert) => vehiclePositions.has(alert.vehicle_id))
      .map((alert) => {
        const pos = vehiclePositions.get(alert.vehicle_id)!;
        const lng = LNG_BASE + pos.x * COORD_SCALE;
        const lat = LAT_BASE + pos.y * COORD_SCALE;
        
        // Weight by severity: CRITICAL=3, WARNING=2, INFO=1
        const weight =
          alert.severity === "CRITICAL" ? 3 :
          alert.severity === "WARNING" ? 2 : 1;

        return {
          type: "Feature" as const,
          properties: {
            weight,
            severity: alert.severity,
            id: alert.id,
          },
          geometry: {
            type: "Point" as const,
            coordinates: [lng, lat],
          },
        };
      });

    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [alerts, vehicles]);

  // Initialize map center from first ego vehicle or provided center
  useEffect(() => {
    if (initialCenter) return;

    const egoVehicle = vehicles.find(
      (v) => v.vehicle_type === "Autonomous Vehicle" || v.vehicle_id.includes("ego")
    );
    const centerVehicle = egoVehicle || vehicles[0];

    if (centerVehicle != null && centerVehicle.last_position_x != null && centerVehicle.last_position_y != null) {
      const lng = LNG_BASE + centerVehicle.last_position_x * COORD_SCALE;
      const lat = LAT_BASE + centerVehicle.last_position_y * COORD_SCALE;
      setInitialCenter({ lng, lat });
    } else if (mapCenter) {
      const lng = LNG_BASE + mapCenter.x * COORD_SCALE;
      const lat = LAT_BASE + mapCenter.y * COORD_SCALE;
      setInitialCenter({ lng, lat });
    }
  }, [vehicles, mapCenter, initialCenter]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || !MAPBOX_TOKEN || initialCenter === null) return;

    const mapStyle =
      theme.mode === "dark"
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/streets-v12";

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: [initialCenter.lng, initialCenter.lat],
      zoom: 15,
      accessToken: MAPBOX_TOKEN,
    });

    mapRef.current = map;
    heatMapInitialized.current = false;

    // Add heat map layer when map loads
    map.on("load", () => {
      // Add heat map source
      map.addSource("alerts-heat", {
        type: "geojson",
        data: heatMapData,
      });

      // Add heat map layer
      map.addLayer({
        id: "alerts-heat-layer",
        type: "heatmap",
        source: "alerts-heat",
        paint: {
          // Weight based on severity
          "heatmap-weight": ["get", "weight"],
          // Intensity
          "heatmap-intensity": 1.5,
          // Color gradient
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(33,102,172,0)",
            0.2, "rgb(103,169,207)",
            0.4, "rgb(209,229,240)",
            0.6, "rgb(253,219,199)",
            0.8, "rgb(239,138,98)",
            1, "rgb(178,24,43)",
          ],
          // Radius
          "heatmap-radius": 40,
          // Opacity
          "heatmap-opacity": showHeatMap ? 0.8 : 0,
        },
      });

      heatMapInitialized.current = true;
    });

    return () => {
      map.remove();
      mapRef.current = null;
      heatMapInitialized.current = false;
    };
  }, [initialCenter, theme.mode]);

  // Update heat map data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !heatMapInitialized.current) return;

    const source = map.getSource("alerts-heat") as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(heatMapData);
    }
  }, [heatMapData]);

  // Toggle heat map visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !heatMapInitialized.current) return;

    map.setPaintProperty(
      "alerts-heat-layer",
      "heatmap-opacity",
      showHeatMap ? 0.8 : 0
    );
  }, [showHeatMap]);

  // Update vehicle markers
  useEffect(() => {
    if (!mapRef.current || initialCenter === null) return;

    const map = mapRef.current;

    // Remove markers for vehicles that no longer exist
    const currentVehicleIds = new Set(vehicles.map((v) => v.vehicle_id));
    for (const [vehicleId, marker] of markersRef.current.entries()) {
      if (!currentVehicleIds.has(vehicleId)) {
        marker.remove();
        markersRef.current.delete(vehicleId);
      }
    }

    // Update or create markers
    vehicles.forEach((vehicle) => {
      if (
        vehicle.last_position_x === null ||
        vehicle.last_position_y === null
      ) {
        return;
      }

      const lng = LNG_BASE + vehicle.last_position_x * COORD_SCALE;
      const lat = LAT_BASE + vehicle.last_position_y * COORD_SCALE;

      // Get color based on state
      const getStateColor = (state: VehicleState): string => {
        switch (state) {
          case "NORMAL":
            return theme.colors.success;
          case "ALERTING":
            return theme.colors.warning;
          case "UNDER_INTERVENTION":
            return theme.colors.critical;
          default:
            return theme.colors.textMuted;
        }
      };

      const isEgo = vehicle.vehicle_type === "Autonomous Vehicle" || vehicle.vehicle_id.includes("ego");
      const isSelected = vehicle.vehicle_id === selectedVehicleId;
      const baseSize = isEgo ? 16 : 10;
      const size = isSelected ? baseSize + 4 : baseSize;
      const color = getStateColor(vehicle.state);
      
      const rotationDeg = vehicle.last_yaw != null 
        ? (90 - (vehicle.last_yaw * 180 / Math.PI)) % 360 
        : 0;

      const existingMarker = markersRef.current.get(vehicle.vehicle_id);

      if (existingMarker) {
        existingMarker.setLngLat([lng, lat]);
        const el = existingMarker.getElement();
        if (el) {
          updateMarkerElement(el, vehicle, isEgo, isSelected, size, color, rotationDeg);
        }
      } else {
        const el = createMarkerElement(vehicle, isEgo, isSelected, size, color, rotationDeg);

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);

        el.addEventListener("click", () => {
          onVehicleClick(vehicle.vehicle_id);
        });

        markersRef.current.set(vehicle.vehicle_id, marker);
      }
    });
  }, [vehicles, selectedVehicleId, onVehicleClick, initialCenter, theme]);

  // Helper to create marker element
  const createMarkerElement = (
    vehicle: Vehicle,
    isEgo: boolean,
    isSelected: boolean,
    size: number,
    color: string,
    rotationDeg: number
  ): HTMLDivElement => {
    const el = document.createElement("div");
    el.className = "vehicle-marker";
    updateMarkerElement(el, vehicle, isEgo, isSelected, size, color, rotationDeg);
    return el;
  };

  // Helper to update marker element styles
  const updateMarkerElement = (
    el: HTMLElement,
    vehicle: Vehicle,
    isEgo: boolean,
    isSelected: boolean,
    size: number,
    color: string,
    rotationDeg: number
  ) => {
    const showHeading = vehicle.last_yaw != null;
    
    if (isEgo) {
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.borderRadius = "0";
      el.style.backgroundColor = "transparent";
      el.style.border = "none";
      el.style.cursor = "pointer";
      el.style.transform = showHeading ? `rotate(${rotationDeg}deg)` : "";
      el.style.transition = "transform 0.3s ease-out";
      
      el.style.borderLeft = `${size / 2}px solid transparent`;
      el.style.borderRight = `${size / 2}px solid transparent`;
      el.style.borderBottom = `${size}px solid ${color}`;
      
      if (isSelected) {
        el.style.filter = `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 8px ${color})`;
      } else {
        el.style.filter = `drop-shadow(0 2px 3px rgba(0,0,0,0.3))`;
      }
    } else {
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.borderRadius = "50%";
      el.style.backgroundColor = color;
      el.style.border = isSelected 
        ? `2px solid ${theme.mode === "dark" ? "#fff" : "#000"}`
        : `1px solid ${color}`;
      el.style.cursor = "pointer";
      el.style.boxShadow = isSelected 
        ? `0 0 8px ${color}, 0 0 16px ${color}`
        : theme.mode === "dark" 
          ? "0 2px 4px rgba(0,0,0,0.5)"
          : "0 2px 4px rgba(0,0,0,0.3)";
      
      el.style.borderLeft = "";
      el.style.borderRight = "";
      el.style.borderBottom = "";
      el.style.transform = "";
      el.style.filter = "";
    }
  };

  // Count open alerts for toggle badge
  const openAlertCount = alerts.filter((a) => a.status === "OPEN").length;

  if (!MAPBOX_TOKEN) {
    return (
      <div 
        style={{ 
          padding: "40px", 
          textAlign: "center", 
          color: theme.colors.textSecondary,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          backgroundColor: theme.colors.background,
        }}
      >
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>🗺️</div>
        <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>
          Map Not Configured
        </div>
        <div style={{ fontSize: "12px", color: theme.colors.textMuted, maxWidth: "300px" }}>
          Set <code style={{ 
            backgroundColor: theme.colors.surfaceSecondary, 
            padding: "2px 6px", 
            borderRadius: "4px",
            fontFamily: theme.fonts.mono,
          }}>VITE_MAPBOX_TOKEN</code> environment variable to enable the map view.
        </div>
      </div>
    );
  }

  if (initialCenter === null) {
    return (
      <div 
        style={{ 
          padding: "40px", 
          textAlign: "center", 
          color: theme.colors.textMuted,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            border: `3px solid ${theme.colors.border}`,
            borderTopColor: theme.colors.primary,
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            marginBottom: "16px",
          }}
        />
        <div style={{ fontSize: "13px" }}>Waiting for vehicle telemetry...</div>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: "400px" }}>
      <div
        ref={mapContainerRef}
        style={{ width: "100%", height: "100%" }}
      />
      
      {/* Heat Map Toggle Button */}
      <button
        onClick={() => setShowHeatMap(!showHeatMap)}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          padding: "8px 12px",
          borderRadius: "8px",
          border: `1px solid ${showHeatMap ? theme.colors.warning : theme.colors.border}`,
          backgroundColor: showHeatMap ? theme.colors.warningMuted : theme.colors.surface,
          color: showHeatMap ? theme.colors.warning : theme.colors.text,
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "6px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          transition: "all 0.2s",
          zIndex: 10,
        }}
        title={showHeatMap ? "Hide incident heat map" : "Show incident heat map"}
      >
        <span style={{ fontSize: "14px" }}>🔥</span>
        Heat Map
        {openAlertCount > 0 && (
          <span
            style={{
              backgroundColor: theme.colors.warning,
              color: "#000",
              borderRadius: "10px",
              padding: "2px 6px",
              fontSize: "10px",
              fontWeight: 700,
              minWidth: "18px",
              textAlign: "center",
            }}
          >
            {openAlertCount}
          </span>
        )}
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: showHeatMap ? theme.colors.success : theme.colors.textMuted,
          }}
        />
      </button>

      {/* Heat Map Legend */}
      {showHeatMap && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            right: "10px",
            padding: "10px 12px",
            borderRadius: "8px",
            backgroundColor: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            fontSize: "11px",
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: theme.colors.textSecondary,
              marginBottom: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Incident Density
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span style={{ color: theme.colors.textMuted }}>Low</span>
            <div
              style={{
                width: "100px",
                height: "10px",
                borderRadius: "5px",
                background: "linear-gradient(to right, rgb(103,169,207), rgb(209,229,240), rgb(253,219,199), rgb(239,138,98), rgb(178,24,43))",
              }}
            />
            <span style={{ color: theme.colors.textMuted }}>High</span>
          </div>
        </div>
      )}
    </div>
  );
}
