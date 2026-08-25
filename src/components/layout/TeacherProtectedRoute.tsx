import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

const TeacherProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth/signin" replace />;

  // Profile not loaded yet — wait instead of bouncing to /dashboard for
  // the same reason as AdminProtectedRoute: on a page reload / network
  // reconnect, the profile fetch is async, and treating a null profile
  // as "not a teacher" kicks a teacher out of where they were.
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Admins can also access teacher dashboard
  if (profile.role === "admin" || profile.role === "teacher") {
    return <>{children}</>;
  }

  // Everyone else goes to user dashboard
  return <Navigate to="/dashboard" replace />;
};

export default TeacherProtectedRoute;
