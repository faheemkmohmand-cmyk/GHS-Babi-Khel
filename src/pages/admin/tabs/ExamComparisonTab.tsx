import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
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
import { ArrowUpRight, ArrowDownRight, GitCompare } from "lucide-react";

// ─── Palette for chart lines ──────────────────────────────────────────────────
const COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#84cc16",
];

// ─── Subject lists per class group ────────────────────────────────────────────
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

const getSubjects = (cls: string) =>
  ["9", "10"].includes(cls) ? SUBJECTS_9_TO_10 : SUBJECTS_6_TO_8;

const getExamTypes = (cls: string) =>
  ["9", "10"].includes(cls)
    ? ["Annual-I", "Annual-II"]
    : ["1st Semester", "2nd Semester"];

// ─── Types ────────────────────────────────────────────────────────────────────
interface ExamComparisonTabProps {
  cls: string;
  year: number;
}

interface SubjectMarks {
  obtained: number;
  total: number;
}

interface ResultRow {
  id: string;
  student_id: string;
  class: string;
  exam_type: string;
  year: number;
  total_marks: number;
  obtained_marks: number;
  percentage: number;
  subject_marks: Record<string, SubjectMarks> | null;
  students: {
    full_name: string;
    roll_number: string;
  } | null;
}

// ─── Helper: compute percentage for a subject from subject_marks ──────────────
function subjectPct(sm: SubjectMarks | undefined): number | null {
  if (!sm || sm.total === 0) return null;
  return Math.round((sm.obtained / sm.total) * 100);
}

