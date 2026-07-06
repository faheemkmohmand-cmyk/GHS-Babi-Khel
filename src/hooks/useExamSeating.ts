// src/hooks/useExamSeating.ts
// Exam Seating Plan Engine — auto-generate room-wise seating with anti-cheat
// class mixing. Each seat gets its own QR token so an invigilator scanning a
// desk marks attendance against that exact seat.
//
// Tables (see supabase/migrations/20260703000001_014_exam_seating_plan.sql):
//   exam_seating_plans        — one plan per (session + optional paper/date)
//   exam_seating_rooms        — physical room (capacity, rows × cols, blocked cells)
//   exam_seating_assignments  — one row per seat assignment
//
// QR format (this hook is the single source of truth):
//   {"t":"seat","pid":planId,"rid":roomId,"sl":seatLabel,"stid":studentId,"rn":examRollNo}

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface SeatingPlan {
  id: string;
  session_id: string;
  title: string;
  paper_subject: string | null;
  exam_date: string | null;
  classes: string[];
  status: "draft" | "generated" | "published" | "archived";
  total_students: number;
  total_seated: number;
  generated_at: string | null;
  published_at: string | null;
  // Countdown-driven publish (added by migration 015):
  publish_at: string | null;
  countdown_label: string | null;
  // Paper timing for the Live Exam Console (added by migration 017):
  paper_start_at: string | null;
  paper_end_at: string | null;
  created_at: string;
}

export interface SeatingRoom {
  id: string;
  plan_id: string;
  name: string;
  capacity: number;
  rows: number;
  cols: number;
  block_layout: number[][]; // [[row,col],...]
  invigilator: string | null;
  notes: string | null;
}

export interface SeatingAssignment {
  id: string;
  plan_id: string;
  room_id: string;
  student_id: string;
  student_name: string;
  class: string;
  class_roll_no: string;
  exam_roll_no: string;
  row_idx: number;
  col_idx: number;
  seat_label: string;
  qr_token: string;
  assigned_at: string;
}

export interface RoomWithAssignments extends SeatingRoom {
  assignments: SeatingAssignment[];
}

export interface SeatingPlanFull extends SeatingPlan {
  rooms: RoomWithAssignments[];
}

// ─── QR CODE FORMAT ───────────────────────────────────────────────────────────

export interface SeatingQRData {
  planId: string;
  roomId: string;
  seatLabel: string;
  studentId: string;
  examRollNo: string;
}

export function encodeSeatingQRData(d: SeatingQRData): string {
  // Compact JSON keeps the QR small (faster scan, lower error-correction needs).
  return JSON.stringify({
    t: "seat",
    pid: d.planId,
    rid: d.roomId,
    sl: d.seatLabel,
    stid: d.studentId,
    rn: d.examRollNo,
  });
}

