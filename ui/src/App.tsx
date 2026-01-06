// Main App component with routing and navigation

import { useState } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import { useTheme } from "./contexts/ThemeContext";
import { MainDashboard } from "./pages/MainDashboard";
import { MetricsDashboard } from "./pages/MetricsDashboard";

function App() {
  const { theme, toggleTheme } = useTheme();
  const [demoMode, setDemoMode] = useState(false);
  const location = useLocation();

  const isOperations = location.pathname === "/" || location.pathname === "/operations";
  const isAnalytics = location.pathname === "/analytics";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.fonts.display,
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "10px 20px",
          borderBottom: `1px solid ${theme.colors.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: theme.colors.surfaceSecondary,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: 700,
              letterSpacing: "-0.5px",
              color: theme.colors.text,
            }}
          >
            FLEETOPS
            <span style={{ color: theme.colors.primary, marginLeft: "6px" }}>
              COMMAND
            </span>
          </h1>
          <span
            style={{
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "4px",
              backgroundColor: theme.colors.primaryMuted,
              color: theme.colors.primary,
              fontWeight: 600,
            }}
          >
            SF BAY
          </span>

          {/* Navigation Tabs */}
          <nav style={{ display: "flex", gap: "4px", marginLeft: "16px" }}>
            <NavLink
              to="/"
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none",
                color: isOperations ? theme.colors.primary : theme.colors.textSecondary,
                backgroundColor: isOperations ? theme.colors.primaryMuted : "transparent",
                border: `1px solid ${isOperations ? theme.colors.primary : "transparent"}`,
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span style={{ fontSize: "14px" }}>📡</span>
              Operations
            </NavLink>
            <NavLink
              to="/analytics"
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none",
                color: isAnalytics ? theme.colors.primary : theme.colors.textSecondary,
                backgroundColor: isAnalytics ? theme.colors.primaryMuted : "transparent",
                border: `1px solid ${isAnalytics ? theme.colors.primary : "transparent"}`,
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span style={{ fontSize: "14px" }}>📊</span>
              Analytics
            </NavLink>
          </nav>
        </div>
        
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: theme.colors.textSecondary,
              cursor: "pointer",
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor: demoMode ? theme.colors.primaryMuted : "transparent",
              border: `1px solid ${demoMode ? theme.colors.primary : theme.colors.border}`,
              transition: "all 0.2s",
            }}
          >
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(e) => setDemoMode(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            <span style={{ fontWeight: demoMode ? 600 : 400 }}>Demo Mode</span>
          </label>
          
          <button
            onClick={toggleTheme}
            style={{
              padding: "6px 12px",
              border: `1px solid ${theme.colors.border}`,
              borderRadius: "6px",
              backgroundColor: theme.colors.surface,
              color: theme.colors.text,
              cursor: "pointer",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.2s",
            }}
            title={`Switch to ${theme.mode === "light" ? "dark" : "light"} mode`}
          >
            {theme.mode === "light" ? "🌙" : "☀️"}
            {theme.mode === "light" ? "Dark" : "Light"}
          </button>
        </div>
      </header>

      {/* Routes */}
      <Routes>
        <Route path="/" element={<MainDashboard demoMode={demoMode} />} />
        <Route path="/operations" element={<MainDashboard demoMode={demoMode} />} />
        <Route path="/analytics" element={<MetricsDashboard />} />
      </Routes>

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

export default App;
