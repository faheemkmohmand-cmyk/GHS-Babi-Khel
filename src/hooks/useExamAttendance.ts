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
      return data ?? [];
    },
    enabled: !!sessionId && !!cls && !!subject && !!examDate,
    staleTime: 1 * 60 * 1000,
  });
}

/** Fetch ALL exam attendance for a session + class (for the attendance overview) */
export function useExamAttendanceOverview(sessionId: string | undefined, cls: string | undefined) {
  return useQuery<ExamAttendanceRecord[]>({
    queryKey: ["exam-attendance-overview", sessionId, cls],
    queryFn: async () => {
      if (!sessionId || !cls) return [];
      const { data, error } = await supabase
        .from("exam_attendance")
        .select("*")
        .eq("session_id", sessionId)
        .eq("class", cls)
        .order("exam_date", { ascending: true })
        .order("class_roll_no", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!sessionId && !!cls,
    staleTime: 2 * 60 * 1000,
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
 * Fetch paper times for a given session+subject+date from the most recent
 * generated-or-published seating plan that has paper_start_at/paper_end_at set.
 *
 * Uses LOOSE subject matching (case-insensitive, bidirectional substring) so
 * that the dropdown subject ("Mathematics") matches a plan whose paper_subject
 * is "Mathematics — Paper 1" or "Math Paper 1" etc. Without this, a strict
 * equality check would fail and the admin would see "no paper times found"
 * even though the plan exists.
 *
 * Returns null if no plan matches or the plan has no paper times.
 */
export async function fetchPaperTimesFromSeatingPlan(
  sessionId: string,
  subject: string,
  examDate: string
): Promise<{ start: string; end: string; planId: string } | null> {
  // Fetch ALL plans for this session+date with paper times set. We can't do
  // loose subject matching server-side (Supabase doesn't support case-
  // insensitive substring filters cleanly), so we fetch all and filter
  // client-side. The dataset is tiny (typically 1–3 plans per date).
  const { data, error } = await supabase
    .from("exam_seating_plans")
    .select("id, paper_subject, paper_start_at, paper_end_at")
    .eq("session_id", sessionId)
    .eq("exam_date", examDate)
    .in("status", ["generated", "published"])
    .not("paper_start_at", "is", null)
    .not("paper_end_at", "is", null)
    .order("created_at", { ascending: false });
  if (error || !data || data.length === 0) return null;

  // 1. Prefer an EXACT (case-insensitive) subject match — avoids ambiguity
  //    when multiple plans exist for the same date.
  const target = subject.trim().toLowerCase();
  let match = data.find(p =>
    (p.paper_subject || "").trim().toLowerCase() === target
  );

  // 2. Fall back to a loose bidirectional substring match. This handles the
  //    common naming mismatch: dropdown "Mathematics" vs plan "Mathematics — Paper 1".
  if (!match) {
    match = data.find(p => subjectsMatch(p.paper_subject, subject));
  }

  if (!match || !match.paper_start_at || !match.paper_end_at) return null;
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
    throw new Error("No paper time set. Configure the paper start/end time in Exam Seating / Live Console first.");
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
        throw new Error("No published/generated seating plan with paper times found for this subject & date. Set paper start/end in Exam Seating first.");
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

/** Scan QR code — mark a student as present (legacy path, no seat info) */
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
    }) => {
      // Window guard.
      const { data: existing } = await supabase
        .from("exam_attendance")
        .select("id, status, paper_start_time, paper_end_time")
        .eq("session_id", params.sessionId)
        .eq("student_id", params.studentId)
        .eq("subject", params.subject)
        .eq("exam_date", params.examDate)
        .maybeSingle();

      await assertWindowOpen({
        examDate: params.examDate,
        sessionId: params.sessionId,
        subject: params.subject,
        rowPaperStart: existing?.paper_start_time,
        rowPaperEnd: existing?.paper_end_time,
      });

      if (existing) {
        const { error } = await supabase
          .from("exam_attendance")
          .update({ status: "present", scanned_at: new Date().toISOString(), scanned_by: params.scannedBy })
          .eq("id", existing.id);
        if (error) throw error;
        return { status: existing.status === "present" ? "already" : "marked", newStatus: "present" as ExamAttStatus };
      } else {
        const { data: rollEntry } = await supabase
          .from("exam_roll_numbers")
          .select("student_name, class_roll_no, exam_roll_no, class")
          .eq("session_id", params.sessionId)
          .eq("student_id", params.studentId)
          .single();
        if (!rollEntry) throw new Error("Student not found in this exam session");

        // Need paper times to set on the new row.
        const planTimes = await fetchPaperTimesFromSeatingPlan(params.sessionId, params.subject, params.examDate);
        const { error } = await supabase
          .from("exam_attendance")
          .insert({
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
            paper_start_time: planTimes?.start ?? null,
            paper_end_time: planTimes?.end ?? null,
          });
        if (error) throw error;
        return { status: "marked", newStatus: "present" as ExamAttStatus };
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["exam-attendance", vars.sessionId, vars.cls, vars.subject, vars.examDate] });
      qc.invalidateQueries({ queryKey: ["exam-attendance-overview", vars.sessionId, vars.cls] });
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

      // 3. Upsert exam_attendance with seat info.
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

      if (existing) {
        const already = existing.status === "present";
        const { error } = await supabase
          .from("exam_attendance")
          .update({
            status: "present",
            scanned_at: new Date().toISOString(),
            scanned_by: params.scannedBy,
            ...seatPayload,
          })
          .eq("id", existing.id);
        if (error) throw error;
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
      } else {
        const { error } = await supabase
          .from("exam_attendance")
          .insert({
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
          });
        if (error) throw error;
        return {
          status: "marked",
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
      }
    },
    onSuccess: (_data, vars) => {
      // Caller invalidates via the returned sessionId+class.
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to mark attendance from seat QR";
      toast.error(msg);
      console.error("[useScanSeatingAttendance] error:", err);
    },
  });
}

/** Manual status update (absent/leave/present) */
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
      // Fetch the row to get paper times.
      const { data: row } = await supabase
        .from("exam_attendance")
        .select("paper_start_time, paper_end_time")
        .eq("id", params.id)
        .maybeSingle();

      await assertWindowOpen({
        examDate: params.examDate,
        sessionId: params.sessionId,
        subject: params.subject,
        rowPaperStart: row?.paper_start_time,
        rowPaperEnd: row?.paper_end_time,
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
