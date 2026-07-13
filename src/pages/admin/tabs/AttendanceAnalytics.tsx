/**
 * AttendanceAnalytics.tsx — Feature 4.5: Attendance Trend Charts & Analytics
 *
 * Interactive analytics dashboard with:
 * - Monthly attendance trend line chart
 * - Class-wise comparison bar chart
 * - Day-of-week patterns bar chart
 * - Heat map calendar (color-coded daily attendance rate)
 * - Key metrics cards (avg daily rate, chronic absentee rate, most improved, peak absence day)
 * - Attendance warnings for students below threshold
 *
 * Mobile-friendly, uses Recharts for all charts.
 */

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend, ReferenceLine, Area, AreaChart,
} from "recharts";
import {
  TrendingUp, BarChart3, Calendar, AlertTriangle, Users, Award,
  ChevronLeft, ChevronRight, Thermometer, Clock, ArrowUp, ArrowDown,
  Shield, ShieldAlert, ShieldCheck,
} from "lucide-react";
import {
  useMonthlyTrend,
  useClassComparison,
  useDayOfWeekPatterns,
  useAttendanceHeatmap,
  useAttendanceMetrics,
  useStudentAttendanceWarnings,
  useAttendanceThresholds,
  useSaveThreshold,
  useDeleteThreshold,
} from "@/hooks/useAttendanceAnalytics";
import { format } from "date-fns";

const classes = ["6", "7", "8", "9", "10"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── Color Helpers ──────────────────────────────────────────────────────────

function heatColor(rate: number): string {
  if (rate >= 95) return "bg-green-500";
  if (rate >= 85) return "bg-green-400";
  if (rate >= 75) return "bg-yellow-400";
  if (rate >= 60) return "bg-orange-400";
  return "bg-red-500";
}

function heatText(rate: number): string {
  if (rate >= 85) return "text-white";
  if (rate >= 60) return "text-gray-900";
  return "text-white";
}

function heatBorder(rate: number): string {
  if (rate >= 95) return "border-green-600";
  if (rate >= 85) return "border-green-500";
  if (rate >= 75) return "border-yellow-500";
  if (rate >= 60) return "border-orange-500";
  return "border-red-600";
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

/** Key Metrics Cards */
function MetricsCards({ cls, month, year }: { cls: string; month: number; year: number }) {
  const { data: metrics, isLoading } = useAttendanceMetrics(cls, month, year);

  if (isLoading) return <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;
  if (!metrics) return null;

  const items = [
    {
      icon: <TrendingUp className="w-5 h-5" />,
      label: "Avg Daily Rate",
      value: `${metrics.avgDailyRate}%`,
      sub: "This month",
      tone: metrics.avgDailyRate >= 85 ? "text-green-600 bg-green-50 dark:bg-green-900/20" : metrics.avgDailyRate >= 75 ? "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20" : "text-red-600 bg-red-50 dark:bg-red-900/20",
    },
    {
      icon: <AlertTriangle className="w-5 h-5" />,
      label: "Chronic Absentees",
      value: `${metrics.chronicAbsenteeCount}`,
      sub: `${metrics.chronicAbsenteeRate}% of class (below 75%)`,
      tone: metrics.chronicAbsenteeCount === 0 ? "text-green-600 bg-green-50 dark:bg-green-900/20" : "text-red-600 bg-red-50 dark:bg-red-900/20",
    },
    {
      icon: <Award className="w-5 h-5" />,
      label: "Most Improved",
      value: metrics.mostImprovedStudent ? metrics.mostImprovedStudent.name.split(" ")[0] : "N/A",
      sub: metrics.mostImprovedStudent ? `+${metrics.mostImprovedStudent.improvement}% this month` : "Not enough data",
      tone: "text-blue-600 bg-blue-50 dark:bg-blue-900/20",
    },
    {
      icon: <Calendar className="w-5 h-5" />,
      label: "Peak Absence Day",
      value: metrics.peakAbsenceDay ? format(new Date(metrics.peakAbsenceDay.date), "dd MMM") : "N/A",
      sub: metrics.peakAbsenceDay ? `${metrics.peakAbsenceDay.rate}% attendance` : "No absences",
      tone: "text-orange-600 bg-orange-50 dark:bg-orange-900/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => (
        <div key={item.label} className={`rounded-xl border border-border p-3.5 ${item.tone}`}>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">
            {item.icon}{item.label}
          </div>
          <div className="mt-1.5 text-xl font-bold text-foreground">{item.value}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground truncate">{item.sub}</div>
        </div>
      ))}
    </div>
  );
}

/** Monthly Trend Line Chart */
function MonthlyTrendChart({ cls, year }: { cls: string; year: number }) {
  const { data: trends, isLoading } = useMonthlyTrend(cls, year);

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (!trends?.length) return (
    <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
      No monthly trend data available for {year}.
    </CardContent></Card>
  );

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" /> Monthly Attendance Trend — {year}
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={trends} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <defs>
              <linearGradient id="colorPct" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === "percentage") return [`${value}%`, "Attendance"];
                return [value, name];
              }}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "Min 75%", fontSize: 9, fill: "#ef4444" }} />
            <Area type="monotone" dataKey="percentage" stroke="#6366f1" strokeWidth={2.5} fill="url(#colorPct)" dot={{ fill: "#6366f1", r: 4 }} activeDot={{ r: 6 }} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/** Class Comparison Bar Chart */
