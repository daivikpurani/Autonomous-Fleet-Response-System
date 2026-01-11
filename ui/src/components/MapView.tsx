// MapboxGL map component with enhanced vehicle visualization and heat map overlay

import { useEffect, useRef, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTheme } from "../contexts/ThemeContext";
import type { Vehicle, VehicleState, Alert } from "../types";
import { 
  assignVehicleToRoute, 
  mapPositionToRoute, 
  getRoutesCenter,
  type MappedPosition 
} from "../utils/syntheticRoutes";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

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

  // Helper to get mapped coordinates for a vehicle
  const getMappedPosition = (vehicleId: string, x: number, y: number): MappedPosition => {
    const route = assignVehicleToRoute(vehicleId);
    return mapPositionToRoute(x, y, route);
  };

  // Generate heat map GeoJSON from alerts
  const heatMapData = useMemo(() => {
    const openAlerts = alerts.filter((a) => a.status === "OPEN");
    
    // Find vehicle positions for alerts
    const vehiclePositions = new Map<string, { x: number; y: number; vehicleId: string }>();
    vehicles.forEach((v) => {
      if (v.last_position_x != null && v.last_position_y != null) {
        vehiclePositions.set(v.vehicle_id, {
          x: v.last_position_x,
          y: v.last_position_y,
          vehicleId: v.vehicle_id,
        });
      }
    });

    // Create GeoJSON features for alerts with positions
    const features = openAlerts
      .filter((alert) => vehiclePositions.has(alert.vehicle_id))
      .map((alert) => {
        const pos = vehiclePositions.get(alert.vehicle_id)!;
        // Use synthetic route mapping for realistic positioning
        const mapped = getMappedPosition(pos.vehicleId, pos.x, pos.y);
        
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
            coordinates: [mapped.lng, mapped.lat],
          },
        };
      });

    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [alerts, vehicles]);

  // Initialize map center from first ego vehicle or SF routes center
  useEffect(() => {
    if (initialCenter) return;

    const egoVehicle = vehicles.find(
      (v) => v.vehicle_type === "Autonomous Vehicle" || v.vehicle_id.includes("ego")
    );
    const centerVehicle = egoVehicle || vehicles[0];

    if (centerVehicle != null && centerVehicle.last_position_x != null && centerVehicle.last_position_y != null) {
      // Use synthetic route mapping for centering
      const mapped = getMappedPosition(
        centerVehicle.vehicle_id,
        centerVehicle.last_position_x,
        centerVehicle.last_position_y
      );
      setInitialCenter({ lng: mapped.lng, lat: mapped.lat });
    } else if (mapCenter) {
      // Use routes center as fallback
      const routesCenter = getRoutesCenter();
      setInitialCenter({ lng: routesCenter.lng, lat: routesCenter.lat });
    } else if (vehicles.length === 0) {
      // Default to SF routes center when no vehicles
      const routesCenter = getRoutesCenter();
      setInitialCenter({ lng: routesCenter.lng, lat: routesCenter.lat });
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

      // Use synthetic route mapping for realistic road positioning
      const mapped = getMappedPosition(
        vehicle.vehicle_id,
        vehicle.last_position_x,
        vehicle.last_position_y
      );

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
      const baseSize = isEgo ? 20 : 14;
      const size = isSelected ? baseSize + 4 : baseSize;
      const color = getStateColor(vehicle.state);
      
      // Use route bearing for rotation, fallback to yaw if available
      const rotationDeg = vehicle.last_yaw != null 
        ? (90 - (vehicle.last_yaw * 180 / Math.PI)) % 360 
        : mapped.bearing;

      const existingMarker = markersRef.current.get(vehicle.vehicle_id);

      if (existingMarker) {
        existingMarker.setLngLat([mapped.lng, mapped.lat]);
        const el = existingMarker.getElement();
        if (el) {
          updateMarkerElement(el, vehicle, isEgo, isSelected, size, color, rotationDeg);
        }
      } else {
        const el = createMarkerElement(vehicle, isEgo, isSelected, size, color, rotationDeg);

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([mapped.lng, mapped.lat])
          .addTo(map);

        el.addEventListener("click", () => {
          onVehicleClick(vehicle.vehicle_id);
        });

        markersRef.current.set(vehicle.vehicle_id, marker);
      }
    });
  }, [vehicles, selectedVehicleId, onVehicleClick, initialCenter, theme]);

  // SVG car icon for vehicle markers (top-down view, pointing up)
  const getCarSvg = (color: string, isEgo: boolean, isSelected: boolean, size: number): string => {
    const strokeWidth = isSelected ? 2 : 1;
    const strokeColor = isSelected 
      ? (theme.mode === "dark" ? "#fff" : "#000")
      : color;
    const glowFilter = isSelected 
      ? `<filter id="glow"><feGaussianBlur stdDeviation="2" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
      : '';
    const filterAttr = isSelected ? 'filter="url(#glow)"' : '';
    
    if (isEgo) {
      // Larger, more detailed autonomous vehicle icon
      return `
        <svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          ${glowFilter}
          <g ${filterAttr}>
            <!-- Car body -->
            <rect x="5" y="2" width="14" height="20" rx="4" ry="4" 
                  fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
            <!-- Windshield -->
            <rect x="7" y="4" width="10" height="5" rx="2" ry="2" 
                  fill="${theme.mode === "dark" ? "#1a1a2e" : "#2d3748"}" opacity="0.8"/>
            <!-- Rear window -->
            <rect x="7" y="15" width="10" height="4" rx="2" ry="2" 
                  fill="${theme.mode === "dark" ? "#1a1a2e" : "#2d3748"}" opacity="0.8"/>
            <!-- Headlights -->
            <circle cx="8" cy="3" r="1.5" fill="#fff" opacity="0.9"/>
            <circle cx="16" cy="3" r="1.5" fill="#fff" opacity="0.9"/>
            <!-- Side mirrors -->
            <rect x="2" y="6" width="3" height="2" rx="1" fill="${color}" stroke="${strokeColor}" stroke-width="0.5"/>
            <rect x="19" y="6" width="3" height="2" rx="1" fill="${color}" stroke="${strokeColor}" stroke-width="0.5"/>
            <!-- AV sensor dome (roof) -->
            <circle cx="12" cy="10" r="2.5" fill="${theme.mode === "dark" ? "#4a5568" : "#718096"}" stroke="#fff" stroke-width="0.5"/>
            <circle cx="12" cy="10" r="1" fill="${theme.colors.primary}" opacity="0.8"/>
          </g>
        </svg>
      `;
    } else {
      // Smaller tracked vehicle icon
      return `
        <svg width="${size}" height="${size}" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          ${glowFilter}
          <g ${filterAttr}>
            <!-- Car body -->
            <rect x="4" y="2" width="12" height="16" rx="3" ry="3" 
                  fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
            <!-- Windshield -->
            <rect x="6" y="4" width="8" height="4" rx="1.5" ry="1.5" 
                  fill="${theme.mode === "dark" ? "#1a1a2e" : "#2d3748"}" opacity="0.7"/>
            <!-- Rear window -->
            <rect x="6" y="12" width="8" height="3" rx="1.5" ry="1.5" 
                  fill="${theme.mode === "dark" ? "#1a1a2e" : "#2d3748"}" opacity="0.7"/>
            <!-- Headlights -->
            <circle cx="7" cy="3" r="1" fill="#fff" opacity="0.85"/>
            <circle cx="13" cy="3" r="1" fill="#fff" opacity="0.85"/>
          </g>
        </svg>
      `;
    }
  };

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
    _vehicle: Vehicle,
    isEgo: boolean,
    isSelected: boolean,
    size: number,
    color: string,
    rotationDeg: number
  ) => {
    // Set container styles
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.cursor = "pointer";
    el.style.transition = "transform 0.3s ease-out, filter 0.2s ease";
    el.style.transform = `rotate(${rotationDeg}deg)`;
    
    // Apply drop shadow for depth
    if (isSelected) {
      el.style.filter = `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color})`;
    } else {
      el.style.filter = theme.mode === "dark" 
        ? "drop-shadow(0 2px 4px rgba(0,0,0,0.6))"
        : "drop-shadow(0 2px 4px rgba(0,0,0,0.4))";
    }
    
    // Set SVG content
    el.innerHTML = getCarSvg(color, isEgo, isSelected, size);
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
