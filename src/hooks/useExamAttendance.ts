// src/hooks/useExamAttendance.ts
// Exam Attendance with QR Code scanning — per class, per paper
// Supabase table: exam_attendance
//
// Two QR formats are now supported:
//   {t:"exam", sid, stid, rn}            — legacy admit-card QR (no seat info)
//   {t:"seat", pid, rid, sl, stid, rn}   — new desk QR (carries seat/room)
// The new useScanSeatingAttendance() mutation writes seat_id / room_id /
// seat_label into the existing exam_attendance row (the migration 014
// adds those nullable columns so legacy records keep working).

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

/** Initialize exam attendance for a class/paper — creates "absent" records for all students */
export function useInitExamAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      sessionId: string;
      cls: string;
      subject: string;
      examDate: string;
      paperStartTime: string; // "HH:MM"
      paperEndTime: string;   // "HH:MM"
      students: { student_id: string; student_name: string; class_roll_no: string; exam_roll_no: string }[];
    }) => {
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
        paper_start_time: params.paperStartTime,
        paper_end_time: params.paperEndTime,
      }));
      // Upsert: if already exists, don't overwrite
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
      // First, try to update existing record
      const { data: existing, error: fetchErr } = await supabase
        .from("exam_attendance")
        .select("id, status")
        .eq("session_id", params.sessionId)
        .eq("student_id", params.studentId)
        .eq("subject", params.subject)
        .eq("exam_date", params.examDate)
        .maybeSingle();
      if (fetchErr) throw fetchErr;

      if (existing) {
        // Update to present
        const { error } = await supabase
          .from("exam_attendance")
          .update({ status: "present", scanned_at: new Date().toISOString(), scanned_by: params.scannedBy })
          .eq("id", existing.id);
        if (error) throw error;
        return { status: existing.status === "present" ? "already" : "marked", newStatus: "present" as ExamAttStatus };
      } else {
        // Need to create — fetch student info first
        const { data: rollEntry } = await supabase
          .from("exam_roll_numbers")
          .select("student_name, class_roll_no, exam_roll_no, class")
          .eq("session_id", params.sessionId)
          .eq("student_id", params.studentId)
          .single();
        if (!rollEntry) throw new Error("Student not found in this exam session");
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
          });
        if (error) throw error;
        return { status: "marked", newStatus: "present" as ExamAttStatus };
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["exam-attendance", vars.sessionId, vars.cls, vars.subject, vars.examDate] });
      qc.invalidateQueries({ queryKey: ["exam-attendance-overview", vars.sessionId, vars.cls] });
    },
  });
}

// ─── SEATING-AWARE SCAN (new, migration 014) ────────────────────────────────
// Called when an invigilator scans a DESK QR ({t:"seat",...}). Looks up the
// seating assignment by qr_token, then upserts the exam_attendance row with
// seat_id / room_id / seat_label populated. Falls back gracefully if the
// plan is for a different exam session than the one the teacher has selected.
//
// Returns the same shape as useScanExamAttendance so the UI can treat both
// paths identically — but with an extra `seatLabel` / `roomName` for the
// success toast.
export function useScanSeatingAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      scannedQrToken: string;
      // OR (if the caller already decoded the QR): pass these directly
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
          .select("id, plan_id, room_id, student_id, student_name, class, class_roll_no, exam_roll_no, seat_label, qr_token, exam_seating_plans!inner(session_id, title), exam_seating_rooms!inner(name)")
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
          .select("id, plan_id, room_id, student_id, student_name, class, class_roll_no, exam_roll_no, seat_label, qr_token, exam_seating_plans!inner(session_id, title), exam_seating_rooms!inner(name)")
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

      // 2. Upsert exam_attendance with seat info.
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
      // We don't know cls/session until the mutation returns; the caller
      // invalidates the right keys via the returned sessionId+class.
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
  });
}

/** Delete exam attendance for a session/class/subject/date */
export function useDeleteExamAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { sessionId: string; cls: string; subject: string; examDate: string }) => {
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

// ─── PAPER TIMING WINDOW ───────────────────────────────────────────────────────
// Admins can only mark exam attendance:
//   1. On today's actual date (not past or future dates), AND
//   2. Between the paper's start time and end time (inclusive).
// Sheets created before migration 015 have null paper_start_time/paper_end_time —
// those are treated as "unrestricted" (legacy) so old data isn't locked forever.

export type PaperWindowStatus = "not_today" | "not_started" | "in_progress" | "ended" | "unrestricted";

export function getPaperWindowStatus(
  examDate: string,
  paperStartTime: string | null | undefined,
  paperEndTime: string | null | undefined,
  now: Date = new Date()
): PaperWindowStatus {
  const todayStr = now.toISOString().slice(0, 10);
  if (examDate !== todayStr) return "not_today";
  if (!paperStartTime || !paperEndTime) return "unrestricted";

  const [sh, sm] = paperStartTime.split(":").map(Number);
  const [eh, em] = paperEndTime.split(":").map(Number);
  const start = new Date(now); start.setHours(sh, sm, 0, 0);
  const end = new Date(now); end.setHours(eh, em, 59, 999);

  if (now < start) return "not_started";
  if (now > end) return "ended";
  return "in_progress";
}

export function canMarkExamAttendance(status: PaperWindowStatus): boolean {
  return status === "in_progress" || status === "unrestricted";
}

export function paperWindowMessage(status: PaperWindowStatus, paperStartTime?: string | null, paperEndTime?: string | null): string {
  switch (status) {
    case "not_today":
      return "Attendance can only be marked on today's date — this exam date is in the past or future.";
    case "not_started":
      return `Paper hasn't started yet. Attendance opens at ${paperStartTime}.`;
    case "ended":
      return `Paper time is over. Attendance closed at ${paperEndTime}.`;
    case "in_progress":
      return `Paper in progress — attendance open until ${paperEndTime}.`;
    default:
      return "";
  }
}

// ─── EXAM SUBJECTS ────────────────────────────────────────────────────────────

export const EXAM_SUBJECTS = [
  "English", "Urdu", "Mathematics", "General Science", "Computer Science",
  "Physics", "Chemistry", "Biology", "Islamiyat", "Pakistan Studies",
  "History", "Geography", "General Knowledge",
];

export const ALL_CLASSES = ["6", "7", "8", "9", "10"];
