import { useState, useEffect, useCallback } from "react";

/**
 * The site ships exactly THREE user-selectable appearances:
 *   • "system"  — follows the device (bright on light-mode devices, dark on
 *     dark-mode devices). This is the default.
 *   • "dark"    — always the black/dark theme.
 *   • "lantern" — Lantern Mode · The Hujra Reading Experience. A warm amber
 *     "place mode" inspired by a Pashtun hujra at night: the page feels lit
 *     by a single kerosene lantern, not by a screen. Lantern always renders
 *     on a dark base (the `dark` class is applied alongside
 *     `theme-lantern`), so every dark-mode-safe component stays readable —
 *     the lantern palette then warms the whole site. The full ambience
 *     (flicker, vignette, sepia reading tone) is layered onto the reading
 *     pages (Notes / News / Notices) by HujraAmbiance.
 * The old standalone "light" choice and the legacy colour themes
 * (midnight / forest / violet) were removed — any saved value migrates
 * to "system" (midnight fans keep "dark" so their site stays dark).
 */
export type ThemeMode = "system" | "dark" | "lantern";

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
  if (saved === "lantern") return "lantern";
  if (saved === "midnight") return "dark"; // was a dark colour theme
  // "system", "light" (removed mode), unknown legacy values and no saved
  // value all resolve to the default: follow the device.
  return "system";
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  // Always strip legacy custom theme classes
  LEGACY_CLASSES.forEach((c) => root.classList.remove(c));
  const isDark = mode === "dark" || mode === "lantern" ||
    (mode === "system" && getSystemPrefersDark());
  // Lantern sits on the dark base so every dark-safe component keeps its
  // contrast; .theme-lantern then warms the palette in index.css.
  root.classList.toggle("dark", isDark);
  root.classList.toggle("theme-lantern", mode === "lantern");
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
