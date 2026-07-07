// src/hooks/useExamAttendance.ts
// Exam Attendance with QR Code scanning — per class, per paper.
// Supabase table: exam_attendance
//
// Two QR formats are now supported:
//   {t:"exam", sid, stid, rn}            — legacy admit-card QR (no seat info)
//   {t:"seat", pid, rid, sl, stid, rn}   — new desk QR (carries seat/room)
//
// ─── STRICT PAPER-WINDOW ENFORCEMENT (rev. 3) ───────────────────────────────
// Attendance can ONLY be marked when ALL of the following are true:
//   1. The selected exam date is TODAY (no past, no future).
//   2. A seating plan exists for this session+subject+date with paper_start_at
//      and paper_end_at set (i.e. the paper time was configured in the
//      Exam Seating / Live Console).
//   3. The current time is BETWEEN paper_start_at and paper_end_at (inclusive).
//
// If any condition fails, ALL attendance writes (init / scan / update) are
// blocked both in the UI and inside every mutation (defense in depth).
//
// LIVE CONSOLE SYNC (rev. 3): the seating plan is the LIVE source of truth.
// If admin extends paper end-time from the Live Console mid-exam (e.g. 12 PM
// → 1 PM because students came late), the attendance window AUTOMATICALLY
// extends — no need to re-init the sheet. The mutation guards always
// re-fetch the latest paper times from the seating plan, never trusting the
// stale snapshot stored on attendance rows.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type ExamAttStatus = "present" | "absent" | "leave";

export interface ExamAttendanceRecord {
  id?: string;
  session_id: string;
  student_id: string;
  student_name: string;
  class: string;
  class_roll_no: string;
  exam_roll_no: string;
  subject: string;
  exam_date: string;
  status: ExamAttStatus;
  scanned_at: string | null;
  scanned_by: string | null;
  // Seating fields (added by migration 014 — nullable, backward compatible):
  seat_id?: string | null;
  room_id?: string | null;
  seat_label?: string | null;
  // Paper timing (added by migration 015 — nullable, backward compatible):
  paper_start_time?: string | null;
  paper_end_time?: string | null;
  created_at?: string;
}

export interface ExamSessionInfo {
  id: string;
  title: string;
  exam_year: number;
  exam_term: string;
  classes: string[];
  class_order: string[];
  starting_number: number;
  is_published: boolean;
}

// ─── HOOKS ────────────────────────────────────────────────────────────────────

