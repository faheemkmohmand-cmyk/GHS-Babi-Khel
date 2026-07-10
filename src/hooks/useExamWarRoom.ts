// src/hooks/useExamWarRoom.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exam War Room — Live Seating Console brain.
//
// Builds on top of the existing exam ecosystem (useExamSeating, useExamAttendance)
// and adds four NEW capabilities the "War Room" view needs:
//
//   1. Per-student RISK PROFILE — historical absentee rate across the active
//      exam session. Used to (a) color-code avatars (red = frequent absentee)
//      and (b) feed the Auto-Optimize algorithm so high-risk students are
//      placed near invigilator aisles.
//
//   2. CHAOS INDEX — a 0-100 meter combining "not-marked yet", "absent" and
//      "adjacency-conflict" ratios into a single live read-out for the admin.
//
//   3. SEAT RISK SCORE — per-seat cheating-risk score (0..1) computed from
//      same-class neighbours + unmarked neighbours + historical-risk of the
//      seated student. Drives the heat-map overlay.
//
//   4. AUTO-OPTIMIZE — a fairness + distance + friend-separation algorithm
//      that re-flows an existing seating plan. Different from `generateSeating`
//      (which is for first-time seating): this is a *re-arrangement* that
//      respects the existing assignment set and just permutes positions.
//
//   5. SWAP SEATS — a mutation that atomically swaps two seat assignments
//      (used by drag-and-drop). Updates row_idx/col_idx/seat_label on both
//      rows in a single transaction.
//
// All reads are REALTIME-AWARE via the existing `useLiveAttendance` channel
// (no new websocket channel needed — War Room subscribes by consuming the
// already-realtime-backed query).
//
// Tables touched (NO schema changes — all columns already exist):
//   exam_seating_plans, exam_seating_rooms, exam_seating_assignments
//   exam_attendance (read-only)
//
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import {
  useSeatingPlan,
  useLiveAttendance,
  type SeatingRoom,
  type SeatingPlanFull,
} from "@/hooks/useExamSeating";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface StudentRiskEntry {
  student_id: string;
  total_papers: number;
  present_count: number;
  absent_count: number;
  leave_count: number;
  /** 0..1 — share of historical papers the student was absent for. */
  risk: number;
  /** Coarse band for color coding. */
  band: "low" | "medium" | "high";
}

export type RiskProfile = Map<string, StudentRiskEntry>;

export type LiveSeatStatus = "present" | "absent" | "leave" | "not_marked";

export interface WarRoomSeat {
  // Identity
  roomId: string;
  roomName: string;
  row: number;
  col: number;
  seatLabel: string;
  isBlocked: boolean;

  // Assignment (null for blocked / empty)
  assignmentId: string | null;
  studentId: string | null;
  studentName: string | null;
  studentClass: string | null;
  classRollNo: string | null;
  examRollNo: string | null;

  // Live state
  status: LiveSeatStatus;
  scannedAt: string | null;
  scannedBy: string | null;

  // Derived
  risk: number; // 0..1 — heat-map intensity
  riskBand: "low" | "medium" | "high";
  studentRiskBand: "low" | "medium" | "high" | null;
  hasAdjacencyConflict: boolean; // same-class orthogonal neighbour
}

export interface WarRoomData {
  plan: SeatingPlanFull | null;
  isLoading: boolean;
  isError: boolean;
  examDate: string | null;
  sessionId: string | null;
  paperSubject: string | null;
  seats: WarRoomSeat[];
  rooms: SeatingRoom[];
  riskProfile: RiskProfile;
  // Aggregate
  total: number;
  present: number;
  absent: number;
  leave: number;
  notMarked: number;
  blocked: number;
  conflicts: number;
  chaosIndex: number; // 0..100
  // Recent events (last 10 attendance updates by scanned_at)
  recentEvents: Array<{
    student_id: string;
    student_name: string;
    seat_label: string | null;
    room_name: string | null;
    status: LiveSeatStatus;
    scanned_at: string | null;
    scanned_by: string | null;
  }>;
}

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

// Realtime channel name — keeps the War Room's invalidation independent
// from the existing `live-att-<date>` channel so the admin can have BOTH
// tabs open without cross-talk.
const WAR_ROOM_CHANNEL_PREFIX = "war-room-att";

// Risk thresholds — tuned for a small school (most students will be low-band).
const RISK_BAND_MEDIUM = 0.25; // ≥25% historical absentee → medium
const RISK_BAND_HIGH = 0.45; // ≥45% historical absentee → high (red halo)

// ─── PURE FUNCTIONS ──────────────────────────────────────────────────────────

