// routePrefetch.ts — makes navbar navigation feel instant, even on slow
// internet, via two complementary layers:
//
// 1. INTENT PREFETCH (the big win):
//    The moment a finger TOUCHES or a cursor HOVERS any navbar link, the
//    target route's JS chunk starts downloading — a full tap takes 100-300ms
//    and a chunk is usually only 20-80KB, so by the time React Router
//    actually navigates, the chunk is already in the browser's module cache
//    and the page renders immediately. One delegated listener on the navbar
//    root covers every link inside it (mega-menu, mobile drawer, Roll No.
//    Slip countdown chips, admission CTA — even links added later).
//
// 2. BACKGROUND PREFETCH (idle warm-up):
//    After the homepage fully loads (window load + browser idle), the main
//    public routes are warmed ONE AT A TIME, in priority order (the pages
//    visitors tap most: Online Classes, Merit List, Roll No. Slip first).
//    Sequential downloading never competes with the homepage's own data —
//    that's what made the old all-at-once prefetch sluggish on slow links.
//
// Both layers respect Data Saver and 2G: on metered connections we don't
// prefetch anything in the background (intent prefetch still runs — the
// user explicitly aims at that page, so it's never wasted data).

type Loader = () => Promise<unknown>;

/** Route path → the exact same dynamic import App.tsx lazy-loads. */
export const ROUTE_LOADERS: Record<string, Loader> = {
  // Top visitor targets (user-reported slow pages first)
  "/online-classes": () => import("@/pages/OnlineClasses"),
  "/merit-list":     () => import("@/pages/MeritList"),
  "/roll-no-slip":   () => import("@/pages/ExamRollNumbers"),
  // Results family
  "/results":        () => import("@/pages/Results"),
  "/result-card":    () => import("@/pages/ResultCard"),
  // School info
  "/about":          () => import("@/pages/About"),
  "/gallery":        () => import("@/pages/Gallery"),
  "/contact":        () => import("@/pages/Contact"),
  "/faq":            () => import("@/pages/FAQ"),
  "/teachers":       () => import("@/pages/Teachers"),
  // News & dates
  "/news":           () => import("@/pages/News"),
  "/notices":        () => import("@/pages/Notices"),
  "/calendar":       () => import("@/pages/Calendar"),
  // Academics
  "/notes":          () => import("@/pages/notes/NotesPage"),
  "/library":        () => import("@/pages/Library"),
  "/duty":           () => import("@/pages/Duty"),
  // Actions
  "/admission":      () => import("@/pages/Admission"),
  "/search":         () => import("@/pages/Search"),
};

/** Background order — most-tapped pages first (see module docstring). */
const BACKGROUND_ORDER = [
  "/online-classes", "/merit-list", "/roll-no-slip",
  "/results", "/result-card", "/gallery",
  "/admission", "/notes", "/library",
  "/news", "/notices", "/calendar", "/about", "/contact",
  "/faq", "/teachers", "/duty", "/search",
];

const done = new Set<string>();

/** Trigger a route chunk download once. Idempotent, failure-tolerant. */
export function prefetchRoute(pathname: string): void {
  const loader = ROUTE_LOADERS[pathname];
  if (!loader || done.has(pathname)) return;
  done.add(pathname);
  loader().catch(() => done.delete(pathname)); // allow retry on next intent
}

/** True once this route's chunk is already fetched this session. */
export const isRoutePrefetched = (pathname: string) => done.has(pathname);

/** Connection-aware gate for BACKGROUND prefetching only. */
function connectionAllowsBackgroundPrefetch(): boolean {
  const conn =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;
  if (conn) {
    if (conn.saveData) return false; // user asked to save data — respect it
    const t = String(conn.effectiveType || "").toLowerCase();
    if (t === "slow-2g" || t === "2g") return false;
  }
  return true;
}

/**
 * Warm all public route chunks after the page has fully loaded and the
 * browser is idle — one chunk at a time (never saturates a slow link).
 * Safe to call multiple times; runs at most once per page load.
 */
let backgroundStarted = false;
export function startBackgroundRoutePrefetch(): void {
  if (backgroundStarted || typeof window === "undefined") return;
  backgroundStarted = true;

  const runQueue = () => {
    if (!connectionAllowsBackgroundPrefetch()) return;
    const queue = BACKGROUND_ORDER.filter((p) => !done.has(p));
    let i = 0;
    const step = () => {
      if (i >= queue.length) return;
      prefetchRoute(queue[i++]);
      // small gap keeps the connection responsive for real user traffic
      setTimeout(step, 400);
    };
    step();
  };

  const kickOff = () => {
    const w = window as any;
    if (typeof w.requestIdleCallback === "function")
      w.requestIdleCallback(runQueue, { timeout: 6000 });
    else setTimeout(runQueue, 2500);
  };

  if (document.readyState === "complete") kickOff();
  else window.addEventListener("load", kickOff, { once: true });
}

/**
 * Delegated intent-prefetch handlers — spread these onto a container that
 * holds links (navbar root, footer, etc.). On pointer hover, keyboard focus
 * or the START of a touch, the link target's route chunk begins downloading
 * immediately, so the subsequent navigation is instant.
 */
export function intentPrefetchHandlers() {
  const handle = (e: Event) => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;
    try {
      const path = new URL(anchor.href, location.href).pathname.replace(/\/+$/, "") || "/";
      prefetchRoute(path);
    } catch { /* ignore malformed hrefs */ }
  };
  return {
    onPointerEnter: handle, // mouse hover / stylus
    onTouchStart: handle,   // mobile tap — fires ~100-300ms before click
    onFocus: handle,        // keyboard / AT navigation
  };
}