export function decodeSeatingQRData(qrString: string): SeatingQRData | null {
  try {
    const obj = JSON.parse(qrString);
    if (obj.t === "seat" && obj.pid && obj.rid && obj.sl && obj.stid && obj.rn) {
      return {
        planId: obj.pid,
        roomId: obj.rid,
        seatLabel: obj.sl,
        studentId: obj.stid,
        examRollNo: obj.rn,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── ANTI-CHEAT SEATING ALGORITHM ────────────────────────────────────────────
// Goal: place students into rooms such that no two students of the same class
// are orthogonally adjacent (front/back/left/right). Diagonal adjacency is OK.
//
// Strategy:
//  1. Group all students by class.
//  2. Build a flat list of seatable desk positions across all rooms, in the
//     order students physically walk into the hall (room by room, row-major
//     snake order so left-right alternates per row — this matches how real
//     boards lay out desks).
//  3. Interleave students round-robin across classes so that in any window
//     of consecutive seats, the class keeps rotating.
//  4. Walk the seat list, placing one interleaved student at a time. After
//     each placement, if the just-placed student would create a same-class
//     adjacency with an already-filled neighbour, swap forward to the next
//     eligible student of a different class.
//  5. If we run out of swap candidates (rare — e.g. one class hugely
//     outnumbers the others), place anyway and flag the seat as
//     "adjacency_conflict" so the admin UI can warn the user.
//
// The function returns assignments keyed by room, ready to bulk-insert.

export interface DeskPosition {
  roomId: string;
  roomName: string;
  row: number;
  col: number;
  seatLabel: string;
}

export interface SeatingResult {
  assignments: Array<{
    desk: DeskPosition;
    student_id: string;
    student_name: string;
    class: string;
    class_roll_no: string;
    exam_roll_no: string;
    qr_token: string;
    adjacency_conflict: boolean;
  }>;
  conflicts: number;
  unassigned: Array<{ student_id: string; student_name: string; class: string }>;
}

/**
 * Compute seatable desk positions for a list of rooms (respecting block_layout).
 * Desks are ordered room-by-room, in snake (boustrophedon) row-major order:
 * row 0 left→right, row 1 right→left, etc. This matches how exam halls are
 * physically walked and ensures "adjacent" in the array = physically adjacent
 * along the same row.
 */
export function computeSeatableDesks(rooms: SeatingRoom[]): DeskPosition[] {
  const desks: DeskPosition[] = [];
  for (const room of rooms) {
    const blocked = new Set(
      (room.block_layout || []).map(([r, c]) => `${r}:${c}`)
    );
    for (let r = 0; r < room.rows; r++) {
      const cols = [];
      for (let c = 0; c < room.cols; c++) {
        if (!blocked.has(`${r}:${c}`)) cols.push(c);
      }
      // snake: even rows L→R, odd rows R→L
      if (r % 2 === 1) cols.reverse();
      for (const c of cols) {
        desks.push({
          roomId: room.id,
          roomName: room.name,
          row: r,
          col: c,
          seatLabel: `${room.name}-R${r + 1}-S${c + 1}`,
        });
      }
    }
  }
  return desks;
}

/**
 * Round-robin interleave: given students grouped by class, produce a single
 * list where classes rotate so the same class never appears twice in a row
 * (when class counts allow it).
 *
 * We rotate through the class queues in order (0,1,2,0,1,2,...), preferring
 * at each step a queue whose head is a different class than the last placed
 * student. If every non-empty queue is the same class as last (the
 * unavoidable tail when one class outnumbers the others), we take from the
 * first non-empty queue and flag it via the placement step.
 *
 * E.g. classes A=[a1,a2,a3], B=[b1,b2], C=[c1] → [a1,b1,c1,a2,b2,a3]
 * E.g. classes 6,7,8 each ×4 → [6,7,8,6,7,8,6,7,8,6,7,8]
 */
export function interleaveByClass(
  byClass: Map<string, Array<{ student_id: string; student_name: string; class: string; class_roll_no: string; exam_roll_no: string }>>
): Array<{ student_id: string; student_name: string; class: string; class_roll_no: string; exam_roll_no: string }> {
  // Sort classes by count descending so the largest class is the "spine".
  const classes = [...byClass.entries()].sort((a, b) => b[1].length - a[1].length);
  const queues = classes.map(([, arr]) => [...arr]);
  const result: any[] = [];
  let lastClass: string | null = null;
  let idx = 0;
  while (queues.some(q => q.length > 0)) {
    // Try queues in rotation starting from `idx`, prefer one whose head is
    // a different class than the last placed student.
    let picked = -1;
    for (let off = 0; off < queues.length; off++) {
      const i = (idx + off) % queues.length;
      if (queues[i].length === 0) continue;
      if (queues[i][0].class !== lastClass) { picked = i; break; }
    }
    // If every non-empty queue is the same class as last, take from the
    // first non-empty queue (the placement step will flag the conflict).
    if (picked === -1) {
      for (let off = 0; off < queues.length; off++) {
        const i = (idx + off) % queues.length;
        if (queues[i].length > 0) { picked = i; break; }
      }
    }
    if (picked === -1) break;
    const student = queues[picked].shift()!;
    result.push(student);
    lastClass = student.class;
    idx = (picked + 1) % queues.length;
  }
  return result;
}

/**
 * Run the full seating algorithm.
 * @param students   flat list of students to seat (must already be filtered to
 *                   the plan's classes + exam session).
 * @param rooms      rooms with grid + block_layout already configured.
 */
export function generateSeating(
  students: Array<{ student_id: string; student_name: string; class: string; class_roll_no: string; exam_roll_no: string }>,
  rooms: SeatingRoom[]
): SeatingResult {
  const desks = computeSeatableDesks(rooms);

  // Group by class for interleaving.
  const byClass = new Map<string, typeof students>();
  for (const s of students) {
    if (!byClass.has(s.class)) byClass.set(s.class, []);
    byClass.get(s.class)!.push(s);
  }
  // Stable-sort each class by class_roll_no so results are deterministic.
  for (const arr of byClass.values()) {
    arr.sort((a, b) =>
      a.class_roll_no.localeCompare(b.class_roll_no, undefined, { numeric: true })
    );
  }

  const interleaved = interleaveByClass(byClass);

  // Build a 2D neighbour-lookup so we can detect same-class adjacency.
  // Key: `${roomId}:${row}:${col}` → assignment.
  const placedMap = new Map<string, SeatingResult["assignments"][number]>();
  const assignments: SeatingResult["assignments"] = [];
  const unassigned: SeatingResult["unassigned"] = [];

  // Helper: orthogonal neighbours of a desk position (in the SAME room).
  const neighbours = (d: DeskPosition): Array<SeatingResult["assignments"][number] | null> => {
    const key = (r: number, c: number) => `${d.roomId}:${r}:${c}`;
    return [
      placedMap.get(key(d.row - 1, d.col)) ?? null,
      placedMap.get(key(d.row + 1, d.col)) ?? null,
      placedMap.get(key(d.row, d.col - 1)) ?? null,
      placedMap.get(key(d.row, d.col + 1)) ?? null,
    ];
  };

  // We use a working list of remaining students so we can swap forward.
  const remaining = [...interleaved];
  let conflicts = 0;

  for (const desk of desks) {
    if (remaining.length === 0) break;

    // Try to find a student whose class doesn't collide with any neighbour.
    let pickedIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const adj = neighbours(desk);
      const collides = adj.some(a => a && a.class === candidate.class);
      if (!collides) { pickedIdx = i; break; }
    }
    // If none found, take the head anyway and flag a conflict.
    let conflict = false;
    if (pickedIdx === -1) {
      pickedIdx = 0;
      conflict = true;
      conflicts++;
    }
    const student = remaining.splice(pickedIdx, 1)[0];
    const assignment = {
      desk,
      student_id: student.student_id,
      student_name: student.student_name,
      class: student.class,
      class_roll_no: student.class_roll_no,
      exam_roll_no: student.exam_roll_no,
      qr_token: makeQrToken(),
      adjacency_conflict: conflict,
    };
    assignments.push(assignment);
    placedMap.set(`${desk.roomId}:${desk.row}:${desk.col}`, assignment);
  }

  // Anyone we couldn't fit (capacity < students) goes into unassigned.
  for (const s of remaining) {
    unassigned.push({ student_id: s.student_id, student_name: s.student_name, class: s.class });
  }

  return { assignments, conflicts, unassigned };
}

// Cryptographically-acceptable URL-safe token (no external dep).
function makeQrToken(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── HOOKS ────────────────────────────────────────────────────────────────────

/** All seating plans for a session. */
export function useSeatingPlans(sessionId: string | undefined) {
  return useQuery<SeatingPlan[]>({
    queryKey: ["seating-plans", sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from("exam_seating_plans")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!sessionId,
    staleTime: 60 * 1000,
  });
}

/** One full plan (with rooms + assignments). */
export function useSeatingPlan(planId: string | undefined) {
  return useQuery<SeatingPlanFull | null>({
    queryKey: ["seating-plan", planId],
    queryFn: async () => {
      if (!planId) return null;
      const { data: plan, error: e1 } = await supabase
        .from("exam_seating_plans")
        .select("*")
        .eq("id", planId)
        .single();
      if (e1) throw e1;
      if (!plan) return null;

      const { data: rooms, error: e2 } = await supabase
        .from("exam_seating_rooms")
        .select("*")
        .eq("plan_id", planId)
        .order("created_at", { ascending: true });
      if (e2) throw e2;

      const { data: assigns, error: e3 } = await supabase
        .from("exam_seating_assignments")
        .select("*")
        .eq("plan_id", planId)
        .order("seat_label", { ascending: true });
      if (e3) throw e3;

      const roomsWithAssigns: RoomWithAssignments[] = (rooms ?? []).map(r => ({
        ...r,
        assignments: (assigns ?? []).filter(a => a.room_id === r.id),
      }));

      return { ...plan, rooms: roomsWithAssigns } as SeatingPlanFull;
    },
    enabled: !!planId,
    staleTime: 30 * 1000,
  });
}

/** Create a new (empty) seating plan tied to an exam session. */
export function useCreateSeatingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      sessionId: string;
      title: string;
      classes: string[];
      paperSubject?: string | null;
      examDate?: string | null;
      paperStartAt?: string | null;
      paperEndAt?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("exam_seating_plans")
        .insert({
          session_id: params.sessionId,
          title: params.title,
          classes: params.classes,
          paper_subject: params.paperSubject ?? null,
          exam_date: params.examDate ?? null,
          paper_start_at: params.paperStartAt ?? null,
          paper_end_at: params.paperEndAt ?? null,
          status: "draft",
        })
        .select()
        .single();
      if (error) throw error;
      return data as SeatingPlan;
    },
    onSuccess: (_d, vars) => {
      toast.success("Seating plan created — add rooms next");
      qc.invalidateQueries({ queryKey: ["seating-plans", vars.sessionId] });
      qc.invalidateQueries({ queryKey: ["seating-plans-all"] });
    },
  });
}

/** Delete an entire plan (rooms + assignments cascade). */
export function useDeleteSeatingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { planId: string; sessionId: string }) => {
      const { error } = await supabase
        .from("exam_seating_plans")
        .delete()
        .eq("id", params.planId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Seating plan deleted");
      qc.invalidateQueries({ queryKey: ["seating-plans", vars.sessionId] });
      qc.invalidateQueries({ queryKey: ["seating-plan", vars.planId] });
    },
  });
}