/** Fetch all published exam sessions (for dropdown) */
export function useExamSessions() {
  return useQuery<ExamSessionInfo[]>({
    queryKey: ["exam-sessions-published"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_roll_sessions")
        .select("id, title, exam_year, exam_term, classes, class_order, starting_number, is_published")
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** Fetch exam roll numbers for a specific session + class */
export function useExamRollNumbers(sessionId: string | undefined, cls: string | undefined) {
  return useQuery<{ id: string; student_id: string; student_name: string; father_name: string | null; class: string; class_roll_no: string; exam_roll_no: string; serial_number: number }[]>({
    queryKey: ["exam-rolls-for-attendance", sessionId, cls],
    queryFn: async () => {
      if (!sessionId || !cls) return [];
      const { data, error } = await supabase
        .from("exam_roll_numbers")
        .select("id, student_id, student_name, father_name, class, class_roll_no, exam_roll_no, serial_number")
        .eq("session_id", sessionId)
        .eq("class", cls)
        .order("serial_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!sessionId && !!cls,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Normalize any date-like string to "YYYY-MM-DD".
 * Handles: "2026-07-06", "2026-07-06T00:00:00.000Z", "2026-07-06 00:00:00+00",
 * "07/06/2026", etc. Returns the original string if it can't be parsed.
 */
function normalizeExamDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return s.slice(0, 10);
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  } catch { /* ignore */ }
  return s;
}

/**
 * DEDUPE helper (rev. 11).
 *
 * The exam_attendance table is supposed to have ONE row per
 * (session_id, student_id, subject, exam_date). Pre-migration data may
 * contain duplicate rows (caused by the old SELECT-then-INSERT scan flow
 * racing with itself when two invigilators scanned the same student in the
 * same second). The migration 018 + the new upsert-based scan flow
 * prevents NEW duplicates, but existing ones must be cleaned up at read
 * time too so the UI doesn't show inflated counts or "delete-but-it-comes-
 * back" cells in the Class Overview.
 *
 * This function keeps ONE row per (student_id, subject, NORMALIZED date)
 * group, preferring:
 *   1. non-null scanned_at   (actually scanned > never scanned)
 *   2. latest scanned_at      (most recent scan wins)
 *   3. latest created_at      (tie-breaker)
 *
 * rev. 11: the date is normalized to "YYYY-MM-DD" before being used as
 * part of the key, so rows with different exam_date string formats
 * ("2026-07-06" vs "2026-07-06T00:00:00.000Z") for the same actual date
 * are correctly deduped instead of appearing as separate entries.
 */
export function dedupeAttendanceRows(rows: ExamAttendanceRecord[]): ExamAttendanceRecord[] {
  if (!rows || rows.length === 0) return [];
  const map = new Map<string, ExamAttendanceRecord>();
  for (const r of rows) {
    const key = `${r.session_id}|${r.student_id}|${r.subject}|${normalizeExamDate(r.exam_date)}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, r);
      continue;
    }
    // Prefer non-null scanned_at, then latest scanned_at, then latest created_at.
    const aHas = !!r.scanned_at;
    const bHas = !!prev.scanned_at;
    let keep: ExamAttendanceRecord;
    if (aHas && !bHas) keep = r;
    else if (!aHas && bHas) keep = prev;
    else if (aHas && bHas) {
      keep = (r.scanned_at! >= prev.scanned_at!) ? r : prev;
    } else {
      // Neither scanned — keep the latest created_at.
      const ra = r.created_at || "";
      const rb = prev.created_at || "";
      keep = (ra >= rb) ? r : prev;
    }
    map.set(key, keep);
  }
  return Array.from(map.values());
}

/** Fetch exam attendance for a specific session + class + subject + date */
export function useExamAttendance(sessionId: string | undefined, cls: string | undefined, subject: string | undefined, examDate: string | undefined) {
  return useQuery<ExamAttendanceRecord[]>({
    queryKey: ["exam-attendance", sessionId, cls, subject, examDate],
    queryFn: async () => {
      if (!sessionId || !cls || !subject || !examDate) return [];
      const { data, error } = await supabase
        .from("exam_attendance")
        .select("*")
        .eq("session_id", sessionId)
        .eq("class", cls)
        .eq("subject", subject)
        .eq("exam_date", examDate)
        .order("class_roll_no", { ascending: true });
      if (error) throw error;
      // DEDUPE: in case pre-migration duplicate rows exist, collapse them
      // so the present/absent/leave stats and the student list aren't inflated.
      return dedupeAttendanceRows(data ?? []);
    },
    enabled: !!sessionId && !!cls && !!subject && !!examDate,
    staleTime: 1 * 60 * 1000,
  });
}

/** Fetch ALL exam attendance for a session + class (for the attendance overview) */
/**
 * Fetch ALL exam attendance for a class (for the Class Overview pivot table).
 *
 * rev. 8: session_id filter REMOVED. The overview now shows attendance from
 * ALL sessions for the selected class. This fixes the "no data shows" bug
 * that occurred when the admin selected a different session in the dropdown
 * than the one the attendance rows were inserted with. The pivot table uses
 * subject+date as column headers so multiple sessions don't collide.
 */
export function useExamAttendanceOverview(sessionId: string | undefined, cls: string | undefined) {
  return useQuery<ExamAttendanceRecord[]>({
    queryKey: ["exam-attendance-overview", sessionId, cls],
    queryFn: async () => {
      if (!cls || !sessionId) return [];
      const { data, error } = await supabase
        .from("exam_attendance")
        .select("*")
        .eq("session_id", sessionId)
        .eq("class", cls)
        .order("exam_date", { ascending: true })
        .order("class_roll_no", { ascending: true });
      if (error) throw error;
      // DEDUPE: collapse any duplicate rows so the pivot table doesn't show
      // "delete-but-it-comes-back" cells (caused by pre-migration duplicates
      // where deleting one row left the other behind).
      return dedupeAttendanceRows(data ?? []);
    },
    enabled: !!cls && !!sessionId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Delete a single attendance cell (one student + one subject + one date).
 * Used by the Class Overview's per-cell delete button.
 */
export function useDeleteAttendanceCell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      studentId: string;
      subject: string;
      examDate: string;
      cls: string;
      sessionId?: string;
    }) => {
      // Delete ALL rows matching (student, subject, date) — not just one.
      // This cleans up any duplicate rows that may exist from before the
      // unique-constraint migration was applied. If sessionId is provided,
      // also scope by session to be extra safe.
      let q = supabase
        .from("exam_attendance")
        .delete()
        .eq("student_id", params.studentId)
        .eq("subject", params.subject)
        .eq("exam_date", params.examDate);
      if (params.sessionId) q = q.eq("session_id", params.sessionId);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Attendance record deleted");
      qc.invalidateQueries({ queryKey: ["exam-attendance-overview"] });
      qc.invalidateQueries({ queryKey: ["exam-attendance"] });
      qc.invalidateQueries({ queryKey: ["live-attendance"] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to delete attendance record";
      toast.error(msg);
      console.error("[useDeleteAttendanceCell] error:", err);
    },
  });
}

/**
 * Delete ALL attendance for one student in a class (across all subjects/dates).
 * Used by the Class Overview's per-student delete button.
 */
export function useDeleteStudentAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      studentId: string;
      cls: string;
      sessionId?: string;
    }) => {
      // Delete ALL rows for this student in this class. If sessionId is
      // provided, scope by it too.
      let q = supabase
        .from("exam_attendance")
        .delete()
        .eq("student_id", params.studentId)
        .eq("class", params.cls);
      if (params.sessionId) q = q.eq("session_id", params.sessionId);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All attendance records for this student deleted");
      qc.invalidateQueries({ queryKey: ["exam-attendance-overview"] });
      qc.invalidateQueries({ queryKey: ["exam-attendance"] });
      qc.invalidateQueries({ queryKey: ["live-attendance"] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to delete attendance records";
      toast.error(msg);
      console.error("[useDeleteStudentAttendance] error:", err);
    },
  });
}

// ─── PAPER TIMES — AUTO-FETCH FROM SEATING PLAN ─────────────────────────────
// The seating plan (set up in Exam Seating / Live Console) stores
// paper_start_at / paper_end_at as timestamptz. We fetch those and convert to
// "HH:MM" (local) for storage on the attendance rows + window comparison.

export interface PaperTimes { start: string; end: string; } // "HH:MM" local

/** Convert an ISO timestamptz string to "HH:MM" in the browser's local tz. */
function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Format a Date as "YYYY-MM-DD" using LOCAL time (not UTC). */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Loose subject matcher — case-insensitive, bidirectional substring.
 * Matches the dropdown subject (e.g. "Mathematics") against the seating
 * plan's free-text paper_subject (e.g. "Mathematics — Paper 1").
 *
 *   "Mathematics"  vs  "Mathematics — Paper 1"  → MATCH (Mathematics is substring)
 *   "Physics"      vs  "Mathematics — Paper 1"  → no match
 *   "English"      vs  "english literature"     → MATCH (case-insensitive + substring)
 *   ""             vs  "anything"               → no match (empties never match)
 */
export function subjectsMatch(
  planSubject: string | null | undefined,
  dropdownSubject: string | null | undefined
): boolean {
  if (!planSubject || !dropdownSubject) return false;
  const a = planSubject.trim().toLowerCase();
  const b = dropdownSubject.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Extract the date portion (YYYY-MM-DD) from any date-like string.
 * Handles: "2026-07-05", "2026-07-05T09:00:00.000Z", "2026-07-05 09:00:00+00",
 * "07/05/2026", etc. Returns null if the input can't be parsed.
 */
function extractDatePart(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Already YYYY-MM-DD?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // ISO/timestamptz — take the first 10 chars.
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return s.slice(0, 10);
  // Try Date parsing as a last resort.
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return formatLocalDate(d);
  } catch { /* ignore */ }
  return null;
}

/**
 * Fetch paper times for a given session+subject+date.
 *
 * DIAGNOSTIC MODE (rev. 6): fetches ALL plans for the session (no server-side
 * date filter — eliminates timestamptz/date format mismatch issues), then
 * filters client-side by:
 *   1. status is 'generated' or 'published'
 *   2. exam_date matches (date-portion comparison — handles both date and
 *      timestamptz columns)
 *   3. paper_start_at and paper_end_at are non-null
 *   4. subject matches (loose, bidirectional, case-insensitive)
 *
 * Logs every step to the console so we can diagnose "no plan found" errors.
 * Returns null if no plan matches — caller should show a detailed error.
 */
export async function fetchPaperTimesFromSeatingPlan(
  sessionId: string,
  subject: string,
  examDate: string
): Promise<{ start: string; end: string; planId: string } | null> {

  // ── STEP 1: Fetch ALL plans for this session (no filters). ──
  // We do ALL filtering client-side to avoid PostgREST type-coercion issues
  // with date/timestamptz columns.
  const { data: allPlans, error } = await supabase
    .from("exam_seating_plans")
    .select("id, paper_subject, paper_start_at, paper_end_at, exam_date, status, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  console.log("[fetchPaperTimesFromSeatingPlan] ── DIAGNOSTIC ──");
  console.log("[fetchPaperTimesFromSeatingPlan] Looking for:", { sessionId, subject, examDate });
  console.log("[fetchPaperTimesFromSeatingPlan] Query error:", error);
  console.log("[fetchPaperTimesFromSeatingPlan] All plans for this session:", allPlans?.length ?? 0);
  if (allPlans && allPlans.length > 0) {
    console.table(allPlans.map(p => ({
      id: p.id?.slice(0, 8) + "...",
      paper_subject: p.paper_subject,
      exam_date: p.exam_date,
      exam_date_parsed: extractDatePart(p.exam_date),
      status: p.status,
      paper_start_at: p.paper_start_at,
      paper_end_at: p.paper_end_at,
    })));
  }

  if (error) {
    console.error("[fetchPaperTimesFromSeatingPlan] Supabase query error:", error);
    return null;
  }
  if (!allPlans || allPlans.length === 0) {
    console.warn("[fetchPaperTimesFromSeatingPlan] No plans found for session", sessionId, "— is the session ID correct?");
    return null;
  }

  // ── STEP 2: Filter by status (generated or published). ──
  const statusOk = allPlans.filter(p => p.status === "generated" || p.status === "published");
  console.log("[fetchPaperTimesFromSeatingPlan] After status filter (generated/published):", statusOk.length, "of", allPlans.length);
  if (statusOk.length === 0) {
    console.warn("[fetchPaperTimesFromSeatingPlan] All plans have wrong status:", allPlans.map(p => p.status));
    return null;
  }

  // ── STEP 3: Filter by date (date-portion comparison). ──
  const targetDate = extractDatePart(examDate);
  console.log("[fetchPaperTimesFromSeatingPlan] Target date (parsed):", targetDate);
  const dateOk = statusOk.filter(p => {
    const planDate = extractDatePart(p.exam_date);
    return planDate === targetDate;
  });
  console.log("[fetchPaperTimesFromSeatingPlan] After date filter:", dateOk.length, "of", statusOk.length);
  if (dateOk.length === 0) {
    console.warn("[fetchPaperTimesFromSeatingPlan] No plans match date", targetDate, ". Plan dates are:", statusOk.map(p => ({ raw: p.exam_date, parsed: extractDatePart(p.exam_date) })));
    return null;
  }

  // ── STEP 4: Filter by paper times set. ──
  const timesOk = dateOk.filter(p => p.paper_start_at && p.paper_end_at);
  console.log("[fetchPaperTimesFromSeatingPlan] After paper-times filter:", timesOk.length, "of", dateOk.length);
  if (timesOk.length === 0) {
    console.warn("[fetchPaperTimesFromSeatingPlan] Plans exist for this date but none have paper_start_at/paper_end_at set:", dateOk.map(p => ({ id: p.id, start: p.paper_start_at, end: p.paper_end_at })));
    return null;
  }

  // ── STEP 5: Filter by subject (loose match). ──
  // 5a. Prefer exact (case-insensitive) match.
  const target = subject.trim().toLowerCase();
  let match = timesOk.find(p =>
    (p.paper_subject || "").trim().toLowerCase() === target
  );
  console.log("[fetchPaperTimesFromSeatingPlan] Exact subject match:", !!match);

  // 5b. Fall back to loose bidirectional substring match.
  if (!match) {
    match = timesOk.find(p => subjectsMatch(p.paper_subject, subject));
    console.log("[fetchPaperTimesFromSeatingPlan] Loose subject match:", !!match);
  }

  // 5c. Last resort: if there's only ONE plan for this date with paper times,
  //     use it regardless of subject. This handles the case where the admin
  //     left paper_subject blank or named it something completely different.
  if (!match && timesOk.length === 1) {
    match = timesOk[0];
    console.warn("[fetchPaperTimesFromSeatingPlan] Subject mismatch, but only 1 plan for this date — using it anyway. Plan subject:", match.paper_subject, "Dropdown subject:", subject);
  }

  if (!match) {
    console.warn("[fetchPaperTimesFromSeatingPlan] No subject match. Dropdown:", subject, "Plan subjects:", timesOk.map(p => p.paper_subject));
    return null;
  }

  console.log("[fetchPaperTimesFromSeatingPlan] ✅ MATCH FOUND:", { planId: match.id, start: isoToHHMM(match.paper_start_at), end: isoToHHMM(match.paper_end_at) });
  return {
    start: isoToHHMM(match.paper_start_at),
    end:   isoToHHMM(match.paper_end_at),
    planId: match.id,
  };
}

/** React Query hook version of fetchPaperTimesFromSeatingPlan. */
export function usePaperTimesFromSeatingPlan(
  sessionId: string | undefined,
  subject: string | undefined,
  examDate: string | undefined
) {
  return useQuery<{ start: string; end: string; planId: string } | null>({
    queryKey: ["paper-times-seating", sessionId, subject, examDate],
    queryFn: () => fetchPaperTimesFromSeatingPlan(sessionId!, subject!, examDate!),
    enabled: !!sessionId && !!subject && !!examDate,
    // 10s stale time — matches the window-tick interval in the UI, and is
    // short enough that a Live Console paper-time update (which invalidates
    // this query) is reflected in the attendance tab within seconds.
    staleTime: 10 * 1000,
  });
}

// ─── PAPER TIMING WINDOW — STRICT ───────────────────────────────────────────
// The "unrestricted" mode is GONE. If there are no paper times, attendance is
// BLOCKED. The only allowed state is "in_progress" (today + paper running).

export type PaperWindowStatus =
  | "not_today"        // examDate is past or future
  | "no_paper_times"   // today, but no paper_start/end set anywhere
  | "not_started"      // today, before paper_start
  | "in_progress"      // today, between paper_start and paper_end (allowed)
  | "ended";           // today, after paper_end

/**
 * Compute the paper-window status. Accepts paper times in EITHER form:
 *   - "HH:MM" string (stored on attendance rows)
 *   - already-resolved { start, end } from the seating plan
 *
 * PRIORITY: seating-plan times WIN over row times. The seating plan is the
 * live-editable source of truth (admin can extend paper end-time from the
 * Live Console mid-exam). Row times are a stale snapshot from init time and
 * are only used as a fallback when no seating plan is found.
 */
export function getPaperWindowStatus(
  examDate: string,
  rowPaperStart: string | null | undefined,
  rowPaperEnd:   string | null | undefined,
  seatingTimes:  { start: string; end: string } | null | undefined,
  now: Date = new Date()
): PaperWindowStatus {
  const todayStr = formatLocalDate(now);
  if (examDate !== todayStr) return "not_today";

  const start = seatingTimes?.start || rowPaperStart || null;
  const end   = seatingTimes?.end   || rowPaperEnd   || null;
  if (!start || !end) return "no_paper_times";

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startDate = new Date(now); startDate.setHours(sh, sm, 0, 0);
  const endDate   = new Date(now); endDate.setHours(eh, em, 59, 999);

  if (now < startDate) return "not_started";
  if (now > endDate)   return "ended";
  return "in_progress";
}

/** The ONLY state that allows marking attendance is "in_progress". */
export function canMarkExamAttendance(status: PaperWindowStatus): boolean {
  return status === "in_progress";
}

export function paperWindowMessage(
  status: PaperWindowStatus,
  paperStart?: string | null,
  paperEnd?: string | null
): string {
  switch (status) {
    case "not_today":
      return "Locked — attendance can only be marked on TODAY's date. Past and future dates are blocked.";
    case "no_paper_times":
      return "Locked — no paper time is set for this subject today. Set the paper start/end time in Exam Seating / Live Console first.";
    case "not_started":
      return `Locked — paper hasn't started yet. Attendance opens at ${paperStart}.`;
    case "ended":
      return `Locked — paper is over. Attendance closed at ${paperEnd}.`;
    case "in_progress":
      return `Open — paper in progress. Attendance can be marked until ${paperEnd}.`;
    default:
      return "";
  }
}

/**
 * Hard guard for mutations. Throws if the window isn't open.
 * This is the defense-in-depth layer — even if the UI is bypassed, no DB write
 * happens outside the paper window.
 *
 * ALWAYS fetches the latest paper times from the seating plan (the live source
 * of truth) — never trusts the row's stored snapshot, because admin may have
 * extended the paper end-time from the Live Console mid-exam.
 */
async function assertWindowOpen(opts: {
  examDate: string;
  sessionId: string;
  subject: string;
  rowPaperStart?: string | null;
  rowPaperEnd?: string | null;
}): Promise<{ start: string; end: string }> {
  const now = new Date();
  const todayStr = formatLocalDate(now);
  if (opts.examDate !== todayStr) {
    throw new Error("Attendance can only be marked on today's date.");
  }

  // ALWAYS re-fetch from the seating plan — it's the live source of truth.
  // Row times are only used as a fallback if no plan is found at all.
  let start: string | null = null;
  let end:   string | null = null;
  const planTimes = await fetchPaperTimesFromSeatingPlan(opts.sessionId, opts.subject, opts.examDate);
  if (planTimes) {
    start = planTimes.start;
    end   = planTimes.end;
  } else if (opts.rowPaperStart && opts.rowPaperEnd) {
    // Fallback for legacy sheets whose seating plan was deleted/unpublished.
    start = opts.rowPaperStart;
    end   = opts.rowPaperEnd;
  }
  if (!start || !end) {
    throw new Error(
      "No paper time set. Check the browser console (F12) for a full diagnostic table. " +
      "Open Live Console → Paper Times to set the paper start/end time, then try again."
    );
  }

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startDate = new Date(now); startDate.setHours(sh, sm, 0, 0);
  const endDate   = new Date(now); endDate.setHours(eh, em, 59, 999);

  if (now < startDate) throw new Error(`Paper hasn't started yet. Opens at ${start}.`);
  if (now > endDate)   throw new Error(`Paper is over. Closed at ${end}.`);

  return { start, end };
}

// ─── MUTATIONS ────────────────────────────────────────────────────────────────

/**
 * Initialize exam attendance for a class/paper — creates "absent" records for
 * all students. Paper times are auto-fetched from the seating plan; if the
 * seating plan has no times for this subject+date, init is BLOCKED.
 */
export function useInitExamAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      sessionId: string;
      cls: string;
      subject: string;
      examDate: string;
      students: { student_id: string; student_name: string; class_roll_no: string; exam_roll_no: string }[];
    }) => {
      // 1. Strict today check.
      const todayStr = formatLocalDate(new Date());
      if (params.examDate !== todayStr) {
        throw new Error("Attendance can only be initialized for today's date.");
      }

      // 2. Pull paper times from the seating plan (NO manual entry).
      const planTimes = await fetchPaperTimesFromSeatingPlan(params.sessionId, params.subject, params.examDate);
      if (!planTimes) {
        // Detailed error — tells the admin EXACTLY what to check.
        // The fetchPaperTimesFromSeatingPlan function has already logged
        // the full diagnostic info to the browser console.
        throw new Error(
          "No matching seating plan with paper times found. Check the browser console (F12) for a full diagnostic table. " +
          "Common causes: (1) wrong Exam Session selected in the dropdown, (2) plan status is 'draft' (publish it first), " +
          "(3) plan's exam_date doesn't match today, (4) paper_start_at/paper_end_at not set on the plan, " +
          "(5) plan's paper_subject doesn't match the dropdown subject. " +
          "Open Live Console → Paper Times to verify the plan exists and has times set."
        );
      }

      // 3. Window check.
      await assertWindowOpen({
        examDate: params.examDate,
        sessionId: params.sessionId,
        subject: params.subject,
        rowPaperStart: planTimes.start,
        rowPaperEnd: planTimes.end,
      });

      // 4. SYNC: always update existing rows' paper times to match the latest
      // seating-plan times. This handles three cases at once:
      //   (a) legacy rows with NULL paper_start_time/paper_end_time
      //   (b) rows whose times are stale because admin extended the paper
      //       end-time from the Live Console AFTER init
      //   (c) rows whose times are stale because admin edited the seating plan
      //       to start earlier/later AFTER init
      // This keeps the row-level display accurate without affecting the
      // window check (which always re-fetches from the seating plan anyway).
      await supabase
        .from("exam_attendance")
        .update({ paper_start_time: planTimes.start, paper_end_time: planTimes.end })
        .eq("session_id", params.sessionId)
        .eq("class", params.cls)
        .eq("subject", params.subject)
        .eq("exam_date", params.examDate);

      // 5. Insert new rows (ignore duplicates).
      const rows = params.students.map(s => ({
        session_id: params.sessionId,
        student_id: s.student_id,
        student_name: s.student_name,
        class: params.cls,
        class_roll_no: s.class_roll_no,
        exam_roll_no: s.exam_roll_no,
        subject: params.subject,
        exam_date: params.examDate,
        status: "absent" as ExamAttStatus,
        scanned_at: null,
        scanned_by: null,
        paper_start_time: planTimes.start,
        paper_end_time: planTimes.end,
      }));
      const { error } = await supabase
        .from("exam_attendance")
        .upsert(rows, { onConflict: "session_id,student_id,subject,exam_date", ignoreDuplicates: true });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (_data, vars) => {
      toast.success(`Attendance sheet initialized for ${vars.subject}`);
      qc.invalidateQueries({ queryKey: ["exam-attendance", vars.sessionId, vars.cls, vars.subject, vars.examDate] });
      qc.invalidateQueries({ queryKey: ["exam-attendance-overview", vars.sessionId, vars.cls] });
    },
    onError: (err: any) => {
      // CRITICAL: surface the error so the admin sees WHY init failed.
      // Without this, the mutation silently swallows errors and the button
      // appears to do nothing.
      const msg = err?.message || "Failed to initialize attendance sheet";
      toast.error(msg);
      console.error("[useInitExamAttendance] error:", err);
    },
  });
}

/**
 * Scan QR code — mark a student as present (legacy admit-card QR path).
 *
 * rev. 10 — ATOMIC UPSERT (race-condition-safe):
 * The previous SELECT-then-INSERT flow could create duplicate rows when two
 * invigilators scanned the same student in the same second (both saw
 * existing=null, both INSERTed). The new flow:
 *   1. SELECT existing (read-only — used for "already marked" detection only)
 *   2. Window guard
 *   3. Resolve student info from exam_roll_numbers (works for ANY class in
 *      the session — the saved row uses the student's ACTUAL class, not the
 *      admin/teacher's selected class. This enables cross-class scanning.)
 *   4. Single atomic UPSERT with onConflict — concurrent scans serialize,
 *      no duplicates possible (requires migration 018's unique constraint).
 *
 * Cross-class scanning: `params.cls` is the SELECTED class in the dropdown,
 * but the saved row's `class` field is `rollEntry.class` (the student's real
 * class). The returned `class` is used by the caller to invalidate the right
 * query keys and to show the correct class in the toast.
 */
export function useScanExamAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      sessionId: string;
      studentId: string;
      subject: string;
      examDate: string;
      cls: string;
      scannedBy: string | null;
    }): Promise<{ status: "marked" | "already"; newStatus: ExamAttStatus; class: string }> => {
      // 1. Read current state (for "already marked" detection ONLY — this
      //    read does NOT gate the write, so the race condition is gone).
      const { data: existing } = await supabase
        .from("exam_attendance")
        .select("id, status, paper_start_time, paper_end_time")
        .eq("session_id", params.sessionId)
        .eq("student_id", params.studentId)
        .eq("subject", params.subject)
        .eq("exam_date", params.examDate)
        .maybeSingle();

      // 2. Window guard.
      await assertWindowOpen({
        examDate: params.examDate,
        sessionId: params.sessionId,
        subject: params.subject,
        rowPaperStart: existing?.paper_start_time,
        rowPaperEnd: existing?.paper_end_time,
      });

      // 3. Resolve student info (session-wide — works for ANY class, not
      //    just the selected one). This is the key change that enables
      //    cross-class scanning: the saved row uses the student's ACTUAL
      //    class from the roll-number table, never a random class.
      const { data: rollEntry } = await supabase
        .from("exam_roll_numbers")
        .select("student_name, class_roll_no, exam_roll_no, class")
        .eq("session_id", params.sessionId)
        .eq("student_id", params.studentId)
        .maybeSingle();
      if (!rollEntry) throw new Error("Student not found in this exam session");

      // 4. Fetch paper times for the row payload (also re-used by the window
      //    guard inside assertWindowOpen — calling twice is cheap, the
      //    query is short-circuited by React Query's cache for the hook
      //    version but here we're in a mutation so we re-fetch).
      const planTimes = await fetchPaperTimesFromSeatingPlan(params.sessionId, params.subject, params.examDate);

      // 5. ATOMIC UPSERT — race-condition-safe. Two teachers scanning the
      //    same student in the same second will no longer produce duplicate
      //    rows. The unique constraint (added by migration 018) is required
      //    for onConflict to work; if it doesn't exist, this still falls
      //    back to a regular INSERT (no worse than before).
      const { error } = await supabase
        .from("exam_attendance")
        .upsert({
          session_id: params.sessionId,
          student_id: params.studentId,
          student_name: rollEntry.student_name,
          class: rollEntry.class,
          class_roll_no: rollEntry.class_roll_no,
          exam_roll_no: rollEntry.exam_roll_no,
          subject: params.subject,
          exam_date: params.examDate,
          status: "present",
          scanned_at: new Date().toISOString(),
          scanned_by: params.scannedBy,
          paper_start_time: planTimes?.start ?? existing?.paper_start_time ?? null,
          paper_end_time: planTimes?.end ?? existing?.paper_end_time ?? null,
        }, { onConflict: "session_id,student_id,subject,exam_date" });
      if (error) throw error;

      return {
        status: existing?.status === "present" ? "already" : "marked",
        newStatus: "present" as ExamAttStatus,
        class: rollEntry.class,
      };
    },
    onSuccess: (data, vars) => {
      // Invalidate the SELECTED class's queries (so the teacher's current
      // view updates if the student happens to be in the selected class).
      qc.invalidateQueries({ queryKey: ["exam-attendance", vars.sessionId, vars.cls, vars.subject, vars.examDate] });
      qc.invalidateQueries({ queryKey: ["exam-attendance-overview", vars.sessionId, vars.cls] });
      // ALSO invalidate the student's ACTUAL class queries — this is the
      // important bit for cross-class scanning. If the teacher selected
      // class 8 but scanned a class-7 student, the class-7 sheet needs to
      // refresh so the Live Console and Class Overview reflect the scan.
      if (data?.class && data.class !== vars.cls) {
        qc.invalidateQueries({ queryKey: ["exam-attendance", vars.sessionId, data.class, vars.subject, vars.examDate] });
        qc.invalidateQueries({ queryKey: ["exam-attendance-overview", vars.sessionId, data.class] });
      }
      // Live console always refreshes.
      qc.invalidateQueries({ queryKey: ["live-attendance"] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to mark attendance";
      toast.error(msg);
      console.error("[useScanExamAttendance] error:", err);
    },
  });
}

