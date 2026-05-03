// src/pages/admin/tabs/AdminSiteAnalytics.tsx
// Site visitor analytics — reads from site_visits table only.
// Uses recharts (already a project dependency).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Users, Eye, Smartphone, Monitor, Tablet,
  TrendingUp, Globe, BarChart3, Clock,
} from "lucide-react";
import { format, subDays, startOfDay, parseISO } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Visit {
  id: string;
  page: string;
  device_type: string;
  session_id: string;
  visited_at: string;
}

// ── Data fetching ──────────────────────────────────────────────────────────────
function useSiteVisits() {
  return useQuery<Visit[]>({
    queryKey: ["site-visits"],
    queryFn: async () => {
      const since = subDays(new Date(), 30).toISOString();
      const { data, error } = await supabase
        .from("site_visits")
        .select("id, page, device_type, session_id, visited_at")
        .gte("visited_at", since)
        .order("visited_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 min
  });
}

// ── Helper: build daily visits for last 14 days ───────────────────────────────
function buildDailyData(visits: Visit[]) {
  const days: Record<string, { date: string; views: number; visitors: Set<string> }> = {};
  for (let i = 13; i >= 0; i--) {
    const d = format(subDays(new Date(), i), "MMM d");
    days[d] = { date: d, views: 0, visitors: new Set() };
  }
  visits.forEach((v) => {
    const d = format(parseISO(v.visited_at), "MMM d");
    if (days[d]) {
      days[d].views += 1;
      days[d].visitors.add(v.session_id);
    }
  });
  return Object.values(days).map((d) => ({
    date: d.date,
    views: d.views,
    visitors: d.visitors.size,
  }));
}

// ── Helper: top pages ─────────────────────────────────────────────────────────
function buildTopPages(visits: Visit[]) {
  const counts: Record<string, number> = {};
  visits.forEach((v) => { counts[v.page] = (counts[v.page] ?? 0) + 1; });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([page, views]) => ({ page: page === "/" ? "Home" : page.replace("/", ""), views }));
}

// ── Helper: device split ──────────────────────────────────────────────────────
function buildDeviceData(visits: Visit[]) {
  const counts: Record<string, number> = { mobile: 0, tablet: 0, desktop: 0 };
  visits.forEach((v) => { counts[v.device_type] = (counts[v.device_type] ?? 0) + 1; });
  return [
    { name: "Mobile",  value: counts.mobile,  color: "#3b82f6" },
    { name: "Desktop", value: counts.desktop, color: "#8b5cf6" },
    { name: "Tablet",  value: counts.tablet,  color: "#10b981" },
  ].filter((d) => d.value > 0);
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, icon: Icon, color, sub,
}: { label: string; value: number | string; icon: React.ElementType; color: string; sub?: string }) {
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}20` }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const AdminSiteAnalytics = () => {
  const { data: visits = [], isLoading, error } = useSiteVisits();

  const dailyData  = buildDailyData(visits);
  const topPages   = buildTopPages(visits);
  const deviceData = buildDeviceData(visits);

  const totalViews    = visits.length;
  const uniqueSessions = new Set(visits.map((v) => v.session_id)).size;
  const todayViews    = visits.filter(
    (v) => parseISO(v.visited_at) >= startOfDay(new Date())
  ).length;
  const mobileCount   = visits.filter((v) => v.device_type === "mobile").length;
  const mobilePct     = totalViews ? Math.round((mobileCount / totalViews) * 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-52" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <BarChart3 className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-muted-foreground font-medium">Could not load analytics</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Make sure you ran the SQL migration to create the <code>site_visits</code> table.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Site Analytics
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Last 30 days • Auto-refreshes every 5 min</p>
        </div>
        <Badge variant="outline" className="text-xs gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
          Live
        </Badge>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Views"      value={totalViews}     icon={Eye}        color="#3b82f6" sub="Last 30 days" />
        <StatCard label="Unique Sessions"  value={uniqueSessions} icon={Users}      color="#8b5cf6" sub="Unique browsers" />
        <StatCard label="Today's Views"    value={todayViews}     icon={TrendingUp} color="#10b981" sub="Since midnight" />
        <StatCard label="Mobile Traffic"   value={`${mobilePct}%`} icon={Smartphone} color="#1e3a8a" sub={`${mobileCount} visits`} />
      </div>

      {/* Daily Area Chart */}
      <Card className="border-border">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Daily Traffic — Last 14 Days
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          {totalViews === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <Clock className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No visits recorded yet</p>
              <p className="text-xs text-muted-foreground">Visit a few pages on your website to see data here</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="visitorsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="views"    name="Page Views" stroke="#3b82f6" fill="url(#viewsGrad)"    strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="visitors" name="Visitors"   stroke="#8b5cf6" fill="url(#visitorsGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bottom two charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Top Pages Bar Chart */}
        <Card className="border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Top Pages
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {topPages.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <p className="text-sm text-muted-foreground">No data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topPages} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="page" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={60} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="views" name="Views" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Device Pie Chart */}
        <Card className="border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-primary" />
              Device Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {deviceData.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <p className="text-sm text-muted-foreground">No data yet</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={deviceData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                      {deviceData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v} visits`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 flex-wrap mt-1">
                  {deviceData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-semibold text-foreground">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Device icons legend */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { icon: Smartphone, label: "Mobile",  count: visits.filter(v => v.device_type === "mobile").length,  color: "#3b82f6" },
              { icon: Monitor,    label: "Desktop", count: visits.filter(v => v.device_type === "desktop").length, color: "#8b5cf6" },
              { icon: Tablet,     label: "Tablet",  count: visits.filter(v => v.device_type === "tablet").length,  color: "#10b981" },
            ].map(({ icon: Icon, label, count, color }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <p className="text-lg font-bold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSiteAnalytics;
        
