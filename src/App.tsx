import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { HelmetProvider } from "react-helmet-async";
import { LazyMotion, domAnimation } from "framer-motion";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import OfflineBanner from "./components/shared/OfflineBanner";
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
// once the homepage has finished its own work, so those pages are already
// cached and work offline even on a person's very first visit — not just
// after they've manually opened each page once while online.
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
// nothing on failure (this is a nice-to-have, never something that should
// visibly break anything).
function prefetchOfflineRoutes() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const run = () => {
    import("./pages/About").catch(() => {});
    import("./pages/Contact").catch(() => {});
    import("./pages/News").catch(() => {});
    import("./pages/Notices").catch(() => {});
    import("./pages/Calendar").catch(() => {});
    import("./pages/Results").catch(() => {});
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

// ✅ On every page load, clear ALL stale "chunk-reload-*" flags from sessionStorage.
// These flags are set by lazyWithRetry to prevent infinite reload loops, but they
// must be cleared on a fresh page load so that a future chunk failure can retry.
try {
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith("chunk-reload-")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => sessionStorage.removeItem(k));
} catch (_e) {
  // sessionStorage may be unavailable in some environments
}

// ✅ lazyWithRetry: if a chunk fails to load (stale cache, network blip),
// reload ONCE using a flag stored in sessionStorage to prevent infinite loops.
// The flag is cleared on the next fresh page load (see above).
//
// IMPORTANT: while offline, this must NOT reload the page. A reload can't
// fix a missing chunk without a network to fetch it from — it only turns a
// simple "this route isn't cached yet" situation into a full browser
// navigation, which the service worker's offline-navigation fallback then
// redirects to the homepage (see public/sw.js). That's what made tapping
// Contact/News/Notices while offline look like it "did nothing" / bounced
// back to the homepage instead of showing a normal error. Offline, we let
// the error bubble up to ErrorBoundary immediately instead, which shows a
// real, in-place message the person can read and dismiss.
function lazyWithRetry(factory: () => Promise<any>) {
  return lazy(() =>
    factory().catch((err) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw err;
      }
      // Build a stable key from the factory source so each chunk gets its own flag
      const key = "chunk-reload-" + btoa(factory.toString().slice(0, 80)).replace(/[^a-z0-9]/gi, "");
      const alreadyRetried = sessionStorage.getItem(key);
      if (!alreadyRetried) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        // Return a never-resolving promise so React doesn't render anything
        return new Promise(() => {});
      }
      // Already retried once — clear the flag so a manual refresh can try again
      sessionStorage.removeItem(key);
      // Let the error bubble up to ErrorBoundary
      throw err;
    })
  );
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
const Weather          = lazyWithRetry(() => import("./pages/Weather"));
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: "always",
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    },
  },
});

const App = () => (
  <ErrorBoundary>
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
                <Route path="/weather"                 element={<Weather />} />
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

