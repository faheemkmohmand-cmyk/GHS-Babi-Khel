import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
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

// How long before any single Supabase call is abandoned
const PROFILE_FETCH_TIMEOUT_MS = 6000;
const AUTH_INIT_TIMEOUT_MS = 8000;

// Wraps a promise with a hard timeout — rejects if the promise doesn't settle in time
function withTimeout<T>(promise: Promise<T>, ms: number, label = "timeout"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} after ${ms}ms`)), ms)
    ),
  ]);
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Prevents a stale onAuthStateChange callback from setting loading=true
  // again after the initial init has already completed and set loading=false.
  const initDone = useRef(false);

  // fetchProfile: always has a hard timeout so it can never hang forever.
  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    try {
      // Try the RPC first (faster, uses security definer)
      const rpcResult = await withTimeout(
        supabase.rpc("get_my_profile"),
        PROFILE_FETCH_TIMEOUT_MS,
        "get_my_profile RPC"
      );

      if (!rpcResult.error && rpcResult.data) {
        return rpcResult.data as Profile;
      }

      // Fallback: direct table query, also with a timeout
      const directResult = await withTimeout(
        supabase.from("profiles").select("*").eq("id", userId).single(),
        PROFILE_FETCH_TIMEOUT_MS,
        "profiles direct query"
      );

      if (directResult.error) {
        console.warn("Profile fetch error:", directResult.error.message);
        return null;
      }
      return directResult.data as Profile;
    } catch (e) {
      console.warn("Profile fetch failed/timed out:", e);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // ── STEP 1: initial session check ───────────────────────────────────────
    const init = async () => {
      try {
        const sessionResult = await withTimeout(
          supabase.auth.getSession(),
          AUTH_INIT_TIMEOUT_MS,
          "getSession"
        );

        if (!mounted) return;

        const sess = (sessionResult as { data: { session: Session | null } }).data.session;

        setSession(sess);
        setUser(sess?.user ?? null);

        if (sess?.user) {
          // fetchProfile already has its own internal timeout
          const prof = await fetchProfile(sess.user.id);
          if (mounted) setProfile(prof);
        }
      } catch (err) {
        console.warn("Auth init error:", err);
      } finally {
        // Always unblock the UI — no matter what happened above
        if (mounted) {
          initDone.current = true;
          setLoading(false);
        }
      }
    };

    init();

    // ── STEP 2: listen for subsequent auth events (sign in / sign out) ───────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, sess) => {
        if (!mounted) return;

        if (event === "SIGNED_OUT") {
          setSession(null);
          setUser(null);
          setProfile(null);
          // Don't touch loading here — sign-out is instant
          return;
        }

        // Update session/user state immediately so the UI isn't blocked
        setSession(sess);
        setUser(sess?.user ?? null);

        if (sess?.user) {
          // Fetch profile in the background — DO NOT set loading=true.
          // The navigate() in SignIn already redirected the user; ProtectedRoute
          // will render children as long as user!=null. Profile will populate
          // asynchronously once the fetch completes.
          fetchProfile(sess.user.id).then((prof) => {
            if (mounted) setProfile(prof);
          });
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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
                     }
            
