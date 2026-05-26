import { lazy, Suspense } from "react";
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

const PageTracker = () => { usePageTracker(); return null; };

// ✅ lazyWithRetry: if a chunk fails to load (stale cache, network blip),
// reload ONCE using a flag stored in sessionStorage to prevent infinite loops.
function lazyWithRetry(factory: () => Promise<any>) {
  return lazy(() =>
    factory().catch((err) => {
      // Build a stable key from the factory source so each chunk gets its own flag
      const key = "chunk-reload-" + btoa(factory.toString().slice(0, 80)).replace(/[^a-z0-9]/gi, "");
      const alreadyRetried = sessionStorage.getItem(key);
      if (!alreadyRetried) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        // Return a never-resolving promise so React doesn't render anything
        return new Promise(() => {});
      }
      // Already retried once — clear the flag so future navigations can retry
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
                <Route path="/teachers"             element={<Teachers />} />
                <Route path="/notices"              element={<Notices />} />
                <Route path="/news"                 element={<News />} />
                <Route path="/results"              element={<Results />} />
                <Route path="/result-card"          element={<ResultCard />} />
                <Route path="/gallery"              element={<Gallery />} />
                <Route path="/library"              element={<Library />} />
                <Route path="/auth/signin"          element={<SignIn />} />
                <Route path="/auth/signup"          element={<SignUp />} />
                <Route path="/auth/forgot-password" element={<ForgotPassword />} />
                <Route path="/auth/reset-password"  element={<ResetPassword />} />
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
      </QueryClientProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

export default App;