function ClassComparisonChart({ month, year }: { month: number; year: number }) {
  const { data: comparison, isLoading } = useClassComparison(month, year);

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (!comparison?.length) return (
    <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
      No class comparison data available.
    </CardContent></Card>
  );

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-primary" /> Class-Wise Comparison — {MONTH_NAMES[month - 1]} {year}
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={comparison} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="className" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
            <Tooltip formatter={(v: number) => [`${v}%`]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "Min", fontSize: 9, fill: "#ef4444" }} />
            <Bar dataKey="averagePercentage" radius={[6, 6, 0, 0]} name="Attendance %">
              {comparison.map((entry, i) => (
                <Cell key={i} fill={entry.averagePercentage >= 85 ? "#10b981" : entry.averagePercentage >= 75 ? "#6366f1" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/** Day-of-Week Pattern Chart */
function DayOfWeekChart({ cls, year }: { cls: string; year: number }) {
  const { data: patterns, isLoading } = useDayOfWeekPatterns(cls, year);

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (!patterns?.length) return (
    <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
      No day-of-week data available.
    </CardContent></Card>
  );

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-primary" /> Day-of-Week Attendance Pattern — Class {cls}
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={patterns} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
            <Tooltip formatter={(v: number) => [`${v}%`]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 2" />
            <Bar dataKey="avgAttendanceRate" radius={[6, 6, 0, 0]} name="Avg Rate %">
              {patterns.map((entry, i) => (
                <Cell key={i} fill={entry.avgAttendanceRate >= 90 ? "#10b981" : entry.avgAttendanceRate >= 80 ? "#6366f1" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/** Heat Map Calendar */
function HeatmapCalendar({ cls, month, year }: { cls: string; month: number; year: number }) {
  const { data: heatmap, isLoading } = useAttendanceHeatmap(cls, month, year);

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0=Sun

  // Build a grid (7 cols x ~5 rows)
  const dayDataMap = new Map<number, typeof heatmap extends (infer T)[] ? T : never>();
  heatmap?.forEach((d) => dayDataMap.set(d.day, d as any));

  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = [];

  // Fill leading empty cells
  for (let i = 0; i < firstDayOfWeek; i++) currentWeek.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  // Fill trailing empty cells
  while (currentWeek.length < 7 && currentWeek.length > 0) currentWeek.push(null);
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
          <Thermometer className="w-4 h-4 text-primary" /> Attendance Heat Map — {MONTH_NAMES[month - 1]} {year}
        </h3>

        {/* Legend */}
        <div className="flex items-center gap-2 mb-3 text-[10px] text-muted-foreground">
          <span>Low</span>
          <div className="flex gap-0.5">
            <div className="w-4 h-4 rounded-sm bg-red-500" />
            <div className="w-4 h-4 rounded-sm bg-orange-400" />
            <div className="w-4 h-4 rounded-sm bg-yellow-400" />
            <div className="w-4 h-4 rounded-sm bg-green-400" />
            <div className="w-4 h-4 rounded-sm bg-green-500" />
          </div>
          <span>High</span>
          <span className="ml-2">(95%+ green, 85-94% yellow, &lt;85% red)</span>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Day labels */}
          {dayLabels.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
          ))}

          {/* Day cells */}
          {weeks.map((week, wi) =>
            week.map((day, di) => {
              if (day === null) return <div key={`${wi}-${di}`} />;
              const data = dayDataMap.get(day) as any;
              const rate = data?.attendanceRate ?? -1;
              const isWeekend = di === 0 || di === 6;

              if (isWeekend) {
                return (
                  <div key={`${wi}-${di}`} className="aspect-square rounded-md bg-muted/30 flex items-center justify-center text-[10px] text-muted-foreground">
                    {day}
                  </div>
                );
              }

              if (rate < 0) {
                return (
                  <div key={`${wi}-${di}`} className="aspect-square rounded-md border border-border/50 bg-muted/20 flex items-center justify-center text-[10px] text-muted-foreground">
                    {day}
                  </div>
                );
              }

              return (
                <div
                  key={`${wi}-${di}`}
                  className={`aspect-square rounded-md border ${heatBorder(rate)} ${heatColor(rate)} ${heatText(rate)} flex flex-col items-center justify-center cursor-default`}
                  title={`${format(new Date(year, month - 1, day), "dd MMM")}: ${rate}% attendance`}
                >
                  <span className="text-[10px] font-bold leading-none">{day}</span>
                  <span className="text-[8px] font-medium leading-none mt-0.5">{rate}%</span>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Student Warnings Table */
function WarningsTable({ cls, year }: { cls: string; year: number }) {
  const { data: warnings, isLoading } = useStudentAttendanceWarnings(cls, year);

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (!warnings?.length) return (
    <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
      <ShieldCheck className="w-8 h-8 text-green-500 mx-auto mb-2" />
      All students have good attendance. No warnings to show.
    </CardContent></Card>
  );

  const statusConfig = {
    critical: { label: "Critical", icon: <ShieldAlert className="w-3.5 h-3.5" />, cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200" },
    warning: { label: "Warning", icon: <Shield className="w-3.5 h-3.5" />, cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200" },
    caution: { label: "Caution", icon: <AlertTriangle className="w-3.5 h-3.5" />, cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200" },
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b border-border bg-red-50/50 dark:bg-red-900/10">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="w-4 h-4" /> Attendance Warnings — {warnings.length} student{warnings.length !== 1 ? "s" : ""} flagged
          </h3>
        </div>
        <div className="divide-y divide-border">
          {warnings.map((w) => {
            const cfg = statusConfig[w.status as keyof typeof statusConfig];
            return (
              <div key={w.student_id} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors">
                <Badge className={`gap-1 text-[10px] shrink-0 ${cfg.cls}`}>{cfg.icon}{cfg.label}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{w.student_name}</p>
                  <p className="text-[11px] text-muted-foreground">Roll: {w.roll_number} · {w.days_present}P / {w.days_halfday}HD / {w.days_absent}A of {w.total_days} days</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-sm font-bold ${w.attendance_percentage < 75 ? "text-red-600" : "text-orange-600"}`}>
                    {w.attendance_percentage}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/** Threshold Manager */
function ThresholdManager() {
  const { data: thresholds, isLoading } = useAttendanceThresholds();
  const saveThreshold = useSaveThreshold();
  const deleteThreshold = useDeleteThreshold();
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newMin, setNewMin] = useState("75");
  const [newWarn, setNewWarn] = useState("80");

  const handleSave = () => {
    if (!newName.trim()) return;
    saveThreshold.mutate({
      ...(editing ? { id: editing } : {}),
      name: newName.trim(),
      minimum_percentage: parseFloat(newMin),
      warning_threshold: parseFloat(newWarn),
      is_active: true,
    }, {
      onSuccess: () => {
        setEditing(null);
        setNewName("");
        setNewMin("75");
        setNewWarn("80");
      },
    });
  };

  if (isLoading) return <Skeleton className="h-40 rounded-xl" />;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" /> Attendance Threshold Configuration
        </h3>
        <p className="text-xs text-muted-foreground">
          Set minimum attendance percentage required for exam eligibility. Students below this threshold receive warnings.
        </p>

        {/* Existing thresholds */}
        {thresholds?.map((t) => (
          <div key={t.id} className={`flex items-center gap-3 p-3 rounded-lg border ${t.is_active ? "border-primary/40 bg-primary/5" : "border-border"}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t.name} {t.is_active && <Badge variant="secondary" className="ml-1 text-[9px]">Active</Badge>}</p>
              <p className="text-[11px] text-muted-foreground">Min: {t.minimum_percentage}% · Warning at: {t.warning_threshold}%</p>
            </div>
            <div className="flex gap-2">
              {!t.is_active && (
                <Button variant="outline" size="sm" className="h-7 text-[10px]"
                  onClick={() => saveThreshold.mutate({ id: t.id, name: t.name, minimum_percentage: t.minimum_percentage, warning_threshold: t.warning_threshold, is_active: true })}
                >Activate</Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-[10px] text-destructive"
                onClick={() => deleteThreshold.mutate(t.id)}
              >Delete</Button>
            </div>
          </div>
        ))}

        {/* Add / Edit form */}
        <div className="border border-dashed border-border rounded-lg p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            {editing ? "Edit Threshold" : "Add New Threshold"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text" placeholder="Name (e.g. BISE Standard)" value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs"
            />
            <input
              type="number" placeholder="Min % (e.g. 75)" value={newMin}
              onChange={(e) => setNewMin(e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs"
            />
            <input
              type="number" placeholder="Warning % (e.g. 80)" value={newWarn}
              onChange={(e) => setNewWarn(e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={!newName.trim()} className="h-7 text-[10px]">
              {editing ? "Update" : "Add Threshold"}
            </Button>
            {editing && (
              <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setNewName(""); }} className="h-7 text-[10px]">Cancel</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

const AttendanceAnalytics = () => {
  const now = new Date();
  const [cls, setCls] = useState("6");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" /> Attendance Analytics
        </h2>
        <p className="text-xs text-muted-foreground">Visual insights, trends, and early warning system</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={cls} onValueChange={setCls}>
          <SelectTrigger className="w-28 sm:w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {classes.map((c) => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <MetricsCards cls={cls} month={month} year={year} />

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MonthlyTrendChart cls={cls} year={year} />
        <ClassComparisonChart month={month} year={year} />
        <DayOfWeekChart cls={cls} year={year} />
        <HeatmapCalendar cls={cls} month={month} year={year} />
      </div>

    </div>
  );
};

export default AttendanceAnalytics;