// ─── SEATING-AWARE SCAN (migration 014) ─────────────────────────────────────
// Called when an invigilator scans a DESK QR ({t:"seat",...}). Looks up the
// seating assignment by qr_token, then upserts the exam_attendance row with
// seat_id / room_id / seat_label populated.
export function useScanSeatingAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      scannedQrToken: string;
      decoded?: { planId: string; roomId: string; seatLabel: string; studentId: string; examRollNo: string };
      subject: string;
      examDate: string;
      scannedBy: string | null;
    }): Promise<{
      status: "marked" | "already";
      newStatus: ExamAttStatus;
      studentId: string;
      studentName: string;
      class: string;
      classRollNo: string;
      examRollNo: string;
      sessionId: string;
      seatLabel: string;
      roomName: string;
    }> => {
      // 1. Resolve the assignment row.
      let assignment: any = null;
      if (params.decoded) {
        const { data, error } = await supabase
          .from("exam_seating_assignments")
          .select("id, plan_id, room_id, student_id, student_name, class, class_roll_no, exam_roll_no, seat_label, qr_token, exam_seating_plans!inner(session_id, title, paper_start_at, paper_end_at), exam_seating_rooms!inner(name)")
          .eq("plan_id", params.decoded.planId)
          .eq("room_id", params.decoded.roomId)
          .eq("seat_label", params.decoded.seatLabel)
          .eq("student_id", params.decoded.studentId)
          .maybeSingle();
        if (error) throw error;
        assignment = data;
      } else {
        const { data, error } = await supabase
          .from("exam_seating_assignments")
          .select("id, plan_id, room_id, student_id, student_name, class, class_roll_no, exam_roll_no, seat_label, qr_token, exam_seating_plans!inner(session_id, title, paper_start_at, paper_end_at), exam_seating_rooms!inner(name)")
          .eq("qr_token", params.scannedQrToken)
          .maybeSingle();
        if (error) throw error;
        assignment = data;
      }
      if (!assignment) {
        throw new Error("Seat assignment not found — the QR may be from an archived plan");
      }

      const sessionId = assignment["exam_seating_plans"]?.session_id;
      const roomName  = assignment["exam_seating_rooms"]?.name ?? "—";
      if (!sessionId) throw new Error("Seating plan has no linked exam session");

      // 2. Window guard — use the plan's paper_start_at/paper_end_at.
      const planStart = assignment["exam_seating_plans"]?.paper_start_at;
      const planEnd   = assignment["exam_seating_plans"]?.paper_end_at;
      await assertWindowOpen({
        examDate: params.examDate,
        sessionId,
        subject: params.subject,
        rowPaperStart: planStart ? isoToHHMM(planStart) : null,
        rowPaperEnd:   planEnd   ? isoToHHMM(planEnd)   : null,
      });

      // 3. Read current state (for "already marked" detection ONLY — this
      //    read does NOT gate the write, so the race condition between two
      //    invigilators scanning the same student in the same second is
      //    eliminated by the atomic upsert below).
      const { data: existing } = await supabase
        .from("exam_attendance")
        .select("id, status")
        .eq("session_id", sessionId)
        .eq("student_id", assignment.student_id)
        .eq("subject", params.subject)
        .eq("exam_date", params.examDate)
        .maybeSingle();

      const seatPayload = {
        seat_id: assignment.id,
        room_id: assignment.room_id,
        seat_label: assignment.seat_label,
        paper_start_time: planStart ? isoToHHMM(planStart) : null,
        paper_end_time:   planEnd   ? isoToHHMM(planEnd)   : null,
      };

      // 4. ATOMIC UPSERT (rev. 10) — race-condition-safe. Replaces the old
      //    SELECT-then-INSERT/UPDATE flow that could create duplicate rows
      //    when two invigilators scanned the same student concurrently.
      //    Requires migration 018's unique constraint on
      //    (session_id, student_id, subject, exam_date) to work atomically;
      //    if absent, this falls back to a regular INSERT (no worse than
      //    before).
      const { error } = await supabase
        .from("exam_attendance")
        .upsert({
          session_id: sessionId,
          student_id: assignment.student_id,
          student_name: assignment.student_name,
          class: assignment.class,
          class_roll_no: assignment.class_roll_no,
          exam_roll_no: assignment.exam_roll_no,
          subject: params.subject,
          exam_date: params.examDate,
          status: "present",
          scanned_at: new Date().toISOString(),
          scanned_by: params.scannedBy,
          ...seatPayload,
        }, { onConflict: "session_id,student_id,subject,exam_date" });
      if (error) throw error;

      const already = existing?.status === "present";
      return {
        status: already ? "already" : "marked",
        newStatus: "present" as ExamAttStatus,
        studentId: assignment.student_id,
        studentName: assignment.student_name,
        class: assignment.class,
        classRollNo: assignment.class_roll_no,
        examRollNo: assignment.exam_roll_no,
        sessionId,
        seatLabel: assignment.seat_label,
        roomName,
      };
    },
    onSuccess: (data, _vars) => {
      // Invalidate the student's ACTUAL class queries (data.class is the
      // student's real class from the seat assignment — not the dropdown).
      // This is what makes the Live Console and Class Overview update in
      // realtime after a scan, regardless of which class the admin had
      // selected in the dropdown.
      if (data?.sessionId && data?.class) {
        qc.invalidateQueries({ queryKey: ["exam-attendance", data.sessionId, data.class] });
        qc.invalidateQueries({ queryKey: ["exam-attendance-overview", data.sessionId, data.class] });
      }
      // Live console always refreshes (it listens to all rows for the date).
      qc.invalidateQueries({ queryKey: ["live-attendance"] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to mark attendance from seat QR";
      toast.error(msg);
      console.error("[useScanSeatingAttendance] error:", err);
    },
  });
}

