import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { HelmetProvider } from "react-helmet-async";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import OfflineBanner from "./components/shared/OfflineBanner";
import { usePageTracker } from "./hooks/usePageTracker";
import SiteSchema from "./components/seo/SiteSchema";

// Invisible component — just runs the tracker hook inside BrowserRouter
const PageTracker = () => { usePageTracker(); return null; };

// ✅ All pages lazy-loaded
const Home             = lazy(() => import("./pages/Home"));
const About            = lazy(() => import("./pages/About"));
const Teachers         = lazy(() => import("./pages/Teachers"));
const Notices          = lazy(() => import("./pages/Notices"));
const News             = lazy(() => import("./pages/News"));
const Results          = lazy(() => import("./pages/Results"));
const Gallery          = lazy(() => import("./pages/Gallery"));
const Library          = lazy(() => import("./pages/Library"));
const ResultCard       = lazy(() => import("./pages/ResultCard"));
const SignIn           = lazy(() => import("./pages/auth/SignIn"));
const SignUp           = lazy(() => import("./pages/auth/SignUp"));
const ForgotPassword   = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword    = lazy(() => import("./pages/auth/ResetPassword"));
const UserDashboard    = lazy(() => import("./pages/dashboard/UserDashboard"));
const NotesPage        = lazy(() => import("./pages/notes/NotesPage"));
const SubjectPage      = lazy(() => import("./pages/notes/SubjectPage"));
const ChapterPage      = lazy(() => import("./pages/notes/ChapterPage"));
const TeacherDashboard = lazy(() => import("./pages/dashboard/TeacherDashboard"));
const AdminDashboard   = lazy(() => import("./pages/admin/AdminDashboard"));
const Weather          = lazy(() => import("./pages/Weather"));
const OnlineClasses    = lazy(() => import("./pages/OnlineClasses"));
const NotFound         = lazy(() => import("./pages/NotFound"));
const Admission        = lazy(() => import("./pages/Admission"));
const ProtectedRoute        = lazy(() => import("./components/layout/ProtectedRoute"));
const AdminProtectedRoute   = lazy(() => import("./components/layout/AdminProtectedRoute"));
const TeacherProtectedRoute = lazy(() => import("./components/layout/TeacherProtectedRoute"));

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
    <QueryClientProvider client={queryClient}>
      <Toaster
        position="top-right"
        toastOptions={{ duration: 3000 }}
        containerStyle={{ top: 16 }}
      />
      <OfflineBanner />
      <BrowserRouter>
        <PageTracker />
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
            <Route path="/weather"                  element={<Weather />} />
            <Route path="/online-classes"          element={<OnlineClasses />} />
            <Route path="/admission"               element={<Admission />} />
            <Route path="/notes"                    element={<NotesPage />} />
            <Route path="/notes/:subject"           element={<SubjectPage />} />
            <Route path="/notes/:subject/:chapter"  element={<ChapterPage />} />
            <Route path="*"                         element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;


