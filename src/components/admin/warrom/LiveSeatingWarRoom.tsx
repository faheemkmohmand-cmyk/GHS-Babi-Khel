// src/components/admin/warroom/LiveSeatingWarRoom.tsx
// ─────────────────────────────────────────────────────────────────────────────
// LIVE EXAM SEATING WAR ROOM — the admin's god-tier view of an exam hall.
//
// Capabilities:
//   1. Plan picker — choose any generated/published plan to enter the war room.
//   2. 2.5D interactive hall map (HallMap2D5) — drag students between seats,
//      color-coded by live attendance status, risk halo for frequent absentees.
//   3. CHAOS INDEX meter — a single 0-100 score that pulses red when the hall
//      is in chaos (too many unmarked + absent + adjacency conflicts).
//   4. AUTO-OPTIMIZE button — runs the fairness + distance + friend-separation
//      algorithm and shows a confirmation modal BEFORE applying (with before/
//      after chaos-index delta and a list of moves).
//   5. HEAT MAP toggle — overlays per-seat cheating-risk colour.
//   6. LIVE SYNC — uses the existing realtime-backed `useLiveAttendance`
//      channel PLUS a dedicated `war-room-att-<date>` channel so the war room
//      stays fresh even when the Live Console tab is closed.
//   7. Recent events feed — last 10 invigilator scans with timestamp + seat.
//
// Mobile-friendly: every section stacks vertically on small screens, the hall
// map auto-switches to flat-2D on touch devices, and the chaos meter scales
// with its container.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Loader2, Wand2, Flame, Activity, Radio, AlertTriangle,
  CheckCircle2, XCircle, Clock, Users, Eye, EyeOff, ChevronRight,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAllSeatingPlans, getEffectiveExamDate,
} from "@/hooks/useExamSeating";
import {
  useWarRoomData, useSwapSeats, useApplyOptimization, optimizeSeating,
  type WarRoomSeat, type OptimizeAssignment, type OptimizeResult,
} from "@/hooks/useExamWarRoom";
import HallMap2D5 from "./HallMap2D5";
import ChaosIndexMeter from "./ChaosIndexMeter";

// ─── MAIN ────────────────────────────────────────────────────────────────────

export default function LiveSeatingWarRoom() {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  if (!selectedPlanId) {
    return <PlanPicker onPick={setSelectedPlanId} />;
  }
  return <WarRoomView planId={selectedPlanId} onBack={() => setSelectedPlanId(null)} />;
}

// ─── PLAN PICKER ─────────────────────────────────────────────────────────────