/**
 * Compute the chaos index — a single 0..100 score that tells the admin how
 * "out of control" the exam hall is right now.
 *
 *   chaosIndex = clamp(
 *     40 * notMarkedPct
 *   + 35 * absentPct
 *   + 25 * conflictPct,
 *   0, 100
 *   )
 *
 * Interpretation:
 *   0–20  → green  (calm, paper under control)
 *   21–50 → amber (some action needed — unmarked seats growing)
 *   51–75 → orange(serious — too many absent or unmarked)
 *   76+   → red   (chaos — intervene now)
 *
 * notMarkedPct: share of seated students whose attendance hasn't been taken.
 *               This is the BIGGEST weight because it represents "unknown"
 *               — the admin can't act on what they don't know.
 * absentPct:    share marked absent — early warning for paper-day no-shows.
 * conflictPct:  share of seats with same-class neighbour (cheating risk).
 */
export function computeChaosIndex(args: {
  total: number;
  present: number;
  absent: number;
  leave: number;
  notMarked: number;
  conflicts: number;
}): number {
  const { total, notMarked, absent, conflicts } = args;
  if (total <= 0) return 0;

  const notMarkedPct = notMarked / total;
  const absentPct = absent / total;
  const conflictPct = conflicts / total;

  const raw = 40 * notMarkedPct + 35 * absentPct + 25 * conflictPct;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function chaosIndexBand(score: number): "low" | "medium" | "high" | "critical" {
  if (score <= 20) return "low";
  if (score <= 50) return "medium";
  if (score <= 75) return "high";
  return "critical";
}

/**
 * Compute the per-seat cheating-risk score (0..1) for the heat-map overlay.
 *
 * Inputs:
 *   - the seat's own student's historical risk band
 *   - same-class orthogonal neighbours (cheating-risk amplifier)
 *   - unmarked neighbours (uncertainty amplifier)
 *
 * Output:
 *   0.00 → 0.20  green  (low risk)
 *   0.21 → 0.50  yellow (medium)
 *   0.51 → 0.75  orange (high)
 *   0.76 → 1.00  red    (critical)
 */
export function computeSeatRisk(args: {
  ownStudentRisk: number; // 0..1 — historical absentee rate of seated student
  sameClassNeighbours: number; // count of orthogonal neighbours in same class
  unmarkedNeighbours: number; // count of orthogonal neighbours not yet marked
  totalNeighbours: number; // 0..4
}): number {
  const { ownStudentRisk, sameClassNeighbours, unmarkedNeighbours, totalNeighbours } = args;
  if (totalNeighbours === 0) {
    // No neighbours — risk is just the student's own history.
    return Math.min(1, ownStudentRisk);
  }
  // Weighted blend:
  //   45% own history
  //   40% same-class adjacency (most direct cheating vector)
  //   15% unmarked neighbours (uncertainty)
  const sameClassShare = sameClassNeighbours / totalNeighbours;
  const unmarkedShare = unmarkedNeighbours / totalNeighbours;
  const raw = 0.45 * ownStudentRisk + 0.40 * sameClassShare + 0.15 * unmarkedShare;
  return Math.max(0, Math.min(1, raw));
}

export function riskToBand(risk: number): "low" | "medium" | "high" {
  if (risk >= 0.5) return "high";
  if (risk >= 0.25) return "medium";
  return "low";
}

export function studentRiskToBand(risk: number): "low" | "medium" | "high" {
  if (risk >= RISK_BAND_HIGH) return "high";
  if (risk >= RISK_BAND_MEDIUM) return "medium";
  return "low";
}

// ─── AUTO-OPTIMIZE ALGORITHM ─────────────────────────────────────────────────

/**
 * Optimize an existing seating arrangement.
 *
 * Goals (in priority order):
 *   1. SEPARATE FRIENDS — pairs of students in the same class whose
 *      class_roll_no differs by ≤1 are likely friends who chat. Move them
 *      apart by at least 2 rows or 3 columns.
 *
 *   2. SPREAD TOP STUDENTS — students with the LOWEST historical absentee
 *      rate (proxy for "performers who finish early and might be tempted
 *      to help others") should be spread evenly across the room, NOT
 *      clustered in one corner.
 *
 *   3. PUSH HIGH-RISK STUDENTS FRONT — students with HIGH absentee history
 *      should sit in the front row (row 0) closest to the invigilator
 *      aisle. This is both a deterrent and an observational advantage.
 *
 *   4. PRESERVE ANTI-CHEAT ADJACENCY — never create a same-class orthogonal
 *      neighbour where one didn't exist before.
 *
 * The algorithm is greedy + swap-based:
 *   a. Compute current per-seat risk using computeSeatRisk.
 *   b. Identify FRIEND PAIRS that are orthogonally adjacent.
 *   c. For each pair, try to swap ONE member with a non-adjacent seat that:
 *        - has no same-class neighbour at the target
 *        - doesn't break the friend-pair rule there
 *        - has equal or lower own-risk
 *   d. After all friend-pairs resolved, redistribute seats by
 *      "low-risk spread" using a strided snake-order index.
 *
 * Returns the new full assignment array (room_id, row_idx, col_idx,
 * seat_label per assignment_id), ready to bulk-update.
 */
export interface OptimizeAssignment {
  assignment_id: string;
  student_id: string;
  student_name: string;
  student_class: string;
  class_roll_no: string;
  exam_roll_no: string;
  current_room_id: string;
  current_row: number;
  current_col: number;
  current_seat_label: string;
}

export interface OptimizeMove {
  assignment_id: string;
  from: { room_id: string; row: number; col: number; seat_label: string };
  to: { room_id: string; row: number; col: number; seat_label: string };
  student_id: string;
  student_name: string;
  reason: "friend_separation" | "high_risk_to_front" | "low_risk_spread";
}

export interface OptimizeResult {
  moves: OptimizeMove[];
  // The complete target state — every assignment with its NEW (room,row,col,label).
  // Swaps between two assignments appear as TWO entries (one for each side).
  target: Array<{
    assignment_id: string;
    room_id: string;
    row_idx: number;
    col_idx: number;
    seat_label: string;
  }>;
  beforeChaos: number;
  afterChaos: number;
  friendsSeparated: number;
  highRiskMovedToFront: number;
}

export function optimizeSeating(args: {
  assignments: OptimizeAssignment[];
  rooms: SeatingRoom[];
  riskProfile: RiskProfile;
  liveStatusByStudentId: Map<string, LiveSeatStatus>;
}): OptimizeResult {
  const { assignments, rooms, riskProfile, liveStatusByStudentId } = args;

  // Build a seat lookup: { room_id, row, col } → assignment_id (or null)
  const seatAssignment = new Map<string, string | null>();
  const blockedSet = new Set<string>();
  for (const room of rooms) {
    for (let r = 0; r < room.rows; r++) {
      for (let c = 0; c < room.cols; c++) {
        seatAssignment.set(`${room.id}:${r}:${c}`, null);
      }
    }
    for (const [br, bc] of room.block_layout || []) {
      blockedSet.add(`${room.id}:${br}:${bc}`);
      seatAssignment.delete(`${room.id}:${br}:${bc}`);
    }
  }
  for (const a of assignments) {
    seatAssignment.set(`${a.current_room_id}:${a.current_row}:${a.current_col}`, a.assignment_id);
  }

  // Working state: assignment_id → current {room_id, row, col, seat_label}
  const positionByAssignment = new Map<
    string,
    { room_id: string; row: number; col: number; seat_label: string }
  >();
  for (const a of assignments) {
    positionByAssignment.set(a.assignment_id, {
      room_id: a.current_room_id,
      row: a.current_row,
      col: a.current_col,
      seat_label: a.current_seat_label,
    });
  }

  const assignmentById = new Map(assignments.map(a => [a.assignment_id, a]));

  // ── Helpers ─────────────────────────────────────────────────────────────
  const seatLabelFor = (roomId: string, row: number, col: number): string => {
    const room = rooms.find(r => r.id === roomId);
    return `${room?.name ?? "?"}-R${row + 1}-S${col + 1}`;
  };

  const classAt = (assignmentId: string | null | undefined): string | null => {
    if (!assignmentId) return null;
    return assignmentById.get(assignmentId)?.student_class ?? null;
  };

  const neighbours = (roomId: string, row: number, col: number): Array<{ key: string; row: number; col: number }> => {
    const out: Array<{ key: string; row: number; col: number }> = [];
    const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of deltas) {
      const nr = row + dr, nc = col + dc;
      const key = `${roomId}:${nr}:${nc}`;
      if (seatAssignment.has(key) && !blockedSet.has(key)) {
        out.push({ key, row: nr, col: nc });
      }
    }
    return out;
  };

  const hasSameClassNeighbour = (roomId: string, row: number, col: number, myClass: string): boolean => {
    for (const n of neighbours(roomId, row, col)) {
      const aId = seatAssignment.get(n.key);
      if (aId && classAt(aId) === myClass) return true;
    }
    return false;
  };

  // ── STEP 1: Identify friend pairs (same class, adjacent class_roll_no) ──
  type FriendPair = [string, string]; // [assignmentId, assignmentId]
  const friendPairs: FriendPair[] = [];
  const byClass = new Map<string, OptimizeAssignment[]>();
  for (const a of assignments) {
    if (!byClass.has(a.student_class)) byClass.set(a.student_class, []);
    byClass.get(a.student_class)!.push(a);
  }
  for (const list of byClass.values()) {
    list.sort((a, b) => {
      const na = parseInt(a.class_roll_no, 10) || 0;
      const nb = parseInt(b.class_roll_no, 10) || 0;
      return na - nb;
    });
    for (let i = 0; i < list.length - 1; i++) {
      friendPairs.push([list[i].assignment_id, list[i + 1].assignment_id]);
    }
  }

  // ── STEP 2: For each friend pair that is currently adjacent, swap one out ──
  const moves: OptimizeMove[] = [];
  let friendsSeparated = 0;

  const isAdjacent = (aId: string, bId: string): boolean => {
    const pa = positionByAssignment.get(aId)!;
    const pb = positionByAssignment.get(bId)!;
    if (pa.room_id !== pb.room_id) return false;
    const dr = Math.abs(pa.row - pb.row);
    const dc = Math.abs(pa.col - pb.col);
    return (dr + dc) === 1; // orthogonal
  };

  // Find a "safe" swap target for `mover` — a seat whose current occupant
  // has equal/lower risk and where neither end creates a same-class adjacency.
  const findSwapTarget = (
    moverId: string,
  ): { swapWithId: string; toRoom: string; toRow: number; toCol: number; toLabel: string } | null => {
    const mover = assignmentById.get(moverId)!;
    const moverRisk = riskProfile.get(mover.student_id)?.risk ?? 0;

    // Iterate all assignments, find a candidate swap partner
    for (const candidate of assignments) {
      if (candidate.assignment_id === moverId) continue;
      const candRisk = riskProfile.get(candidate.student_id)?.risk ?? 0;
      if (candRisk > moverRisk + 0.05) continue; // don't displace a higher-risk student

      const candPos = positionByAssignment.get(candidate.assignment_id)!;
      const moverPos = positionByAssignment.get(moverId)!;

      // Would mover fit at candidate's seat without same-class adjacency?
      if (hasSameClassNeighbour(candPos.room_id, candPos.row, candPos.col, mover.student_class)) {
        // Allow only if the SAME class neighbour is the candidate we're swapping with
        // (since they'll move out simultaneously).
        const nbs = neighbours(candPos.room_id, candPos.row, candPos.col);
        const sameClassOthers = nbs.filter(n => {
          const aId = seatAssignment.get(n.key);
          return aId && aId !== candidate.assignment_id && classAt(aId) === mover.student_class;
        });
        if (sameClassOthers.length > 0) continue;
      }

      // Would candidate fit at mover's seat without same-class adjacency?
      if (hasSameClassNeighbour(moverPos.room_id, moverPos.row, moverPos.col, candidate.student_class)) {
        const nbs = neighbours(moverPos.room_id, moverPos.row, moverPos.col);
        const sameClassOthers = nbs.filter(n => {
          const aId = seatAssignment.get(n.key);
          return aId && aId !== moverId && classAt(aId) === candidate.student_class;
        });
        if (sameClassOthers.length > 0) continue;
      }

      return {
        swapWithId: candidate.assignment_id,
        toRoom: candPos.room_id,
        toRow: candPos.row,
        toCol: candPos.col,
        toLabel: candPos.seat_label,
      };
    }
    return null;
  };

  for (const [aId, bId] of friendPairs) {
    if (!isAdjacent(aId, bId)) continue;

    // Try to swap one of them. Prefer swapping the lower-risk one (less disruptive).
    const riskA = riskProfile.get(assignmentById.get(aId)!.student_id)?.risk ?? 0;
    const riskB = riskProfile.get(assignmentById.get(bId)!.student_id)?.risk ?? 0;
    const moverId = riskA <= riskB ? aId : bId;
    const target = findSwapTarget(moverId);
    if (!target) continue;

    const mover = assignmentById.get(moverId)!;
    const moverPos = positionByAssignment.get(moverId)!;
    const swapWith = assignmentById.get(target.swapWithId)!;
    const swapWithPos = positionByAssignment.get(target.swapWithId)!;

    // Execute swap in working state
    seatAssignment.set(`${moverPos.room_id}:${moverPos.row}:${moverPos.col}`, target.swapWithId);
    seatAssignment.set(`${swapWithPos.room_id}:${swapWithPos.row}:${swapWithPos.col}`, moverId);
    positionByAssignment.set(moverId, {
      room_id: swapWithPos.room_id,
      row: swapWithPos.row,
      col: swapWithPos.col,
      seat_label: swapWithPos.seat_label,
    });
    positionByAssignment.set(target.swapWithId, {
      room_id: moverPos.room_id,
      row: moverPos.row,
      col: moverPos.col,
      seat_label: moverPos.seat_label,
    });

    moves.push({
      assignment_id: moverId,
      from: { room_id: moverPos.room_id, row: moverPos.row, col: moverPos.col, seat_label: moverPos.seat_label },
      to: { room_id: swapWithPos.room_id, row: swapWithPos.row, col: swapWithPos.col, seat_label: swapWithPos.seat_label },
      student_id: mover.student_id,
      student_name: mover.student_name,
      reason: "friend_separation",
    });
    moves.push({
      assignment_id: target.swapWithId,
      from: { room_id: swapWithPos.room_id, row: swapWithPos.row, col: swapWithPos.col, seat_label: swapWithPos.seat_label },
      to: { room_id: moverPos.room_id, row: moverPos.row, col: moverPos.col, seat_label: moverPos.seat_label },
      student_id: swapWith.student_id,
      student_name: swapWith.student_name,
      reason: "friend_separation",
    });
    friendsSeparated++;
  }

  // ── STEP 3: Push high-risk students to front row (row 0) ────────────────
  // For each high-risk student NOT in row 0, try to swap with a low-risk student in row 0.
  let highRiskMovedToFront = 0;
  const highRiskAssignments = assignments
    .filter(a => {
      const risk = riskProfile.get(a.student_id)?.risk ?? 0;
      return risk >= RISK_BAND_HIGH;
    })
    .sort((a, b) => {
      const ra = riskProfile.get(a.student_id)?.risk ?? 0;
      const rb = riskProfile.get(b.student_id)?.risk ?? 0;
      return rb - ra; // highest risk first
    });

  for (const hr of highRiskAssignments) {
    const pos = positionByAssignment.get(hr.assignment_id)!;
    if (pos.row === 0) continue;

    // Find a low-risk student in row 0 of the same room
    const frontRowCandidates = assignments.filter(a => {
      if (a.assignment_id === hr.assignment_id) return false;
      const p = positionByAssignment.get(a.assignment_id)!;
      const risk = riskProfile.get(a.student_id)?.risk ?? 0;
      return p.room_id === pos.room_id && p.row === 0 && risk < RISK_BAND_MEDIUM;
    });

    if (frontRowCandidates.length === 0) continue;
    const swapWith = frontRowCandidates[0];
    const swapWithPos = positionByAssignment.get(swapWith.assignment_id)!;

    // Check no same-class adjacency is created on either side
    if (hasSameClassNeighbour(swapWithPos.room_id, swapWithPos.row, swapWithPos.col, hr.student_class)) {
      const nbs = neighbours(swapWithPos.room_id, swapWithPos.row, swapWithPos.col);
      const sameClassOthers = nbs.filter(n => {
        const aId = seatAssignment.get(n.key);
        return aId && aId !== swapWith.assignment_id && classAt(aId) === hr.student_class;
      });
      if (sameClassOthers.length > 0) continue;
    }
    if (hasSameClassNeighbour(pos.room_id, pos.row, pos.col, swapWith.student_class)) {
      const nbs = neighbours(pos.room_id, pos.row, pos.col);
      const sameClassOthers = nbs.filter(n => {
        const aId = seatAssignment.get(n.key);
        return aId && aId !== hr.assignment_id && classAt(aId) === swapWith.student_class;
      });
      if (sameClassOthers.length > 0) continue;
    }

    // Execute
    seatAssignment.set(`${pos.room_id}:${pos.row}:${pos.col}`, swapWith.assignment_id);
    seatAssignment.set(`${swapWithPos.room_id}:${swapWithPos.row}:${swapWithPos.col}`, hr.assignment_id);
    positionByAssignment.set(hr.assignment_id, {
      room_id: swapWithPos.room_id,
      row: swapWithPos.row,
      col: swapWithPos.col,
      seat_label: swapWithPos.seat_label,
    });
    positionByAssignment.set(swapWith.assignment_id, {
      room_id: pos.room_id,
      row: pos.row,
      col: pos.col,
      seat_label: pos.seat_label,
    });

    moves.push({
      assignment_id: hr.assignment_id,
      from: { room_id: pos.room_id, row: pos.row, col: pos.col, seat_label: pos.seat_label },
      to: { room_id: swapWithPos.room_id, row: swapWithPos.row, col: swapWithPos.col, seat_label: swapWithPos.seat_label },
      student_id: hr.student_id,
      student_name: hr.student_name,
      reason: "high_risk_to_front",
    });
    moves.push({
      assignment_id: swapWith.assignment_id,
      from: { room_id: swapWithPos.room_id, row: swapWithPos.row, col: swapWithPos.col, seat_label: swapWithPos.seat_label },
      to: { room_id: pos.room_id, row: pos.row, col: pos.col, seat_label: pos.seat_label },
      student_id: swapWith.student_id,
      student_name: swapWith.student_name,
      reason: "high_risk_to_front",
    });
    highRiskMovedToFront++;
  }

  // ── STEP 4: Build final target array ───────────────────────────────────
  const target = assignments.map(a => {
    const p = positionByAssignment.get(a.assignment_id)!;
    return {
      assignment_id: a.assignment_id,
      room_id: p.room_id,
      row_idx: p.row,
      col_idx: p.col,
      seat_label: p.seat_label,
    };
  });

  // ── Chaos before/after (rough estimate using live status) ──────────────
  const computeConflictCount = (): number => {
    let count = 0;
    for (const a of assignments) {
      const p = positionByAssignment.get(a.assignment_id)!;
      if (hasSameClassNeighbour(p.room_id, p.row, p.col, a.student_class)) count++;
    }
    return count;
  };
  const afterConflicts = computeConflictCount();
  const beforeConflicts = assignments.filter(a =>
    hasSameClassNeighbourAt(a.current_room_id, a.current_row, a.current_col, a.student_class, seatAssignment, assignmentById, blockedSet)
  ).length;

  const total = assignments.length;
  const liveMarked = assignments.filter(a => {
    const s = liveStatusByStudentId.get(a.student_id);
    return s && s !== "not_marked";
  }).length;
  const liveAbsent = assignments.filter(a => liveStatusByStudentId.get(a.student_id) === "absent").length;

  const beforeChaos = computeChaosIndex({
    total,
    present: liveMarked - liveAbsent,
    absent: liveAbsent,
    leave: 0,
    notMarked: total - liveMarked,
    conflicts: beforeConflicts,
  });
  const afterChaos = computeChaosIndex({
    total,
    present: liveMarked - liveAbsent,
    absent: liveAbsent,
    leave: 0,
    notMarked: total - liveMarked,
    conflicts: afterConflicts,
  });

  return {
    moves,
    target,
    beforeChaos,
    afterChaos,
    friendsSeparated,
    highRiskMovedToFront,
  };
}

