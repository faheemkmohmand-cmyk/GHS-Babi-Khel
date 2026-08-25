import { useState, useEffect, useCallback } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "ghs-theme";
const LEGACY_CLASSES = ["theme-midnight", "theme-forest", "theme-violet"];

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readInitial(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (saved === "light" || saved === "dark" || saved === "system") return saved;
  // Migrate legacy theme values to safe defaults
  if (saved === "midnight" || saved === "forest" || saved === "violet") return "dark";
  return "system";
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  // Always strip legacy custom theme classes
  LEGACY_CLASSES.forEach((c) => root.classList.remove(c));
  const isDark = mode === "dark" || (mode === "system" && getSystemPrefersDark());
  root.classList.toggle("dark", isDark);
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => readInitial());

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyTheme("system");
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    localStorage.removeItem("ghs-dark-mode");
    localStorage.removeItem("ghs-dark-mode-manual");
    setThemeState(mode);
  }, []);

  return { theme, setTheme };
}