function PlanPicker({ onPick }: { onPick: (id: string) => void }) {
  const { data: plans, isLoading } = useAllSeatingPlans();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
    );
  }
  if (!plans || plans.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
        <p className="text-sm font-medium">No seating plans found</p>
        <p className="text-xs text-muted-foreground mt-1">
          Generate a seating plan first (in the <strong>Seating Plans</strong> tab),
          then come back here to run the War Room.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">War Room — pick a plan</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose a seating plan to enter the live operations room. The plan must have at least one room with assignments.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map(plan => {
          const examDate = getEffectiveExamDate(plan);
          const isActive = (() => {
            try { return examDate ? true : false; } catch { return false; }
          })();
          return (
            <button
              key={plan.id}
              onClick={() => onPick(plan.id)}
              className="group text-left rounded-2xl border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{plan.title}</p>
                  {plan.paper_subject && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{plan.paper_subject}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                  <Users className="w-3 h-3" /> {plan.total_seated}/{plan.total_students}
                </span>
                {examDate && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                    <Clock className="w-3 h-3" /> {examDate}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${
                  plan.status === "published" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : plan.status === "generated" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  : "bg-secondary text-muted-foreground"
                }`}>
                  {plan.status}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── WAR ROOM VIEW ───────────────────────────────────────────────────────────

function WarRoomView({ planId, onBack }: { planId: string; onBack: () => void }) {
  const data = useWarRoomData(planId);
  const swapMutation = useSwapSeats();
  const optimizeMutation = useApplyOptimization();

  const [showHeatMap, setShowHeatMap] = useState(false);
  const [optimizeDialogOpen, setOptimizeDialogOpen] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick every 30s — only for "X seconds ago" labels in the event feed
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Drag-and-drop swap handler ─────────────────────────────────────────
  const onSwap = (a: WarRoomSeat, b: WarRoomSeat) => {
    if (!data.plan) return;
    if (!a.studentId) return; // can't drag empty
    // If both have students → swap. If only `a` has a student and `b` is empty → move.
    if (b.studentId) {
      // Swap
      swapMutation.mutate({
        planId,
        sessionId: data.plan.session_id,
        a: {
          assignment_id: a.assignmentId!,
          to_room_id: b.roomId,
          to_row: b.row,
          to_col: b.col,
          to_seat_label: b.seatLabel,
        },
        b: {
          assignment_id: b.assignmentId!,
          to_room_id: a.roomId,
          to_row: a.row,
          to_col: a.col,
          to_seat_label: a.seatLabel,
        },
      });
    } else {
      // Move — synthesize a no-op for `b` (it has no assignment to update)
      swapMutation.mutate({
        planId,
        sessionId: data.plan.session_id,
        a: {
          assignment_id: a.assignmentId!,
          to_room_id: b.roomId,
          to_row: b.row,
          to_col: b.col,
          to_seat_label: b.seatLabel,
        },
        b: {
          assignment_id: a.assignmentId!, // same as a — server update is idempotent
          to_room_id: a.roomId,
          to_row: a.row,
          to_col: a.col,
          to_seat_label: a.seatLabel,
        },
      });
    }
  };

  // ── Auto-optimize handler ──────────────────────────────────────────────
  const onOptimize = () => {
    if (!data.plan) return;
    const assignments: OptimizeAssignment[] = [];
    const liveStatusByStudentId = new Map<string, "present" | "absent" | "leave" | "not_marked">();
    for (const seat of data.seats) {
      if (seat.assignmentId && seat.studentId) {
        assignments.push({
          assignment_id: seat.assignmentId,
          student_id: seat.studentId,
          student_name: seat.studentName ?? "",
          student_class: seat.studentClass ?? "",
          class_roll_no: seat.classRollNo ?? "",
          exam_roll_no: seat.examRollNo ?? "",
          current_room_id: seat.roomId,
          current_row: seat.row,
          current_col: seat.col,
          current_seat_label: seat.seatLabel,
        });
        liveStatusByStudentId.set(seat.studentId, seat.status);
      }
    }
    const result = optimizeSeating({
      assignments,
      rooms: data.rooms,
      riskProfile: data.riskProfile,
      liveStatusByStudentId,
    });
    setOptimizeResult(result);
    setOptimizeDialogOpen(true);
  };

  const onApplyOptimize = () => {
    if (!optimizeResult || !data.plan) return;
    optimizeMutation.mutate(
      { planId, sessionId: data.plan.session_id, target: optimizeResult.target },
      { onSuccess: () => setOptimizeDialogOpen(false) }
    );
  };

  // ─── LOADING ───────────────────────────────────────────────────────────
  if (data.isLoading && !data.plan) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading war room…</span>
        </div>
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-60 rounded-2xl" />
      </div>
    );
  }

  // ─── ERROR / EMPTY ─────────────────────────────────────────────────────
  if (!data.plan) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
        <p className="text-sm font-medium">Plan not found</p>
        <Button variant="ghost" size="sm" onClick={onBack} className="mt-3">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to plan list
        </Button>
      </div>
    );
  }

  if (data.plan.rooms.length === 0) {
    return (
      <div className="space-y-4">
        <BackBar onBack={onBack} title={data.plan.title} />
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
          <p className="text-sm font-medium">No rooms defined</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add rooms in the <strong>Seating Plans</strong> tab first, then return here.
          </p>
        </div>
      </div>
    );
  }

  const totalAssignments = data.plan.rooms.reduce(
    (n, r) => n + (r.assignments?.length ?? 0), 0
  );
  if (totalAssignments === 0) {
    return (
      <div className="space-y-4">
        <BackBar onBack={onBack} title={data.plan.title} />
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
          <p className="text-sm font-medium">No seating assignments yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click <strong>Auto-Generate Seating</strong> in the Seating Plans tab first.
          </p>
        </div>
      </div>
    );
  }

  // ─── MAIN VIEW ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <BackBar onBack={onBack} title={data.plan.title} />

      {/* Status strip — exam date + LIVE indicator */}
      <div className="rounded-2xl border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {data.paperSubject && (
              <span className="font-semibold">{data.paperSubject}</span>
            )}
            {data.examDate && (
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> {data.examDate}
              </span>
            )}
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Users className="w-3 h-3" /> {data.total} seated · {data.blocked} blocked
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            LIVE
          </div>
        </div>
      </div>

      {/* Stats + Chaos Index */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        <StatsGrid data={data} />
        <div className="flex flex-col items-center justify-center gap-2 lg:items-end">
          <ChaosIndexMeter score={data.chaosIndex} size={130} />
          <p className="text-[10px] text-muted-foreground text-center max-w-[200px]">
            Combines not-marked, absent &amp; adjacency-conflict ratios.
          </p>
        </div>
      </div>

      {/* Threshold alert */}
      {data.chaosIndex >= 76 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-3 sm:p-4 animate-pulse"
        >
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-bold text-sm">CHAOS — INTERVENE NOW</span>
          </div>
          <p className="text-xs text-red-600 dark:text-red-300 mt-1">
            {data.notMarked > 0 && `${data.notMarked} unmarked · `}
            {data.absent > 0 && `${data.absent} absent · `}
            {data.conflicts > 0 && `${data.conflicts} adjacency conflict${data.conflicts === 1 ? "" : "s"}`}
          </p>
        </motion.div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={onOptimize}
          disabled={optimizeMutation.isPending}
        >
          {optimizeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          Auto-Optimize
        </Button>
        <Button
          size="sm"
          variant={showHeatMap ? "default" : "outline"}
          onClick={() => setShowHeatMap(s => !s)}
        >
          {showHeatMap ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {showHeatMap ? "Heat-Map On" : "Heat-Map Off"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { /* data refreshes via realtime + polling */ }}
          disabled
          title="Auto-refreshing every 5s via realtime"
        >
          <Radio className="w-3.5 h-3.5 text-emerald-500" /> Auto-syncing
        </Button>
      </div>

      {/* Hall map + event feed (stacks on mobile, side-by-side on desktop) */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
        <div className="rounded-2xl border bg-card/40 p-3 sm:p-4">
          <HallMap2D5
            seats={data.seats}
            rooms={data.rooms}
            showHeatMap={showHeatMap}
            onSwap={onSwap}
            isSwapPending={swapMutation.isPending}
          />
        </div>

        {/* Right rail: event feed */}
        <div className="rounded-2xl border bg-card/40 p-3">
          <div className="flex items-center gap-1.5 mb-3">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Live Invigilator Feed
            </h3>
          </div>
          {data.recentEvents.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-6 text-center">
              No scans yet. As invigilators mark attendance via mobile, you'll see updates here in real time.
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {data.recentEvents.map((ev, i) => (
                  <motion.li
                    key={`${ev.student_id}-${ev.scanned_at}-${i}`}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-[11px] rounded-lg border bg-card px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{ev.student_name}</span>
                      <StatusIcon status={ev.status} />
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5 flex items-center justify-between gap-1">
                      <span className="truncate">{ev.seat_label ?? "—"}</span>
                      <span>{timeAgo(ev.scanned_at, now)}</span>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>

      {/* Optimize confirmation dialog */}
      <AlertDialog open={optimizeDialogOpen} onOpenChange={setOptimizeDialogOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Wand2 className="w-4 h-4" /> Apply Auto-Optimize?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  This will re-arrange {optimizeResult?.target.length ?? 0} seat assignments using the
                  fairness + friend-separation + front-row-for-high-risk algorithm.
                </p>
                {optimizeResult && (
                  <div className="rounded-lg border bg-secondary/30 p-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Friends separated</span>
                      <span className="font-semibold">{optimizeResult.friendsSeparated}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">High-risk → front row</span>
                      <span className="font-semibold">{optimizeResult.highRiskMovedToFront}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total seat moves</span>
                      <span className="font-semibold">{optimizeResult.moves.length}</span>
                    </div>
                    <div className="flex items-center justify-between border-t pt-1.5 mt-1.5">
                      <span className="text-muted-foreground">Chaos index</span>
                      <span className="font-semibold">
                        {optimizeResult.beforeChaos} → {optimizeResult.afterChaos}
                        {optimizeResult.afterChaos < optimizeResult.beforeChaos && (
                          <span className="text-emerald-600 ml-1">▼</span>
                        )}
                        {optimizeResult.afterChaos > optimizeResult.beforeChaos && (
                          <span className="text-red-600 ml-1">▲</span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
                {optimizeResult && optimizeResult.moves.length === 0 && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    ✅ The current arrangement is already optimal — no moves needed.
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Note: any live attendance data already scanned stays tied to the STUDENT, not the seat.
                  After the swap, the next scan will resolve to the student's new desk.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onApplyOptimize}
              disabled={optimizeMutation.isPending || (optimizeResult?.moves.length ?? 0) === 0}
            >
              {optimizeMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              Apply Optimization
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BackBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={onBack} className="h-8">
        <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
      </Button>
      <h1 className="text-base font-semibold tracking-tight truncate">{title}</h1>
      <span className="hidden sm:inline-flex text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-semibold uppercase">
        War Room
      </span>
    </div>
  );
}

function StatsGrid({ data }: { data: ReturnType<typeof useWarRoomData> }) {
  const cards: Array<{
    label: string; value: number; icon: React.ReactNode; color: string; sub?: string;
  }> = [
    { label: "Present",    value: data.present,    icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Absent",     value: data.absent,     icon: <XCircle className="w-3.5 h-3.5" />,        color: "text-red-600 dark:text-red-400" },
    { label: "Leave",      value: data.leave,      icon: <Clock className="w-3.5 h-3.5" />,          color: "text-blue-600 dark:text-blue-400" },
    { label: "Not Marked", value: data.notMarked,  icon: <AlertTriangle className="w-3.5 h-3.5" />,  color: "text-amber-600 dark:text-amber-400" },
    { label: "Conflicts",  value: data.conflicts,  icon: <Flame className="w-3.5 h-3.5" />,          color: "text-orange-600 dark:text-orange-400" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {cards.map(c => (
        <div key={c.label} className="rounded-xl border bg-card p-2.5">
          <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${c.color}`}>
            {c.icon}
            {c.label}
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums">{c.value}</div>
          {data.total > 0 && (
            <div className="text-[9px] text-muted-foreground">
              {Math.round((c.value / data.total) * 100)}% of seated
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusIcon({ status }: { status: "present" | "absent" | "leave" | "not_marked" }) {
  if (status === "present") return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
  if (status === "absent")  return <XCircle className="w-3 h-3 text-red-500" />;
  if (status === "leave")   return <Clock className="w-3 h-3 text-blue-500" />;
  return <span className="text-[9px] text-muted-foreground">?</span>;
}

function timeAgo(iso: string | null, _now: number): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