// ─── Component ────────────────────────────────────────────────────────────────
function ExamComparisonTab({ cls, year }: ExamComparisonTabProps) {
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  const examTypes = useMemo(() => getExamTypes(cls), [cls]);
  const subjects = useMemo(() => getSubjects(cls), [cls]);

  // ── Fetch ALL results for this class+year (both exam types) ─────────────────
  const { data: results = [], isLoading } = useQuery<ResultRow[]>({
    queryKey: ["exam-comparison", cls, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, student_id, class, exam_type, year, total_marks, obtained_marks, percentage, subject_marks, students(full_name, roll_number)"
        )
        .eq("class", cls)
        .eq("year", year);
      if (error) throw error;
      return (data ?? []) as unknown as ResultRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Unique student list for dropdown ────────────────────────────────────────
  const studentList = useMemo(() => {
    const map = new Map<
      string,
      { id: string; full_name: string; roll_number: string }
    >();
    for (const r of results) {
      if (r.students && !map.has(r.student_id)) {
        map.set(r.student_id, {
          id: r.student_id,
          full_name: r.students.full_name,
          roll_number: r.students.roll_number,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true })
    );
  }, [results]);

  // ── Group results by exam_type ──────────────────────────────────────────────
  const resultsByExam = useMemo(() => {
    const map = new Map<string, ResultRow[]>();
    for (const r of results) {
      const list = map.get(r.exam_type) ?? [];
      list.push(r);
      map.set(r.exam_type, list);
    }
    return map;
  }, [results]);

  // ── Class-level averages per subject per exam ───────────────────────────────
  const classAverages = useMemo(() => {
    // For each exam type, compute average % per subject
    const avgByExam: Record<string, Record<string, number>> = {};
    for (const et of examTypes) {
      const rows = resultsByExam.get(et) ?? [];
      const sums: Record<string, number> = {};
      const counts: Record<string, number> = {};
      for (const row of rows) {
        if (!row.subject_marks) continue;
        for (const subj of subjects) {
          const pct = subjectPct(row.subject_marks[subj]);
          if (pct !== null) {
            sums[subj] = (sums[subj] ?? 0) + pct;
            counts[subj] = (counts[subj] ?? 0) + 1;
          }
        }
      }
      const avgs: Record<string, number> = {};
      for (const subj of subjects) {
        avgs[subj] = counts[subj] ? Math.round(sums[subj] / counts[subj]) : 0;
      }
      avgByExam[et] = avgs;
    }
    return avgByExam;
  }, [examTypes, resultsByExam, subjects]);

  // ── Overall class average per exam ──────────────────────────────────────────
  const classOverallAvg = useMemo(() => {
    const avg: Record<string, number> = {};
    for (const et of examTypes) {
      const rows = resultsByExam.get(et) ?? [];
      if (rows.length === 0) {
        avg[et] = 0;
        continue;
      }
      const sum = rows.reduce((s, r) => s + r.percentage, 0);
      avg[et] = Math.round(sum / rows.length);
    }
    return avg;
  }, [examTypes, resultsByExam]);

  // ── Chart data for class-level line chart ───────────────────────────────────
  const classChartData = useMemo(() => {
    return examTypes.map((et) => {
      const point: Record<string, string | number> = { exam: et };
      for (const subj of subjects) {
        point[subj] = classAverages[et]?.[subj] ?? 0;
      }
      return point;
    });
  }, [examTypes, subjects, classAverages]);

  // ── Subject deltas (from first exam to second) ──────────────────────────────
  const subjectDeltas = useMemo(() => {
    if (examTypes.length < 2) return [];
    const first = classAverages[examTypes[0]] ?? {};
    const second = classAverages[examTypes[1]] ?? {};
    return subjects.map((subj) => ({
      subject: subj,
      delta: (second[subj] ?? 0) - (first[subj] ?? 0),
      firstVal: first[subj] ?? 0,
      secondVal: second[subj] ?? 0,
    }));
  }, [examTypes, subjects, classAverages]);

  // ── Overall delta ───────────────────────────────────────────────────────────
  const overallDelta = useMemo(() => {
    if (examTypes.length < 2) return 0;
    return classOverallAvg[examTypes[1]] - classOverallAvg[examTypes[0]];
  }, [examTypes, classOverallAvg]);

  // ── Student-level data ──────────────────────────────────────────────────────
  const selectedStudentResults = useMemo(() => {
    if (!selectedStudentId) return [];
    return results.filter((r) => r.student_id === selectedStudentId);
  }, [results, selectedStudentId]);

  const studentChartData = useMemo(() => {
    return examTypes.map((et) => {
      const row = selectedStudentResults.find((r) => r.exam_type === et);
      const point: Record<string, string | number> = { exam: et };
      for (const subj of subjects) {
        point[subj] = row?.subject_marks
          ? subjectPct(row.subject_marks[subj]) ?? 0
          : 0;
      }
      return point;
    });
  }, [examTypes, subjects, selectedStudentResults]);

  const studentDeltas = useMemo(() => {
    if (examTypes.length < 2 || selectedStudentResults.length < 2) return [];
    const firstRow = selectedStudentResults.find(
      (r) => r.exam_type === examTypes[0]
    );
    const secondRow = selectedStudentResults.find(
      (r) => r.exam_type === examTypes[1]
    );
    if (!firstRow || !secondRow) return [];
    return subjects.map((subj) => {
      const first =
        firstRow.subject_marks
          ? subjectPct(firstRow.subject_marks[subj]) ?? 0
          : 0;
      const second =
        secondRow.subject_marks
          ? subjectPct(secondRow.subject_marks[subj]) ?? 0
          : 0;
      return { subject: subj, delta: second - first, firstVal: first, secondVal: second };
    });
  }, [examTypes, subjects, selectedStudentResults]);

  const studentOverallDelta = useMemo(() => {
    if (selectedStudentResults.length < 2) return 0;
    const firstRow = selectedStudentResults.find(
      (r) => r.exam_type === examTypes[0]
    );
    const secondRow = selectedStudentResults.find(
      (r) => r.exam_type === examTypes[1]
    );
    if (!firstRow || !secondRow) return 0;
    return secondRow.percentage - firstRow.percentage;
  }, [examTypes, selectedStudentResults]);

  // ─── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">
            Exam-to-Exam Comparison
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    );
  }

  // ─── No data ────────────────────────────────────────────────────────────────
  const hasData = examTypes.every(
    (et) => (resultsByExam.get(et) ?? []).length > 0
  );
  if (!hasData && results.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">
            Exam-to-Exam Comparison
          </h2>
        </div>
        <Card>
          <CardContent className="py-16 text-center">
            <GitCompare className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              No results found for Class {cls} ({year})
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Results must exist for both exam types to show a comparison.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Delta badge helper ─────────────────────────────────────────────────────
  const DeltaBadge = ({
    delta,
    label,
  }: {
    delta: number;
    label: string;
  }) => {
    if (delta === 0) {
      return (
        <Badge
          variant="secondary"
          className="text-xs font-semibold gap-1 py-1 px-2.5"
        >
          {label}: 0%
        </Badge>
      );
    }
    const isPositive = delta > 0;
    return (
      <Badge
        className={`text-xs font-semibold gap-1 py-1 px-2.5 ${
          isPositive
            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800"
            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800"
        }`}
      >
        {isPositive ? (
          <ArrowUpRight className="w-3 h-3" />
        ) : (
          <ArrowDownRight className="w-3 h-3" />
        )}
        {label}: {isPositive ? "+" : ""}
        {delta}%
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <GitCompare className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">
          Exam-to-Exam Comparison
        </h2>
        <Badge variant="outline" className="ml-1">
          Class {cls} &middot; {year}
        </Badge>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          1. Class-Level Comparison Card
      ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-primary" />
            Class Average Comparison
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Overall averages */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {examTypes.map((et, i) => (
              <span key={et} className="font-medium">
                {et}:{" "}
                <span className="text-lg font-bold text-primary">
                  {classOverallAvg[et] ?? 0}%
                </span>
              </span>
            ))}
            {examTypes.length === 2 && (
              <DeltaBadge delta={overallDelta} label="Change" />
            )}
          </div>

          {/* Subject-wise breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {subjectDeltas.map((d, i) => {
              const isUp = d.delta > 0;
              const isDown = d.delta < 0;
              return (
                <div
                  key={d.subject}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                    isUp
                      ? "border-green-200 bg-green-50/60 dark:border-green-800 dark:bg-green-950/20"
                      : isDown
                      ? "border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-950/20"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <span className="font-medium truncate mr-2">
                    {d.subject}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="text-muted-foreground text-xs">
                      {d.firstVal}% → {d.secondVal}%
                    </span>
                    <span
                      className={`font-bold ${
                        isUp
                          ? "text-green-600 dark:text-green-400"
                          : isDown
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {isUp ? (
                        <ArrowUpRight className="w-3.5 h-3.5 inline" />
                      ) : isDown ? (
                        <ArrowDownRight className="w-3.5 h-3.5 inline" />
                      ) : null}
                      {d.delta > 0 ? "+" : ""}
                      {d.delta}%
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════
          2. Class-Level Line Chart
      ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Subject Averages Across Exams
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full h-[350px] sm:h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={classChartData}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="exam"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  width={35}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    fontSize: "12px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                  formatter={(value: number, name: string) => [
                    `${value}%`,
                    name,
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                />
                {subjects.map((subj, i) => (
                  <Line
                    key={subj}
                    type="monotone"
                    dataKey={subj}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════
          3. Delta Indicators Grid
      ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Subject Change Indicators ({examTypes[0]} → {examTypes[1]})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {subjectDeltas.map((d, i) => (
              <DeltaBadge key={d.subject} delta={d.delta} label={d.subject} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════
          4. Student-Level Comparison
      ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Student-Level Comparison
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Student selector */}
          <div className="max-w-sm">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              Select Student
            </label>
            <Select
              value={selectedStudentId}
              onValueChange={setSelectedStudentId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a student..." />
              </SelectTrigger>
              <SelectContent>
                {studentList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.roll_number} — {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedStudentId ? (
            <>
              {/* Student overall comparison */}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {examTypes.map((et) => {
                  const row = selectedStudentResults.find(
                    (r) => r.exam_type === et
                  );
                  return (
                    <span key={et} className="font-medium">
                      {et}:{" "}
                      <span className="text-lg font-bold text-primary">
                        {row?.percentage ?? "—"}%
                      </span>
                    </span>
                  );
                })}
                {selectedStudentResults.length === 2 && (
                  <DeltaBadge delta={studentOverallDelta} label="Change" />
                )}
              </div>

              {/* Student line chart */}
              <div className="w-full h-[300px] sm:h-[380px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={studentChartData}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="exam"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      width={35}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        fontSize: "12px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      }}
                      formatter={(value: number, name: string) => [
                        `${value}%`,
                        name,
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                    />
                    {subjects.map((subj, i) => (
                      <Line
                        key={subj}
                        type="monotone"
                        dataKey={subj}
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 4, strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Student delta badges */}
              {studentDeltas.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Subject Changes ({examTypes[0]} → {examTypes[1]})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {studentDeltas.map((d) => (
                      <DeltaBadge
                        key={d.subject}
                        delta={d.delta}
                        label={d.subject}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-10 text-center text-muted-foreground text-sm">
              Select a student above to view their exam-to-exam comparison.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ExamComparisonTab;