/** Add a room to a plan. */
export function useUpsertRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      planId: string;
      room?: Partial<SeatingRoom> & { id?: string };
    }) => {
      // Recompute effective capacity = rows × cols − blocked.
      const rows = params.room?.rows ?? 6;
      const cols = params.room?.cols ?? 5;
      const blocked = params.room?.block_layout ?? [];
      const capacity = Math.max(0, rows * cols - blocked.length);

      const payload = {
        plan_id: params.planId,
        name: params.room?.name ?? "New Room",
        rows,
        cols,
        capacity,
        block_layout: blocked,
        invigilator: params.room?.invigilator ?? null,
        notes: params.room?.notes ?? null,
      };

      if (params.room?.id) {
        const { data, error } = await supabase
          .from("exam_seating_rooms")
          .update(payload)
          .eq("id", params.room.id)
          .select()
          .single();
        if (error) throw error;
        return data as SeatingRoom;
      } else {
        const { data, error } = await supabase
          .from("exam_seating_rooms")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data as SeatingRoom;
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.room?.id ? "Room updated" : "Room added");
      qc.invalidateQueries({ queryKey: ["seating-plan", vars.planId] });
    },
  });
}

/** Delete a room (its assignments are cascade-deleted). */
export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { planId: string; roomId: string }) => {
      const { error } = await supabase
        .from("exam_seating_rooms")
        .delete()
        .eq("id", params.roomId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Room deleted");
      qc.invalidateQueries({ queryKey: ["seating-plan", vars.planId] });
    },
  });
}

