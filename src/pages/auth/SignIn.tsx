import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, GraduationCap, ArrowRight, Loader2, Clock, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import { useSchoolSettings, safeMediaUrl } from "@/hooks/useSchoolSettings";

// Timeout helper: rejects after `ms` milliseconds
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out")), ms)
    ),
  ]);
}

const SignIn = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<"pending" | "rejected" | null>(null);
  const navigate = useNavigate();

  const { data: settings } = useSchoolSettings();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPendingStatus(null);

    try {
      // Step 1: Authenticate — timeout after 10s
      const authResult = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        10000
      );

      const { data: authData, error: authError } = authResult;

      if (authError || !authData.user) {
        toast.error(authError?.message || "Login failed.");
        setLoading(false);
        return;
      }

      // Step 2: Fetch profile — timeout after 6s, fall back gracefully
      let profile: { role?: string; status?: string } | null = null;

      try {
        const rpcResult = await withTimeout(
          supabase.rpc("get_my_profile"),
          6000
        );

        if (!rpcResult.error && rpcResult.data) {
          profile = rpcResult.data;
        } else {
          // Fallback: direct table query with its own timeout
          const directResult = await withTimeout(
            supabase
              .from("profiles")
              .select("role, status")
              .eq("id", authData.user.id)
              .single(),
            6000
          );
          profile = directResult.data ?? null;
        }
      } catch {
        // Profile fetch timed out — treat as pending to be safe
        console.warn("Profile fetch timed out, treating as pending.");
        await supabase.auth.signOut();
        toast.error("Server is slow. Please try again in a moment.");
        setLoading(false);
        return;
      }

      const status = profile?.status || "pending";
      const role = profile?.role;

      if (status === "pending") {
        await supabase.auth.signOut();
        setPendingStatus("pending");
        setLoading(false);
        return;
      }

      if (status === "rejected") {
        await supabase.auth.signOut();
        setPendingStatus("rejected");
        setLoading(false);
        return;
      }

      // Step 3: Navigate FIRST, then clear loading
      toast.success("Signed in successfully!");

      if (role === "admin") {
        navigate("/admin", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }

      setLoading(false);
    } catch (err) {
      // Catches the top-level auth timeout or any unexpected error
      const message =
        err instanceof Error && err.message === "Request timed out"
          ? "Sign in is taking too long. Check your connection and try again."
          : "An unexpected error occurred. Please try again.";
      toast.error(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-20 -left-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="bg-card rounded-2xl shadow-elevated p-8">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl gradient-hero mx-auto mb-4 flex items-center justify-center overflow-hidden">
              {settings?.logo_url && !logoFailed ? (
                <img
                  src={safeMediaUrl(settings.logo_url)!}
                  alt={`${settings?.school_name || "GHS Babi Khel"} logo`}
                  className="w-full h-full object-cover"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <GraduationCap className="w-8 h-8 text-primary-foreground" />
              )}
            </div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Welcome Back</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to your {settings?.school_name || "GHS Babi Khel"} account
            </p>
          </div>

          {/* Pending / Rejected banners */}
          {pendingStatus === "pending" && (
            <div className="mb-6 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-center">
              <Clock className="w-8 h-8 text-blue-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-400">Waiting for Admin Approval</p>
              <p className="text-xs text-blue-700 dark:text-blue-400/80 mt-1">
                Your account is under review. You'll be able to login once an administrator approves your account.
              </p>
            </div>
          )}

          {pendingStatus === "rejected" && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-center">
              <XCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Account Rejected</p>
              <p className="text-xs text-red-600 dark:text-red-400/80 mt-1">
                Your account request was rejected by the administrator. Please contact the school for more information.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-foreground">Password</label>
                <Link to="/auth/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full gradient-accent text-primary-foreground font-semibold py-3 rounded-xl shadow-card hover:shadow-elevated transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{" "}
            <Link to="/auth/signup" className="text-primary font-medium hover:underline">
              Sign Up
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default SignIn;
            
