// src/pages/dashboard/tabs/AnalyticsTab.tsx
// Features 4, 5, 7, 9 combined + Feature 4.4 (Half-Day):
//   - Attendance % with color coding (Feature 4)
//   - Half-Day status support (Feature 4.4)
//   - Result comparison chart (Feature 5)
//   - Subject-wise performance bar chart (Feature 7)
//   - Performance trend over exams (Feature 9)
//   - Attendance trend mini chart (Feature 4.5 student view)

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useResults, useResultYears } from "@/hooks/useResults";
import { useStudentAttendanceStats, useMonthlyTrend } from "@/hooks/useAttendanceAnalytics";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend, ReferenceLine, Area, AreaChart,
} from "recharts";
import { TrendingUp, BarChart3, Calendar, Award, Sunrise } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const classes = ["6", "7", "8", "9", "10"];
const examTypes: Record<string, string[]> = {
  "6": ["1st Semester", "2nd Semester"],
  "7": ["1st Semester", "2nd Semester"],
  "8": ["1st Semester", "2nd Semester"],
  "9": ["Annual-I", "Annual-II"],
  "10": ["Annual-I", "Annual-II"],
};

const SUBJECT_COLORS = [
  "#6366f1","#1e3a8a","#10b981","#ef4444","#8b5cf6","#14b8a6","#f97316","#06b6d4","#84cc16","#ec4899"
];