/**
 * Run the seating algorithm and persist assignments.
 * Caller passes the full student list (already filtered to the plan's classes)
 * and the current rooms. We compute locally, then bulk-insert.
 */
export function useGenerateSeating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      planId: string;
      sessionId: string;
      students: Array<{ student_id: string; student_name: string; class: string; class_roll_no: string; exam_roll_no: string }>;
      rooms: SeatingRoom[];
    }) => {
      const result = generateSeating(params.students, params.rooms);

      // Wipe old assignments for this plan, then insert new ones in one shot.
      const { error: delErr } = await supabase
        .from("exam_seating_assignments")
        .delete()
        .eq("plan_id", params.planId);
      if (delErr) throw delErr;

      if (result.assignments.length > 0) {
        const rows = result.assignments.map(a => ({
          plan_id: params.planId,
          room_id: a.desk.roomId,
          student_id: a.student_id,
          student_name: a.student_name,
          class: a.class,
          class_roll_no: a.class_roll_no,
          exam_roll_no: a.exam_roll_no,
          row_idx: a.desk.row,
          col_idx: a.desk.col,
          seat_label: a.desk.seatLabel,
          qr_token: a.qr_token,
        }));
        const { error: insErr } = await supabase
          .from("exam_seating_assignments")
          .insert(rows);
        if (insErr) throw insErr;
      }

      // Update plan totals + status.
      const { error: updErr } = await supabase
        .from("exam_seating_plans")
        .update({
          total_students: params.students.length,
          total_seated: result.assignments.length,
          generated_at: new Date().toISOString(),
          status: "generated",
        })
        .eq("id", params.planId);
      if (updErr) throw updErr;

      return result;
    },
    onSuccess: (result, vars) => {
      const msg =
        result.unassigned.length === 0
          ? `Seating generated · ${result.assignments.length} seats · ${result.conflicts} adjacency conflict${result.conflicts === 1 ? "" : "s"}`
          : `Seating generated · ${result.assignments.length} seated, ${result.unassigned.length} could not fit (capacity)`;
      if (result.conflicts > 0) toast(msg, { icon: "⚠️" });
      else toast.success(msg);
      qc.invalidateQueries({ queryKey: ["seating-plan", vars.planId] });
      qc.invalidateQueries({ queryKey: ["seating-plans", vars.sessionId] });
    },
  });
}

