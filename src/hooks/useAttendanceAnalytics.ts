// src/hooks/useAttendanceAnalytics.ts
// Features 4.4, 4.5, 4.6: Attendance Analytics & Enhanced Stats
// Provides hooks for: half-day support, trend charts, heatmap, class comparison,
// day-of-week patterns, threshold warnings, and report card attendance integration

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AttendanceStatus = "present" | "absent" | "late" | "leave" | "halfday";

export interface AttendanceStat {
  total_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  leave_days: number;
  halfday_days: number;
  percentage: number;
  // Weighted: present=1, late=1, halfday=0.5, absent=0, leave=0
}

export interface MonthlyTrend {
  month: string;        // "Jan", "Feb", etc.
  monthNum: number;     // 1-12
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  halfdayDays: number;
  totalDays: number;
  percentage: number;
}

export interface ClassComparisonItem {
  className: string;
  averagePercentage: number;
  totalStudents: number;
  presentRate: number;
  absentRate: number;
  halfdayRate: number;
}

export interface DayOfWeekPattern {
  day: string;          // "Mon", "Tue", etc.
  dayIndex: number;     // 1=Mon, 5=Fri
  avgAttendanceRate: number;
  totalRecords: number;
  presentCount: number;
  absentCount: number;
  halfdayCount: number;
}

export interface HeatmapDay {
  date: string;         // "2026-06-10"
  day: number;          // 1-31
  weekday: number;      // 0=Sun, 6=Sat
  attendanceRate: number;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  halfdayCount: number;
}

