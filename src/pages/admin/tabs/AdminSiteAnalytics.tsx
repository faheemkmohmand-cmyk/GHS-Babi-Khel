// src/pages/admin/tabs/AdminSiteAnalytics.tsx
//
// Standalone "Site Analytics" tab in the Admin Dashboard.
// Wraps the SiteAnalytics component inside an error boundary so a
// missing Supabase table never crashes the rest of the dashboard.

import { Component, type ReactNode } from "react";
import SiteAnalytics from "@/components/admin/SiteAnalytics";
import { BarChart2, RefreshCw, AlertCircle } from "lucide-react";

// ── Error Boundary ───────────────────────────────────────────────────────────
interface EBState { hasError: boolean; error?: Error }

class SiteAnalyticsBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center">
                <BarChart2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              </div>
              <h3 className="text-base font-bold text-foreground">Site Analytics</h3>
            </div>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
              title="Retry"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h4 className="text-sm font-bold text-foreground mb-2">Site Analytics failed to load</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Make sure the{" "}
              <code className="font-mono bg-secondary px-1 py-0.5 rounded text-[10px]">site_visits</code>{" "}
              table exists in Supabase and the SQL migration has been run.
            </p>
            <p className="text-[10px] text-muted-foreground/70 font-mono break-all">
              {this.state.error?.message || "Unknown error"}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Page Header ──────────────────────────────────────────────────────────────
const PageHeader = () => (
  <div className="flex items-center gap-3 mb-6">
    <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center shrink-0">
      <BarChart2 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
    </div>
    <div>
      <h2 className="text-lg font-extrabold text-foreground leading-tight">Site Analytics</h2>
      <p className="text-xs text-muted-foreground">Visitor metrics, traffic trends &amp; device breakdowns</p>
    </div>
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────────
const AdminSiteAnalytics = () => (
  <div className="space-y-2 pb-4">
    <PageHeader />
    <SiteAnalyticsBoundary>
      <SiteAnalytics />
    </SiteAnalyticsBoundary>
  </div>
);

export default AdminSiteAnalytics;