/**
 * Publish a plan — either immediately or scheduled with a countdown.
 *
 * - Immediate:  { mode: "now" }
 *     sets status='published', published_at=now(), publish_at=null
 * - Scheduled:  { mode: "schedule", publishAt, countdownLabel }
 *     sets publish_at=<future ISO>, countdown_label=<text>, status stays 'generated'
 *     The student-side tab watches publish_at and flips status to 'published'
 *     via useAutoPublishSeatingPlan() when the countdown reaches zero.
 */
export function usePublishSeatingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      planId: string;
      sessionId: string;
      mode: "now" | "schedule";
      publishAt?: string;        // ISO — required when mode="schedule"
      countdownLabel?: string;   // optional custom label
    }) => {
      if (params.mode === "schedule" && !params.publishAt) {
        throw new Error("publishAt is required when mode='schedule'");
      }
      const payload = params.mode === "now"
        ? { status: "published" as const, published_at: new Date().toISOString(), publish_at: null, countdown_label: null }
        : { publish_at: params.publishAt, countdown_label: params.countdownLabel ?? null };
      const { error } = await supabase
        .from("exam_seating_plans")
        .update(payload)
        .eq("id", params.planId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(
        vars.mode === "now"
          ? "Seating plan published — students can now see their seats"
          : "Seating plan scheduled — students will see a countdown"
      );
      qc.invalidateQueries({ queryKey: ["seating-plan", vars.planId] });
      qc.invalidateQueries({ queryKey: ["seating-plans", vars.sessionId] });
      qc.invalidateQueries({ queryKey: ["published-seating-plans"] });
    },
  });
}

/**
 * Auto-publish a plan whose countdown has expired.
 * Called by the student-side SeatingTab's CountdownTimer when publish_at < now.
 * Safe to call repeatedly — only flips rows where status is NOT already 'published'.
 */
export function useAutoPublishSeatingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { planId: string }) => {
      const { error } = await supabase
        .from("exam_seating_plans")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", params.planId)
        .neq("status", "published");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["published-seating-plans"] });
    },
  });
}

// ─── STUDENT-SIDE: ALL PUBLISHED (OR SCHEDULED) PLANS ────────────────────────
// Used by the renamed "Exam Seating" student tab. Returns every plan the
// school has published (or scheduled with a countdown) along with all rooms
// and assignments — so the student can search for any classmate's seat, not
// just their own. The student's own seat is highlighted in the UI.

