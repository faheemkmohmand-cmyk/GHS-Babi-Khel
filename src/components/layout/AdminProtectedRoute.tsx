import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

const AdminProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, profile, loading } = useAuth();

  // Show spinner while auth loads — same as ProtectedRoute
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
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

  // Not admin → back to user dashboard
  if (profile.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default AdminProtectedRoute;
