import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

const AdminProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, profile, loading, hasCachedSession } = useAuth();

  // Show spinner while auth loads — same as ProtectedRoute
  //
  // …unless we already KNOW this person is signed in. getSession() is capped
  // at AUTH_INIT_TIMEOUT_MS (5s), and on a slow mobile connection it very
  // often takes the full budget to answer. Showing a blank full-screen
  // spinner for that long every time the dashboard is opened is exactly the
  // "admin dashboard is hanging" symptom.
  //
  // A Supabase session token sitting in localStorage is synchronous, instant,
  // and authoritative enough to render with: if the token really is expired or
  // revoked, getSession() will still fail and redirect to the sign-in page a
  // moment later. So in that case we render the dashboard immediately and let
  // auth settle in the background, instead of blocking the whole UI on a
  // network round trip we do not need in order to draw a shell.
  if (loading && !hasCachedSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Signed in according to the local token, but the network round trip has
  // not answered yet. Render the dashboard now and let auth finish in the
  // background — `user` is still null here, so the checks below would
  // otherwise bounce a perfectly valid admin to the sign-in page.
  if (loading && hasCachedSession) {
    return <>{children}</>;
  }

  // Not logged in → sign in page
  if (!user) {
    return <Navigate to="/auth/signin" replace />;
  }

  // Auth resolved but the profile fetch hasn't finished yet (or the
  // localStorage profile cache was empty). Don't bounce the user to
  // /dashboard during that brief window — the moment we land there, the
  // user is signed in as admin and the dashboard route is what triggered
  // this whole check in the first place, so they'd see themselves
  // "downgraded" to a regular user for a few seconds and then have to
  // navigate back to where they were (e.g. Exam Seating). This was the
  // exact bug shown in the screenshot: a network reconnect / page reload
  // while the user was on /admin/* would land them on /dashboard.
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not admin → User Dashboard was removed, so send them home
  if (profile.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default AdminProtectedRoute;