export function usePublishedSeatingPlans() {
  return useQuery<SeatingPlanFull[]>({
    queryKey: ["published-seating-plans"],
    queryFn: async () => {
      // Plans where status='published' OR publish_at is set (scheduled).
      const { data: plans, error } = await supabase
        .from("exam_seating_plans")
        .select("*")
        .or("status.eq.published,publish_at.not.is.null")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!plans || plans.length === 0) return [];

      const planIds = plans.map(p => p.id);

      const [roomsRes, assignsRes] = await Promise.all([
        supabase
          .from("exam_seating_rooms")
          .select("*")
          .in("plan_id", planIds)
          .order("created_at", { ascending: true }),
        supabase
          .from("exam_seating_assignments")
          .select("*")
          .in("plan_id", planIds)
          .order("seat_label", { ascending: true }),
      ]);
      if (roomsRes.error) throw roomsRes.error;
      if (assignsRes.error) throw assignsRes.error;

      return plans.map(p => ({
        ...p,
        rooms: (roomsRes.data ?? [])
          .filter(r => r.plan_id === p.id)
          .map(r => ({
            ...r,
            assignments: (assignsRes.data ?? []).filter(a => a.plan_id === p.id && a.room_id === r.id),
          })),
      })) as SeatingPlanFull[];
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000, // refresh so countdown + auto-publish propagate
  });
}

// ─── STUDENT LOOKUP ───────────────────────────────────────────────────────────
// Used by the student dashboard "My Seating" tab.

export interface MySeat {
  plan_id: string;
  plan_title: string;
  session_id: string;
  paper_subject: string | null;
  exam_date: string | null;
  plan_status: string;
  room_id: string;
  room_name: string;
  invigilator: string | null;
  room_notes: string | null;
  row_idx: number;
  col_idx: number;
  seat_label: string;
  qr_token: string;
  exam_roll_no: string;
}

/**
 * Fetch the logged-in student's seating across all published plans.
 * We rely on the v_student_seating view (defined in the migration).
 */
