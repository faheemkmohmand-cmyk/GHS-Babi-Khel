// SchoolAnalyticsTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Three-section analytics dashboard:
//   1. OVERVIEW  — Top performer (topper) of each class 6-10, live honor cards
//   2. CLASSES   — Pick a class → full detailed analytics for that class only
//   3. STUDENTS  — Pick a class → pick a student → their full personal report
//
// Used in: Admin Dashboard (analytics tab) + User Dashboard (analytics tab)
// All data is live from Supabase results + students tables.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend, ReferenceLine, PieChart, Pie,
} from "recharts";
import {
  TrendingUp, Users, Award, BarChart3, BookOpen, CheckCircle,
  Crown, ChevronRight, ChevronLeft, Star, Target,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ── Constants ─────────────────────────────────────────────────────────────────
const ALL_CLASSES = ["6", "7", "8", "9", "10"];
const CLASS_COLORS: Record<string, string> = {
  "6":  "#6366f1",
  "7":  "#10b981",
  "8":  "#1e3a8a",
  "9":  "#ef4444",
  "10": "#8b5cf6",
};
const SUBJECT_COLORS = [
  "#6366f1","#10b981","#1e3a8a","#ef4444","#8b5cf6",
  "#14b8a6","#f97316","#06b6d4","#84cc16","#ec4899",
];
const EXAM_TYPES: Record<string, string[]> = {
  "6":  ["1st Semester", "2nd Semester"],
  "7":  ["1st Semester", "2nd Semester"],
  "8":  ["1st Semester", "2nd Semester"],
  "9":  ["Annual-I", "Annual-II"],
  "10": ["Annual-I", "Annual-II"],
};
const currentYear = new Date().getFullYear();

// ── Types ─────────────────────────────────────────────────────────────────────
interface Result {
  id: string;
  student_id: string;
  class: string;
  exam_type: string;
  year: number;
  total_marks: number;
  obtained_marks: number;
  percentage: number;
  grade: string | null;
  position: number | null;
  is_pass: boolean;
  subject_marks: Record<string, { obtained: number; total: number }> | null;
  students: { full_name: string; roll_number: string; photo_url: string | null } | null;
}

// ── Data hooks ─────────────────────────────────────────────────────────────────

function useAllResults(year: number) {
  return useQuery<Result[]>({
    queryKey: ["all-results-analytics", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("id, student_id, class, exam_type, year, total_marks, obtained_marks, percentage, grade, position, is_pass, subject_marks, students(full_name, roll_number, photo_url)")
        .eq("year", year)
        .eq("is_published", true)
        .order("percentage", { ascending: false })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as unknown as Result[];
    },
    staleTime: 3 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

function useClassStudents(cls: string, year: number) {
  return useQuery({
    queryKey: ["class-students-analytics", cls, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("student_id, students(full_name, roll_number, photo_url)")
        .eq("class", cls)
        .eq("year", year)
        .eq("is_published", true);
      if (error) return [];
      const seen = new Set<string>();
      return (data ?? [])
        .filter((r: any) => { if (seen.has(r.student_id)) return false; seen.add(r.student_id); return true; })
        .map((r: any) => ({
          id: r.student_id,
          full_name: r.students?.full_name ?? "Unknown",
          roll_number: r.students?.roll_number ?? "",
          photo_url: r.students?.photo_url ?? null,
        }))
        .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));
    },
    enabled: !!cls,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex flex-col items-center bg-card border border-border rounded-2xl p-3 shadow-sm min-w-0">
      <span className="text-xl font-black" style={{ color }}>{value}</span>
      <span className="text-[10px] text-muted-foreground font-medium mt-0.5 text-center leading-tight">{label}</span>
    </div>
  );
}

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-lg text-xs max-w-[200px]">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(1) : p.value}{p.name?.toLowerCase().includes("%") || p.name?.toLowerCase().includes("avg") || p.name?.toLowerCase().includes("rate") ? "%" : ""}</strong>
        </p>
      ))}
    </div>
  );
};

