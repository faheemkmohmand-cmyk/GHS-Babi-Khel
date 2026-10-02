// src/components/admin/SiteAnalytics.tsx
//
// Site Analytics — a rich analytics dashboard embedded in the admin overview.
// Shows visitor metrics, trend charts, device breakdowns, top pages,
// referrers, and comparison data with configurable time periods.
// Fully mobile-friendly with responsive grid layouts.
// Includes error handling so it never crashes the parent dashboard.

import { useState } from "react";
import { useSiteAnalytics, type AnalyticsPeriod } from "@/hooks/useSiteAnalytics";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Eye, Users, Monitor, Smartphone, Tablet, TrendingUp,
  ArrowUpRight, ArrowDownRight, Clock, Globe, BarChart3,
  RefreshCw, Minus, MousePointerClick, UserCheck, Layers,
  Activity, AlertCircle,
} from "lucide-react";

// ─── Chart color palette ────────────────────────────────────────────────────
const COLORS = [
  "hsl(221, 83%, 53%)",   // blue
  "hsl(142, 71%, 45%)",   // emerald
  "hsl(262, 83%, 58%)",   // violet
  "hsl(38, 92%, 50%)",    // amber
  "hsl(346, 77%, 50%)",   // rose
  "hsl(199, 89%, 48%)",   // sky
  "hsl(173, 80%, 40%)",   // teal
  "hsl(24, 95%, 53%)",    // orange
];

const DEVICE_COLORS: Record<string, string> = {
  desktop: "hsl(221, 83%, 53%)",
  mobile: "hsl(142, 71%, 45%)",
  tablet: "hsl(262, 83%, 58%)",
  unknown: "hsl(220, 9%, 46%)",
};

const visitChartConfig: ChartConfig = {
  visits: { label: "Page Views", color: "hsl(221, 83%, 53%)" },
  uniqueVisitors: { label: "Unique Visitors", color: "hsl(142, 71%, 45%)" },
};

const hourlyChartConfig: ChartConfig = {
  visits: { label: "Visits", color: "hsl(262, 83%, 58%)" },
};

const deviceChartConfig: ChartConfig = {
  desktop: { label: "Desktop", color: "hsl(221, 83%, 53%)" },
  mobile: { label: "Mobile", color: "hsl(142, 71%, 45%)" },
  tablet: { label: "Tablet", color: "hsl(262, 83%, 58%)" },
  unknown: { label: "Unknown", color: "hsl(220, 9%, 46%)" },
};

// ─── Period selector ────────────────────────────────────────────────────────
const periods: { value: AnalyticsPeriod; label: string }[] = [
  { value: 1, label: "Today" },
  { value: 7, label: "7 Days" },
  { value: 15, label: "15 Days" },
  { value: 30, label: "30 Days" },
];

// ─── Change Badge ───────────────────────────────────────────────────────────
const ChangeBadge = ({ value, invert = false }: { value: number; invert?: boolean }) => {
  const isPositive = invert ? value < 0 : value > 0;
  const isNeutral = value === 0;
  if (isNeutral) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
        <Minus className="w-2.5 h-2.5" />0%
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
      isPositive
        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
        : "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400"
    }`}>
      {isPositive ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
      {Math.abs(value)}%
    </span>
  );
};

// ─── Metric Card ────────────────────────────────────────────────────────────
interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  change?: number;
  invertChange?: boolean;
  subtitle?: string;
  isLoading: boolean;
}

const MetricCard = ({ label, value, icon: Icon, color, bgColor, change, invertChange, subtitle, isLoading }: MetricCardProps) => (
  <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 relative overflow-hidden">
    <div className="flex items-start justify-between">
      <div className={`w-9 h-9 rounded-xl ${bgColor} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      {change !== undefined && <ChangeBadge value={change} invert={invertChange} />}
    </div>
    {isLoading ? (
      <Skeleton className="h-7 w-16" />
    ) : (
      <p className="text-2xl font-extrabold text-foreground tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
    )}
    <div>
      <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
      {subtitle && <p className="text-[10px] text-muted-foreground/70">{subtitle}</p>}
    </div>
    <div className={`absolute -bottom-2 -right-2 w-10 h-10 rounded-full opacity-10 ${bgColor}`} />
  </div>
);

// ─── Section Header ─────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, action }: { icon: React.ElementType; title: string; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <h3 className="text-base font-bold text-foreground">{title}</h3>
    </div>
    {action}
  </div>
);

// ─── Custom label for pie chart ─────────────────────────────────────────────
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-bold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h > 12 ? `${h - 12} PM` : `${h} AM`;
}

