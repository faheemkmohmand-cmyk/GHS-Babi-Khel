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

// How long before any single Supabase call is abandoned.
//
// ── AUTH_INIT_TIMEOUT_MS (fix for issue 2.6) ──────────────────────────────
// Previously 8000 ms, which was too long: a parent on 2G mobile would stare
// at a "Loading…" spinner for 8 seconds before the page became interactive,
// even though the actual hang was just a stale refresh token. Reduced to
// 3000 ms — long enough for a healthy network round-trip to Supabase's auth
// edge, short enough to not torture slow connections.
//
// On timeout we now also explicitly call `supabase.auth.signOut()` (see
// below). This clears the stale refresh token from localStorage and stops
// the background autoRefreshToken loop from continuing to retry — which
// was the root cause of the admission form hanging and the original
// motivation for the `supabasePublic` split in src/lib/supabase.ts. With
// the stale session cleared at the source, the auth-enabled `supabase`
// client no longer hangs on subsequent calls either.
const PROFILE_FETCH_TIMEOUT_MS = 6000;
const AUTH_INIT_TIMEOUT_MS = 3000;

// Wraps a promise with a hard timeout — rejects if the promise doesn't settle in time
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label = "timeout"): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
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
          // Subscribe to realtime changes for this user's profile row
          if (mounted) subscribeToProfileChanges(sess.user.id);
        }
      } catch (err) {
        // ── Timeout / failure path (fix for issue 2.6) ──────────────────────
        // `getSession()` either timed out or threw. The most common cause is
        // a stale or expired refresh token sitting in localStorage, which
        // makes the Supabase JS client try to refresh in the background —
        // and that refresh loop is what was hanging subsequent calls
        // (admission form inserts, page-view tracking, etc.).
        //
        // The fix: explicitly sign out. This clears the stale token from
        // localStorage AND terminates the autoRefreshToken loop, so the
        // auth-enabled `supabase` client behaves like an anonymous client
        // from this point forward. The user can simply click "Sign In"
        // again to get a fresh session.
        //
        // We don't set a profile or session here — the catch block leaves
        // them as their initial null values, which is correct for an
        // anonymous visitor. The `finally` block below unblocks the UI.
        console.warn("Auth init failed/timed out — clearing stale session:", err);
        try {
          await supabase.auth.signOut();
        } catch {
          // If signOut itself fails (e.g. network down), there's nothing
          // more we can do — leave it to the next page load.
        }
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

    // ── STEP 3: realtime watch on the current user's profile row ────────────
    // Without this, when an admin approves or rejects a user the profile
    // sitting in memory stays stale — the user never sees the status change
    // until they manually refresh the page.
    // This channel re-fetches the profile whenever the DB row is updated,
    // so ProtectedRoute immediately reflects the new status (approved / rejected).
    let profileChannel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToProfileChanges = (userId: string) => {
      // Remove any existing channel before creating a new one
      if (profileChannel) supabase.removeChannel(profileChannel);

      profileChannel = supabase
        .channel(`profile-status-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${userId}`,
          },
          async () => {
            // Re-fetch from DB so we always get the authoritative value
            if (!mounted) return;
            const fresh = await fetchProfile(userId);
            if (mounted) setProfile(fresh);
          }
        )
        .subscribe();
    };

    // Also re-subscribe whenever the user signs in/changes
    const { data: { subscription: authSub2 } } = supabase.auth.onAuthStateChange(
      (_event, sess) => {
        if (!mounted) return;
        if (sess?.user) {
          subscribeToProfileChanges(sess.user.id);
        } else {
          if (profileChannel) {
            supabase.removeChannel(profileChannel);
            profileChannel = null;
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
      authSub2.unsubscribe();
      if (profileChannel) supabase.removeChannel(profileChannel);
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

        