function SectionCard({ title, icon: Icon, children, color = "#6366f1" }: {
  title: string; icon: React.ElementType; children: React.ReactNode; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
        <Icon className="w-4 h-4 shrink-0" style={{ color }} />
        <span className="font-bold text-sm text-foreground">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── NAV TABS ──────────────────────────────────────────────────────────────────
type MainTab = "overview" | "classes" | "students";

function NavTabs({ active, onChange }: { active: MainTab; onChange: (t: MainTab) => void }) {
  const tabs: { id: MainTab; label: string; emoji: string }[] = [
    { id: "overview", label: "Overview",  emoji: "🏆" },
    { id: "classes",  label: "Classes",   emoji: "📊" },
    { id: "students", label: "Students",  emoji: "👤" },
  ];
  return (
    <div className="flex gap-1 p-1 bg-secondary rounded-xl">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
            active === t.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>{t.emoji}</span>
          <span className="hidden sm:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: OVERVIEW — Toppers of each class
// ─────────────────────────────────────────────────────────────────────────────

function TopperCard({ cls, results }: { cls: string; results: Result[] }) {
  const clsResults = results.filter((r) => r.class === cls);
  if (!clsResults.length) return null;
  const topper = clsResults[0];
  const name = topper.students?.full_name ?? "Unknown";
  const roll = topper.students?.roll_number ?? "";
  const photo = topper.students?.photo_url;
  const pct = topper.percentage ?? 0;
  const grade = topper.grade ?? (pct >= 90 ? "A+" : pct >= 80 ? "A" : pct >= 60 ? "B" : "C");
  const color = CLASS_COLORS[cls] ?? "#6366f1";
  const avg = clsResults.reduce((s, r) => s + (r.percentage ?? 0), 0) / clsResults.length;
  const passed = clsResults.filter((r) => r.is_pass).length;
  const passRate = Math.round((passed / clsResults.length) * 100);

  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ backgroundColor: color }} />
      <div className="flex items-start gap-3 mb-3">
        <div className="relative shrink-0">
          {photo ? (
            <img src={photo} alt={name} className="w-14 h-14 rounded-full object-cover border-2" style={{ borderColor: color }} />
          ) : (
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-black" style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}>
              {name[0]}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-blue-400 flex items-center justify-center">
            <Crown className="w-3 h-3 text-white" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-white" style={{ backgroundColor: color }}>Class {cls}</span>
            <span className="text-[10px] text-muted-foreground">#{roll}</span>
          </div>
          <p className="font-bold text-foreground text-sm leading-tight truncate">{name}</p>
          <p className="text-[10px] text-muted-foreground">{topper.exam_type}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-black" style={{ color }}>{pct.toFixed(1)}%</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400">{grade}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="bg-muted/40 rounded-lg p-1.5">
          <p className="text-xs font-bold text-foreground">{clsResults.length}</p>
          <p className="text-[9px] text-muted-foreground">Results</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-1.5">
          <p className="text-xs font-bold text-foreground">{avg.toFixed(1)}%</p>
          <p className="text-[9px] text-muted-foreground">Class Avg</p>
        </div>
        <div className={`rounded-lg p-1.5 ${passRate >= 80 ? "bg-green-100 dark:bg-green-900/20" : passRate >= 60 ? "bg-blue-100 dark:bg-blue-950/20" : "bg-red-100 dark:bg-red-900/20"}`}>
          <p className={`text-xs font-bold ${passRate >= 80 ? "text-green-700 dark:text-green-400" : passRate >= 60 ? "text-blue-800 dark:text-blue-400" : "text-red-700 dark:text-red-400"}`}>{passRate}%</p>
          <p className="text-[9px] text-muted-foreground">Pass Rate</p>
        </div>
      </div>
    </div>
  );
}

function OverviewSection({ results, year }: { results: Result[]; year: number }) {
  const classStats = useMemo(() => {
    return ALL_CLASSES.map((cls) => {
      const cr = results.filter((r) => r.class === cls);
      if (!cr.length) return null;
      const avg = cr.reduce((s, r) => s + (r.percentage ?? 0), 0) / cr.length;
      const passed = cr.filter((r) => r.is_pass).length;
      return {
        class: `Cls ${cls}`, classNum: cls,
        avg: Math.round(avg * 10) / 10,
        passRate: Math.round((passed / cr.length) * 100),
        students: cr.length,
      };
    }).filter(Boolean) as any[];
  }, [results]);

  const hasData = classStats.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-bold text-foreground flex items-center gap-2 text-sm">
          <Crown className="w-4 h-4 text-blue-500" /> Class Toppers — {year}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">Best performer of each class based on published results</p>
      </div>
      {!hasData ? (
        <div className="bg-card rounded-2xl border border-border p-10 text-center">
          <Crown className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-semibold text-foreground">No published results for {year}</p>
          <p className="text-xs text-muted-foreground mt-1">Publish results from Manage Results to see toppers</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ALL_CLASSES.map((cls) => {
              const cr = results.filter((r) => r.class === cls);
              if (!cr.length) return null;
              return <TopperCard key={cls} cls={cls} results={cr} />;
            })}
          </div>
          {classStats.length > 0 && (
            <SectionCard title="School-wide Comparison" icon={BarChart3} color="#6366f1">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={classStats} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="class" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="avg" name="Avg %" radius={[5, 5, 0, 0]}>
                    {classStats.map((e: any, i: number) => <Cell key={i} fill={CLASS_COLORS[e.classNum] ?? "#6366f1"} />)}
                  </Bar>
                  <Bar dataKey="passRate" name="Pass Rate %" radius={[5, 5, 0, 0]}>
                    {classStats.map((e: any, i: number) => <Cell key={i} fill={`${CLASS_COLORS[e.classNum] ?? "#6366f1"}80`} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: CLASSES — pick a class → detailed analytics
// ─────────────────────────────────────────────────────────────────────────────

function ClassAnalyticsSection({ results, year }: { results: Result[]; year: number }) {
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  const availableClasses = useMemo(() => ALL_CLASSES.filter((cls) => results.some((r) => r.class === cls)), [results]);

  const clsResults = useMemo(() => {
    if (!selectedClass) return [];
    return results.filter((r) => r.class === selectedClass);
  }, [results, selectedClass]);

  const stats = useMemo(() => {
    if (!clsResults.length) return null;
    const pcts = clsResults.map((r) => r.percentage ?? 0);
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    const passed = clsResults.filter((r) => r.is_pass).length;
    const grades: Record<string, number> = {};
    clsResults.forEach((r) => { const g = r.grade || "Fail"; grades[g] = (grades[g] ?? 0) + 1; });
    return {
      avg: Math.round(avg * 10) / 10,
      highest: Math.max(...pcts),
      lowest: Math.min(...pcts),
      passed,
      failed: clsResults.length - passed,
      passRate: Math.round((passed / clsResults.length) * 100),
      total: clsResults.length,
      grades,
    };
  }, [clsResults]);

  const examBreakdown = useMemo(() => {
    if (!selectedClass) return [];
    const byExam: Record<string, number[]> = {};
    clsResults.forEach((r) => { if (!byExam[r.exam_type]) byExam[r.exam_type] = []; byExam[r.exam_type].push(r.percentage ?? 0); });
    return Object.entries(byExam).map(([exam, pcts]) => ({
      exam: exam.replace(" Semester", " Sem").replace("Annual-", "Ann-"),
      avg: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length * 10) / 10,
      count: pcts.length,
    }));
  }, [clsResults, selectedClass]);

  const gradeChartData = useMemo(() => {
    if (!stats) return [];
    const gc: Record<string, string> = { "A+": "#22c55e", "A": "#3b82f6", "B": "#6366f1", "C": "#1e3a8a", "D": "#f97316", "Fail": "#ef4444" };
    return Object.entries(stats.grades).map(([grade, count]) => ({ name: grade, value: count, color: gc[grade] ?? "#94a3b8" }));
  }, [stats]);

  const subjectAvgs = useMemo(() => {
    if (!clsResults.length) return [];
    const totals: Record<string, { sum: number; count: number }> = {};
    clsResults.forEach((r) => {
      if (!r.subject_marks) return;
      Object.entries(r.subject_marks).forEach(([sub, m]) => {
        if (!totals[sub]) totals[sub] = { sum: 0, count: 0 };
        if (m.total > 0) { totals[sub].sum += (m.obtained / m.total) * 100; totals[sub].count += 1; }
      });
    });
    return Object.entries(totals)
      .map(([subject, { sum, count }]) => ({ subject: subject.length > 12 ? subject.slice(0, 11) + "…" : subject, fullSubject: subject, avg: Math.round(sum / count * 10) / 10 }))
      .sort((a, b) => b.avg - a.avg);
  }, [clsResults]);

  const scoreDist = useMemo(() => {
    const buckets = [
      { label: "0-33", min: 0, max: 33, color: "#ef4444" },
      { label: "33-50", min: 33, max: 50, color: "#f97316" },
      { label: "50-60", min: 50, max: 60, color: "#1e3a8a" },
      { label: "60-75", min: 60, max: 75, color: "#6366f1" },
      { label: "75-90", min: 75, max: 90, color: "#10b981" },
      { label: "90-100", min: 90, max: 101, color: "#22c55e" },
    ];
    return buckets.map((b) => ({ ...b, count: clsResults.filter((r) => { const p = r.percentage ?? 0; return p >= b.min && p < b.max; }).length }));
  }, [clsResults]);

  const top5 = useMemo(() => [...clsResults].sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0)).slice(0, 5), [clsResults]);

  if (!selectedClass) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-bold text-foreground flex items-center gap-2 text-sm"><BarChart3 className="w-4 h-4 text-primary" /> Select a Class</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Choose a class to see its detailed analytics</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {availableClasses.length === 0 ? (
            <div className="col-span-3 bg-card rounded-2xl border border-border p-10 text-center">
              <BarChart3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-semibold text-foreground">No data for {year}</p>
              <p className="text-xs text-muted-foreground mt-1">Publish results first</p>
            </div>
          ) : availableClasses.map((cls) => {
            const cr = results.filter((r) => r.class === cls);
            const avg = cr.reduce((s, r) => s + (r.percentage ?? 0), 0) / cr.length;
            const passed = cr.filter((r) => r.is_pass).length;
            const color = CLASS_COLORS[cls] ?? "#6366f1";
            return (
              <button key={cls} onClick={() => setSelectedClass(cls)}
                className="bg-card border border-border rounded-2xl p-4 text-left hover:shadow-md transition-all hover:border-primary/50 active:scale-95">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg mb-2" style={{ backgroundColor: color }}>{cls}</div>
                <p className="font-bold text-foreground text-sm">Class {cls}</p>
                <p className="text-xs text-muted-foreground">{cr.length} results</p>
                <div className="mt-2 flex gap-2 text-xs">
                  <span className="font-semibold" style={{ color }}>{avg.toFixed(1)}% avg</span>
                  <span className={`font-semibold ${Math.round(passed/cr.length*100) >= 70 ? "text-green-600" : "text-blue-700"}`}>{Math.round(passed/cr.length*100)}% pass</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground mt-2" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const color = CLASS_COLORS[selectedClass] ?? "#6366f1";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => setSelectedClass(null)} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> All Classes
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-sm" style={{ backgroundColor: color }}>{selectedClass}</div>
          <span className="font-bold text-foreground text-sm">Class {selectedClass} Analytics — {year}</span>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {(EXAM_TYPES[selectedClass] ?? []).map((et) => {
          const etR = clsResults.filter((r) => r.exam_type === et);
          return <span key={et} className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: color }}>{et} ({etR.length})</span>;
        })}
      </div>

      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <StatPill label="Total" value={stats.total} color={color} />
          <StatPill label="Avg %" value={`${stats.avg}%`} color={color} />
          <StatPill label="Pass Rate" value={`${stats.passRate}%`} color={stats.passRate >= 70 ? "#10b981" : "#1e3a8a"} />
          <StatPill label="Highest" value={`${stats.highest.toFixed(1)}%`} color="#22c55e" />
          <StatPill label="Lowest" value={`${stats.lowest.toFixed(1)}%`} color="#ef4444" />
          <StatPill label="Passed" value={stats.passed} color="#10b981" />
        </div>
      )}

      <SectionCard title="Score Distribution" icon={BarChart3} color={color}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={scoreDist} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="count" name="Students" radius={[5, 5, 0, 0]}>
              {scoreDist.map((b, i) => <Cell key={i} fill={b.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {examBreakdown.length > 0 && (
          <SectionCard title="Exam-wise Average" icon={TrendingUp} color={color}>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={examBreakdown} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="exam" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="avg" name="Avg %" fill={color} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
        )}
        {gradeChartData.length > 0 && (
          <SectionCard title="Grade Distribution" icon={Award} color={color}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={gradeChartData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value">
                  {gradeChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: number, n: string) => [`${v} students`, n]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </SectionCard>
        )}
      </div>

      {subjectAvgs.length > 0 && (
        <SectionCard title="Subject-wise Average" icon={BookOpen} color={color}>
          <ResponsiveContainer width="100%" height={Math.max(180, subjectAvgs.length * 28)}>
            <BarChart data={subjectAvgs} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
              <YAxis dataKey="subject" type="category" tick={{ fontSize: 10 }} width={60} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="avg" name="Avg %" radius={[0, 5, 5, 0]}>
                {subjectAvgs.map((_, i) => <Cell key={i} fill={SUBJECT_COLORS[i % SUBJECT_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {top5.length > 0 && (
        <SectionCard title="Top 5 Students" icon={Crown} color={color}>
          <div className="space-y-2">
            {top5.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/30 transition-colors">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${i === 0 ? "bg-blue-400 text-white" : i === 1 ? "bg-slate-400 text-white" : i === 2 ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"}`}>{i + 1}</div>
                {r.students?.photo_url ? <img src={r.students.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">{r.students?.full_name?.[0] ?? "?"}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{r.students?.full_name ?? "Unknown"}</p>
                  <p className="text-[10px] text-muted-foreground">#{r.students?.roll_number} · {r.exam_type}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-sm" style={{ color }}>{(r.percentage ?? 0).toFixed(1)}%</p>
                  <p className="text-[10px] text-muted-foreground">{r.grade ?? "—"}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {stats && (
        <SectionCard title="Pass vs Fail" icon={CheckCircle} color={color}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-green-600 font-semibold">Passed: {stats.passed}</span>
            <span className="text-red-500 font-semibold">Failed: {stats.failed}</span>
          </div>
          <div className="w-full h-4 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${stats.passRate}%` }} />
          </div>
          <p className="text-center text-xs mt-1 font-bold" style={{ color }}>{stats.passRate}% Pass Rate</p>
        </SectionCard>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: STUDENTS — pick class → pick student → full profile
// ─────────────────────────────────────────────────────────────────────────────

function StudentProfile({ studentId, studentName, photo, results }: {
  studentId: string; studentName: string; photo: string | null; results: Result[];
}) {
  const myResults = useMemo(() => results.filter((r) => r.student_id === studentId), [results, studentId]);
  const byExam = useMemo(() => {
    const map: Record<string, Result> = {};
    myResults.forEach((r) => { map[`${r.exam_type}_${r.year}`] = r; });
    return Object.values(map).sort((a, b) => a.year - b.year);
  }, [myResults]);

  const trendData = byExam.map((r) => ({
    label: `${r.exam_type.replace(" Semester"," Sem").replace("Annual-","Ann-")} ${r.year}`,
    pct: r.percentage ?? 0,
    marks: `${r.obtained_marks}/${r.total_marks}`,
    pass: r.is_pass,
  }));

  const bestResult = byExam.reduce((best, r) => (!best || (r.percentage ?? 0) > (best.percentage ?? 0)) ? r : best, null as Result | null);

  const subjectData = useMemo(() => {
    if (!bestResult?.subject_marks) return [];
    return Object.entries(bestResult.subject_marks).map(([sub, m], i) => ({
      subject: sub.length > 10 ? sub.slice(0, 9) + "…" : sub,
      fullSub: sub, obtained: m.obtained, total: m.total,
      pct: m.total > 0 ? Math.round((m.obtained / m.total) * 100) : 0,
      fill: SUBJECT_COLORS[i % SUBJECT_COLORS.length],
    }));
  }, [bestResult]);

  const radarData = subjectData.map((s) => ({ subject: s.subject, score: s.pct }));
  const overallAvg = myResults.length ? myResults.reduce((s, r) => s + (r.percentage ?? 0), 0) / myResults.length : 0;
  const bestPct = myResults.length ? Math.max(...myResults.map((r) => r.percentage ?? 0)) : 0;
  const allPassed = myResults.filter((r) => r.is_pass).length;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
        {photo ? <img src={photo} alt={studentName} className="w-16 h-16 rounded-full object-cover border-2 border-primary" /> : (
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-black">{studentName[0]}</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground text-base">{studentName}</p>
          <p className="text-xs text-muted-foreground">{myResults[0]?.class ? `Class ${myResults[0].class}` : ""} · {myResults.length} exam{myResults.length !== 1 ? "s" : ""}</p>
          <div className="flex gap-2 mt-1 flex-wrap">
            <span className="text-xs font-bold text-primary">{overallAvg.toFixed(1)}% avg</span>
            <span className="text-xs font-bold text-green-600">{allPassed}/{myResults.length} passed</span>
            <span className="text-xs font-bold text-blue-700">Best: {bestPct.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {myResults.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <Target className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No published results for this student</p>
        </div>
      ) : (
        <>
          {trendData.length === 1 ? (
            <SectionCard title="Exam Result" icon={TrendingUp} color="#6366f1">
              <div className="text-center py-4">
                <p className="text-3xl font-black text-primary">{trendData[0].pct.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground mt-1">{trendData[0].label} · {trendData[0].marks}</p>
                <span className={`text-xs font-bold mt-2 inline-block px-2 py-0.5 rounded-full ${trendData[0].pass ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {trendData[0].pass ? "Passed ✓" : "Failed ✗"}
                </span>
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="Performance Trend" icon={TrendingUp} color="#6366f1">
              {trendData.length >= 2 && (() => {
                const diff = trendData[trendData.length - 1].pct - trendData[0].pct;
                return <p className={`text-xs font-semibold mb-3 ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                  {diff > 0 ? `↑ Improved by ${diff.toFixed(1)}%` : diff < 0 ? `↓ Dropped by ${Math.abs(diff).toFixed(1)}%` : "→ No change"}
                </p>;
              })()}
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={trendData} margin={{ top: 5, right: 10, left: -15, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: any, _, props) => [`${v}% (${props.payload.marks})`, "Score"]} />
                  <ReferenceLine y={33} stroke="#ef4444" strokeDasharray="3 2" />
                  <Line type="monotone" dataKey="pct" stroke="#6366f1" strokeWidth={2.5} dot={{ fill: "#6366f1", r: 5 }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
            </SectionCard>
          )}

          {subjectData.length > 0 && (
            <SectionCard title={`Subject Performance — ${bestResult?.exam_type ?? ""}`} icon={BarChart3} color="#10b981">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={subjectData} margin={{ top: 5, right: 5, left: -15, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="subject" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: any, _, props) => [`${props.payload.obtained}/${props.payload.total} (${v}%)`, props.payload.fullSub]} />
                  <ReferenceLine y={33} stroke="#ef4444" strokeDasharray="3 2" label={{ value: "Pass", fontSize: 9, fill: "#ef4444" }} />
                  <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                    {subjectData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}

          {radarData.length >= 3 && (
            <SectionCard title="Subject Radar" icon={Star} color="#8b5cf6">
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} tickCount={4} />
                  <Radar name="Score %" dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}

          <SectionCard title="All Exam Results" icon={Award} color="#1e3a8a">
            <div className="space-y-2">
              {byExam.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">{r.exam_type} {r.year}</p>
                    <p className="text-[10px] text-muted-foreground">{r.obtained_marks}/{r.total_marks} marks</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-sm text-primary">{(r.percentage ?? 0).toFixed(1)}%</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${r.is_pass ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                      {r.grade ?? (r.is_pass ? "Pass" : "Fail")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

function StudentsSection({ results, year }: { results: Result[]; year: number }) {
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string; photo: string | null } | null>(null);
  const [search, setSearch] = useState("");

  const { data: students = [], isLoading: studentsLoading } = useClassStudents(selectedClass ?? "", year);
  const availableClasses = useMemo(() => ALL_CLASSES.filter((cls) => results.some((r) => r.class === cls)), [results]);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return (students as any[]).filter((s) => s.full_name.toLowerCase().includes(q) || s.roll_number.toLowerCase().includes(q));
  }, [students, search]);

  const handleClassSelect = (cls: string) => { setSelectedClass(cls); setSelectedStudent(null); setSearch(""); };

  if (selectedStudent) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedStudent(null)} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Class {selectedClass} Students
        </button>
        <StudentProfile studentId={selectedStudent.id} studentName={selectedStudent.name} photo={selectedStudent.photo} results={results} />
      </div>
    );
  }

  if (selectedClass) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedClass(null)} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" /> All Classes
          </button>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-sm" style={{ backgroundColor: CLASS_COLORS[selectedClass] ?? "#6366f1" }}>{selectedClass}</div>
          <span className="font-bold text-foreground text-sm">Class {selectedClass} Students</span>
        </div>
        <input type="text" placeholder="Search by name or roll number…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-secondary border border-border rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
        {studentsLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : (filteredStudents as any[]).length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-8 text-center">
            <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{search ? "No students match your search" : "No students with published results"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(filteredStudents as any[]).map((s) => {
              const myR = results.filter((r) => r.student_id === s.id);
              const avg = myR.length ? myR.reduce((sum, r) => sum + (r.percentage ?? 0), 0) / myR.length : 0;
              const best = myR.length ? Math.max(...myR.map((r) => r.percentage ?? 0)) : 0;
              return (
                <button key={s.id} onClick={() => setSelectedStudent({ id: s.id, name: s.full_name, photo: s.photo_url })}
                  className="w-full flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:shadow-md hover:border-primary/40 transition-all text-left active:scale-[0.99]">
                  {s.photo_url ? <img src={s.photo_url} alt={s.full_name} className="w-10 h-10 rounded-full object-cover" /> : (
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">{s.full_name[0]}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{s.full_name}</p>
                    <p className="text-[10px] text-muted-foreground">Roll: {s.roll_number} · {myR.length} exam{myR.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-primary">{avg.toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">Best {best.toFixed(1)}%</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold text-foreground flex items-center gap-2 text-sm"><Users className="w-4 h-4 text-primary" /> Select a Class</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Choose a class to browse its students</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {availableClasses.length === 0 ? (
          <div className="col-span-3 bg-card rounded-2xl border border-border p-10 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-semibold text-foreground">No data for {year}</p>
          </div>
        ) : availableClasses.map((cls) => {
          const uniqueStudents = [...new Set(results.filter((r) => r.class === cls).map((r) => r.student_id))];
          const color = CLASS_COLORS[cls] ?? "#6366f1";
          return (
            <button key={cls} onClick={() => handleClassSelect(cls)}
              className="bg-card border border-border rounded-2xl p-4 text-left hover:shadow-md transition-all hover:border-primary/50 active:scale-95">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg mb-2" style={{ backgroundColor: color }}>{cls}</div>
              <p className="font-bold text-foreground text-sm">Class {cls}</p>
              <p className="text-xs text-muted-foreground">{uniqueStudents.length} students</p>
              <ChevronRight className="w-4 h-4 text-muted-foreground mt-2" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const SchoolAnalyticsTab = () => {
  const [mainTab, setMainTab] = useState<MainTab>("overview");
  const [year, setYear] = useState(currentYear);
  const { data: results = [], isLoading } = useAllResults(year);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" /> School Analytics
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Live data · Auto-refreshes every 5 min</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground font-medium">Year:</label>
          <input
            type="number" value={year}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 2000 && v <= 2099) setYear(v); }}
            min={2000} max={2099}
            className="text-sm bg-secondary border border-border rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary w-24 font-mono"
          />
        </div>
      </div>

      <NavTabs active={mainTab} onChange={setMainTab} />

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <>
          {mainTab === "overview"  && <OverviewSection results={results} year={year} />}
          {mainTab === "classes"   && <ClassAnalyticsSection results={results} year={year} />}
          {mainTab === "students"  && <StudentsSection results={results} year={year} />}
        </>
      )}
    </div>
  );
};

export default SchoolAnalyticsTab;
