import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, GraduationCap, ArrowRight, Loader2, Clock, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import { useSchoolSettings, safeMediaUrl } from "@/hooks/useSchoolSettings";

const SignIn = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<"pending" | "rejected" | null>(null);
  const navigate = useNavigate();

  // FIX: Load actual school logo so it shows on sign-in page
  const { data: settings } = useSchoolSettings();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPendingStatus(null);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      toast.error(authError?.message || "Login failed.");
      setLoading(false);
      return;
    }

    // Check profile status
    const { data: profileJson, error: rpcError } = await supabase.rpc("get_my_profile");

    let profile: { role?: string; status?: string } | null = null;

    if (!rpcError && profileJson) {
      profile = profileJson;
    } else {
      const { data: directProfile } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", authData.user.id)
        .single();
      profile = directProfile;
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

    toast.success("Signed in successfully!");

    if (role === "admin") {
      navigate("/admin", { replace: true });
    } else {
      navigate("/dashboard", { replace: true });
    }

    setLoading(false);
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
            {/* FIX: Show real school logo if available, fallback to icon */}
            <div className="w-14 h-14 rounded-2xl gradient-hero mx-auto mb-4 flex items-center justify-center overflow-hidden">
              {settings?.logo_url && !logoFailed ? (
                <img
                  src={safeMediaUrl(settings.logo_url)!}
                  alt={`${settings?.school_name || "GHS Babi Khel"} logo`}
                  className="w-full h-full object-cover"
                  crossOrigin="anonymous"
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