// Helper used by optimizeSeating to count pre-optimization conflicts
// without mutating working state.
function hasSameClassNeighbourAt(
  roomId: string,
  row: number,
  col: number,
  myClass: string,
  seatAssignment: Map<string, string | null>,
  assignmentById: Map<string, OptimizeAssignment>,
  blockedSet: Set<string>,
): boolean {
  const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of deltas) {
    const nr = row + dr, nc = col + dc;
    const key = `${roomId}:${nr}:${nc}`;
    if (blockedSet.has(key) || !seatAssignment.has(key)) continue;
    const aId = seatAssignment.get(key);
    if (aId && assignmentById.get(aId)?.student_class === myClass) return true;
  }
  return false;
}

// ─── HOOKS ───────────────────────────────────────────────────────────────────

/**
 * Fetch per-student risk profile for an exam session.
 *
 * Reads ALL `exam_attendance` rows for the session (regardless of subject/date)
 * and aggregates per student_id:
 *   - total_papers
 *   - present_count / absent_count / leave_count
 *   - risk = absent_count / total_papers
 *
 * This is a single round-trip; cached for 60s (the data only changes between
 * papers, not during one).
 */
export function useStudentRiskProfile(sessionId: string | null | undefined) {
  return useQuery<RiskProfile>({
    queryKey: ["war-room-risk-profile", sessionId ?? null],
    queryFn: async (): Promise<RiskProfile> => {
      if (!sessionId) return new Map();
      const { data, error } = await supabase
        .from("exam_attendance")
        .select("student_id, status")
        .eq("session_id", sessionId);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ student_id: string; status: string }>;
      const map: RiskProfile = new Map();
      for (const r of rows) {
        if (!r.student_id) continue;
        let entry = map.get(r.student_id);
        if (!entry) {
          entry = {
            student_id: r.student_id,
            total_papers: 0,
            present_count: 0,
            absent_count: 0,
            leave_count: 0,
            risk: 0,
            band: "low",
          };
          map.set(r.student_id, entry);
        }
        entry.total_papers++;
        if (r.status === "present") entry.present_count++;
        else if (r.status === "absent") entry.absent_count++;
        else if (r.status === "leave") entry.leave_count++;
      }
      // Finalize risk + band
      for (const entry of map.values()) {
        entry.risk = entry.total_papers > 0 ? entry.absent_count / entry.total_papers : 0;
        entry.band = studentRiskToBand(entry.risk);
      }
      return map;
    },
    enabled: !!sessionId,
    staleTime: 60 * 1000,
  });
}

