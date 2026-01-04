// Theme context for dark mode support

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ThemeMode = "light" | "dark";

interface Theme {
  mode: ThemeMode;
  colors: {
    background: string;
    surface: string;
    surfaceSecondary: string;
    border: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    primary: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    hover: string;
    selected: string;
  };
}

const lightTheme: Theme = {
  mode: "light",
  colors: {
    background: "#ffffff",
    surface: "#ffffff",
    surfaceSecondary: "#f5f5f5",
    border: "#ddd",
    text: "#000000",
    textSecondary: "#666",
    textMuted: "#888",
    primary: "#2196f3",
    success: "#4caf50",
    warning: "#ff6b35",
    error: "#d32f2f",
    info: "#2196f3",
    hover: "#f5f5f5",
    selected: "#e3f2fd",
  },
};

const darkTheme: Theme = {
  mode: "dark",
  colors: {
    background: "#121212",
    surface: "#1e1e1e",
    surfaceSecondary: "#2d2d2d",
    border: "#404040",
    text: "#ffffff",
    textSecondary: "#b0b0b0",
    textMuted: "#888888",
    primary: "#64b5f6",
    success: "#81c784",
    warning: "#ff8a65",
    error: "#e57373",
    info: "#64b5f6",
    hover: "#2d2d2d",
    selected: "#1e3a5f",
  },
};

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    // Check localStorage first
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") {
      return saved;
    }
    // Check system preference
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  });

  useEffect(() => {
    // Save to localStorage
    localStorage.setItem("theme", mode);
    // Update body class for global styles
    document.body.className = `theme-${mode}`;
  }, [mode]);

  const toggleTheme = () => {
    setMode((prev) => (prev === "light" ? "dark" : "light"));
  };

  const setTheme = (newMode: ThemeMode) => {
    setMode(newMode);
  };

  const theme = mode === "dark" ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