/**
 * Manual status update (absent/leave/present).
 *
 * CORRECTION MODE (rev. 8): the window guard has been REMOVED from this
 * mutation. Admins can now update attendance even AFTER the paper has ended
 * — this is needed for corrections (e.g. a student was wrongly marked absent
 * and the admin wants to fix it after the paper). The Live Console will
 * reflect the change in realtime.
 *
 * INIT and SCAN are still window-guarded — you can only create new sheets
 * and scan QR codes during the paper window. But updating EXISTING records
 * is always allowed.
 */
export function useUpdateExamAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      status: ExamAttStatus;
      sessionId: string;
      cls: string;
      subject: string;
      examDate: string;
    }) => {
      // WINDOW GUARD (rev. 9): manual status changes are ONLY allowed while
      // the paper is in progress — same rule as scanning/init. This closes
      // the loophole where "corrections" could be made after the paper (or
      // the whole day) ended, which let Exam Attendance drift out of sync
      // with what the Live Console showed as final.
      // Re-fetches the live seating-plan times, so if the admin EXTENDS the
      // paper end-time from the Live Console, the window re-opens
      // automatically — no special-casing needed.
      await assertWindowOpen({
        examDate: params.examDate,
        sessionId: params.sessionId,
        subject: params.subject,
      });

      const updateData: any = { status: params.status };
      if (params.status === "present") {
        updateData.scanned_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("exam_attendance")
        .update(updateData)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast.success("Attendance updated");
      qc.invalidateQueries({ queryKey: ["exam-attendance", vars.sessionId, vars.cls, vars.subject, vars.examDate] });
      qc.invalidateQueries({ queryKey: ["exam-attendance-overview", vars.sessionId, vars.cls] });
      // Also invalidate live-attendance so the Live Console updates in realtime.
      qc.invalidateQueries({ queryKey: ["live-attendance"] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to update attendance";
      toast.error(msg);
      console.error("[useUpdateExamAttendance] error:", err);
    },
  });
}