// ─── Main Component ─────────────────────────────────────────────────────────
const SiteAnalytics = () => {
  const [period, setPeriod] = useState<AnalyticsPeriod>(7);
  const { data, isLoading, error, refetch, isFetching } = useSiteAnalytics(period);

  // Error state — show a friendly message instead of crashing
  if (error) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <SectionHeader icon={BarChart3} title="Site Analytics" />
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Retry"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <h4 className="text-sm font-bold text-foreground mb-1">Unable to load analytics</h4>
          <p className="text-xs text-muted-foreground mb-3">
            The site_visits table might not exist yet or access is denied. Please make sure you have run the SQL migration in Supabase.
          </p>
          <p className="text-[10px] text-muted-foreground/70 font-mono break-all">{error?.message || "Unknown error"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header with period selector ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <div className="flex bg-secondary rounded-xl p-1 gap-0.5">
            {periods.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  period === p.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh analytics"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Key Metrics Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Total Page Views"
          value={data?.summary.totalVisits ?? 0}
          icon={Eye}
          color="text-blue-600 dark:text-blue-400"
          bgColor="bg-blue-100 dark:bg-blue-500/20"
          change={data?.comparison.visitsChange}
          subtitle={`${data?.summary.avgDailyVisits ?? 0} avg/day`}
          isLoading={isLoading}
        />
        <MetricCard
          label="Unique Visitors"
          value={data?.summary.uniqueVisitors ?? 0}
          icon={Users}
          color="text-emerald-600 dark:text-emerald-400"
          bgColor="bg-emerald-100 dark:bg-emerald-500/20"
          change={data?.comparison.uniqueChange}
          subtitle={`${data?.summary.returningVisitors ?? 0} returning`}
          isLoading={isLoading}
        />
        <MetricCard
          label="Bounce Rate"
          value={`${data?.summary.bounceRate ?? 0}%`}
          icon={Activity}
          color="text-amber-600 dark:text-amber-400"
          bgColor="bg-amber-100 dark:bg-amber-500/20"
          change={data?.comparison.bounceChange}
          invertChange
          subtitle="lower is better"
          isLoading={isLoading}
        />
        <MetricCard
          label="Avg Pages/Session"
          value={data?.summary.avgPagesPerSession ?? 0}
          icon={Layers}
          color="text-violet-600 dark:text-violet-400"
          bgColor="bg-violet-100 dark:bg-violet-500/20"
          subtitle={`${data?.summary.uniqueUsers ?? 0} logged-in users`}
          isLoading={isLoading}
        />
      </div>

      {/* ── Traffic Trend Chart ── */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-bold text-foreground">Traffic Trend</h4>
          </div>
          {data?.summary.peakDay && (
            <span className="text-[10px] text-muted-foreground font-medium bg-secondary px-2 py-1 rounded-lg">
              Peak: {formatShortDate(data.summary.peakDay.date)} ({data.summary.peakDay.visits} views)
            </span>
          )}
        </div>
        {isLoading ? (
          <Skeleton className="h-[220px] w-full rounded-xl" />
        ) : (
          <ChartContainer config={visitChartConfig} className="h-[220px] w-full">
            <AreaChart data={data?.dailyTrend ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="fillVisits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-visits)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-visits)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fillUnique" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-uniqueVisitors)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-uniqueVisitors)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-[10px]"
                interval={period > 7 ? Math.floor((period - 1) / 6) : 0}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} className="text-[10px]" />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                type="monotone"
                dataKey="visits"
                stroke="var(--color-visits)"
                strokeWidth={2}
                fill="url(#fillVisits)"
                dot={period <= 7 ? { r: 3, strokeWidth: 2 } : false}
                activeDot={{ r: 5, strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="uniqueVisitors"
                stroke="var(--color-uniqueVisitors)"
                strokeWidth={2}
                fill="url(#fillUnique)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>

      {/* ── Two-column: Device Breakdown + Hourly Activity ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Device Breakdown */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Monitor className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-bold text-foreground">Device Breakdown</h4>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center">
              <Skeleton className="h-[180px] w-[180px] rounded-full" />
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-[160px] h-[160px] shrink-0">
                <ChartContainer config={deviceChartConfig} className="w-full h-full">
                  <PieChart>
                    <Pie
                      data={data?.deviceBreakdown ?? []}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="count"
                      nameKey="device"
                      label={renderCustomLabel}
                      labelLine={false}
                    >
                      {(data?.deviceBreakdown ?? []).map((entry, idx) => (
                        <Cell
                          key={`cell-${idx}`}
                          fill={DEVICE_COLORS[entry.device] || COLORS[idx % COLORS.length]}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent nameKey="device" hideLabel />} />
                  </PieChart>
                </ChartContainer>
              </div>
              <div className="flex-1 space-y-2 w-full">
                {data?.deviceBreakdown.map((d, i) => {
                  const iconMap: Record<string, React.ElementType> = {
                    desktop: Monitor,
                    mobile: Smartphone,
                    tablet: Tablet,
                    unknown: Globe,
                  };
                  const Icon = iconMap[d.device] || Globe;
                  return (
                    <div key={d.device} className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${DEVICE_COLORS[d.device] || COLORS[i]}20` }}
                      >
                        <Icon className="w-4 h-4" style={{ color: DEVICE_COLORS[d.device] || COLORS[i] }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground capitalize">{d.device}</span>
                          <span className="text-xs font-bold text-foreground tabular-nums">{d.count.toLocaleString()}</span>
                        </div>
                        <div className="w-full h-1.5 bg-secondary rounded-full mt-1 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${d.percentage}%`,
                              backgroundColor: DEVICE_COLORS[d.device] || COLORS[i],
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground tabular-nums w-8 text-right">{d.percentage}%</span>
                    </div>
                  );
                })}
                {(!data?.deviceBreakdown.length) && (
                  <p className="text-xs text-muted-foreground text-center py-4">No device data yet</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Hourly Activity */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-bold text-foreground">Hourly Activity</h4>
            </div>
            {data?.summary.peakHour !== null && data?.summary.peakHour !== undefined && (
              <span className="text-[10px] text-muted-foreground font-medium bg-secondary px-2 py-1 rounded-lg">
                Peak: {formatHour(data.summary.peakHour)}
              </span>
            )}
          </div>
          {isLoading ? (
            <Skeleton className="h-[180px] w-full rounded-xl" />
          ) : (
            <ChartContainer config={hourlyChartConfig} className="h-[180px] w-full">
              <BarChart data={data?.hourlyDistribution ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  className="text-[9px]"
                  interval={2}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={4} className="text-[10px]" />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <Bar
                  dataKey="visits"
                  fill="var(--color-visits)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </div>

      {/* ── Two-column: Top Pages + Top Referrers ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Pages */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <MousePointerClick className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-bold text-foreground">Top Pages</h4>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
            </div>
          ) : !data?.topPages.length ? (
            <p className="text-xs text-muted-foreground text-center py-6">No page data yet</p>
          ) : (
            <ul className="space-y-1.5">
              {data.topPages.map((p, i) => {
                const maxVisits = data.topPages[0]?.visits || 1;
                const widthPct = Math.round((p.visits / maxVisits) * 100);
                return (
                  <li key={p.page + i} className="group">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-foreground truncate max-w-[65%]">{p.page}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground tabular-nums">{p.uniqueVisitors} unique</span>
                        <span className="text-xs font-bold text-foreground tabular-nums">{p.visits.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 bg-primary"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Top Referrers */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-bold text-foreground">Top Referrers</h4>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
            </div>
          ) : !data?.topReferrers.length ? (
            <p className="text-xs text-muted-foreground text-center py-6">No referrer data yet</p>
          ) : (
            <ul className="space-y-1.5">
              {data.topReferrers.map((r, i) => {
                const maxRefVisits = data.topReferrers[0]?.visits || 1;
                const widthPct = Math.round((r.visits / maxRefVisits) * 100);
                return (
                  <li key={r.referrer + i} className="group">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-foreground truncate max-w-[65%]">{r.referrer}</span>
                      <span className="text-xs font-bold text-foreground tabular-nums">{r.visits.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: COLORS[i % COLORS.length],
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Comparison Summary ── */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <UserCheck className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-bold text-foreground">Period Comparison</h4>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground font-medium mb-1">Page Views Change</p>
              <div className="flex items-center justify-center gap-1">
                <ChangeBadge value={data?.comparison.visitsChange ?? 0} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">vs previous {period} days</p>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground font-medium mb-1">Unique Visitors Change</p>
              <div className="flex items-center justify-center gap-1">
                <ChangeBadge value={data?.comparison.uniqueChange ?? 0} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">vs previous {period} days</p>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground font-medium mb-1">Bounce Rate Change</p>
              <div className="flex items-center justify-center gap-1">
                <ChangeBadge value={data?.comparison.bounceChange ?? 0} invert />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">vs previous {period} days</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SiteAnalytics;
