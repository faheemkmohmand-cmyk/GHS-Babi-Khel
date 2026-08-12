import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { HelmetProvider } from "react-helmet-async";
import { LazyMotion, domAnimation } from "framer-motion";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import OfflineBanner from "./components/shared/OfflineBanner";
// Global MCQ-timer siren controller — fires the red flash + air-raid siren
// when the admin's MCQ timer reaches zero, NO MATTER which page the user
// is on (admin, public, auth — anywhere). See the component file for full
// design notes (background-tab handling, wake lock, mobile-locked behavior).
import McqSirenGlobalController from "./components/shared/McqSirenGlobalController";
import { usePageTracker } from "./hooks/usePageTracker";
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

// ✅ lazyWithRetry: if a lazy-loaded chunk fails (slow network, blip, or a
// genuinely stale cached chunk after a deploy), retry the IMPORT ITSELF a
// few times with a short backoff — entirely in place, in memory. This does
// NOT touch window.location or reload the page.
//
// Why this matters: the old version called window.location.reload() on the
// very first failure. On a slow connection that's not a real failure, it's
// just a slow chunk — but the reload wiped the entire SPA state: whatever
// admin tab you were on, any form you were mid-edit on (adding a result,
// editing a date sheet, anything unsaved) was gone, and you were dropped
// back to a blank loading screen. A slow network turned a normal wait into
// data loss. Real SaaS apps never do this — they retry quietly and let you
// keep working once the chunk arrives.
//
// CRITICAL FIX FOR PAGE REFRESH ISSUE:
// Only after several in-place retries still fail (a truly broken/missing
// chunk, not just slow) do we let the error bubble up to ErrorBoundary,
// which shows an inline, dismissible message instead of a full reload —
// so even the worst case keeps you on the same page with your state intact.
//
// FIXED: Removed the automatic window.location.reload() for stale chunks.
// Now we NEVER automatically reload the page — we either retry successfully
// or show an inline error that lets the user decide what to do.
function lazyWithRetry(factory: () => Promise<any>) {
  return lazy(() => retryImport(factory));
}

// Detects the specific "this chunk file no longer exists on the server"
// signature that browsers throw after a new deploy replaces the old
// content-hashed JS files. This is NOT a network blip — retrying the
// import will never succeed, because the file is genuinely gone.
function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Failed to fetch dynamically imported module|Loading chunk .* failed|error loading dynamically imported module|Importing a module script failed/i.test(msg);
}

// FIXED: This function now NEVER calls window.location.reload().
// 
// OLD BEHAVIOR: After exhausting all retries for a stale chunk error,
// it would call window.location.reload() once. This caused full page
// refreshes during editing, losing all form data and context.
//
// NEW BEHAVIOR: 
// - For stale chunk errors: We throw the error and let ErrorBoundary
//   handle it with an inline UI (not a reload)
// - For transient errors: We retry with backoff up to 6 attempts
// - For offline errors: We fail immediately (no point retrying)
// - The user can manually refresh if needed via the ErrorBoundary button
function retryImport(factory: () => Promise<any>, attemptsLeft = 6, delayMs = 800): Promise<any> {
  return factory().catch((err) => {
    // Offline: retrying won't help without a network, and we don't want to
    // spin silently forever — let it bubble to ErrorBoundary right away.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw err;
    }
    
    // Check if this is a stale chunk error (file deleted after deploy)
    const stale = isStaleChunkError(err);
    
    if (attemptsLeft <= 1) {
      // Final attempt exhausted.
      // FIXED: NO LONGER call window.location.reload() here!
      //
      // Previously, for stale chunk errors, we would do a single reload.
      // This was problematic because:
      // 1. It happened during user interaction (editing forms, etc.)
      // 2. On slow connections, the reload itself could fail or take minutes
      // 3. All unsaved form data was lost
      // 4. The user had no control over when this happened
      //
      // Now we simply throw the error and let ErrorBoundary display
      // an inline recovery UI. The user can then decide to:
      // - Manually refresh (if they have no unsaved work)
      // - Try again (retry the action)
      // - Navigate away and come back
      if (stale) {
        console.warn("[lazyWithRetry] Chunk appears stale after retries — showing recovery UI instead of reloading");
      }
      throw err;
    }
    
    // For stale chunks, don't wait as long between retries — the file
    // won't magically reappear, but we give a brief moment in case it's
    // actually a transient network glitch masquerading as a stale chunk
    const adjustedDelay = stale ? Math.min(delayMs * 0.5, 1000) : delayMs;
    
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        retryImport(factory, attemptsLeft - 1, delayMs * 1.5).then(resolve, reject);
      }, adjustedDelay);
    });
  });
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

const PageSkeleton = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground font-medium">Loading…</p>
    </div>
  </div>
);

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
      refetchOnReconnect: 'off', // Completely off, not even in background
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
            <PageTracker />
            <RouteSEOInjector />
            <Suspense fallback={<PageSkeleton />}>
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
          </BrowserRouter>
        </LazyMotion>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

export default App;
