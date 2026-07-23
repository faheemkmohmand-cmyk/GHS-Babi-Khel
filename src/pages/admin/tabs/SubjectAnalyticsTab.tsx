import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import type { ResultWithStudent } from "@/hooks/useResultsEnhanced";

// ─── Subject lists per class group ───────────────────────────────────────────
const SUBJECTS_6_TO_8 = [
  "English",
  "Urdu",
  "Islamiyat",
  "M.Quran",
  "Arabic",
  "Geography",
  "Pashto",
  "Maths",
  "History",
  "G.Science",
  "Computer Science",
];

const SUBJECTS_9_TO_10 = [
  "English",
  "Urdu",
  "Pak-study",
  "Chemistry",
  "Physics",
  "Computer Science",
  "Biology",
  "Islamiyat",
  "M.Quran",
  "Mathematics",
];

function getSubjects(cls: string): string[] {
  return ["9", "10"].includes(cls) ? SUBJECTS_9_TO_10 : SUBJECTS_6_TO_8;
}

// ─── Color palette for chart bars ────────────────────────────────────────────
const SUBJECT_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
];

// ─── Props ───────────────────────────────────────────────────────────────────
interface SubjectAnalyticsTabProps {
  cls: string;
  year: number;
}

export default function SubjectAnalyticsTab({
  cls,
  year,
}: SubjectAnalyticsTabProps) {
  const subjects = useMemo(() => getSubjects(cls), [cls]);

  // ── Student selection state ───────────────────────────────────────────────
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  // ── Fetch all results for this class + year ──────────────────────────────
  const {
    data: results = [],
    isLoading,
    isError,
  } = useQuery<ResultWithStudent[]>({
    queryKey: ["subject-analytics", cls, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, student_id, class, exam_type, year, total_marks, obtained_marks, percentage, grade, is_pass, subject_marks, students(full_name, roll_number)"
        )
        .eq("class", cls)
        .eq("year", year);
      if (error) throw error;
      return (data ?? []) as unknown as ResultWithStudent[];
    },
    enabled: !!cls && !!year,
    staleTime: 10 * 60 * 1000,
  });

  // ── Unique students list ─────────────────────────────────────────────────
  const students = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; roll: string }
    >();
    for (const r of results) {
      if (r.students && !map.has(r.student_id)) {
        map.set(r.student_id, {
          id: r.student_id,
          name: r.students.full_name,
          roll: r.students.roll_number,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.roll.localeCompare(b.roll, undefined, { numeric: true })
    );
  }, [results]);

  // ── 1. Subject Average Bar Chart data ────────────────────────────────────
  const subjectAverageData = useMemo(() => {
    if (results.length === 0) return [];

    return subjects.map((subject, idx) => {
      let totalPct = 0;
      let count = 0;

      for (const r of results) {
        const sm = r.subject_marks?.[subject];
        if (sm && sm.total > 0) {
          totalPct += (sm.obtained / sm.total) * 100;
          count++;
        }
      }

      const avg = count > 0 ? Math.round((totalPct / count) * 10) / 10 : 0;

      return {
        subject: subject.length > 8 ? subject.slice(0, 7) + "…" : subject,
        fullName: subject,
        average: avg,
        fill: SUBJECT_COLORS[idx % SUBJECT_COLORS.length],
      };
    });
  }, [results, subjects]);

  // ── 2. Radar Chart data: student vs class average ────────────────────────
  const radarData = useMemo(() => {
    // Class average per subject
    const classAvg: Record<string, number> = {};
    for (const subject of subjects) {
      let totalPct = 0;
      let count = 0;
      for (const r of results) {
        const sm = r.subject_marks?.[subject];
        if (sm && sm.total > 0) {
          totalPct += (sm.obtained / sm.total) * 100;
          count++;
        }
      }
      classAvg[subject] = count > 0 ? Math.round((totalPct / count) * 10) / 10 : 0;
    }

    // Selected student's per-subject percentage
    const studentAvg: Record<string, number> = {};
    if (selectedStudentId) {
      const studentResults = results.filter(
        (r) => r.student_id === selectedStudentId
      );
      for (const subject of subjects) {
        let totalPct = 0;
        let count = 0;
        for (const r of studentResults) {
          const sm = r.subject_marks?.[subject];
          if (sm && sm.total > 0) {
            totalPct += (sm.obtained / sm.total) * 100;
            count++;
          }
        }
        studentAvg[subject] =
          count > 0 ? Math.round((totalPct / count) * 10) / 10 : 0;
      }
    }

    return subjects.map((subject) => ({
      subject: subject.length > 10 ? subject.slice(0, 9) + "…" : subject,
      fullName: subject,
      student: studentAvg[subject] ?? 0,
      classAverage: classAvg[subject] ?? 0,
    }));
  }, [results, subjects, selectedStudentId]);

  // ── 3. Strongest / Weakest subject for selected student ──────────────────
  const { strongest, weakest } = useMemo(() => {
    if (!selectedStudentId || radarData.length === 0) {
      return { strongest: null, weakest: null };
    }

    let maxPct = -1;
    let minPct = 101;
    let maxSubj = "";
    let minSubj = "";

    for (const d of radarData) {
      if (d.student > maxPct) {
        maxPct = d.student;
        maxSubj = d.fullName;
      }
      if (d.student < minPct) {
        minPct = d.student;
        minSubj = d.fullName;
      }
    }

    return {
      strongest: maxPct >= 0 ? { subject: maxSubj, percentage: maxPct } : null,
      weakest: minPct <= 100 ? { subject: minSubj, percentage: minPct } : null,
    };
  }, [selectedStudentId, radarData]);

  // ── 4. Trend Analysis (multiple exam types) ─────────────────────────────
  const examTypes = useMemo(() => {
    const set = new Set(results.map((r) => r.exam_type));
    return Array.from(set).sort();
  }, [results]);

  const trendData = useMemo(() => {
    if (examTypes.length < 2) return [];

    // For each exam type, compute average percentage per subject
    const dataByExam = examTypes.map((examType) => {
      const examResults = results.filter((r) => r.exam_type === examType);
      const entry: Record<string, string | number> = { examType };
      for (const subject of subjects) {
        let totalPct = 0;
        let count = 0;
        for (const r of examResults) {
          const sm = r.subject_marks?.[subject];
          if (sm && sm.total > 0) {
            totalPct += (sm.obtained / sm.total) * 100;
            count++;
          }
        }
        entry[subject] =
          count > 0 ? Math.round((totalPct / count) * 10) / 10 : 0;
      }
      return entry;
    });

    return dataByExam;
  }, [results, examTypes, subjects]);

  // ── Loading / error states ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-destructive">
          Failed to load analytics data. Please try again later.
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No results data available</p>
          <p className="text-sm mt-1">
            Results for Class {cls}, {year} have not been entered yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Selected student name for display ────────────────────────────────────
  const selectedStudent = students.find(
    (s) => s.id === selectedStudentId
  );

  return (
    <div className="space-y-6">
      {/* ── Top: Bar Chart + Radar Chart (2-col on desktop) ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Subject Average Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-5 h-5 text-primary" />
              Subject-wise Class Average
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Average marks percentage per subject across all students — Class{" "}
              {cls}, {year}
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={subjectAverageData}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="subject"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: number, _name: string, props: any) => [
                    `${value}%`,
                    props.payload.fullName,
                  ]}
                  labelFormatter={() => ""}
                  contentStyle={{
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="average"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                >
                  {subjectAverageData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 2. Student Radar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-5 h-5 text-primary" />
              Student vs Class Average
            </CardTitle>
            <div className="mt-2">
              <Select
                value={selectedStudentId}
                onValueChange={setSelectedStudentId}
              >
                <SelectTrigger className="w-full sm:w-[280px]">
                  <SelectValue placeholder="Select a student to compare" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.roll} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {selectedStudentId ? (
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="70%"
                  data={radarData}
                >
                  <PolarGrid strokeOpacity={0.3} />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fontSize: 10 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fontSize: 9 }}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Radar
                    name={`${
                      selectedStudent?.name ?? "Student"
                    }`}
                    dataKey="student"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                  <Radar
                    name="Class Average"
                    dataKey="classAverage"
                    stroke="#94a3b8"
                    fill="#94a3b8"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px" }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${value}%`,
                      name,
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                Select a student above to see the radar comparison
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Strongest / Weakest Subject Cards ─────────────────────────────── */}
      {selectedStudentId && (strongest || weakest) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {strongest && (
            <Card className="border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-950/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wide">
                    Strongest Subject
                  </p>
                  <p className="text-lg font-bold text-green-800 dark:text-green-300">
                    {strongest.subject}{" "}
                    <span className="text-green-600 dark:text-green-400">
                      ({strongest.percentage}%)
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {weakest && (
            <Card className="border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40">
                  <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-red-700 dark:text-red-400 uppercase tracking-wide">
                    Weakest Subject
                  </p>
                  <p className="text-lg font-bold text-red-800 dark:text-red-300">
                    {weakest.subject}{" "}
                    <span className="text-red-600 dark:text-red-400">
                      ({weakest.percentage}%)
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Trend Analysis (only when 2+ exam types exist) ────────────────── */}
      {examTypes.length >= 2 && trendData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-5 h-5 text-primary" />
              Subject Trend Across Exams
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Track how each subject's class average changes across exam types —
              Class {cls}, {year}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {subjects.map((subject, idx) => (
                <Badge
                  key={subject}
                  variant="outline"
                  className="text-[10px] gap-1"
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        SUBJECT_COLORS[idx % SUBJECT_COLORS.length],
                    }}
                  />
                  {subject}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={trendData}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="examType"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value}%`,
                    name,
                  ]}
                  contentStyle={{
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px" }}
                />
                {subjects.map((subject, idx) => (
                  <Line
                    key={subject}
                    type="monotone"
                    dataKey={subject}
                    stroke={SUBJECT_COLORS[idx % SUBJECT_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Info when only 1 exam type exists ──────────────────────────────── */}
      {examTypes.length < 2 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-muted-foreground">
            <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">Trend Analysis Unavailable</p>
            <p className="text-xs mt-1">
              Only one exam type (
              {examTypes[0] ?? "none"}) found for Class {cls}, {year}.
              <br />
              Trend lines appear when at least two exam types exist.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