export function useMySeating(studentId: string | undefined, studentClass: string | undefined, classRollNo: string | undefined) {
  return useQuery<MySeat[]>({
    queryKey: ["student-seating", studentId, studentClass, classRollNo],
    queryFn: async () => {
      if (!studentId && !classRollNo) return [];
      // v_student_seating is keyed by student_id; fall back to class+roll_no.
      let q = supabase.from("v_student_seating").select("*");
      if (studentId) {
        q = q.eq("student_id", studentId);
      } else if (classRollNo && studentClass) {
        q = q.eq("class", studentClass).eq("class_roll_no", classRollNo);
      } else {
        return [];
      }
      const { data, error } = await q.order("exam_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as MySeat[];
    },
    enabled: !!(studentId || (classRollNo && studentClass)),
    staleTime: 60 * 1000,
  });
}

// ─── LIVE EXAM CONSOLE HOOKS (migration 017) ────────────────────────────────

/** All plans with status 'generated' or 'published' — for the console picker. */
export function useAllSeatingPlans() {
  return useQuery<SeatingPlan[]>({
    queryKey: ["seating-plans-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_seating_plans")
        .select("*")
        .in("status", ["generated", "published"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Update paper start/end times on a plan (used by the console settings).
 *
 * SIDE EFFECT (rev. 3): also syncs paper_start_time / paper_end_time on every
 * existing exam_attendance row that belongs to this plan's session+subject+
 * exam_date. This keeps the attendance window in lockstep with the Live
 * Console — so when admin extends paper end-time from 12 PM to 1 PM mid-exam,
 * the Exam Attendance tab immediately allows marking during the extra hour
 * (no re-init needed). It also keeps the row-level display accurate.
 *
 * Returns the count of attendance rows synced (for the toast).
 */
export function useUpdatePaperTimes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      planId: string;
      paperStartAt: string | null;
      paperEndAt: string | null;
    }): Promise<number> => {
      // 1. Update the seating plan itself.
      const { error } = await supabase
        .from("exam_seating_plans")
        .update({
          paper_start_at: params.paperStartAt,
          paper_end_at: params.paperEndAt,
        })
        .eq("id", params.planId);
      if (error) throw error;

      // 2. Fetch the plan's session_id, paper_subject, and exam_date so we
      //    know which attendance rows to sync.
      const { data: plan, error: planErr } = await supabase
        .from("exam_seating_plans")
        .select("session_id, paper_subject, exam_date")
        .eq("id", params.planId)
        .maybeSingle();
      if (planErr) throw planErr;

      // 3. Convert ISO paper times to "HH:MM" (local) for storage on rows.
      const toHHMM = (iso: string | null): string | null => {
        if (!iso) return null;
        const d = new Date(iso);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      const startHHMM = toHHMM(params.paperStartAt);
      const endHHMM   = toHHMM(params.paperEndAt);

      // 4. Sync ALL existing attendance rows for this session+subject+date.
      //    If paper times were cleared (set to null), keep the rows unchanged
      //    so we don't accidentally destroy historical data.
      //
      //    LOOSE SUBJECT MATCH: the seating plan's paper_subject is free-text
      //    (e.g. "Mathematics — Paper 1") while attendance rows store the
      //    dropdown subject (e.g. "Mathematics"). Strict equality would miss
      //    the rows. We fetch all rows for this session+date, filter client-
      //    side by bidirectional case-insensitive substring match, and update
      //    only the matching IDs.
      let synced = 0;
      if (plan?.session_id && plan?.paper_subject && plan?.exam_date && startHHMM && endHHMM) {
        // 4a. Fetch candidate rows (session+date only — subject filtered client-side).
        const { data: candidates, error: fetchErr } = await supabase
          .from("exam_attendance")
          .select("id, subject")
          .eq("session_id", plan.session_id)
          .eq("exam_date", plan.exam_date);
        if (fetchErr) throw fetchErr;

        // 4b. Loose subject match (case-insensitive, bidirectional substring).
        const planSubj = plan.paper_subject.trim().toLowerCase();
        const matchingIds = (candidates ?? [])
          .filter(r => {
            const rowSubj = (r.subject || "").trim().toLowerCase();
            if (!rowSubj || !planSubj) return false;
            return rowSubj === planSubj || planSubj.includes(rowSubj) || rowSubj.includes(planSubj);
          })
          .map(r => r.id);

        // 4c. Bulk update the matching rows.
        if (matchingIds.length > 0) {
          const { error: syncErr } = await supabase
            .from("exam_attendance")
            .update({ paper_start_time: startHHMM, paper_end_time: endHHMM })
            .in("id", matchingIds);
          if (syncErr) throw syncErr;
          synced = matchingIds.length;
        }
      }
      return synced;
    },
    onSuccess: (synced, vars) => {
      toast.success(
        synced > 0
          ? `Paper times updated — ${synced} attendance row${synced === 1 ? "" : "s"} synced`
          : "Paper times updated"
      );
      qc.invalidateQueries({ queryKey: ["seating-plan", vars.planId] });
      qc.invalidateQueries({ queryKey: ["seating-plans-all"] });
      // CRITICAL: invalidate the paper-times-seating query so any open
      // Exam Attendance tab (admin or teacher) immediately picks up the
      // new window — without needing a manual refresh.
      qc.invalidateQueries({ queryKey: ["paper-times-seating"] });
      // Also invalidate live-attendance so the console's per-student
      // tally refreshes (paper times display in the Live Console).
      qc.invalidateQueries({ queryKey: ["live-attendance"] });
    },
  });
}

/**
 * Live attendance for a specific exam date.
 *
 * FILTERING (rev. 7): the session_id filter has been REMOVED. It was causing
 * a bug where the Live Console showed all students as "Unmarked" even though
 * attendance had been taken — because the attendance rows' session_id didn't
 * match the seating plan's session_id (admin selected a different session in
 * the Exam Attendance dropdown).
 *
 * The tally in AdminExamConsole already matches by student_id — it only
 * counts students who are seated in the plan. So there's no risk of counting
 * students from other sessions. The only filtering we need is:
 *   1. exam_date matches today (server-side)
 *   2. subject matches (client-side, loose, with fallback)
 *
 * Subject matching is loose (bidirectional, case-insensitive substring). If
 * the subject filter returns 0 rows, we fall back to ALL rows for the date
 * (handles the case where paper_subject is blank or uses a completely
 * different naming convention).
 *
 * Subscribes to Supabase realtime on the full exam_attendance table and
 * refetches on any change — so the console updates live as invigilators
 * scan QR codes.
 */
export function useLiveAttendance(
  examDate: string | null | undefined,
  sessionId?: string | null,
  paperSubject?: string | null
) {
  const qc = useQueryClient();
  // sessionId is kept in the queryKey for cache identity but is NOT used
  // as a server-side filter (see comment above).
  const queryKey = ["live-attendance", examDate, sessionId ?? null, paperSubject ?? null];

  const query = useQuery<{
    id: string;
    student_id: string;
    student_name: string;
    class: string;
    class_roll_no: string;
    exam_roll_no: string;
    subject: string;
    exam_date: string;
    status: "present" | "absent" | "leave";
    scanned_at: string | null;
    scanned_by: string | null;
    seat_id: string | null;
    room_id: string | null;
    seat_label: string | null;
  }[]>({
    queryKey,
    queryFn: async () => {
      if (!examDate) return [];

      // ── Fetch ALL attendance rows for this date (no session_id filter). ──
      // The tally matches by student_id, so only seated students are counted.
      const { data, error } = await supabase
        .from("exam_attendance")
        .select("*")
        .eq("exam_date", examDate);
      if (error) throw error;
      const allRows = data ?? [];

      console.log("[useLiveAttendance] ── DIAGNOSTIC ──");
      console.log("[useLiveAttendance] examDate:", examDate, "plan sessionId:", sessionId, "plan paperSubject:", paperSubject);
      console.log("[useLiveAttendance] Total rows for this date:", allRows.length);
      if (allRows.length > 0) {
        // Log a summary of session_ids and subjects in the rows
        const sessionIds = new Set(allRows.map(r => r.session_id?.slice(0, 8)));
        const subjects = new Set(allRows.map(r => r.subject));
        console.log("[useLiveAttendance] Row session_ids:", Array.from(sessionIds));
        console.log("[useLiveAttendance] Row subjects:", Array.from(subjects));
        console.log("[useLiveAttendance] Sample rows:", allRows.slice(0, 5).map(r => ({
          student: r.student_name,
          student_id: r.student_id?.slice(0, 8) + "...",
          subject: r.subject,
          status: r.status,
          session_id: r.session_id?.slice(0, 8) + "...",
        })));
      }

      // ── Subject filter (client-side, loose match with fallback). ──
      if (paperSubject) {
        const target = paperSubject.trim().toLowerCase();
        const subjectMatched = allRows.filter(r => {
          const row = (r.subject || "").trim().toLowerCase();
          if (!row || !target) return false;
          return target.includes(row) || row.includes(target);
        });
        console.log("[useLiveAttendance] After subject filter:", subjectMatched.length, "of", allRows.length);

        // FALLBACK: if subject filter returns 0 rows but there ARE rows for
        // this date, use ALL rows. This handles the case where the plan's
        // paper_subject uses a completely different naming convention.
        if (subjectMatched.length === 0 && allRows.length > 0) {
          console.warn("[useLiveAttendance] Subject filter matched 0 rows — falling back to ALL rows for this date. Plan subject:", paperSubject, "Row subjects:", Array.from(new Set(allRows.map(r => r.subject))));
          return allRows;
        }
        return subjectMatched;
      }

      // No paperSubject provided — return all rows for the date.
      return allRows;
    },
    enabled: !!examDate,
    staleTime: 5 * 1000,
  });

  // Realtime: invalidate on any change to exam_attendance. We can't filter
  // the realtime channel by exam_date, so we listen to all rows and let the
  // query refetch handle the filtering. The invalidation is cheap because
  // the query is already staleTime=5s.
  useEffect(() => {
    const channel = supabase
      .channel(`live-att-${examDate ?? "none"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_attendance" },
        () => qc.invalidateQueries({ queryKey })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [examDate, qc, queryKey]);

  return query;
}
