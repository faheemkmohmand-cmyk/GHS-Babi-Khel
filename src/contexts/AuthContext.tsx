import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  full_name: string | null;
  role: string;
  class: string | null;
  roll_number: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  created_at: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// Maximum time to wait for auth init before giving up (prevents infinite spinner)
const AUTH_INIT_TIMEOUT_MS = 8000;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("get_my_profile");

      if (!rpcError && rpcData) {
        return rpcData as Profile;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.warn("Profile fetch error:", error.message);
        return null;
      }
      return data as Profile;
    } catch (e) {
      console.warn("Profile fetch exception:", e);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), AUTH_INIT_TIMEOUT_MS)
          ),
        ]);

        if (!mounted) return;

        const session = sessionResult
          ? (sessionResult as { data: { session: Session | null } }).data.session
          : null;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const prof = await fetchProfile(session.user.id);
          if (mounted) setProfile(prof);
        }

        if (mounted) setLoading(false);
      } catch (err) {
        console.warn("Auth init error:", err);
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === "SIGNED_OUT") {
          setSession(null);
          setUser(null);
          setProfile(null);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const prof = await fetchProfile(session.user.id);
          if (mounted) setProfile(prof);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signOut = async () => {
    setProfile(null);
    setUser(null);
    setSession(null);
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (user) {
      const prof = await fetchProfile(user.id);
      setProfile(prof);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth — consumes the shared AuthContext.
 *
 * All components share ONE auth state. This means:
 * - No duplicate Supabase listeners
 * - No race condition on refresh (loading stays true until session resolves)
 * - Protected routes never flash to /sign-in on refresh
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