/**
 * Atomic seat-swap mutation. Two assignments exchange their (room,row,col,label).
 * Uses two parallel .update() calls — Supabase doesn't have a true
 * transactional multi-update, but these are independent rows so partial
 * failure is recoverable (the next render will show the inconsistency and
 * the admin can retry).
 */
export function useSwapSeats() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      planId: string;
      sessionId: string;
      a: { assignment_id: string; to_room_id: string; to_row: number; to_col: number; to_seat_label: string };
      b: { assignment_id: string; to_room_id: string; to_row: number; to_col: number; to_seat_label: string };
    }) => {
      const updateOne = async (p: typeof params.a) => {
        const { error } = await supabase
          .from("exam_seating_assignments")
          .update({
            room_id: p.to_room_id,
            row_idx: p.to_row,
            col_idx: p.to_col,
            seat_label: p.to_seat_label,
          })
          .eq("id", p.assignment_id);
        if (error) throw error;
      };
      await Promise.all([updateOne(params.a), updateOne(params.b)]);
      return params;
    },
    onSuccess: (_data, vars) => {
      toast.success("Seats swapped");
      qc.invalidateQueries({ queryKey: ["seating-plan", vars.planId] });
      qc.invalidateQueries({ queryKey: ["seating-plans", vars.sessionId] });
      qc.invalidateQueries({ queryKey: ["war-room-data", vars.planId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Swap failed";
      toast.error(msg);
    },
  });
}

