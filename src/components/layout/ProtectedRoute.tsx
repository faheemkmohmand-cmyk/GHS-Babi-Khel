import { ReactNode } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Clock, XCircle } from "lucide-react";

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/signin" replace />;
  }

  // If user is authenticated but profile hasn't loaded yet, show spinner
  // instead of letting them through — prevents pending users from slipping in
  // during the brief window where profile is null after auth state change.
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Admin users always pass through (they are auto-approved)
  if (profile.role === "admin") {
    return <>{children}</>;
  }

  // Block pending users
  if (profile.status === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-elevated p-8 text-center">
          <Clock className="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <h1 className="text-xl font-heading font-bold text-foreground">Pending Approval</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your account is under review by the administrator. You'll be able to access the dashboard once approved.
          </p>
          <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
            <p className="text-xs text-blue-800 dark:text-blue-400">
              This usually takes a short while. Please check back later.
            </p>
          </div>
          <Link
            to="/"
            className="inline-block mt-6 text-sm font-medium text-primary hover:underline"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // Block rejected users
  if (profile.status === "rejected") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-elevated p-8 text-center">
          <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-heading font-bold text-foreground">Account Rejected</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your account request was rejected. Please contact the school administration for assistance.
          </p>
          <Link
            to="/"
            className="inline-block mt-6 text-sm font-medium text-primary hover:underline"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
