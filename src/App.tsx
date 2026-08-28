import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { HelmetProvider } from "react-helmet-async";
import { LazyMotion, domAnimation } from "framer-motion";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import OfflineBanner from "./components/shared/OfflineBanner";
import RouteLoadingFallback from "./components/shared/RouteLoadingFallback";
import RouteErrorBoundary from "./components/shared/RouteErrorBoundary";
// Global MCQ-timer siren controller — fires the red flash + air-raid siren
// when the admin's MCQ timer reaches zero, NO MATTER which page the user
// is on (admin, public, auth — anywhere). See the component file for full
// design notes (background-tab handling, wake lock, mobile-locked behavior).
import McqSirenGlobalController from "./components/shared/McqSirenGlobalController";
import { usePageTracker } from "./hooks/usePageTracker";
import ScrollToTopOnNavigate from "./components/shared/ScrollToTopOnNavigate";
import SiteSchema from "./components/seo/SiteSchema";
import RouteSEOInjector from "./components/seo/RouteSEOInjector";
import ProtectedRoute        from "./components/layout/ProtectedRoute";
import AdminProtectedRoute   from "./components/layout/AdminProtectedRoute";
import TeacherProtectedRoute from "./components/layout/TeacherProtectedRoute";
import { AuthProvider }      from "./contexts/AuthContext";
import { restoreHomepageCache, persistHomepageCache } from "./lib/queryPersist";

const PageTracker = () => { usePageTracker(); return null; };

// Restores offline-cached data (notices/news/teachers/achievements/
// school-settings/school-events/results) from IndexedDB on cold start so
// Home, About, Contact, News, Notices, Calendar, and Results can paint
// instantly even with no network, then keeps that cache updated in the
// background whenever fresh data arrives. Scoped to a small allow-list of
// query keys — see src/lib/queryPersist.ts.
const OfflineCacheBootstrap = ({ queryClient }: { queryClient: QueryClient }) => {
  useEffect(() => {
    restoreHomepageCache(queryClient);
    const stopPersisting = persistHomepageCache(queryClient);
    return stopPersisting;
  }, [queryClient]);
  return null;
};

// Quietly pre-loads the JS for About/Contact/News/Notices/Calendar/Results
// AND Admission/Notes (list + subject page) once the homepage has finished
// its own work, so those pages are already cached and work offline even on
// a person's very first visit — not just after they've manually opened
// each page once while online.
//
// Uses the exact same import() calls App.tsx already uses to lazy-load
// these routes, so this is not a second/duplicate loading mechanism — it's
// just triggering the normal one early, in the background. Each import()
// is an ordinary fetch that the service worker's networkFirstAsset handler
// (see public/sw.js) caches exactly like a real visit would.
//
// Deliberately: only runs when online (no point trying while offline —
// there's nothing to fetch), waits until the browser is idle so it never
// competes with the homepage's own initial load, and silently does
// nothing on failure (this is a nice-to-have, should never visibly break anything).
//
// Notes' chapter page (./pages/notes/ChapterPage) is intentionally NOT
// prefetched here — it pulls in heavy deps (KaTeX, audio player, etc.)
// that would bloat the cache for every visitor. It gets cached on the
// user's first real visit to a chapter, which is fine because by then
// they're already invested in that subject. The subject list + subject
// page ARE prefetched, so the student can always reach a subject offline.
function prefetchOfflineRoutes() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const run = () => {
    import("./pages/About").catch(() => {});
    import("./pages/Contact").catch(() => {});
    import("./pages/News").catch(() => {});
    import("./pages/Notices").catch(() => {});
    import("./pages/Calendar").catch(() => {});
    import("./pages/Results").catch(() => {});
    // Homepage CTA targets — make sure tapping "Apply for Admission" or
    // any "Notes" link from the homepage works offline on the very first
    // visit too, not just after a prior online visit to those pages.
    import("./pages/Admission").catch(() => {});
    import("./pages/notes/NotesPage").catch(() => {});
    import("./pages/notes/SubjectPage").catch(() => {});
  };

  if (typeof (window as any).requestIdleCallback === "function") {
    (window as any).requestIdleCallback(run, { timeout: 5000 });
  } else {
    setTimeout(run, 3000);
  }
}