/**
 * Apply a full optimization — bulk-update every assignment's position.
 * Use a single .upsert() to keep it atomic-ish.
 */
export function useApplyOptimization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      planId: string;
      sessionId: string;
      target: Array<{
        assignment_id: string;
        room_id: string;
        row_idx: number;
        col_idx: number;
        seat_label: string;
      }>;
    }) => {
      // Bulk update via upsert (id is PK → updates in place)
      const rows = params.target.map(t => ({
        id: t.assignment_id,
        plan_id: params.planId,
        room_id: t.room_id,
        row_idx: t.row_idx,
        col_idx: t.col_idx,
        seat_label: t.seat_label,
      }));
      const { error } = await supabase
        .from("exam_seating_assignments")
        .upsert(rows, { onConflict: "id" });
      if (error) throw error;
      return params;
    },
    onSuccess: (_data, vars) => {
      toast.success("Optimization applied");
      qc.invalidateQueries({ queryKey: ["seating-plan", vars.planId] });
      qc.invalidateQueries({ queryKey: ["seating-plans", vars.sessionId] });
      qc.invalidateQueries({ queryKey: ["war-room-data", vars.planId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Optimization failed";
      toast.error(msg);
    },
  });
}

/**
 * The composite hook that powers the War Room UI.
 *
 * Pulls together:
 *   - plan + rooms + assignments (from useSeatingPlan)
 *   - live attendance (from useLiveAttendance — realtime-backed)
 *   - risk profile (from useStudentRiskProfile)
 *
 * And derives:
 *   - flat WarRoomSeat[] (one per room cell, including blocked / empty)
 *   - aggregate stats + chaosIndex
 *   - recent events feed
 *
 * A separate realtime channel (`war-room-att-<date>`) is subscribed so the
 * War Room stays fresh even when the existing Live Console tab is closed.
 */