export interface AttendanceThreshold {
  id: string;
  name: string;
  minimum_percentage: number;
  description: string | null;
  is_active: boolean;
  warning_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface StudentAttendanceWarning {
  student_id: string;
  student_name: string;
  roll_number: string;
  class: string;
  attendance_percentage: number;
  days_present: number;
  days_halfday: number;
  days_absent: number;
  total_days: number;
  status: "critical" | "warning" | "caution" | "ok";
  // critical: below minimum, warning: between min and warning, caution: near warning, ok: above
}

export interface DailyStatRecord {
  id: string;
  class: string;
  date: string;
  total_students: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  leave_count: number;
  halfday_count: number;
  attendance_rate: number;
}

const classes = ["6", "7", "8", "9", "10"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ─── Helper: compute attendance percentage with halfday = 0.5 ──────────────

export function computeAttendancePercentage(stats: {
  present: number; late: number; halfday: number; total: number;
}): number {
  if (stats.total === 0) return 0;
  const weighted = stats.present + stats.late + stats.halfday * 0.5;
  return Math.round((weighted / stats.total) * 100 * 10) / 10;
}

// ─── Student Attendance Stats (Enhanced with Half-Day) ─────────────────────

export function useStudentAttendanceStats(
  studentId: string | undefined,
  month?: number,
  year?: number
) {
  return useQuery<AttendanceStat>({
    queryKey: ["attendance-stat", studentId, month, year],
    queryFn: async () => {
      if (!studentId) return { total_days: 0, present_days: 0, absent_days: 0, late_days: 0, leave_days: 0, halfday_days: 0, percentage: 0 };
      let q = supabase.from("attendance").select("status").eq("student_id", studentId);
      if (month && year) {
        const start = `${year}-${String(month).padStart(2, "0")}-01`;
        const end = `${year}-${String(month).padStart(2, "0")}-31`;
        q = q.gte("date", start).lte("date", end);
      }
      const { data, error } = await q;
      if (error) throw error;
      const records = data ?? [];
      const present = records.filter((r) => r.status === "present").length;
      const absent = records.filter((r) => r.status === "absent").length;
      const late = records.filter((r) => r.status === "late").length;
      const leave = records.filter((r) => r.status === "leave").length;
      const halfday = records.filter((r) => r.status === "halfday").length;
      const total = records.length;
      const percentage = computeAttendancePercentage({ present, late, halfday, total });
      return { total_days: total, present_days: present, absent_days: absent, late_days: late, leave_days: leave, halfday_days: halfday, percentage };
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Monthly Attendance Trend ───────────────────────────────────────────────

export function useMonthlyTrend(cls: string, year: number) {
  return useQuery<MonthlyTrend[]>({
    queryKey: ["attendance-monthly-trend", cls, year],
    queryFn: async () => {
      const { data: students } = await supabase
        .from("students")
        .select("id")
        .eq("class", cls)
        .eq("is_active", true);
      if (!students?.length) return [];

      const studentIds = students.map((s) => s.id);
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const { data, error } = await supabase
        .from("attendance")
        .select("status, date")
        .in("student_id", studentIds)
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;

      const records = data ?? [];
      const monthMap = new Map<number, { present: number; absent: number; late: number; leave: number; halfday: number; total: number }>();

      for (let m = 1; m <= 12; m++) {
        monthMap.set(m, { present: 0, absent: 0, late: 0, leave: 0, halfday: 0, total: 0 });
      }

      records.forEach((r) => {
        const m = new Date(r.date).getMonth() + 1;
        const entry = monthMap.get(m);
        if (entry) {
          entry.total++;
          if (r.status === "present") entry.present++;
          else if (r.status === "absent") entry.absent++;
          else if (r.status === "late") entry.late++;
          else if (r.status === "leave") entry.leave++;
          else if (r.status === "halfday") entry.halfday++;
        }
      });

      return Array.from(monthMap.entries())
        .filter(([, v]) => v.total > 0)
        .map(([m, v]) => ({
          month: MONTH_NAMES[m - 1],
          monthNum: m,
          presentDays: v.present,
          absentDays: v.absent,
          lateDays: v.late,
          leaveDays: v.leave,
          halfdayDays: v.halfday,
          totalDays: v.total,
          percentage: computeAttendancePercentage(v),
        }));
    },
    enabled: !!cls && !!year,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Class-Wise Comparison ──────────────────────────────────────────────────

export function useClassComparison(month: number, year: number) {
  return useQuery<ClassComparisonItem[]>({
    queryKey: ["attendance-class-comparison", month, year],
    queryFn: async () => {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = `${year}-${String(month).padStart(2, "0")}-31`;

      const results: ClassComparisonItem[] = [];

      for (const cls of classes) {
        const { data: students } = await supabase
          .from("students")
          .select("id")
          .eq("class", cls)
          .eq("is_active", true);
        if (!students?.length) continue;

        const { data: att } = await supabase
          .from("attendance")
          .select("status")
          .in("student_id", students.map((s) => s.id))
          .gte("date", start)
          .lte("date", end);

        const records = att ?? [];
        const total = records.length;
        if (total === 0) continue;

        const present = records.filter((r) => r.status === "present").length;
        const absent = records.filter((r) => r.status === "absent").length;
        const halfday = records.filter((r) => r.status === "halfday").length;
        const pct = computeAttendancePercentage({ present, late: records.filter((r) => r.status === "late").length, halfday, total });

        results.push({
          className: `Class ${cls}`,
          averagePercentage: pct,
          totalStudents: students.length,
          presentRate: Math.round((present / total) * 100),
          absentRate: Math.round((absent / total) * 100),
          halfdayRate: Math.round((halfday / total) * 100),
        });
      }
      return results;
    },
    enabled: !!month && !!year,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Day-of-Week Patterns ───────────────────────────────────────────────────

export function useDayOfWeekPatterns(cls: string, year: number) {
  return useQuery<DayOfWeekPattern[]>({
    queryKey: ["attendance-day-of-week", cls, year],
    queryFn: async () => {
      const { data: students } = await supabase
        .from("students")
        .select("id")
        .eq("class", cls)
        .eq("is_active", true);
      if (!students?.length) return [];

      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const { data, error } = await supabase
        .from("attendance")
        .select("status, date")
        .in("student_id", students.map((s) => s.id))
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;

      const records = data ?? [];
      const dayMap = new Map<number, { total: number; present: number; absent: number; halfday: number }>();

      for (let d = 1; d <= 5; d++) {
        dayMap.set(d, { total: 0, present: 0, absent: 0, halfday: 0 });
      }

      records.forEach((r) => {
        const jsDay = new Date(r.date).getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        if (jsDay === 0 || jsDay === 6) return; // skip weekends
        const dayIndex = jsDay; // 1=Mon, 2=Tue, ..., 5=Fri
        const entry = dayMap.get(dayIndex);
        if (entry) {
          entry.total++;
          if (r.status === "present" || r.status === "late") entry.present++;
          else if (r.status === "absent") entry.absent++;
          else if (r.status === "halfday") entry.halfday++;
        }
      });

      return Array.from(dayMap.entries())
        .filter(([, v]) => v.total > 0)
        .map(([dayIndex, v]) => ({
          day: DAY_NAMES[dayIndex],
          dayIndex,
          avgAttendanceRate: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
          totalRecords: v.total,
          presentCount: v.present,
          absentCount: v.absent,
          halfdayCount: v.halfday,
        }));
    },
    enabled: !!cls && !!year,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Heatmap Calendar Data ──────────────────────────────────────────────────

export function useAttendanceHeatmap(cls: string, month: number, year: number) {
  return useQuery<HeatmapDay[]>({
    queryKey: ["attendance-heatmap", cls, month, year],
    queryFn: async () => {
      const { data: students } = await supabase
        .from("students")
        .select("id")
        .eq("class", cls)
        .eq("is_active", true);
      if (!students?.length) return [];

      const studentIds = students.map((s) => s.id);
      const totalStudents = studentIds.length;
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = `${year}-${String(month).padStart(2, "0")}-31`;
      const { data, error } = await supabase
        .from("attendance")
        .select("status, date")
        .in("student_id", studentIds)
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;

      const records = data ?? [];
      const dateMap = new Map<string, { present: number; absent: number; halfday: number; total: number }>();

      records.forEach((r) => {
        if (!dateMap.has(r.date)) dateMap.set(r.date, { present: 0, absent: 0, halfday: 0, total: 0 });
        const entry = dateMap.get(r.date)!;
        entry.total++;
        if (r.status === "present" || r.status === "late") entry.present++;
        else if (r.status === "absent") entry.absent++;
        else if (r.status === "halfday") entry.halfday++;
      });

      return Array.from(dateMap.entries()).map(([date, v]) => {
        const d = new Date(date);
        const rate = v.total > 0 ? computeAttendancePercentage({ present: v.present, late: 0, halfday: v.halfday, total: v.total }) : 0;
        return {
          date,
          day: d.getDate(),
          weekday: d.getDay(),
          attendanceRate: rate,
          totalStudents,
          presentCount: v.present,
          absentCount: v.absent,
          halfdayCount: v.halfday,
        };
      }).sort((a, b) => a.day - b.day);
    },
    enabled: !!cls && !!month && !!year,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Class Attendance Summary (Enhanced) ────────────────────────────────────

export function useClassAttendanceSummary(cls: string, month: number, year: number) {
  return useQuery<{ student_id: string; student_name: string; roll_number: string; percentage: number }[]>({
    queryKey: ["class-attendance-summary", cls, month, year],
    queryFn: async () => {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = `${year}-${String(month).padStart(2, "0")}-31`;
      const { data: students } = await supabase
        .from("students")
        .select("id, full_name, roll_number")
        .eq("class", cls)
        .eq("is_active", true);
      if (!students?.length) return [];
      const { data: att } = await supabase
        .from("attendance")
        .select("student_id, status")
        .in("student_id", students.map((s) => s.id))
        .gte("date", start)
        .lte("date", end);
      const attRecords = att ?? [];
      return students.map((s) => {
        const mine = attRecords.filter((a) => a.student_id === s.id);
        const present = mine.filter((a) => a.status === "present").length;
        const late = mine.filter((a) => a.status === "late").length;
        const halfday = mine.filter((a) => a.status === "halfday").length;
        const total = mine.length;
        const percentage = computeAttendancePercentage({ present, late, halfday, total });
        return {
          student_id: s.id,
          student_name: s.full_name,
          roll_number: s.roll_number,
          percentage,
        };
      }).sort((a, b) => b.percentage - a.percentage);
    },
    enabled: !!cls,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Attendance Thresholds ──────────────────────────────────────────────────

export function useAttendanceThresholds() {
  return useQuery<AttendanceThreshold[]>({
    queryKey: ["attendance-thresholds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_thresholds")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AttendanceThreshold[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useActiveThreshold() {
  return useQuery<AttendanceThreshold | null>({
    queryKey: ["attendance-active-threshold"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_thresholds")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as AttendanceThreshold | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<AttendanceThreshold> & { name: string }) => {
      if (payload.id) {
        // Deactivate all others if this one is being set active
        if (payload.is_active) {
          await supabase.from("attendance_thresholds").update({ is_active: false }).neq("id", payload.id);
        }
        const { data, error } = await supabase
          .from("attendance_thresholds")
          .update(payload)
          .eq("id", payload.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        if (payload.is_active) {
          await supabase.from("attendance_thresholds").update({ is_active: false }).neq("id", "");
        }
        const { data, error } = await supabase
          .from("attendance_thresholds")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-thresholds"] });
      qc.invalidateQueries({ queryKey: ["attendance-active-threshold"] });
    },
  });
}

export function useDeleteThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendance_thresholds").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-thresholds"] });
      qc.invalidateQueries({ queryKey: ["attendance-active-threshold"] });
    },
  });
}

// ─── Student Warnings (Feature 4.6) ────────────────────────────────────────

export function useStudentAttendanceWarnings(cls: string, year: number) {
  return useQuery<StudentAttendanceWarning[]>({
    queryKey: ["attendance-warnings", cls, year],
    queryFn: async () => {
      // Get active threshold
      const { data: threshold } = await supabase
        .from("attendance_thresholds")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      const minPct = threshold?.minimum_percentage ?? 75;
      const warnPct = threshold?.warning_threshold ?? 80;

      const start = `${year}-01-01`;
      const end = `${year}-12-31`;

      const { data: students } = await supabase
        .from("students")
        .select("id, full_name, roll_number, class")
        .eq("class", cls)
        .eq("is_active", true);
      if (!students?.length) return [];

      const { data: att } = await supabase
        .from("attendance")
        .select("student_id, status")
        .in("student_id", students.map((s) => s.id))
        .gte("date", start)
        .lte("date", end);

      const records = att ?? [];

      return students.map((s) => {
        const mine = records.filter((a) => a.student_id === s.id);
        const present = mine.filter((a) => a.status === "present").length;
        const late = mine.filter((a) => a.status === "late").length;
        const halfday = mine.filter((a) => a.status === "halfday").length;
        const absent = mine.filter((a) => a.status === "absent").length;
        const total = mine.length;
        const pct = computeAttendancePercentage({ present, late, halfday, total });

        let status: StudentAttendanceWarning["status"] = "ok";
        if (pct < minPct) status = "critical";
        else if (pct < warnPct) status = "warning";
        else if (pct < warnPct + 5) status = "caution";

        return {
          student_id: s.id,
          student_name: s.full_name,
          roll_number: s.roll_number,
          class: s.class,
          attendance_percentage: pct,
          days_present: present + late,
          days_halfday: halfday,
          days_absent: absent,
          total_days: total,
          status,
        };
      })
        .filter((w) => w.status !== "ok")
        .sort((a, b) => a.attendance_percentage - b.attendance_percentage);
    },
    enabled: !!cls && !!year,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Enhanced Attendance Summary for Report Cards ───────────────────────────

export interface ReportCardAttendance {
  present: number;
  absent: number;
  late: number;
  leave: number;
  halfday: number;
  total: number;
  percentage: number;
  isEligible: boolean;
  warningLevel: "none" | "caution" | "warning" | "critical";
  award: string | null;
  // award: "Perfect Attendance" for 100%, "Excellent" for 95%+
}

export async function fetchReportCardAttendance(
  studentId: string,
  year: number
): Promise<ReportCardAttendance> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  // Fetch attendance records
  const { data, error } = await supabase
    .from("attendance")
    .select("status")
    .eq("student_id", studentId)
    .gte("date", start)
    .lte("date", end);

  if (error) return { present: 0, absent: 0, late: 0, leave: 0, halfday: 0, total: 0, percentage: 0, isEligible: true, warningLevel: "none", award: null };

  const records = data ?? [];
  const present = records.filter((r: any) => r.status === "present").length;
  const absent = records.filter((r: any) => r.status === "absent").length;
  const late = records.filter((r: any) => r.status === "late").length;
  const leave = records.filter((r: any) => r.status === "leave").length;
  const halfday = records.filter((r: any) => r.status === "halfday").length;
  const total = records.length;
  const percentage = computeAttendancePercentage({ present, late, halfday, total });

  // Get active threshold
  const { data: threshold } = await supabase
    .from("attendance_thresholds")
    .select("minimum_percentage, warning_threshold")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const minPct = threshold?.minimum_percentage ?? 75;
  const warnPct = threshold?.warning_threshold ?? 80;

  let warningLevel: ReportCardAttendance["warningLevel"] = "none";
  if (percentage < minPct) warningLevel = "critical";
  else if (percentage < warnPct) warningLevel = "warning";
  else if (percentage < warnPct + 5) warningLevel = "caution";

  // Awards
  let award: string | null = null;
  if (percentage === 100 && absent === 0 && halfday === 0) award = "Perfect Attendance";
  else if (percentage >= 95) award = "Excellent Attendance";

  return {
    present, absent, late, leave, halfday, total, percentage,
    isEligible: percentage >= minPct,
    warningLevel,
    award,
  };
}

// ─── Daily Stats CRUD (for caching) ────────────────────────────────────────

export function useDailyStats(cls: string, month: number, year: number) {
  return useQuery<DailyStatRecord[]>({
    queryKey: ["attendance-daily-stats", cls, month, year],
    queryFn: async () => {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = `${year}-${String(month).padStart(2, "0")}-31`;
      const { data, error } = await supabase
        .from("attendance_daily_stats")
        .select("*")
        .eq("class", cls)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DailyStatRecord[];
    },
    enabled: !!cls,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Key Metrics ────────────────────────────────────────────────────────────

export interface AttendanceMetrics {
  avgDailyRate: number;
  chronicAbsenteeCount: number;
  chronicAbsenteeRate: number;
  totalStudents: number;
  mostImprovedStudent: { name: string; improvement: number } | null;
  peakAbsenceDay: { date: string; rate: number } | null;
}

export function useAttendanceMetrics(cls: string, month: number, year: number) {
  return useQuery<AttendanceMetrics>({
    queryKey: ["attendance-metrics", cls, month, year],
    queryFn: async () => {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = `${year}-${String(month).padStart(2, "0")}-31`;

      const { data: students } = await supabase
        .from("students")
        .select("id, full_name")
        .eq("class", cls)
        .eq("is_active", true);
      if (!students?.length) return { avgDailyRate: 0, chronicAbsenteeCount: 0, chronicAbsenteeRate: 0, totalStudents: 0, mostImprovedStudent: null, peakAbsenceDay: null };

      const studentIds = students.map((s) => s.id);
      const totalStudents = studentIds.length;

      const { data: att } = await supabase
        .from("attendance")
        .select("student_id, status, date")
        .in("student_id", studentIds)
        .gte("date", start)
        .lte("date", end);

      const records = att ?? [];
      if (records.length === 0) return { avgDailyRate: 0, chronicAbsenteeCount: 0, chronicAbsenteeRate: 0, totalStudents, mostImprovedStudent: null, peakAbsenceDay: null };

      // Average daily rate
      const dateMap = new Map<string, { present: number; total: number }>();
      records.forEach((r) => {
        if (!dateMap.has(r.date)) dateMap.set(r.date, { present: 0, total: 0 });
        const entry = dateMap.get(r.date)!;
        entry.total++;
        if (r.status === "present" || r.status === "late") entry.present++;
        else if (r.status === "halfday") entry.present += 0.5;
      });
      const dailyRates = Array.from(dateMap.values()).map((v) => v.total > 0 ? (v.present / v.total) * 100 : 0);
      const avgDailyRate = dailyRates.length > 0 ? Math.round(dailyRates.reduce((a, b) => a + b, 0) / dailyRates.length) : 0;

      // Chronic absentee (below 75%)
      const studentMap = new Map<string, { present: number; total: number }>();
      records.forEach((r) => {
        if (!studentMap.has(r.student_id)) studentMap.set(r.student_id, { present: 0, total: 0 });
        const entry = studentMap.get(r.student_id)!;
        entry.total++;
        if (r.status === "present" || r.status === "late") entry.present++;
        else if (r.status === "halfday") entry.present += 0.5;
      });
      const chronicAbsenteeCount = Array.from(studentMap.values()).filter((v) => {
        const pct = v.total > 0 ? (v.present / v.total) * 100 : 0;
        return pct < 75;
      }).length;
      const chronicAbsenteeRate = totalStudents > 0 ? Math.round((chronicAbsenteeCount / totalStudents) * 100) : 0;

      // Peak absence day
      let peakAbsenceDay: { date: string; rate: number } | null = null;
      let lowestRate = 100;
      dateMap.forEach((v, date) => {
        const rate = v.total > 0 ? Math.round((v.present / v.total) * 100) : 0;
        if (rate < lowestRate) {
          lowestRate = rate;
          peakAbsenceDay = { date, rate };
        }
      });

      // Most improved: compare first half vs second half of month
      const midDay = 15;
      const firstHalf = records.filter((r) => parseInt(r.date.split("-")[2]) <= midDay);
      const secondHalf = records.filter((r) => parseInt(r.date.split("-")[2]) > midDay);

      let mostImprovedStudent: { name: string; improvement: number } | null = null;
      let bestImprovement = -Infinity;

      students.forEach((s) => {
        const fh = firstHalf.filter((r) => r.student_id === s.id);
        const sh = secondHalf.filter((r) => r.student_id === s.id);
        if (fh.length < 3 || sh.length < 3) return; // need minimum data

        const fhPct = fh.filter((r) => r.status === "present" || r.status === "late").length / fh.length * 100;
        const shPct = sh.filter((r) => r.status === "present" || r.status === "late").length / sh.length * 100;
        const improvement = shPct - fhPct;

        if (improvement > bestImprovement && improvement > 0) {
          bestImprovement = Math.round(improvement);
          mostImprovedStudent = { name: s.full_name, improvement: bestImprovement };
        }
      });

      return { avgDailyRate, chronicAbsenteeCount, chronicAbsenteeRate, totalStudents, mostImprovedStudent, peakAbsenceDay };
    },
    enabled: !!cls && !!month && !!year,
    staleTime: 5 * 60 * 1000,
  });
}