const OfflineRoutePrefetch = () => {
  useEffect(() => {
    prefetchOfflineRoutes();
  }, []);
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ CRASH-PROOF ROUTE LOADING (fixes both critical offline & slow-network
//    crashes — "Something went wrong. An unexpected error occurred.")
//
// THE BUG: every page is a React.lazy() route chunk fetched via dynamic
// import(). When that fetch failed — because the device was OFFLINE (chunk
// not yet in the service-worker's cache) or on a SLOW/FLAKY connection —
// the rejection bubbled straight past <Suspense> into the ROOT ErrorBoundary,
// which unmounted the ENTIRE app and replaced it with the crash screen.
// Users hit this exactly when they:
//   1. opened the site/PWA offline and tapped any page, or
//   2. navigated on a slow connection and the chunk request failed.
//
// THE HIDDEN TRAP: browsers cache a FAILED dynamic import in their module
// map for the lifetime of the document. Retrying the same specifier fails
// instantly forever — even once the network is back. That is why the old
// retry-then-error-boundary approach could never recover.
//
// THE FIX — importWithRecovery(): a failed route-chunk import is a
// RECOVERABLE condition, not a crash. The import promise is kept PENDING
// (so <Suspense> shows the friendly offline/slow fallback, never the crash
// screen) while we:
//   • probe the chunk URL every few seconds (HEAD — bypasses the module map),
//   • the moment it's reachable again, import it under a cache-busting
//     query (?ghs-retry=N) — a fresh module-map entry and fresh fetch,
//     which the service worker serves from cache when offline — and hand
//     the module to the SAME promise React.lazy is awaiting, so the page
//     renders IN PLACE: no reload, no lost context, zero user effort.
//   • only for a genuinely STALE chunk (404 after a new deploy) do we do
//     ONE guarded reload (max 3 per minute, never while the user has
//     navigated elsewhere) to pick up the fresh index.html + hashes.
// Only after 10 minutes of continuous failure does the error bubble up —
// and even then, RouteErrorBoundary (mounted just below the root boundary)
// shows a friendly, recoverable panel instead of the app-wide crash screen.
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_LOAD_STATUS_EVENT = "ghs-route-load-status";
const MAX_RECOVERY_MS = 10 * 60 * 1000; // total time we keep retrying before surfacing an error

type RouteLoadStatus = "offline-wait" | "slow-retry" | "retrying";

// Lets the loading fallback (RouteLoadingFallback) show WHY a page is still
// loading — "you're offline" vs "slow connection" — instead of a bare
// spinner. Purely cosmetic: never allowed to break the loading itself.
function emitRouteLoadStatus(status: RouteLoadStatus) {
  try {
    window.dispatchEvent(new CustomEvent(ROUTE_LOAD_STATUS_EVENT, { detail: { status } }));
  } catch {
    /* cosmetic only */
  }
}

function isOfflineNow(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function lazyWithRetry(factory: () => Promise<any>) {
  return lazy(() => importWithRecovery(factory));
}

// Pulls the absolute chunk URL out of a failed dynamic-import error, e.g.
// "TypeError: Failed to fetch dynamically imported module:
//  https://site/assets/Gallery-abc123.js" → that .js URL. Firefox/Safari
// omit the URL — callers fall back gracefully when this returns null.
function extractChunkUrl(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/https?:\/\/[^\s'"]+\.js/i);
  return m ? m[0] : null;
}

// Network probe for one asset. HEAD on purpose: it bypasses the module map,
// is cheap (no body), and the service worker ignores non-GET requests, so
// this always tests the REAL network. Returns:
//   "ok"          → asset reachable (network is healthy again)
//   "stale"       → 404/410 — the hashed file no longer exists (new deploy)
//   "unreachable" → offline, or server/CDN still failing
async function probeUrl(url: string): Promise<"ok" | "stale" | "unreachable"> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (res.ok) return "ok";
    if (res.status === 404 || res.status === 410) return "stale";
    return "unreachable";
  } catch {
    return "unreachable";
  }
}

// One guarded reload, max 3 per rolling 60 s (sessionStorage). This exists
// ONLY for the stale-chunk case (file replaced by a new deploy) where no
// in-document recovery is possible. The cap makes a reload loop impossible.
function guardedReload(reason: string): boolean {
  try {
    const KEY = "ghs-chunk-reloads";
    const now = Date.now();
    const recent = JSON.parse(sessionStorage.getItem(KEY) || "[]").filter((t) => now - t < 60_000);
    if (recent.length >= 3) {
      console.warn("[routeChunk] Reload cap reached — handing over to the recovery panel");
      return false;
    }
    recent.push(now);
    sessionStorage.setItem(KEY, JSON.stringify(recent));
  } catch {
    /* storage unavailable — proceed with the reload */
  }
  console.warn(`[routeChunk] One guarded reload to recover route chunk (${reason})`);
  window.location.reload();
  return true; // the page is unloading
}

let recoverySeq = 0;

async function importWithRecovery(factory: () => Promise<any>): Promise<any> {
  const startedAt = Date.now();
  let lastError: unknown;

  try {
    return await factory();
  } catch (err) {
    lastError = err;
  }

  // ── WHY NOT JUST RETRY factory() ──────────────────────────────────────────
  // The browser caches a FAILED dynamic import in its module map for the
  // lifetime of the document. Re-running the same specifier fails instantly,
  // forever — even after the network is back (verified: fetch() of the same
  // URL returns 200 while import() keeps rejecting). This was the hidden
  // root cause of BOTH crash reports: offline tap → import fails → poisoned
  // → the old retry loop burned out → root ErrorBoundary → crash screen.
  //
  // THE FIX: import the SAME chunk file under a cache-busting query
  // (?ghs-retry=N). That is a brand-new module-map entry and a fresh network
  // fetch — which the service worker serves from cache when offline. The
  // resolved module is returned to the SAME awaited promise React.lazy is
  // holding, so the page renders IN PLACE: no reload, no lost state, and
  // the user simply sees the page appear once the connection returns.
  // ──────────────────────────────────────────────────────────────────────────
  const failedUrl = extractChunkUrl(lastError);
  const intendedPath = typeof location !== "undefined" ? location.pathname : "/";
  let bustedFailures = 0;

  while (Date.now() - startedAt < MAX_RECOVERY_MS) {
    // Keep the fallback honest about what's happening while we wait.
    emitRouteLoadStatus(isOfflineNow() ? "offline-wait" : "slow-retry");
    await sleep(3000);
    emitRouteLoadStatus("retrying");

    if (failedUrl) {
      const state = await probeUrl(failedUrl);

      if (state === "ok") {
        // Network is healthy again — pull the chunk under a fresh specifier.
        try {
          return await import(/* @vite-ignore */ `${failedUrl}?ghs-retry=${++recoverySeq}`);
        } catch (err) {
          lastError = err;
          bustedFailures += 1;
          // Rare: a deeper chunk of the graph is also poisoned. A few more
          // probe cycles usually don't help — one guarded reload does.
          if (bustedFailures >= 3 && location.pathname === intendedPath && guardedReload("chunk graph recovery")) {
            await sleep(30_000); // page is reloading; this is just a safety net
          }
          continue;
        }
      }

      if (state === "stale") {
        // 404/410 — the hashed file is gone (a new deploy replaced it). No
        // in-document recovery exists; one guarded reload fetches the fresh
        // index.html with the new hashes. Skipped if the user already moved
        // to another page (never yank someone mid-task).
        if (location.pathname === intendedPath) {
          if (guardedReload("stale chunk")) {
            await sleep(30_000); // page is reloading; this is just a safety net
            continue;
          }
        }
        throw lastError; // → RouteErrorBoundary's friendly panel
      }

      // "unreachable" — offline or the server is still down: keep the
      // import pending and keep probing. The fallback explains the wait.
      continue;
    }

    // Couldn't extract a URL from the error (some browsers omit it): retry
    // the factory as a best effort — harmless if the map is poisoned, and
    // it covers engines that don't cache failures.
    try {
      return await factory();
    } catch (err) {
      lastError = err;
    }
  }

  // Recovery window exhausted (10 minutes of continuous failure) — let the
  // error reach RouteErrorBoundary, which shows a friendly recovery panel.
  throw lastError;
}

const Home             = lazyWithRetry(() => import("./pages/Home"));
const About            = lazyWithRetry(() => import("./pages/About"));
const Teachers         = lazyWithRetry(() => import("./pages/Teachers"));
const Notices          = lazyWithRetry(() => import("./pages/Notices"));
const News             = lazyWithRetry(() => import("./pages/News"));
const Results          = lazyWithRetry(() => import("./pages/Results"));
const Gallery          = lazyWithRetry(() => import("./pages/Gallery"));
const Library          = lazyWithRetry(() => import("./pages/Library"));
const ResultCard       = lazyWithRetry(() => import("./pages/ResultCard"));
const SignIn           = lazyWithRetry(() => import("./pages/auth/SignIn"));
const SignUp           = lazyWithRetry(() => import("./pages/auth/SignUp"));
const ForgotPassword   = lazyWithRetry(() => import("./pages/auth/ForgotPassword"));
const ResetPassword    = lazyWithRetry(() => import("./pages/auth/ResetPassword"));
const AuthCallback     = lazyWithRetry(() => import("./pages/auth/AuthCallback"));
const UserDashboard    = lazyWithRetry(() => import("./pages/dashboard/UserDashboard"));
const NotesPage        = lazyWithRetry(() => import("./pages/notes/NotesPage"));
const SubjectPage      = lazyWithRetry(() => import("./pages/notes/SubjectPage"));
const ChapterPage      = lazyWithRetry(() => import("./pages/notes/ChapterPage"));
const TeacherDashboard = lazyWithRetry(() => import("./pages/dashboard/TeacherDashboard"));
const AdminDashboard   = lazyWithRetry(() => import("./pages/admin/AdminDashboard"));
const OnlineClasses    = lazyWithRetry(() => import("./pages/OnlineClasses"));
const NotFound         = lazyWithRetry(() => import("./pages/NotFound"));
const Admission        = lazyWithRetry(() => import("./pages/Admission"));
const DutyPage         = lazyWithRetry(() => import("./pages/Duty"));
const Search           = lazyWithRetry(() => import("./pages/Search"));
const NewsDetail       = lazyWithRetry(() => import("./pages/NewsDetail"));
const NoticeDetail     = lazyWithRetry(() => import("./pages/NoticeDetail"));
const Contact          = lazyWithRetry(() => import("./pages/Contact"));
const Calendar         = lazyWithRetry(() => import("./pages/Calendar"));

// The route-loading UI lives in src/components/shared/RouteLoadingFallback.tsx —
// it explains offline / slow-connection states instead of a bare spinner,
// and pairs with importWithRecovery() above to make slow/offline navigation
// recoverable instead of crashing into the root ErrorBoundary.

// ✅ OPTIMIZED QueryClient configuration for NO page refreshes:
//
// CRITICAL SETTINGS EXPLAINED:
// 1. refetchOnWindowFocus: false
//    - Prevents data refetching when user switches tabs or windows
//    - This was a major cause of "page feels like it refreshed" because
//      all queries would re-run and update the UI when user returned
//    - Admin dashboard especially has many queries, so tab-switching
//      caused visible flickering and form resets
//
// 2. refetchOnReconnect: false  
//    - Prevents aggressive refetching when connection restores
//    - On slow/flaky networks, this would trigger constantly
//    - User could be mid-edit when connection flickers and data refreshes
//
// 3. Increased retry counts and delays
//    - More forgiving of slow networks
//    - Won't immediately show errors on transient failures
//
// 4. structuralSharing: false
//    - Prevents reference equality issues that cause unnecessary re-renders
//    - Complex objects won't trigger cascading updates
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 60 * 1000, // 15 minutes — data stays fresh longer
      gcTime: 60 * 60 * 1000,    // 1 hour cache — survive long editing sessions
      // CRITICAL: Don't refetch on window focus — prevents "refresh" feeling
      refetchOnWindowFocus: false,
      // CRITICAL: Don't aggressively refetch on reconnect — prevents interrupting edits
      // FIXED: was 'off', which is NOT a valid React Query v5 value (it's a
      // truthy string, so refetch-on-reconnect was actually LEFT ON — every
      // connection flicker on a slow network mass-refetched all queries and
      // interrupted edits). false is the correct "completely off" value.
      refetchOnReconnect: false,
      retry: 4,                   // More retries before showing error
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000), // Gentler backoff
      // Structural sharing disabled for complex objects to prevent reference issues
      structuralSharing: false,
      // Keep previous data while refetching — prevents UI flashes
      placeholderData: (previousData) => previousData,
    },
    mutations: {
      retry: 3,                   // More mutation retries
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      // Don't throw errors immediately — let error boundaries handle gracefully
      throwOnError: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    {/* Global MCQ-timer siren controller. Mounted high in the tree so it
        lives for the entire app lifetime. Renders nothing — it's a
        side-effect-only component that watches localStorage and fires the
        siren + red flash overlay when the MCQ timer hits zero, regardless
        of which page the user is currently on. */}
    <McqSirenGlobalController />
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
        <OfflineCacheBootstrap queryClient={queryClient} />
        <OfflineRoutePrefetch />
        <LazyMotion features={domAnimation} strict>
          <SiteSchema />
          <Toaster
            position="top-right"
            toastOptions={{ duration: 3000 }}
            containerStyle={{ top: 16 }}
          />
          <OfflineBanner />
          <BrowserRouter>
            <ScrollToTopOnNavigate />
            <PageTracker />
            <RouteSEOInjector />
            <RouteErrorBoundary>
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
                <Route path="/"                     element={<Home />} />
                <Route path="/about"                element={<About />} />
                <Route path="/contact"              element={<Contact />} />
                <Route path="/calendar"             element={<Calendar />} />
                <Route path="/teachers"             element={<Teachers />} />
                <Route path="/notices"              element={<Notices />} />
                <Route path="/notices/:id"          element={<NoticeDetail />} />
                <Route path="/news"                 element={<News />} />
                <Route path="/news/:id"             element={<NewsDetail />} />
                <Route path="/search"               element={<Search />} />
                <Route path="/results"              element={<Results />} />
                <Route path="/result-card"          element={<ResultCard />} />
                <Route path="/gallery"              element={<Gallery />} />
                <Route path="/library"              element={<Library />} />
                <Route path="/auth/signin"          element={<SignIn />} />
                <Route path="/auth/signup"          element={<SignUp />} />
                <Route path="/auth/forgot-password" element={<ForgotPassword />} />
                <Route path="/auth/reset-password"  element={<ResetPassword />} />
                <Route path="/auth/callback"         element={<AuthCallback />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <UserDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/teacher"
                  element={
                    <TeacherProtectedRoute>
                      <TeacherDashboard />
                    </TeacherProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <AdminProtectedRoute>
                      <AdminDashboard />
                    </AdminProtectedRoute>
                  }
                />
                <Route path="/online-classes"          element={<OnlineClasses />} />
                <Route path="/admission"               element={<Admission />} />
                <Route path="/duty"                    element={<DutyPage />} />
                <Route path="/notes"                   element={<NotesPage />} />
                <Route path="/notes/:subject"          element={<SubjectPage />} />
                <Route path="/notes/:subject/:chapter" element={<ChapterPage />} />
                <Route path="*"                        element={<NotFound />} />
              </Routes>
            </Suspense>
            </RouteErrorBoundary>
          </BrowserRouter>
        </LazyMotion>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

export default App;