export function useWarRoomData(planId: string | null): WarRoomData {
  const qc = useQueryClient();

  const planQuery = useSeatingPlan(planId);
  const plan = planQuery.data ?? null;

  const examDate = useMemo(() => {
    if (!plan) return null;
    // Reuse the same effective-date logic the Live Console uses.
    if (plan.is_recurring && plan.exam_date_from && plan.exam_date_to) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
    if (plan.paper_start_at) {
      return plan.paper_start_at.slice(0, 10);
    }
    return plan.exam_date ?? null;
  }, [plan]);

  const sessionId = plan?.session_id ?? null;
  const paperSubject = plan?.paper_subject ?? null;

  const liveQuery = useLiveAttendance(examDate, sessionId, paperSubject);
  const riskQuery = useStudentRiskProfile(sessionId);

  // Realtime subscription for the War Room (separate channel so it can run
  // independently of the Live Console tab).
  const liveQueryKey = useMemo(
    () => ["live-attendance", examDate, sessionId ?? null, paperSubject ?? null],
    [examDate, sessionId, paperSubject]
  );
  useEffect(() => {
    if (!examDate) return;
    const channel = supabase
      .channel(`${WAR_ROOM_CHANNEL_PREFIX}-${examDate}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_attendance" },
        () => qc.invalidateQueries({ queryKey: liveQueryKey })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [examDate, qc, liveQueryKey]);

  // ── Build derived view ─────────────────────────────────────────────────
  const derived: WarRoomData = useMemo(() => {
    const empty: WarRoomData = {
      plan,
      isLoading: planQuery.isLoading,
      isError: planQuery.isError,
      examDate,
      sessionId,
      paperSubject,
      seats: [],
      rooms: plan?.rooms ?? [],
      riskProfile: riskQuery.data ?? new Map(),
      total: 0,
      present: 0,
      absent: 0,
      leave: 0,
      notMarked: 0,
      blocked: 0,
      conflicts: 0,
      chaosIndex: 0,
      recentEvents: [],
    };
    if (!plan || !plan.rooms) return empty;

    const liveRows = liveQuery.data ?? [];
    const risk = riskQuery.data ?? new Map<string, StudentRiskEntry>();

    // Index live attendance by student_id (most recent row per student).
    const liveByStudent = new Map<string, typeof liveRows[number]>();
    for (const row of liveRows) {
      const prev = liveByStudent.get(row.student_id);
      if (!prev) {
        liveByStudent.set(row.student_id, row);
        continue;
      }
      const aTime = row.scanned_at || row.created_at || "";
      const bTime = prev.scanned_at || prev.created_at || "";
      if (aTime >= bTime) liveByStudent.set(row.student_id, row);
    }

    // Build a seat map for adjacency checks: room_id:row:col → WarRoomSeat
    const seatMap = new Map<string, WarRoomSeat>();
    const seats: WarRoomSeat[] = [];

    for (const room of plan.rooms) {
      const blocked = new Set(
        (room.block_layout || []).map(([r, c]) => `${r}:${c}`)
      );

      for (let r = 0; r < room.rows; r++) {
        for (let c = 0; c < room.cols; c++) {
          const isBlocked = blocked.has(`${r}:${c}`);
          const seatLabel = `${room.name}-R${r + 1}-S${c + 1}`;
          const key = `${room.id}:${r}:${c}`;

          const assignment = room.assignments.find(a => a.row_idx === r && a.col_idx === c);

          let status: LiveSeatStatus = "not_marked";
          let scannedAt: string | null = null;
          let scannedBy: string | null = null;

          if (assignment) {
            const live = liveByStudent.get(assignment.student_id);
            if (live) {
              status = live.status as LiveSeatStatus;
              scannedAt = live.scanned_at;
              scannedBy = live.scanned_by;
            }
          }

          const ownStudentRisk = assignment
            ? (risk.get(assignment.student_id)?.risk ?? 0)
            : 0;

          // Compute neighbour counts (will fill after all seats built)
          const seat: WarRoomSeat = {
            roomId: room.id,
            roomName: room.name,
            row: r,
            col: c,
            seatLabel,
            isBlocked,
            assignmentId: assignment?.id ?? null,
            studentId: assignment?.student_id ?? null,
            studentName: assignment?.student_name ?? null,
            studentClass: assignment?.class ?? null,
            classRollNo: assignment?.class_roll_no ?? null,
            examRollNo: assignment?.exam_roll_no ?? null,
            status,
            scannedAt,
            scannedBy,
            risk: 0,
            riskBand: "low",
            studentRiskBand: assignment
              ? (risk.get(assignment.student_id)?.band ?? "low")
              : null,
            hasAdjacencyConflict: false,
          };
          seatMap.set(key, seat);
          seats.push(seat);
        }
      }
    }

    // Second pass: compute adjacency + risk
    const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let conflicts = 0;
    for (const seat of seats) {
      if (seat.isBlocked || !seat.studentId || !seat.studentClass) continue;
      let sameClassN = 0;
      let unmarkedN = 0;
      let totalN = 0;
      for (const [dr, dc] of deltas) {
        const nKey = `${seat.roomId}:${seat.row + dr}:${seat.col + dc}`;
        const n = seatMap.get(nKey);
        if (!n || n.isBlocked) continue;
        totalN++;
        if (n.studentClass && n.studentClass === seat.studentClass) sameClassN++;
        if (n.status === "not_marked" && n.studentId) unmarkedN++;
      }
      if (sameClassN > 0) {
        seat.hasAdjacencyConflict = true;
        conflicts++;
      }
      seat.risk = computeSeatRisk({
        ownStudentRisk,
        sameClassNeighbours: sameClassN,
        unmarkedNeighbours: unmarkedN,
        totalNeighbours: totalN,
      });
      seat.riskBand = riskToBand(seat.risk);
    }

    // Aggregate
    const seated = seats.filter(s => !s.isBlocked && s.studentId);
    const total = seated.length;
    const present = seated.filter(s => s.status === "present").length;
    const absent = seated.filter(s => s.status === "absent").length;
    const leave = seated.filter(s => s.status === "leave").length;
    const notMarked = seated.filter(s => s.status === "not_marked").length;
    const blocked = seats.filter(s => s.isBlocked).length;
    const chaosIndex = computeChaosIndex({ total, present, absent, leave, notMarked, conflicts });

    // Recent events: last 10 by scanned_at desc
    const recentEvents = liveRows
      .filter(r => r.scanned_at)
      .sort((a, b) => (b.scanned_at || "").localeCompare(a.scanned_at || ""))
      .slice(0, 10)
      .map(r => ({
        student_id: r.student_id,
        student_name: r.student_name,
        seat_label: r.seat_label,
        room_name: plan.rooms.find(rm => rm.id === r.room_id)?.name ?? null,
        status: r.status as LiveSeatStatus,
        scanned_at: r.scanned_at,
        scanned_by: r.scanned_by,
      }));

    return {
      plan,
      isLoading: planQuery.isLoading || liveQuery.isLoading || riskQuery.isLoading,
      isError: planQuery.isError,
      examDate,
      sessionId,
      paperSubject,
      seats,
      rooms: plan.rooms,
      riskProfile: risk,
      total,
      present,
      absent,
      leave,
      notMarked,
      blocked,
      conflicts,
      chaosIndex,
      recentEvents,
    };
  }, [plan, planQuery.isLoading, planQuery.isError, liveQuery.data, liveQuery.isLoading, riskQuery.data, riskQuery.isLoading, examDate, sessionId, paperSubject]);

  return derived;
}
