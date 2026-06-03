// src/pages/admin/tabs/AdminSiteAnalytics.tsx
import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import {
  Users, Eye, Smartphone, Monitor, Tablet,
  TrendingUp, Globe, BarChart3, Clock, ArrowUpRight, ArrowDownRight,
  Minus, RefreshCw, Activity, Layers, MousePointerClick,
  CheckCircle2, Circle, ExternalLink, Copy, Check, Settings2,
  AlertTriangle, Zap, Shield,
} from "lucide-react";
import { format, subDays, startOfDay, startOfWeek, parseISO } from "date-fns";
import { isPlausibleEnabled } from "@/hooks/usePlausible";

const AdminPendingRequests = lazy(() => import("./AdminPendingRequests"));

// ── Types ─────────────────────────────────────────────────────────────────────
interface Visit {
  id: string;
  page: string;
  device_type: string;
  session_id: string;
  visited_at: string;
  referrer?: string | null;
  user_id?: string | null;
}

type Range = "7" | "14" | "30";

// ── Data fetching ──────────────────────────────────────────────────────────────
function useSiteVisits(days: number) {
  return useQuery<Visit[]>({
    queryKey: ["site-visits", days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from("site_visits")
        .select("id, page, device_type, session_id, visited_at, referrer, user_id")
        .gte("visited_at", since)
        .order("visited_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildDailyData(visits: Visit[], days: number) {
  const map: Record<string, { date: string; views: number; visitors: Set<string>; signedIn: number }> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = format(subDays(new Date(), i), "MMM d");
    map[d] = { date: d, views: 0, visitors: new Set(), signedIn: 0 };
  }
  visits.forEach((v) => {
    const d = format(parseISO(v.visited_at), "MMM d");
    if (map[d]) {
      map[d].views += 1;
      map[d].visitors.add(v.session_id);
      if (v.user_id) map[d].signedIn += 1;
    }
  });
  return Object.values(map).map((d) => ({
    date: d.date,
    views: d.views,
    visitors: d.visitors.size,
    signedIn: d.signedIn,
  }));
}

function buildHourlyData(visits: Visit[]) {
  const hours: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hours[h] = 0;
  visits
    .filter((v) => parseISO(v.visited_at) >= startOfDay(subDays(new Date(), 6)))
    .forEach((v) => {
      const h = parseISO(v.visited_at).getHours();
      hours[h] += 1;
    });
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`,
    visits: hours[h],
  }));
}

function buildTopPages(visits: Visit[]) {
  const counts: Record<string, { views: number; sessions: Set<string> }> = {};
  visits.forEach((v) => {
    if (!counts[v.page]) counts[v.page] = { views: 0, sessions: new Set() };
    counts[v.page].views += 1;
    counts[v.page].sessions.add(v.session_id);
  });
  return Object.entries(counts)
    .sort((a, b) => b[1].views - a[1].views)
    .slice(0, 8)
    .map(([page, d]) => ({
      page: page === "/" ? "Home" : page.replace(/^\//, "").replace(/-/g, " "),
      views: d.views,
      visitors: d.sessions.size,
    }));
}

function buildDeviceData(visits: Visit[]) {
  const counts: Record<string, number> = { mobile: 0, tablet: 0, desktop: 0 };
  visits.forEach((v) => { counts[v.device_type] = (counts[v.device_type] ?? 0) + 1; });
  return [
    { name: "Mobile",  value: counts.mobile,  color: "#3b82f6" },
    { name: "Desktop", value: counts.desktop, color: "#8b5cf6" },
    { name: "Tablet",  value: counts.tablet,  color: "#10b981" },
  ].filter((d) => d.value > 0);
}

function buildReferrerData(visits: Visit[]) {
  const counts: Record<string, number> = {};
  visits.forEach((v) => {
    const ref = v.referrer
      ? (v.referrer.includes("google")  ? "Google"    :
         v.referrer.includes("facebook") ? "Facebook"  :
         v.referrer.includes("youtube")  ? "YouTube"   :
         v.referrer.includes("twitter") || v.referrer.includes("x.com") ? "Twitter/X" :
         "Other")
      : "Direct";
    counts[ref] = (counts[ref] ?? 0) + 1;
  });
  const colors: Record<string, string> = {
    Direct: "#3b82f6", Google: "#10b981", Facebook: "#f59e0b",
    YouTube: "#ef4444", "Twitter/X": "#6366f1", Other: "#94a3b8",
  };
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value, color: colors[name] ?? "#94a3b8" }));
}

function buildWeeklyData(visits: Visit[]) {
  const weeks: Record<string, { label: string; views: number; visitors: Set<string> }> = {};
  for (let w = 3; w >= 0; w--) {
    const start = startOfWeek(subDays(new Date(), w * 7));
    const label = `Wk ${format(start, "MMM d")}`;
    weeks[label] = { label, views: 0, visitors: new Set() };
  }
  visits.forEach((v) => {
    const start = startOfWeek(parseISO(v.visited_at));
    const label = `Wk ${format(start, "MMM d")}`;
    if (weeks[label]) {
      weeks[label].views += 1;
      weeks[label].visitors.add(v.session_id);
    }
  });
  return Object.values(weeks).map((w) => ({
    week: w.label,
    views: w.views,
    visitors: w.visitors.size,
  }));
}

function getTrend(visits: Visit[], days: number) {
  const mid      = subDays(new Date(), Math.floor(days / 2));
  const current  = visits.filter((v) => parseISO(v.visited_at) >= mid).length;
  const previous = visits.filter((v) => parseISO(v.visited_at) <  mid).length;
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Small UI pieces ────────────────────────────────────────────────────────────
function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  if (pct > 0)  return <span className="flex items-center gap-0.5 text-xs text-emerald-600 font-semibold"><ArrowUpRight className="w-3 h-3" />{pct}%</span>;
  if (pct < 0)  return <span className="flex items-center gap-0.5 text-xs text-red-500 font-semibold"><ArrowDownRight className="w-3 h-3" />{Math.abs(pct)}%</span>;
  return <span className="flex items-center gap-0.5 text-xs text-muted-foreground font-semibold"><Minus className="w-3 h-3" />0%</span>;
}

function StatCard({ label, value, icon: Icon, color, sub, trend }: {
  label: string; value: number | string; icon: React.ElementType;
  color: string; sub?: string; trend?: number | null;
}) {
  return (
    <Card className="border-border hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}18` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          {trend !== undefined && <TrendBadge pct={trend ?? null} />}
        </div>
        <p className="text-2xl font-bold text-foreground tracking-tight">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        <p className="text-xs font-medium text-foreground/70 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-xl text-xs min-w-[120px]">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="font-bold text-foreground">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

const AnalyticsSkeleton = () => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
    </div>
    <Skeleton className="h-72 rounded-xl" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" />
    </div>
  </div>
);

// ── Copy-to-clipboard helper button ───────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="ml-2 p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Code snippet block ─────────────────────────────────────────────────────────
function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  return (
    <div className="relative rounded-lg bg-muted/60 border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/80">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{lang}</span>
        <CopyButton text={code} />
      </div>
      <pre className="text-xs font-mono text-foreground px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

// ── Setup step component ───────────────────────────────────────────────────────
function SetupStep({
  n, title, done, children,
}: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border-2 ${
            done
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-primary text-primary bg-background"
          }`}
        >
          {done ? <Check className="w-3.5 h-3.5" /> : n}
        </div>
        <div className="w-px flex-1 bg-border mt-1 mb-1" />
      </div>
      <div className="pb-5 flex-1 min-w-0">
        <p className={`text-sm font-semibold mb-2 ${done ? "text-emerald-600" : "text-foreground"}`}>
          {title}
        </p>
        <div className="text-xs text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  );
}

// ── Plausible Setup Panel ──────────────────────────────────────────────────────
const PlausibleSetupPanel = () => {
  const enabled = isPlausibleEnabled();
  const domain  = "ghsbabikhel.indevs.in";

  return (
    <div className="space-y-5">
      {/* Status banner */}
      <Card className={`border-2 ${enabled ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20"}`}>
        <CardContent className="p-4 flex items-start gap-3">
          <div className={`p-2 rounded-xl shrink-0 ${enabled ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-amber-100 dark:bg-amber-900/40"}`}>
            {enabled
              ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              : <AlertTriangle className="w-5 h-5 text-amber-600" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${enabled ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
              {enabled ? "Plausible Analytics is Active" : "Plausible Not Configured Yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {enabled
                ? `Tracking ${domain} — pageviews, geography, bounce rate, and session depth are now flowing into your Plausible dashboard.`
                : "Follow the 4 steps below to connect Plausible. It takes about 5 minutes and is completely free for 30 days."}
            </p>
          </div>
          {enabled && (
            <a
              href={`https://plausible.io/${domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
            >
              Open Dashboard <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </CardContent>
      </Card>

      {/* Why Plausible */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Shield,   color: "#3b82f6", title: "Privacy-First",   desc: "No cookies, no GDPR consent banner needed. Fully compliant." },
          { icon: Zap,      color: "#10b981", title: "Lightweight",      desc: "< 1 KB script. Doesn't slow your site at all." },
          { icon: BarChart3, color: "#8b5cf6", title: "Real Analytics",  desc: "Geography, bounce rate, session depth, funnels — things your custom tracker can't see." },
        ].map(({ icon: Icon, color, title, desc }) => (
          <Card key={title} className="border-border">
            <CardContent className="p-4">
              <div className="p-2 rounded-xl w-fit mb-2" style={{ backgroundColor: `${color}18` }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground mt-1">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Step-by-step setup */}
      <Card className="border-border">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" />
            Setup Guide — 4 Steps
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <SetupStep n={1} title="Create a free Plausible account" done={enabled}>
            <p>Go to <a href="https://plausible.io" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">plausible.io</a> and sign up. The free trial is 30 days with no credit card required.</p>
            <p className="mt-1">After signup, click <strong>"Add a website"</strong> and enter your domain:</p>
            <CodeBlock code={domain} lang="domain" />
            <p className="mt-1 text-emerald-600 font-medium flex items-center gap-1">
              <Circle className="w-2.5 h-2.5" /> Self-hosting alternative (free forever):
            </p>
            <p>
              Deploy Plausible CE on your own server:{" "}
              <a href="https://plausible.io/docs/self-hosting" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                plausible.io/docs/self-hosting
              </a>
            </p>
          </SetupStep>

          <SetupStep n={2} title="Add environment variables" done={enabled}>
            <p>In your <strong>Vercel dashboard</strong> go to:</p>
            <p className="font-mono text-xs bg-muted rounded px-2 py-1 inline-block mt-1">
              Project → Settings → Environment Variables
            </p>
            <p className="mt-2">Add these two variables:</p>
            <div className="space-y-2 mt-2">
              <div>
                <p className="font-semibold text-foreground text-xs mb-1">VITE_PLAUSIBLE_DOMAIN</p>
                <CodeBlock code={domain} lang="value" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-xs mb-1">VITE_PLAUSIBLE_SRC <span className="font-normal text-muted-foreground">(only if self-hosting)</span></p>
                <CodeBlock code="https://plausible.yourserver.com/js/script.js" lang="value" />
                <p className="mt-1">Leave blank if using Plausible cloud.</p>
              </div>
            </div>
          </SetupStep>

          <SetupStep n={3} title="Redeploy your site" done={enabled}>
            <p>After adding the env vars, trigger a new deployment:</p>
            <CodeBlock code="Vercel Dashboard → Deployments → Redeploy (latest)" lang="steps" />
            <p className="mt-1">The Vite build plugin picks up <code className="bg-muted px-1 rounded">VITE_PLAUSIBLE_DOMAIN</code> and injects the Plausible <code className="bg-muted px-1 rounded">&lt;script&gt;</code> tag automatically. No manual code change needed.</p>
          </SetupStep>

          <SetupStep n={4} title="Verify tracking is working" done={enabled}>
            <p>Visit your live site, then open the Plausible dashboard. You should see a live visitor within seconds.</p>
            {enabled ? (
              <a
                href={`https://plausible.io/${domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Open Plausible Dashboard <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <p className="mt-1 text-amber-600 font-medium">⟵ Complete steps 1–3 first, then this link will be active.</p>
            )}
          </SetupStep>
        </CardContent>
      </Card>

      {/* What each layer tracks */}
      <Card className="border-border">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Dual-Layer Tracking — What Each Layer Covers
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-2">
                <Globe className="w-4 h-4" /> Plausible Analytics
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {["Geography (country, city)", "Bounce rate & session depth", "Traffic sources (search, social, direct)", "Browser & OS breakdown", "Real-time visitors map", "Conversion funnels"].map(f => (
                  <li key={f} className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />{f}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 p-4">
              <p className="text-sm font-semibold text-violet-700 dark:text-violet-400 mb-2 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Custom site_visits Table
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {["Logged-in student activity", "Per-user page history", "School-specific page grouping", "Admin-side dashboards & charts", "Cross-referenced with results/notices", "Kept private — never shared"].map(f => (
                  <li key={f} className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-violet-500 shrink-0" />{f}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 p-3 rounded-lg bg-muted/50 border border-border">
            Both layers run in parallel. The <code className="bg-muted px-1 rounded">usePageTracker</code> hook fires both on every SPA navigation. They complement each other — Plausible gives you the full picture of public traffic, while <code className="bg-muted px-1 rounded">site_visits</code> gives you school-specific insights no external tool can see.
          </p>
        </CardContent>
      </Card>

      {/* Custom event tracking reference */}
      <Card className="border-border">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MousePointerClick className="w-4 h-4 text-primary" />
            Custom Event Tracking (Optional)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Use <code className="bg-muted px-1 rounded">usePlausible()</code> anywhere in your components to track school-specific events like result views, notice downloads, and admission form opens.
          </p>
          <CodeBlock lang="tsx" code={`import { usePlausible } from "@/hooks/usePlausible";

// Inside any component:
const { trackEvent } = usePlausible();

// Track a result view
trackEvent("Result Viewed", { props: { class: "10", year: "2025" } });

// Track notice download
trackEvent("Notice Downloaded", { props: { title: "Exam Schedule" } });

// Track admission form open
trackEvent("Admission Form Opened");`} />
          <p className="text-xs text-muted-foreground">
            These events appear in your Plausible dashboard under <strong>Goal Conversions</strong>. No-ops silently when Plausible is not configured.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

// ── Main Analytics Component ───────────────────────────────────────────────────
const AdminSiteAnalytics = () => {
  const [range, setRange] = useState<Range>("14");
  const days = parseInt(range);

  const { data: visits = [], isLoading, error, refetch, isFetching } = useSiteVisits(days);

  const dailyData    = buildDailyData(visits, days);
  const hourlyData   = buildHourlyData(visits);
  const topPages     = buildTopPages(visits);
  const deviceData   = buildDeviceData(visits);
  const referrerData = buildReferrerData(visits);
  const weeklyData   = buildWeeklyData(visits);

  const totalViews     = visits.length;
  const uniqueSessions = new Set(visits.map((v) => v.session_id)).size;
  const todayViews     = visits.filter((v) => parseISO(v.visited_at) >= startOfDay(new Date())).length;
  const signedInViews  = visits.filter((v) => v.user_id).length;
  const mobileCount    = visits.filter((v) => v.device_type === "mobile").length;
  const mobilePct      = totalViews ? Math.round((mobileCount / totalViews) * 100) : 0;
  const avgPerDay      = days > 0 ? Math.round(totalViews / days) : 0;
  const viewsTrend     = getTrend(visits, days);
  const sessionsTrend  = getTrend(visits, days);
  const plausibleOn    = isPlausibleEnabled();

  if (isLoading) return <AnalyticsSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <BarChart3 className="w-12 h-12 text-muted-foreground/30" />
        <p className="font-semibold text-foreground">Could not load analytics</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Make sure the <code className="bg-muted px-1 rounded">site_visits</code> table exists in your database.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Site Analytics
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            School visitor insights · {plausibleOn ? (
              <span className="text-emerald-600 font-medium">Plausible active ✓</span>
            ) : (
              <span className="text-amber-500 font-medium">Plausible not configured</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {(["7", "14", "30"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Badge variant="outline" className="text-xs gap-1.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
            Live
          </Badge>
        </div>
      </div>

      {/* Plausible not-configured nudge */}
      {!plausibleOn && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong>Plausible not connected.</strong> You're missing geography, bounce rate, and session depth data.
              </span>
            </div>
            <button
              onClick={() => {
                // Switch to the setup tab — handled by parent Tabs component
                const btn = document.querySelector<HTMLButtonElement>('[data-value="setup"]');
                btn?.click();
              }}
              className="text-xs font-semibold text-amber-700 dark:text-amber-400 underline underline-offset-2 shrink-0 hover:text-amber-900"
            >
              View Setup Guide →
            </button>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Page Views"  value={totalViews}     icon={Eye}       color="#3b82f6" sub={`Last ${days} days`} trend={viewsTrend} />
        <StatCard label="Unique Sessions"   value={uniqueSessions} icon={Users}     color="#8b5cf6" sub="Unique browsers"     trend={sessionsTrend} />
        <StatCard label="Today's Views"     value={todayViews}     icon={TrendingUp} color="#10b981" sub="Since midnight" />
        <StatCard label="Avg Views / Day"   value={avgPerDay}      icon={BarChart3} color="#f59e0b" sub={`Over ${days} days`} />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10"><Smartphone className="w-4 h-4 text-blue-500" /></div>
            <div>
              <p className="text-lg font-bold text-foreground">{mobilePct}%</p>
              <p className="text-xs text-muted-foreground">Mobile Traffic</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-500/10"><MousePointerClick className="w-4 h-4 text-violet-500" /></div>
            <div>
              <p className="text-lg font-bold text-foreground">{signedInViews.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Logged-in Views</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10"><Layers className="w-4 h-4 text-emerald-500" /></div>
            <div>
              <p className="text-lg font-bold text-foreground">
                {uniqueSessions > 0 ? (totalViews / uniqueSessions).toFixed(1) : "0"}
              </p>
              <p className="text-xs text-muted-foreground">Pages / Session</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Traffic */}
      <Card className="border-border">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Daily Traffic — Last {days} Days
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          {totalViews === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 gap-2">
              <Clock className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No visits recorded yet</p>
              <p className="text-xs text-muted-foreground">Browse a few pages to see data appear here</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="visitorsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="signedInGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="views"    name="Page Views"     stroke="#3b82f6" fill="url(#viewsGrad)"    strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="visitors" name="Unique Sessions" stroke="#8b5cf6" fill="url(#visitorsGrad)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="signedIn" name="Logged-in"       stroke="#10b981" fill="url(#signedInGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top Pages + Device Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />Top Pages
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {topPages.length === 0 ? (
              <div className="flex items-center justify-center h-48"><p className="text-sm text-muted-foreground">No data yet</p></div>
            ) : (
              <div className="space-y-2 px-3">
                {topPages.map((p, i) => {
                  const pct = totalViews > 0 ? Math.round((p.views / totalViews) * 100) : 0;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground capitalize truncate max-w-[55%]">{p.page}</span>
                        <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                          <span>{p.views.toLocaleString()} views</span>
                          <span className="text-foreground font-semibold">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: i===0?"#3b82f6":i===1?"#8b5cf6":i===2?"#10b981":"#f59e0b" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-primary" />Device Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {deviceData.length === 0 ? (
              <div className="flex items-center justify-center h-48"><p className="text-sm text-muted-foreground">No data yet</p></div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={160}>
                  <PieChart>
                    <Pie data={deviceData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3} dataKey="value" strokeWidth={0}>
                      {deviceData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v} visits`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-3 flex-1">
                  {[
                    { icon: Smartphone, label: "Mobile",  count: visits.filter(v => v.device_type==="mobile").length,  color: "#3b82f6" },
                    { icon: Monitor,    label: "Desktop", count: visits.filter(v => v.device_type==="desktop").length, color: "#8b5cf6" },
                    { icon: Tablet,     label: "Tablet",  count: visits.filter(v => v.device_type==="tablet").length,  color: "#10b981" },
                  ].map(({ icon: Icon, label, count, color }) => {
                    const pct = totalViews > 0 ? Math.round((count / totalViews) * 100) : 0;
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-semibold text-foreground">{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hourly + Sources + Weekly */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-primary" />Hourly Activity</CardTitle>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hourlyData} margin={{ top: 0, right: 5, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={5} />
                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="visits" name="Visits" fill="#3b82f6" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Globe className="w-4 h-4 text-primary" />Traffic Sources</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {referrerData.length === 0 ? (
              <div className="flex items-center justify-center h-40"><p className="text-sm text-muted-foreground">No data yet</p></div>
            ) : (
              <div className="space-y-3 mt-1">
                {referrerData.map((r, i) => {
                  const pct = totalViews > 0 ? Math.round((r.value / totalViews) * 100) : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: r.color }} />
                          {r.name}
                        </span>
                        <span className="text-muted-foreground">{r.value} <span className="font-semibold text-foreground">({pct}%)</span></span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: r.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />Weekly Comparison</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={weeklyData} margin={{ top: 0, right: 5, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="views"    name="Views"    fill="#3b82f6" radius={[3,3,0,0]} />
                <Bar dataKey="visitors" name="Sessions" fill="#8b5cf6" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Engagement line chart */}
      <Card className="border-border">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />Engagement Trend — Views vs Unique Sessions
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          {totalViews === 0 ? (
            <div className="flex items-center justify-center h-40"><p className="text-sm text-muted-foreground">No data yet</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={dailyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="views"    name="Page Views"     stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="visitors" name="Unique Sessions" stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Summary footer */}
      <Card className="border-border bg-muted/30">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center divide-x divide-border">
            {[
              { label: "Avg Daily Views",      value: avgPerDay.toLocaleString() },
              { label: "Total Unique Sessions", value: uniqueSessions.toLocaleString() },
              { label: "Pages per Session",     value: uniqueSessions > 0 ? (totalViews / uniqueSessions).toFixed(1) : "–" },
              { label: "Mobile Share",          value: `${mobilePct}%` },
            ].map(({ label, value }) => (
              <div key={label} className="px-2">
                <p className="text-lg font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSiteAnalytics;

// ─── WRAPPER with tabs: Analytics | Setup | Pending Requests ─────────────────
export const AdminAnalyticsHub = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
        <Globe className="w-5 h-5 text-primary" /> Analytics & Requests
      </h2>
      <p className="text-sm text-muted-foreground mt-0.5">Site analytics, Plausible setup, and pending user requests</p>
    </div>
    <Tabs defaultValue="analytics" className="w-full">
      <TabsList className="w-full grid grid-cols-3 sm:inline-flex sm:w-auto">
        <TabsTrigger value="analytics" className="gap-1.5 text-xs sm:text-sm">
          <Activity className="w-3.5 h-3.5" /><span>Site Analytics</span>
        </TabsTrigger>
        <TabsTrigger value="setup" data-value="setup" className="gap-1.5 text-xs sm:text-sm">
          <Settings2 className="w-3.5 h-3.5" />
          <span>Analytics Setup</span>
          {!isPlausibleEnabled() && (
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block ml-0.5" />
          )}
        </TabsTrigger>
        <TabsTrigger value="pending" className="gap-1.5 text-xs sm:text-sm">
          <Clock className="w-3.5 h-3.5" /><span>Pending Requests</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="analytics" className="mt-4">
        <AdminSiteAnalytics />
      </TabsContent>

      <TabsContent value="setup" className="mt-4">
        <PlausibleSetupPanel />
      </TabsContent>

      <TabsContent value="pending" className="mt-4">
        <Suspense fallback={<div className="space-y-2">{[...Array(4)].map((_,i)=><div key={i} className="h-12 rounded-lg bg-muted animate-pulse"/>)}</div>}>
          <AdminPendingRequests />
        </Suspense>
      </TabsContent>
    </Tabs>
  </div>
);