const currentYear = new Date().getFullYear();
const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Attendance Card (Enhanced with Half-Day + Mini Trend) ──────────────────
function AttendanceCard({ userId, cls }: { userId: string; cls: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());
  const { data: stat, isLoading } = useStudentAttendanceStats(userId, month, year);

  // Mini trend data for the last 6 months
  const { data: trendData } = useMonthlyTrend(cls, year);

  const miniTrend = useMemo(() => {
    if (!trendData?.length) return [];
    return trendData.slice(-6);
  }, [trendData]);

  const pct = stat?.percentage ?? 0;
  const color = pct >= 75 ? "text-green-600" : pct >= 60 ? "text-blue-500" : "text-red-500";
  const ringColor = pct >= 75 ? "stroke-green-500" : pct >= 60 ? "stroke-blue-400" : "stroke-red-500";
  const radius = 36; const circ = 2 * Math.PI * radius;
  const dashOffset = circ - (pct / 100) * circ;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-primary" /> Attendance
        </h3>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="text-xs bg-secondary rounded-lg px-2 py-1 border-none outline-none"
        >
          {months.map((m, i) => <option key={m} value={i + 1}>{m} {year}</option>)}
        </select>
      </div>
      {isLoading ? <Skeleton className="h-24 rounded-xl" /> : (
        <div className="flex items-center gap-6">
          {/* Ring chart */}
          <div className="relative shrink-0">
            <svg width="96" height="96" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
              <circle cx="48" cy="48" r={radius} fill="none" strokeWidth="8" strokeLinecap="round"
                className={ringColor} strokeDasharray={circ} strokeDashoffset={dashOffset}
                style={{ transform: "rotate(-90deg)", transformOrigin: "48px 48px", transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-xl font-black ${color}`}>{pct}%</span>
            </div>
          </div>
          {/* Stats */}
          <div className="flex-1 grid grid-cols-2 gap-2 text-center">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-2">
              <p className="text-lg font-bold text-green-600">{stat?.present_days ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Present</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-2">
              <p className="text-lg font-bold text-red-500">{stat?.absent_days ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Absent</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-2">
              <p className="text-lg font-bold text-blue-500">{stat?.late_days ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Late</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-2">
              <p className="text-lg font-bold text-purple-500">{stat?.halfday_days ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Half-Day</p>
            </div>
          </div>
        </div>
      )}
      <div className={`mt-3 text-xs font-semibold text-center py-1.5 rounded-lg ${
        pct >= 75 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
        pct >= 60 ? "bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400" :
        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      }`}>
        {pct >= 75 ? "✓ Good attendance" : pct >= 60 ? "⚠ Below recommended (75%)" : "✗ Critical — please improve"}
      </div>

      {/* Mini trend chart */}
      {miniTrend.length >= 2 && (
        <div className="mt-3">
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Monthly Trend</p>
          <ResponsiveContainer width="100%" height={60}>
            <AreaChart data={miniTrend} margin={{ top: 2, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="miniTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 8 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} hide />
              <Tooltip formatter={(v: number) => [`${v}%`]} contentStyle={{ fontSize: 10, borderRadius: 6 }} />
              <Area type="monotone" dataKey="percentage" stroke="#6366f1" strokeWidth={1.5} fill="url(#miniTrendGrad)" dot={{ r: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Subject Performance Bar Chart ─────────────────────────────────────────────
function SubjectChart({ results, selectedExam }: { results: any[]; selectedExam: string }) {
  const myResult = results[0]; // already filtered to this student
  if (!myResult?.subject_marks) return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <h3 className="font-semibold text-foreground text-sm flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-primary" /> Subject Performance — {selectedExam}
      </h3>
      <p className="text-xs text-muted-foreground text-center py-6">Subject-wise marks not available for this exam.</p>
    </div>
  );

  const subjectMarks = myResult.subject_marks as Record<string, { obtained: number; total: number }>;
  const chartData = Object.entries(subjectMarks).map(([subject, marks], i) => ({
    subject: subject.length > 10 ? subject.slice(0, 8) + "…" : subject,
    fullSubject: subject,
    obtained: marks.obtained,
    total: marks.total,
    pct: marks.total > 0 ? Math.round((marks.obtained / marks.total) * 100) : 0,
    fill: SUBJECT_COLORS[i % SUBJECT_COLORS.length],
  }));

  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <h3 className="font-semibold text-foreground text-sm flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-primary" /> Subject Performance — {selectedExam}
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="subject" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
          <Tooltip
            formatter={(value: any, name: string, props: any) =>
              [`${props.payload.obtained}/${props.payload.total} (${value}%)`, props.payload.fullSubject]
            }
          />
          <ReferenceLine y={75} stroke="#10b981" strokeDasharray="4 2" label={{ value: "Pass", fontSize: 9, fill: "#10b981" }} />
          <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Comparison Chart (Feature 5) — safe: two fixed hook calls, no dynamic loops ─
function ComparisonChart({ cls, rollNumber }: { cls: string; rollNumber: string }) {
  const examTypeList = examTypes[cls] || [];
  const et0 = examTypeList[0] || "";
  const et1 = examTypeList[1] || examTypeList[0] || "";
  const { data: years = [] } = useResultYears();
  const year = years[0] || currentYear;

  // Two fixed hook calls — never inside a loop (that breaks Rules of Hooks)
  const { data: res0 = [] } = useResults({ classFilter: cls, examType: et0, year });
  const { data: res1 = [] } = useResults({ classFilter: cls, examType: et1, year });

  const chartData = useMemo(() => {
    const r0 = res0.find((r) => r.students?.roll_number === rollNumber);
    const r1 = res1.find((r) => r.students?.roll_number === rollNumber);
    return [
      { exam: et0, percentage: r0?.percentage ?? 0, marks: r0 ? `${r0.obtained_marks}/${r0.total_marks}` : "N/A" },
      ...(et1 && et1 !== et0 ? [{ exam: et1, percentage: r1?.percentage ?? 0, marks: r1 ? `${r1.obtained_marks}/${r1.total_marks}` : "N/A" }] : []),
    ];
  }, [res0, res1, rollNumber, et0, et1]);

  if (chartData.every((d) => d.percentage === 0)) return null;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <h3 className="font-semibold text-foreground text-sm flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-primary" /> Exam Comparison ({year})
      </h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="exam" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
          <Tooltip formatter={(v: any, _name, props) => [`${v}% (${props.payload.marks})`, "Your Score"]} />
          <ReferenceLine y={33} stroke="#ef4444" strokeDasharray="3 2" label={{ value: "Pass", fontSize: 9, fill: "#ef4444" }} />
          <Bar dataKey="percentage" fill="#6366f1" radius={[6, 6, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.percentage >= 60 ? "#6366f1" : entry.percentage >= 33 ? "#1e3a8a" : "#ef4444"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main Analytics Tab ────────────────────────────────────────────────────────
const AnalyticsTab = () => {
  const { user, profile } = useAuth();
  const profileClass = profile?.class || "6";
  const safeClass = examTypes[profileClass] ? profileClass : "6";
  const [cls, setCls] = useState(safeClass);
  const [examType, setExamType] = useState(examTypes[safeClass][0]);

  // Sync class/examType when profile loads asynchronously
  useEffect(() => {
    if (profile?.class && examTypes[profile.class]) {
      setCls(profile.class);
      setExamType(examTypes[profile.class][0]);
    }
  }, [profile?.class]);
  const { data: years = [] } = useResultYears();
  const [year, setYear] = useState<number | undefined>(undefined);

  const { data: results = [], isLoading } = useResults({ classFilter: cls, examType, year });

  const myResult = useMemo(() => {
    if (!profile?.roll_number) return null;
    return results.find((r) => r.students?.roll_number === profile.roll_number) ?? null;
  }, [results, profile]);

  // Trend data: load both exam types for the student's class
  const examTypeList = examTypes[cls] || [];
  const trendYear = years[0] || currentYear;
  const { data: results1 = [] } = useResults({ classFilter: cls, examType: examTypeList[0] || "", year: trendYear });
  const { data: results2 = [] } = useResults({ classFilter: cls, examType: examTypeList[1] || examTypeList[0] || "", year: trendYear });

  const trendData = useMemo(() => {
    const rn = profile?.roll_number;
    if (!rn) return [];
    const r1 = results1.find((r) => r.students?.roll_number === rn);
    const r2 = results2.find((r) => r.students?.roll_number === rn);
    return [
      r1 ? { exam: examTypeList[0], pct: r1.percentage, marks: `${r1.obtained_marks}/${r1.total_marks}` } : null,
      r2 && examTypeList[1] ? { exam: examTypeList[1], pct: r2.percentage, marks: `${r2.obtained_marks}/${r2.total_marks}` } : null,
    ].filter(Boolean) as { exam: string; pct: number; marks: string }[];
  }, [results1, results2, profile, examTypeList]);

  const isStudent = profile?.role === "student";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" /> Analytics
        </h2>
        <p className="text-xs text-muted-foreground">Attendance, results & performance insights</p>
      </div>

      {/* Filters — class is auto-set from profile, student picks exam type & year */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-lg">Class {cls}</span>
        {examTypes[cls].map((et) => (
          <button key={et} onClick={() => setExamType(et)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${examType === et ? "bg-primary/20 text-primary border border-primary/30" : "bg-secondary text-muted-foreground"}`}>
            {et}
          </button>
        ))}
        <select value={year ?? ""} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : undefined)}
          className="text-xs bg-secondary rounded-lg px-2 py-1.5 border-none outline-none ml-auto">
          <option value="">All Years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Attendance (for logged-in student) */}
      {isStudent && user && profile?.class && (
        <AttendanceCard userId={user.id} cls={profile?.class || cls} />
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
      ) : (
        <>
          {/* Subject performance for student's own result */}
          {myResult && <SubjectChart results={[myResult]} selectedExam={examType} />}
          {!myResult && isStudent && (
            <div className="bg-card rounded-2xl border border-border p-8 text-center">
              <Award className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Your results for {examType} are not published yet.</p>
            </div>
          )}
        </>
      )}

      {/* Trend chart */}
      {trendData.length >= 2 && (
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" /> Performance Trend — {trendYear}
          </h3>
          {(() => {
            const diff = trendData[1].pct - trendData[0].pct;
            return (
              <p className={`text-xs mb-4 font-medium ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                {diff > 0 ? `↑ Improved by ${diff.toFixed(1)}%` : diff < 0 ? `↓ Dropped by ${Math.abs(diff).toFixed(1)}%` : "→ No change"} from {trendData[0].exam} to {trendData[1].exam}
              </p>
            );
          })()}
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="exam" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip formatter={(v: any, _name, props) => [`${v}% (${props.payload.marks})`, "Score"]} />
              <ReferenceLine y={33} stroke="#ef4444" strokeDasharray="3 2" />
              <Line type="monotone" dataKey="pct" stroke="#6366f1" strokeWidth={2.5} dot={{ fill: "#6366f1", r: 5 }} activeDot={{ r: 7 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Exam Comparison (Feature 5) — uses safe ComparisonChart with fixed hook calls */}
      {isStudent && profile?.roll_number && (
        <ComparisonChart cls={cls} rollNumber={profile.roll_number} />
      )}
    </div>
  );
};

export default AnalyticsTab;
