import { useState, useEffect, useCallback } from "react";

/**
 * The site ships exactly TWO user-selectable appearances:
 *   • "system" — follows the device (bright on light-mode devices, dark on
 *     dark-mode devices). This is the default.
 *   • "dark"   — always the black/dark theme.
 * The old standalone "light" choice and the legacy colour themes
 * (midnight / forest / violet) were removed — any saved value migrates
 * to "system" (midnight fans keep "dark" so their site stays dark).
 */
export type ThemeMode = "system" | "dark";

const STORAGE_KEY = "ghs-theme";
// Belt-and-suspenders: strip any legacy theme class that may still be on <html>
const LEGACY_CLASSES = ["theme-midnight", "theme-forest", "theme-violet"];

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readInitial(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "dark") return "dark";
  if (saved === "midnight") return "dark"; // was a dark colour theme
  // "system", "light" (removed mode), unknown legacy values and no saved
  // value all resolve to the default: follow the device.
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
