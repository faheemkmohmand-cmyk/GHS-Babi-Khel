import { Component, type ReactNode } from "react";
import { AlertTriangle, Home, RefreshCw, WifiOff } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// RouteErrorBoundary — the LAST-RESORT safety net for route loading, mounted
// directly around the app's <Routes> (just below the root ErrorBoundary).
//
// With importWithRecovery (src/App.tsx) in place, offline and slow-network
// chunk failures are held as PENDING imports and never reach a boundary at
// all. This component exists for the rare cases that still surface:
//   • a route chunk that stayed unloadable for the whole 10-minute recovery
//     window (e.g. a very long offline stretch),
//   • a stale chunk that no longer exists on the server after a deploy,
//   • a genuine render error inside a page.
//
// For all of those it shows a calm, recoverable panel — NOT the app-wide
// crash screen the root boundary used to produce — and, when the panel
// appeared because the device was offline, it auto-recovers the moment the
// connection returns (one guarded reload, loop-protected).
// ─────────────────────────────────────────────────────────────────────────────

interface Props { children: ReactNode; }
interface State { hasError: boolean; wasOffline: boolean; }

const AUTO_RELOAD_GUARD_KEY = "ghs-route-error-autoreload";
const AUTO_RELOAD_MIN_GAP_MS = 30_000;

class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, wasOffline: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      wasOffline: typeof navigator !== "undefined" && navigator.onLine === false,
    };
  }

  componentDidCatch(error: Error) {
    console.error("[RouteErrorBoundary] Route failed to load:", error);
  }

  componentDidMount() {
    window.addEventListener("online", this.handleBackOnline);
  }

  componentWillUnmount() {
    window.removeEventListener("online", this.handleBackOnline);
  }

  // If this panel appeared while the user was OFFLINE, the moment the
  // connection returns we auto-recover once by reloading — the fresh page
  // load fetches the route chunk that previously failed, and the user ends
  // up exactly where they were heading, with zero taps. The sessionStorage
  // guard makes a reload loop impossible.
  handleBackOnline = () => {
    if (!this.state.hasError || !this.state.wasOffline) return;
    try {
      const last = Number(sessionStorage.getItem(AUTO_RELOAD_GUARD_KEY) || 0);
      if (Date.now() - last < AUTO_RELOAD_MIN_GAP_MS) return;
      sessionStorage.setItem(AUTO_RELOAD_GUARD_KEY, String(Date.now()));
    } catch {
      /* storage blocked — still safe to reload once */
    }
    window.location.reload();
  };

  // Full navigations (not client-side Links) on purpose: a boundary reset
  // would re-render the SAME React.lazy component, whose rejected import is
  // cached — only a fresh document load re-attempts the chunk cleanly. The
  // service worker serves "/" from cache, so this works fully offline too.
  goHome = () => {
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const offline = typeof navigator !== "undefined" && navigator.onLine === false;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            {offline ? (
              <WifiOff className="w-8 h-8 text-destructive" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-destructive" />
            )}
          </div>
          <h1 className="text-2xl font-heading font-bold text-foreground mb-2">
            {offline ? "You're offline" : "This page couldn't load"}
          </h1>
          <p className="text-muted-foreground mb-6">
            {offline
              ? "There's no internet connection right now. This page will load automatically once you're back online — nothing is lost."
              : "This page had trouble loading — most likely a slow or interrupted connection, or a recent app update. Your data is safe. Try again, or head back to the homepage."}
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl gradient-accent text-primary-foreground font-semibold shadow-card hover:shadow-elevated transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
            <button
              onClick={this.goHome}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-background text-foreground font-semibold hover:bg-muted transition-all"
            >
              <Home className="w-4 h-4" />
              Go to Homepage
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default RouteErrorBoundary;