/** Delete exam attendance for a session/class/subject/date — admin override only. */
export function useDeleteExamAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { sessionId: string; cls: string; subject: string; examDate: string }) => {
      // NOTE: delete is intentionally NOT window-guarded — admin may need to
      // clean up bad data after the paper is over. But we keep it admin-only
      // via the route guard at the app layer.
      const { error } = await supabase
        .from("exam_attendance")
        .delete()
        .eq("session_id", params.sessionId)
        .eq("class", params.cls)
        .eq("subject", params.subject)
        .eq("exam_date", params.examDate);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast.success("Attendance records deleted");
      qc.invalidateQueries({ queryKey: ["exam-attendance", vars.sessionId, vars.cls, vars.subject, vars.examDate] });
      qc.invalidateQueries({ queryKey: ["exam-attendance-overview", vars.sessionId, vars.cls] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to delete attendance records";
      toast.error(msg);
      console.error("[useDeleteExamAttendance] error:", err);
    },
  });
}

// ─── QR CODE DATA FORMAT ─────────────────────────────────────────────────────
// Legacy admit-card QR (still supported):
//   { "t": "exam", "sid": sessionId, "stid": studentId, "rn": examRollNo }
//
// New desk QR (carries seat info, see useExamSeating.ts):
//   { "t": "seat", "pid": planId, "rid": roomId, "sl": seatLabel, "stid": studentId, "rn": examRollNo }

export function encodeExamQRData(sessionId: string, studentId: string, examRollNo: string): string {
  return JSON.stringify({ t: "exam", sid: sessionId, stid: studentId, rn: examRollNo });
}

export function decodeExamQRData(qrString: string): { sessionId: string; studentId: string; examRollNo: string } | null {
  try {
    const obj = JSON.parse(qrString);
    if (obj.t === "exam" && obj.sid && obj.stid && obj.rn) {
      return { sessionId: obj.sid, studentId: obj.stid, examRollNo: obj.rn };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── EXAM SUBJECTS ────────────────────────────────────────────────────────────

export const EXAM_SUBJECTS = [
  "English", "Urdu", "Mathematics", "General Science", "Computer Science",
  "Physics", "Chemistry", "Biology", "Islamiyat", "Pakistan Studies",
  "History", "Geography", "General Knowledge",
];

export const ALL_CLASSES = ["6", "7", "8", "9", "10"];
