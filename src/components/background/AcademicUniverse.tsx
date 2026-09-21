import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/* ════════════════════════════════════════════════════════════════════════
   ACADEMIC UNIVERSE — the living 3D math-bubble background
   ────────────────────────────────────────────────────────────────────────
   A fixed, full-viewport WebGL layer that sits BEHIND all page content
   (z-index: -1): soft translucent bubbles drift in 3D space, each holding
   a faint glowing math formula (π, ∫, E=mc², √, ∑ …) or a science glyph
   (atom, DNA, geometry). Edges catch a blue↔orange iridescent sheen that
   matches the site's azure/tangerine brand. Scrolling parallaxes the
   bubbles at depth-dependent speeds; tapping anywhere pops the nearest
   bubble into a tiny gold sparkle and a fresh one floats up.

   This file is the LIGHT shell — it deliberately imports nothing heavy.
   The actual scene (three.js + @react-three/fiber, ~150 KB gz) lives in
   UniverseScene.tsx and is loaded through React.lazy ONLY when:
     • the current route is a public, content-facing page (never on
       /admin, /dashboard, /auth or /notes — dense reading & work screens
       must stay distraction-free and their CPU untouched),
     • the device can actually render WebGL,
     • the user hasn't asked for Data-Saver / is not on 2G,
     • the page has finished loading (mount is deferred to browser idle,
       so the background never competes with first paint or a route chunk).

   PERFORMANCE / POLITENESS CONTRACT (mirrors the site's Android GPU fixes)
   • Reduced-motion → the scene renders ONE static frame (frameloop
     "demand"): same ambient beauty, zero animation, ~zero CPU.
   • Any open modal dialog ([aria-modal="true"] — including the Results
     Grand Reveal / Scratch overlay) pauses the render loop entirely so
     the reveal, confetti and HUD animation get 100% of the GPU.
   • Hidden tab → paused. Prerender bot (navigator.webdriver) → skipped.
   • The canvas is pointer-events: none; taps are observed on the window
     and IGNORED when the tap lands on a button/link/input, so real UI
     interaction is never visually interrupted or intercepted.
   • Softness is baked into the shaders (fresnel falloff, low alpha) —
     no CSS blur filters, which the site already bans for Android GPU
     texture-corruption reasons (see index.css header notes).
   ════════════════════════════════════════════════════════════════════════ */

const UniverseScene = lazy(() => import("./UniverseScene"));

/** Public pages where the ambient background is welcome. "/" is exact —
 *  every other entry is a prefix so /notices/:id, /news/:id etc. match. */
const ENABLED_EXACT = new Set(["/"]);
const ENABLED_PREFIXES = [
  "/results",
  "/about",
  "/teachers",
  "/notices",
  "/news",
  "/gallery",
  "/calendar",
  "/contact",
  "/faq",
  "/admission",
  "/merit-list",
  "/library",
  "/online-classes",
  "/search",
  "/duty",
  "/roll-no-slip",
];

function routeEnabled(pathname: string): boolean {
  if (ENABLED_EXACT.has(pathname)) return true;
  return ENABLED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** One-time capability probe. Kept cheap and side-effect free. */
function detectSupport(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  // Prerender/headless (scripts/prerender.mjs, bots): never mount WebGL.
  if ((navigator as { webdriver?: boolean }).webdriver) return false;
  // Data-Saver / 2G: the user asked us to keep bytes and CPU low. Skip.
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType && /(^|\b)2g\b/.test(conn.effectiveType)) return false;
  // WebGL availability (webgl2 preferred, webgl fallback).
  try {
    const probe = document.createElement("canvas");
    if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return false;
  } catch {
    return false;
  }
  return true;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const AcademicUniverse = () => {
  const { pathname } = useLocation();
  const [supported] = useState(detectSupport);
  const [staticMode] = useState(prefersReducedMotion);
  // Deferred mount: wait for browser idle so the three.js chunk download +
  // scene build never compete with the page's own first paint / hydration.
  const [idleReady, setIdleReady] = useState(false);

  useEffect(() => {
    if (!supported || idleReady) return;
    let cancelled = false;
    const go = () => {
      if (!cancelled) setIdleReady(true);
    };
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    let fallback: ReturnType<typeof setTimeout> | undefined;
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(go, { timeout: 2500 });
    } else {
      fallback = setTimeout(go, 1800);
    }
    return () => {
      cancelled = true;
      if (fallback) clearTimeout(fallback);
    };
  }, [supported, idleReady]);

  if (!supported || !routeEnabled(pathname)) return null;

  return (
    <div className="academic-universe" aria-hidden="true">
      {idleReady && (
        <Suspense fallback={null}>
          <UniverseScene staticMode={staticMode} />
        </Suspense>
      )}
    </div>
  );
};

export default AcademicUniverse;
