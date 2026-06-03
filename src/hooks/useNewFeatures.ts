// src/hooks/useNewFeatures.ts
// Hooks for: Quotes, ExamSchedule, HonorRoll, AttendanceStats
// Used by all new feature tabs/components

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface DailyQuote {
  id: string;
  text: string;
  author: string | null;
  category: string;
  fixed_date: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ExamScheduleEntry {
  id: string;
  class: string;
  exam_type: string;
  year: number;
  subject: string;
  paper_name: string | null;
  paper_code: string | null;
  exam_date: string;
  start_time: string | null;
  end_time: string | null;
  hall: string | null;
  notes: string | null;
  is_published: boolean;
  created_at: string;
}

export interface HonorRollEntry {
  id: string;
  student_name: string;
  class: string;
  month: number;
  year: number;
  reason: string | null;
  photo_url: string | null;
  is_published: boolean;
  created_at: string;
}

export interface MeritList {
  id: string;
  class: string;
  exam_type: string;
  year: number;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

// ─── QUOTES HOOKS ─────────────────────────────────────────────────────────────

export function useTodayQuote() {
  return useQuery<DailyQuote | null>({
    queryKey: ["today-quote"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      // First try fixed date
      const { data: fixed } = await supabase
        .from("daily_quotes")
        .select("*")
        .eq("fixed_date", today)
        .eq("is_active", true)
        .single();
      if (fixed) return fixed as DailyQuote;
      // Fall back to random active quote
      const { data: all, error } = await supabase
        .from("daily_quotes")
        .select("*")
        .eq("is_active", true)
        .is("fixed_date", null);
      if (error || !all?.length) return null;
      // Deterministic "random" based on day of year so same quote shows all day
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
      return all[dayOfYear % all.length] as DailyQuote;
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useAllQuotes() {
  return useQuery<DailyQuote[]>({
    queryKey: ["all-quotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_quotes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<DailyQuote> & { text: string }) => {
      if (payload.id) {
        const { error } = await supabase.from("daily_quotes").update(payload).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("daily_quotes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-quotes"] });
      qc.invalidateQueries({ queryKey: ["today-quote"] });
    },
  });
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-quotes"] });
      qc.invalidateQueries({ queryKey: ["today-quote"] });
    },
  });
}

// ─── EXAM SCHEDULE HOOKS ──────────────────────────────────────────────────────

export function useExamSchedule(cls?: string, examType?: string, year?: number) {
  return useQuery<ExamScheduleEntry[]>({
    queryKey: ["exam-schedule", cls, examType, year],
    queryFn: async () => {
      let q = supabase
        .from("exam_schedule")
        .select("*")
        .eq("is_published", true)
        .order("exam_date", { ascending: true });
      if (cls) q = q.eq("class", cls);
      if (examType) q = q.eq("exam_type", examType);
      if (year) q = q.eq("year", year);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!cls,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAllExamSchedule() {
  return useQuery<ExamScheduleEntry[]>({
    queryKey: ["all-exam-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_schedule")
        .select("*")
        .order("exam_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertExamSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entries: Omit<ExamScheduleEntry, "id" | "created_at">[]) => {
      const { error } = await supabase.from("exam_schedule").insert(entries);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exam-schedule"] }),
  });
}

export function useDeleteExamEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exam_schedule").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam-schedule"] });
      qc.invalidateQueries({ queryKey: ["all-exam-schedule"] });
    },
  });
}

// ─── HONOR ROLL HOOKS ─────────────────────────────────────────────────────────

export function useHonorRoll(year?: number, month?: number) {
  return useQuery<HonorRollEntry[]>({
    queryKey: ["honor-roll", year, month],
    queryFn: async () => {
      let q = supabase
        .from("honor_roll")
        .select("*")
        .eq("is_published", true)
        .order("class", { ascending: true });
      if (year) q = q.eq("year", year);
      if (month) q = q.eq("month", month);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useAllHonorRoll() {
  return useQuery<HonorRollEntry[]>({
    queryKey: ["all-honor-roll"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("honor_roll")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertHonorRoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<HonorRollEntry> & { student_name: string }) => {
      if (payload.id) {
        const { error } = await supabase.from("honor_roll").update(payload).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("honor_roll").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["honor-roll"] });
      qc.invalidateQueries({ queryKey: ["all-honor-roll"] });
    },
  });
}

export function useDeleteHonorRoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("honor_roll").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["honor-roll"] });
      qc.invalidateQueries({ queryKey: ["all-honor-roll"] });
    },
  });
}

// ─── MERIT LIST HOOKS ─────────────────────────────────────────────────────────

export function useMeritLists() {
  return useQuery<MeritList[]>({
    queryKey: ["merit-lists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merit_lists")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePublishMeritList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cls, examType, year }: { cls: string; examType: string; year: number }) => {
      const { error } = await supabase.from("merit_lists").upsert({
        class: cls, exam_type: examType, year,
        is_published: true, published_at: new Date().toISOString(),
      }, { onConflict: "class,exam_type,year" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["merit-lists"] }),
  });
}

// ─── ATTENDANCE STATS HOOKS ───────────────────────────────────────────────────

export interface AttendanceStat {
  total_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  leave_days: number;
  percentage: number;
}

export function useStudentAttendanceStats(studentId: string | undefined, month?: number, year?: number) {
  return useQuery<AttendanceStat>({
    queryKey: ["attendance-stat", studentId, month, year],
    queryFn: async () => {
      if (!studentId) return { total_days: 0, present_days: 0, absent_days: 0, late_days: 0, leave_days: 0, percentage: 0 };
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
      const total = records.length;
      const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
      return { total_days: total, present_days: present, absent_days: absent, late_days: late, leave_days: leave, percentage };
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useClassAttendanceSummary(cls: string, month: number, year: number) {
  return useQuery<{ student_id: string; student_name: string; percentage: number }[]>({
    queryKey: ["class-attendance-summary", cls, month, year],
    queryFn: async () => {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = `${year}-${String(month).padStart(2, "0")}-31`;
      const { data: students } = await supabase
        .from("students")
        .select("id, full_name")
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
        const present = mine.filter((a) => ["present", "late"].includes(a.status)).length;
        const total = mine.length;
        return {
          student_id: s.id,
          student_name: s.full_name,
          percentage: total > 0 ? Math.round((present / total) * 100) : 0,
        };
      }).sort((a, b) => b.percentage - a.percentage);
    },
    enabled: !!cls,
    staleTime: 5 * 60 * 1000,
  });
    }
    
