/**
 * AdminExamConsole.tsx
 * Live Exam Hall Operations Console — a wall-screen dashboard for exam day.
 *
 * Features:
 *  • Plan picker — lists all generated/published plans.
 *  • Countdown to paper-start and paper-end (updates every second).
 *  • Live present / absent / late / leave tally as invigilators scan QR
 *    codes. Uses Supabase realtime on exam_attendance for instant updates.
 *  • Auto-red-flag when absent count crosses a configurable threshold
 *    (default 20%, adjustable 5–50% via a slider).
 *  • Per-room breakdown with per-room progress bars.
 *  • One-click absentee PDF for re-exam approvals — lists every absent
 *    student grouped by room, with seat label, exam roll, class, invigilator.
 *  • Paper-times editor — set/update paper_start_at and paper_end_at from
 *    the console itself (in case they weren't set at plan-creation time).
 *  • Realtime connection indicator (green pulse = connected).
 *  • MCQ Timer — admin starts a N-minute countdown (e.g. 15 min for an MCQ
 *    paper). The remaining time is shown on the console as a large
 *    minute:second display. The same timer is mirrored LIVE inside the 3D
 *    Hall screen (Hall3DView + Hall_3D.html). When it reaches zero, the 3D
 *    Hall screen fires a red siren overlay for 15 seconds. The timer state
 *    is persisted in localStorage so it survives refreshes and is shared
 *    across tabs (Console tab + 3D Hall tab, if both are open).
 *
 * Navigation: Admin → STUDENTS → 🖥️ Live Exam Console
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Monitor, ArrowLeft, Loader2, Clock, Users, CheckCircle2, XCircle, Palmtree,
  Timer, AlertTriangle, Download, RefreshCw, Building2, CalendarDays, BookOpen,
  Settings2, Play, Square, RotateCcw,
} from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  useAllSeatingPlans, useSeatingPlan, useLiveAttendance, useUpdatePaperTimes,
  getEffectiveExamDate, isPlanActiveToday,
  type SeatingPlanFull,
} from "@/hooks/useExamSeating";

// ── Color helper ──
const colorFor = (cls: string) => {
  const m: Record<string, { bg: string; text: string }> = {
    "6":  { bg: "bg-blue-100 dark:bg-blue-900/40",       text: "text-blue-700 dark:text-blue-300" },
    "7":  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
    "8":  { bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300" },
    "9":  { bg: "bg-rose-100 dark:bg-rose-900/40",       text: "text-rose-700 dark:text-rose-300" },
    "10": { bg: "bg-violet-100 dark:bg-violet-900/40",   text: "text-violet-700 dark:text-violet-300" },
  };
  return m[cls] ?? { bg: "bg-slate-100 dark:bg-slate-900/40", text: "text-slate-700 dark:text-slate-300" };
};

// ────────────────────────────────────────────────────────────────────────────
// MCQ Timer — shared state via localStorage
// ────────────────────────────────────────────────────────────────────────────
// The admin starts an N-minute MCQ timer from this console. The same timer
// is mirrored LIVE inside the 3D Hall screen (Hall3DView + Hall_3D.html).
// When it reaches zero, the 3D Hall screen fires a red siren overlay for
// 15 seconds (great for signalling the end of an MCQ paper).
//
// State is stored in localStorage under MCQ_TIMER_KEY so it survives
// refreshes and is shared across tabs. The browser fires a `storage` event
// in OTHER tabs whenever the key changes, so both Console and 3D Hall
// (which may be open in separate tabs) stay in sync without any server
// round-trip. The 1-second `now` tick re-derives the remaining time on
// every render, so the countdown is always smooth even in the tab that
// started the timer (no storage event fires in the same tab that wrote).
const MCQ_TIMER_KEY = "ghs-exam-mcq-timer";

interface McqTimerState {
  // Wall-clock epoch ms when the timer is supposed to hit zero.
  endTime: number;
  // Total duration the admin originally picked (ms) — used to show
  // "x / y min" progress and to clamp remaining to 0.
  totalMs: number;
  // "running" | "stopped" | "finished"
  //   running  → counting down from endTime
  //   stopped  → admin hit Stop before it finished (no siren fires)
  //   finished → reached zero naturally (siren fires in 3D Hall)
  status: "running" | "stopped" | "finished";
  // Wall-clock epoch ms when the timer finished (for siren window calc).
  finishedAt?: number;
}

function readMcqTimer(): McqTimerState | null {
  try {
    const raw = localStorage.getItem(MCQ_TIMER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.endTime !== "number") return null;
    if (typeof parsed.totalMs !== "number") return null;
    if (typeof parsed.status !== "string") return null;
    return parsed as McqTimerState;
  } catch {
    return null;
  }
}

function writeMcqTimer(state: McqTimerState | null): void {
  try {
    if (state === null) {
      localStorage.removeItem(MCQ_TIMER_KEY);
    } else {
      localStorage.setItem(MCQ_TIMER_KEY, JSON.stringify(state));
    }
  } catch { /* ignore quota / private-mode errors */ }
}

/**
 * Returns the live MCQ timer state, re-evaluating every second so the
 * countdown is smooth. Also listens for `storage` events so changes from
 * other tabs (e.g. the admin clicked Stop in the 3D Hall tab) are
 * reflected immediately.
 *
 * When the timer hits zero while running, it auto-flips to "finished"
 * status and records finishedAt — this is what triggers the siren in the
 * 3D Hall. The auto-flip is written to localStorage so the other tab
 * picks it up too.
 */
function useMcqTimer(now: number) {
  const [state, setState] = useState<McqTimerState | null>(() => readMcqTimer());

  // Re-read on every tick (1s) so the derived remaining time updates
  // smoothly. We don't setState unless something actually changed, to
  // avoid re-rendering the whole console twice per second.
  useEffect(() => {
    const fresh = readMcqTimer();
    if (!fresh) { setState(null); return; }
    // Auto-flip running → finished when endTime is reached.
    if (fresh.status === "running" && now >= fresh.endTime) {
      const finished: McqTimerState = { ...fresh, status: "finished", finishedAt: fresh.endTime };
      writeMcqTimer(finished);
      setState(finished);
      return;
    }
    // Only update if status/endTime/totalMs changed (shallow compare).
    setState(prev => {
      if (!prev) return fresh;
      if (prev.status !== fresh.status || prev.endTime !== fresh.endTime || prev.totalMs !== fresh.totalMs) return fresh;
      return prev;
    });
  }, [now]);

  // Cross-tab sync: when another tab changes the timer, the browser fires
  // a `storage` event HERE. Re-read immediately so this tab reflects the
  // change without waiting for the next 1s tick.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MCQ_TIMER_KEY) setState(readMcqTimer());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Derived remaining milliseconds (clamped to ≥ 0).
  const remainingMs = useMemo(() => {
    if (!state) return 0;
    if (state.status === "stopped") return Math.max(0, state.endTime - Date.now());
    if (state.status === "finished") return 0;
    // running
    return Math.max(0, state.endTime - Date.now());
  }, [state, now]);

  const start = useCallback((minutes: number) => {
    const totalMs = Math.max(1, Math.floor(minutes)) * 60 * 1000;
    const next: McqTimerState = {
      endTime: Date.now() + totalMs,
      totalMs,
      status: "running",
    };
    writeMcqTimer(next);
    setState(next);
  }, []);

  const stop = useCallback(() => {
    const cur = readMcqTimer();
    if (!cur) return;
    // Stop keeps the remaining time visible — we just freeze status.
    // To preserve "remaining time" on reload, store endTime as
    // (Date.now() + remainingMs) so when status is "stopped" the derived
    // remaining = endTime - Date.now() = remainingMs (assuming the user
    // reopens soon). This is approximate (drifts over time if left
    // stopped), but a stopped timer is meant to be reset, not left.
    const remaining = Math.max(0, cur.endTime - Date.now());
    const stopped: McqTimerState = {
      ...cur,
      endTime: Date.now() + remaining,
      status: "stopped",
    };
    writeMcqTimer(stopped);
    setState(stopped);
  }, []);

  const reset = useCallback(() => {
    writeMcqTimer(null);
    setState(null);
  }, []);

  return { state, remainingMs, start, stop, reset };
}

/** Format ms as M:SS or MM:SS — used by both the console display and the
 *  value sent to the 3D Hall. */
function formatMcqTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Types ──
interface LiveAttRow {
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
  seat_id: string | null;
  room_id: string | null;
  seat_label: string | null;
}

// ── Main component ──
const AdminExamConsole = () => {
  const [searchParams] = useSearchParams();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    searchParams.get("plan") ?? null
  );

  if (selectedPlanId) {
    return <ConsoleView planId={selectedPlanId} onBack={() => setSelectedPlanId(null)} />;
  }
  return <PlansPicker onOpenPlan={setSelectedPlanId} />;
};

// ────────────────────────────────────────────────────────────────────────────
// 1. PLANS PICKER
// ────────────────────────────────────────────────────────────────────────────
const PlansPicker = ({ onOpenPlan }: { onOpenPlan: (id: string) => void }) => {
  const { data: plans = [], isLoading } = useAllSeatingPlans();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
          <Monitor className="w-6 h-6 text-primary" /> Live Exam Console
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Live attendance dashboard for exam day
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Select a Plan to Monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : plans.length === 0 ? (
            <div className="text-center py-10">
              <Monitor className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-semibold text-foreground">No plans available</p>
              <p className="text-sm text-muted-foreground mt-1">
                Generate and publish a seating plan first to monitor it live.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {plans.map(p => (
                <button
                  key={p.id}
                  onClick={() => onOpenPlan(p.id)}
                  className="text-left p-4 rounded-xl border border-border hover:border-primary/40 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-sm text-foreground truncate">{p.title}</h3>
                    <Badge variant="secondary" className={
                      p.status === "published"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 shrink-0"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0"
                    }>
                      {p.status === "published" ? "Published" : "Generated"}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {p.paper_subject && <p className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {p.paper_subject}</p>}
                    {p.exam_date && <p className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {new Date(p.exam_date).toLocaleDateString()}</p>}
                    <p className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {p.total_seated} students seated</p>
                    {p.paper_start_at && (
                      <p className="flex items-center gap-1"><Clock className="w-3 h-3" /> Starts {new Date(p.paper_start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// 2. CONSOLE VIEW
// ────────────────────────────────────────────────────────────────────────────
const ConsoleView = ({ planId, onBack }: { planId: string; onBack: () => void }) => {
  const { data: plan, isLoading: loadingPlan } = useSeatingPlan(planId);
  const [threshold, setThreshold] = useState(20);
  const [now, setNow] = useState(Date.now());

  // Tick every second for countdowns.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── MCQ Timer (shared with 3D Hall via localStorage) ──────────────────────
  // Hooked to `now` so the displayed countdown updates every second.
  const mcqTimer = useMcqTimer(now);

  // Live attendance — filtered by exam_date + session_id + subject partial
  // match. This ensures the Live Console ONLY shows attendance that belongs
  // to THIS plan's session and THIS plan's paper — not stale rows from a
  // previous session, and not rows from a different paper earlier the same
  // day. Without this filter, the console would show non-zero counts even
  // before any attendance had been taken for this paper.
  //
  // ── RECURRING DATE RANGE (Problem 2 fix, rev. 2) ─────────────────────────
  // The plan can now have exam_date_from / exam_date_to. When today falls
  // within that range, the paper runs TODAY at the same time-of-day as
  // paper_start_at / paper_end_at. We use getEffectiveExamDate() which
  // returns TODAY when the plan's range includes today — so the Live
  // Console automatically shows today's countdown + attendance every day
  // of the exam window, without the admin needing to update anything.
  //
  // The countdown logic below uses paper_start_at / paper_end_at directly
  // (as Date objects). For recurring-range plans, those timestamps are on
  // the FIRST day of the range — so we shift them to TODAY before comparing
  // with `now`. This makes "Paper ends in 2h 15m" correct on every day of
  // the range, not just day 1.
  const examDate = plan ? getEffectiveExamDate(plan) : null;
  const sessionId = plan?.session_id;
  const paperSubject = plan?.paper_subject;
  const { data: attendance = [], isLoading: loadingAtt } = useLiveAttendance(examDate, sessionId, paperSubject);

  // ── TODAY-SHIFTED PAPER TIMES (Problem 2 fix) ────────────────────────────
  // For recurring-range plans, paper_start_at / paper_end_at are stored on
  // day 1 of the range. We shift their TIME-OF-DAY portions to TODAY so the
  // countdown shows the correct remaining time on every day of the range.
  // For single-day plans, this is a no-op (the date portions already match).
  const todayShiftedTimes = useMemo(() => {
    if (!plan?.paper_start_at || !plan?.paper_end_at) return { start: null as number | null, end: null as number | null };
    const ps = new Date(plan.paper_start_at);
    const pe = new Date(plan.paper_end_at);

    // ── FIX (rev. 4 — "shows paper time after range ended" bug) ─────────
    // Only shift to TODAY if today is actually within the plan's recurring
    // range [exam_date_from, exam_date_to]. Previously this shifted to
    // today's date unconditionally, so once the range ended (e.g. range
    // was 07/09-07/10 and today is 07/11), the console still built a
    // "today" start/end and showed "Paper ends in ..." forever instead of
    // "Paper ended". For single-day plans (no range), we always shift
    // (backward-compatible no-op since the date already matches).
    const fromStr = (plan as any).exam_date_from as string | null | undefined;
    const toStr   = (plan as any).exam_date_to   as string | null | undefined;
    if (fromStr && toStr) {
      const [fy, fm, fd] = fromStr.split("-").map(Number);
      const [ty, tm, td] = toStr.split("-").map(Number);
      if (fy && ty) {
        const fromDate = new Date(fy, fm - 1, fd);
        const toDate   = new Date(ty, tm - 1, td);
        const n = new Date();
        const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
        if (today.getTime() < fromDate.getTime() || today.getTime() > toDate.getTime()) {
          // Outside the recurring range - use the raw stored timestamps so
          // the countdown correctly resolves to "ended" (or "before-start"
          // if somehow before the range), instead of a phantom "today".
          return { start: ps.getTime(), end: pe.getTime() };
        }
      }
    }

    const now = new Date();
    const shiftedStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), ps.getHours(), ps.getMinutes(), 0, 0);
    const shiftedEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), pe.getHours(), pe.getMinutes(), 59, 999);
    return { start: shiftedStart.getTime(), end: shiftedEnd.getTime() };
  }, [plan?.paper_start_at, plan?.paper_end_at, (plan as any)?.exam_date_from, (plan as any)?.exam_date_to]);

  // ── Compute tally ──
  // Categories: Present (marked present), Absent (marked absent),
  // Leave (marked leave), NotMarked (no attendance row yet — WARNING).
  // No "Late" — that was causing manually-marked-present students to show
  // as Late just because scanned_at > paper_start_at.
  const tally = useMemo(() => {
    if (!plan) return { present: 0, absent: 0, leave: 0, notMarked: 0, total: 0, rooms: [] as any[] };

    // Build a per-student attendance map. A student might have multiple rows
    // if they were re-marked (e.g. corrected present -> absent after
    // extending the paper), or if useLiveAttendance's subject-fallback
    // returned rows for more than one paper on the same day. In BOTH cases
    // we must pick the MOST RECENT row, not the "best" status — picking by
    // status priority (present > leave > absent) meant a student marked
    // present once could never show as absent again even after a genuine
    // correction, which is what caused the console to keep showing 3/3
    // present after the admin re-marked a student absent post-extension.
    const rowTimestamp = (r: LiveAttRow) => r.scanned_at || (r as any).created_at || "";
    const attMap = new Map<string, LiveAttRow>();
    for (const a of attendance) {
      const existing = attMap.get(a.student_id);
      if (!existing || rowTimestamp(a) >= rowTimestamp(existing)) {
        attMap.set(a.student_id, a);
      }
    }

    // ── DIAGNOSTIC: log the student_id matching so we can see WHY students
    //    show as "Not Marked" even though attendance was taken. ──
    console.log("[AdminExamConsole] ── TALLY DIAGNOSTIC ──");
    console.log("[AdminExamConsole] Attendance rows received:", attendance.length);
    console.log("[AdminExamConsole] Unique students in attendance:", attMap.size);
    const allAssigns = plan.rooms.flatMap(r => r.assignments);
    console.log("[AdminExamConsole] Seating assignments:", allAssigns.length);
    const matchedStudents = allAssigns.filter(a => attMap.has(a.student_id));
    const unmatchedStudents = allAssigns.filter(a => !attMap.has(a.student_id));
    console.log("[AdminExamConsole] Matched (have attendance):", matchedStudents.length);
    console.log("[AdminExamConsole] Unmatched (Not Marked):", unmatchedStudents.length);
    if (unmatchedStudents.length > 0 && attendance.length > 0) {
      // Show the student_ids from both sides to see if they actually match
      console.log("[AdminExamConsole] Unmatched seating student_ids:", unmatchedStudents.map(a => a.student_id?.slice(0, 8) + "..."));
      console.log("[AdminExamConsole] Attendance student_ids:", Array.from(attMap.keys()).map(id => id?.slice(0, 8) + "..."));
    }

    let present = 0, absent = 0, leave = 0, notMarked = 0;
    const perRoom: Array<{ roomId: string; roomName: string; invigilator: string | null; present: number; absent: number; leave: number; notMarked: number; total: number }> = [];

    for (const room of plan.rooms) {
      let rp = 0, ra = 0, rv = 0, rn = 0;
      for (const assign of room.assignments) {
        const att = attMap.get(assign.student_id);
        if (att?.status === "present") {
          present++; rp++;
        } else if (att?.status === "leave") {
          leave++; rv++;
        } else if (att?.status === "absent") {
          absent++; ra++;
        } else {
          // No attendance row at all — not yet marked.
          notMarked++; rn++;
        }
      }
      perRoom.push({
        roomId: room.id, roomName: room.name, invigilator: room.invigilators?.length ? room.invigilators.join(", ") : room.invigilator,
        present: rp, absent: ra, leave: rv, notMarked: rn, total: room.assignments.length,
      });
    }

    const total = present + absent + leave + notMarked;
    console.log("[AdminExamConsole] Final tally:", { present, absent, leave, notMarked, total });
    return { present, absent, leave, notMarked, total, rooms: perRoom };
  }, [plan, attendance]);

  const absentPct = tally.total > 0 ? Math.round((tally.absent / tally.total) * 100) : 0;
  const thresholdBreached = absentPct > threshold && tally.total > 0;

  // ── Countdown logic ──
  // Uses the TODAY-SHIFTED times (rev. 2, Problem 2 fix) so that recurring-
  // range plans show the correct countdown on every day of the range, not
  // just day 1. For single-day plans the shifted times equal the original
  // times (same date), so this is backward-compatible.
  const startTime = todayShiftedTimes.start;
  const endTime = todayShiftedTimes.end;

  // ── NEXT PAPER DAY (rev. 3 — Problem "reset after paper ends" fix) ──────
  // For multi-day plans (exam_date_from → exam_date_to), after today's paper
  // ends the console should show "Time remaining to next paper" counting
  // down to TOMORROW's paper_start time — NOT "Paper ended Xm ago" forever.
  //
  // We compute the NEXT day in the range that is strictly AFTER today. If
  // the range has ended (today is the last day or past it), there is no
  // next paper day and the console falls back to the "ended" phase.
  //
  // For single-day plans (no range), this is null → the old "Paper ended"
  // behavior is preserved.
  const nextPaperDay = useMemo(() => {
    if (!plan) return null;
    const fromStr = (plan as any).exam_date_from as string | null | undefined;
    const toStr   = (plan as any).exam_date_to   as string | null | undefined;
    if (!fromStr || !toStr) return null;
    // Parse the range endpoints as local dates.
    const [fy, fm, fd] = fromStr.split("-").map(Number);
    const [ty, tm, td] = toStr.split("-").map(Number);
    if (!fy || !ty) return null;
    const fromDate = new Date(fy, fm - 1, fd);
    const toDate   = new Date(ty, tm - 1, td);
    // Today (local, date-only).
    const n = new Date();
    const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    // If today is the last day or past the range, no next paper day.
    if (today.getTime() >= toDate.getTime()) return null;
    // Next paper day = tomorrow (if today is within the range) or the
    // range start (if today is before the range).
    let candidate = new Date(today);
    candidate.setDate(candidate.getDate() + 1); // tomorrow
    // If tomorrow is before the range start, jump to the range start.
    if (candidate.getTime() < fromDate.getTime()) candidate = new Date(fromDate);
    return candidate; // a Date at 00:00 local on the next paper day
  }, [plan]);

  // The start time of the NEXT paper day (tomorrow's 9 AM, etc.) — used
  // for the "Time remaining to next paper" countdown.
  const nextPaperStartTime = useMemo(() => {
    if (!nextPaperDay || !plan?.paper_start_at) return null;
    const ps = new Date(plan.paper_start_at);
    // Build a Date for nextPaperDay at the same TIME-OF-DAY as paper_start_at.
    return new Date(
      nextPaperDay.getFullYear(),
      nextPaperDay.getMonth(),
      nextPaperDay.getDate(),
      ps.getHours(),
      ps.getMinutes(),
      0,
      0
    ).getTime();
  }, [nextPaperDay, plan?.paper_start_at]);

  const countdown = useMemo(() => {
    if (!startTime && !endTime) return { phase: "no-times" as const, label: "No paper times set", value: "", color: "text-muted-foreground" };
    if (startTime && now < startTime) {
      return { phase: "before-start" as const, label: "Paper starts in", value: formatDuration(startTime - now), color: "text-blue-600 dark:text-blue-400" };
    }
    if (endTime && now < endTime) {
      return { phase: "during" as const, label: "Paper ends in", value: formatDuration(endTime - now), color: "text-emerald-600 dark:text-emerald-400" };
    }
    // ── Paper has ended (now >= endTime) ──
    // For multi-day plans with a next paper day, show "Time remaining to
    // next paper" counting down to tomorrow's start time. This is the
    // behavior the admin asked for: after today's paper ends, the console
    // resets and counts down to tomorrow's paper.
    if (nextPaperStartTime && now < nextPaperStartTime) {
      return { phase: "before-next-paper" as const, label: "Time remaining to next paper", value: formatDuration(nextPaperStartTime - now), color: "text-blue-600 dark:text-blue-400" };
    }
    if (endTime && now >= endTime) {
      return { phase: "ended" as const, label: "Paper ended", value: formatDuration(now - endTime) + " ago", color: "text-muted-foreground" };
    }
    if (startTime && now >= startTime) {
      return { phase: "during" as const, label: "Paper in progress", value: "No end time set", color: "text-amber-600 dark:text-amber-400" };
    }
    return { phase: "no-times" as const, label: "No paper times set", value: "", color: "text-muted-foreground" };
  }, [startTime, endTime, now, nextPaperStartTime]);

  if (loadingPlan || !plan) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4" /> Back</Button>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  // Live attendance requires an effective exam date (mandatory), plus
  // session_id and paper_subject for proper filtering. session_id is always
  // present on a generated plan; paper_subject may be blank if the admin
  // skipped it. The effective date is derived from exam_date_from/to range
  // (today if in range), or paper_start_at (recurring), or exam_date.
  const missingPaperInfo = !examDate;

  return (
    <div className="space-y-5">
      {/* ── Header (stacks vertically on mobile) ── */}
      <div className="space-y-2">
        {/* Row 1: Back + Title + LIVE + Paper Times */}
        <div className="flex items-start gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0 px-2">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg sm:text-xl font-heading font-bold text-foreground break-words flex-1 min-w-[140px]">
            {plan.title}
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium shrink-0 mt-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            LIVE
          </div>
          <PaperTimesEditor plan={plan} />
        </div>
        {/* Row 2: metadata */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground pl-10">
          {plan.paper_subject && <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {plan.paper_subject}</span>}
          {plan.exam_date && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {new Date(plan.exam_date).toLocaleDateString()}</span>}
          <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {plan.rooms.length} rooms</span>
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {tally.total} students</span>
        </div>
      </div>

      {/* ── Missing info warning ── */}
      {missingPaperInfo && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Exam date is not set on this plan
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Live attendance matching requires the exam date. Set it in the Exam Seating tab (edit the plan) or use the Paper Times button above.
            </p>
          </div>
        </div>
      )}

      {/* ── Single countdown card ── */}
      <Card className={
        countdown.phase === "before-start" ? "ring-2 ring-blue-500/50" :
        countdown.phase === "during" ? "ring-2 ring-emerald-500/50" :
        countdown.phase === "ended" ? "ring-2 ring-muted-foreground/30" : ""
      }>
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Phase label + countdown */}
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                {countdown.phase === "before-start" && <Clock className="w-4 h-4" />}
                {countdown.phase === "during" && <Timer className="w-4 h-4" />}
                {countdown.phase === "ended" && <CheckCircle2 className="w-4 h-4" />}
                {countdown.phase === "no-times" && <Clock className="w-4 h-4" />}
                {countdown.label}
              </p>
              <p className={`text-5xl font-bold font-mono ${countdown.color}`}>
                {countdown.value || "—"}
              </p>
            </div>
            {/* Start + End times */}
            <div className="flex flex-col gap-2 text-xs">
              {plan.paper_start_at && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wider text-[10px] w-10">Start</span>
                  <span className="text-foreground font-medium">
                    {new Date(plan.paper_start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )}
              {plan.paper_end_at && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wider text-[10px] w-10">End</span>
                  <span className="text-foreground font-medium">
                    {new Date(plan.paper_end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )}
              {!plan.paper_start_at && !plan.paper_end_at && (
                <p className="text-muted-foreground">Use "Paper Times" to set start/end</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── MCQ Timer card ─────────────────────────────────────────────────────
          Shows the live MCQ countdown (MM:SS) when running/stopped, plus the
          "Start Timer" / "Stop" / "Reset" controls. When finished, the card
          flashes red to mirror the 3D Hall siren. Mobile-friendly: the
          countdown takes full width on small screens, controls wrap below. */}
      <McqTimerCard timer={mcqTimer} />

      {/* ── Next-paper reset banner (shown after today's paper ends, for multi-day plans) ── */}
      {countdown.phase === "before-next-paper" && nextPaperDay && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700/50 rounded-xl p-4 flex items-start gap-3">
          <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-blue-800 dark:text-blue-300">
              Today's paper has ended — console reset for tomorrow
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
              Today's attendance is saved. The tally below shows today's final numbers for reference.
              When the next paper starts on <strong>{nextPaperDay.toLocaleDateString()}</strong> at{" "}
              <strong>{plan.paper_start_at ? new Date(plan.paper_start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</strong>,
              the console will automatically show fresh attendance for that paper.
            </p>
          </div>
        </div>
      )}

      {/* ── Threshold alert ── */}
      {thresholdBreached && countdown.phase !== "before-next-paper" && (
        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700/50 rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-800 dark:text-red-300">
              HIGH ABSENCE ALERT
            </p>
            <p className="text-xs text-red-700 dark:text-red-400">
              {tally.absent} of {tally.total} students absent ({absentPct}%) — threshold is {threshold}%
            </p>
          </div>
        </div>
      )}

      {/* ── Tally cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <TallyCard icon={<CheckCircle2 className="w-5 h-5" />} label="Present" value={tally.present} total={tally.total} color="text-emerald-600" bg="bg-emerald-500/10" />
        <TallyCard icon={<XCircle className="w-5 h-5" />} label="Absent" value={tally.absent} total={tally.total} color="text-red-600" bg="bg-red-500/10" highlight={thresholdBreached} />
        <TallyCard icon={<Palmtree className="w-5 h-5" />} label="Leave" value={tally.leave} total={tally.total} color="text-blue-600" bg="bg-blue-500/10" />
        <TallyCard icon={<AlertTriangle className="w-5 h-5" />} label="Not Marked" value={tally.notMarked} total={tally.total} color="text-amber-600" bg="bg-amber-500/10" highlight={tally.notMarked > 0} />
        <TallyCard icon={<Users className="w-5 h-5" />} label="Total" value={tally.total} total={tally.total} color="text-foreground" bg="bg-secondary" />
      </div>

      {/* ── Threshold slider ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Absent Threshold</Label>
              <p className="text-2xl font-bold text-foreground mt-0.5">{threshold}%</p>
            </div>
            <div className="flex-1 min-w-[200px] max-w-md">
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={threshold}
                onChange={e => setThreshold(+e.target.value)}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>5%</span><span>20%</span><span>50%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Alert triggers when absent % exceeds this threshold
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Per-room breakdown ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Per-Room Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tally.rooms.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No rooms in this plan</p>
          ) : (
            <div className="space-y-2">
              {tally.rooms.map(r => {
                const roomPct = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0;
                const roomAbsentPct = r.total > 0 ? Math.round((r.absent / r.total) * 100) : 0;
                const roomBreached = roomAbsentPct > threshold && r.total > 0;
                return (
                  <div
                    key={r.roomId}
                    className={`rounded-lg border p-3 ${roomBreached ? "border-red-300 dark:border-red-700/50 bg-red-50/50 dark:bg-red-900/10" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{r.roomName}</span>
                        {r.invigilator && <Badge variant="outline" className="text-[10px]">{r.invigilator}</Badge>}
                        {roomBreached && <Badge variant="destructive" className="text-[10px]">⚠ {roomAbsentPct}% absent</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">P: {r.present}</span>
                        <span className="text-red-600 dark:text-red-400 font-semibold">A: {r.absent}</span>
                        <span className="text-blue-600 dark:text-blue-400 font-semibold">Lv: {r.leave}</span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">NM: {r.notMarked}</span>
                        <span className="text-muted-foreground font-semibold">T: {r.total}</span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-2 rounded-full bg-secondary overflow-hidden flex">
                      <div className="bg-emerald-500" style={{ width: `${r.total > 0 ? (r.present / r.total) * 100 : 0}%` }} title={`Present: ${r.present}`} />
                      <div className="bg-red-500" style={{ width: `${r.total > 0 ? (r.absent / r.total) * 100 : 0}%` }} title={`Absent: ${r.absent}`} />
                      <div className="bg-blue-500" style={{ width: `${r.total > 0 ? (r.leave / r.total) * 100 : 0}%` }} title={`Leave: ${r.leave}`} />
                      <div className="bg-amber-500" style={{ width: `${r.total > 0 ? (r.notMarked / r.total) * 100 : 0}%` }} title={`Not Marked: ${r.notMarked}`} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{roomPct}% present</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Actions ── */}
      <div className="flex flex-wrap gap-2">
        <AbsenteePdfButton plan={plan} attendance={attendance} tally={tally} />
        <McqTimerButton timer={mcqTimer} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>
    </div>
  );
};

// ── Tally card ──
const TallyCard = ({ icon, label, value, total, color, bg, highlight }: {
  icon: React.ReactNode; label: string; value: number; total: number;
  color: string; bg: string; highlight?: boolean;
}) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Card className={highlight ? "ring-2 ring-red-500" : ""}>
      <CardContent className="p-4">
        <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center ${color} mb-2`}>
          {icon}
        </div>
        <p className="text-3xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label} · {pct}%</p>
      </CardContent>
    </Card>
  );
};

// ── Paper times editor dialog ──
const PaperTimesEditor = ({ plan }: { plan: SeatingPlanFull }) => {
  const updateMut = useUpdatePaperTimes();
  const [open, setOpen] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  // New (Problem 2 fix): recurring date range. When both are set, the paper
  // times above apply to EVERY day in [from, to]. The Live Console + Exam
  // Attendance automatically treat each day in the range as a paper day.
  const [examDateFrom, setExamDateFrom] = useState("");
  const [examDateTo, setExamDateTo] = useState("");

  // Pre-fill from plan when dialog opens.
  useEffect(() => {
    if (open) {
      const toLocal = (iso: string | null) => {
        if (!iso) return "";
        const d = new Date(iso);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      setStartAt(toLocal(plan.paper_start_at));
      setEndAt(toLocal(plan.paper_end_at));
      // exam_date_from / exam_date_to are plain date strings (YYYY-MM-DD)
      // or null. The plan object may not have them if the DB hasn't been
      // migrated yet — guard with optional chaining + fallback to "".
      setExamDateFrom((plan as any).exam_date_from ?? "");
      setExamDateTo((plan as any).exam_date_to ?? "");
    }
  }, [open, plan.paper_start_at, plan.paper_end_at, (plan as any).exam_date_from, (plan as any).exam_date_to]);

  const handleSave = async () => {
    try {
      await updateMut.mutateAsync({
        planId: plan.id,
        paperStartAt: startAt ? new Date(startAt).toISOString() : null,
        paperEndAt: endAt ? new Date(endAt).toISOString() : null,
        // Pass the date range as YYYY-MM-DD strings (or null if empty).
        examDateFrom: examDateFrom || null,
        examDateTo: examDateTo || null,
      });
      setOpen(false);
    } catch { /* handled in hook */ }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="w-3.5 h-3.5" /> Paper Times
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Set Paper Times</AlertDialogTitle>
          <AlertDialogDescription>
            Used by the console for paper-start and paper-end countdowns. Set a date range to make the paper run at the same time every day.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Paper Start</Label>
              <Input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Paper End</Label>
              <Input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} className="mt-1 h-9 text-sm" />
            </div>
          </div>
          {/* ── Recurring date range (Problem 2 fix) ── */}
          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">Recurring Paper Days (optional)</p>
            <p className="text-[11px] text-muted-foreground">
              Set a date range and the paper will run at the same start/end TIME every day in that range.
              The Live Console and Exam Attendance automatically use today's date when it falls within the range —
              no need to update anything each morning.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">From (first paper day)</Label>
                <Input type="date" value={examDateFrom} onChange={e => setExamDateFrom(e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">To (last paper day)</Label>
                <Input type="date" value={examDateTo} onChange={e => setExamDateTo(e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
            </div>
            {examDateFrom && examDateTo && examDateFrom > examDateTo && (
              <p className="text-[11px] text-red-500 font-semibold">⚠ "From" date must be before or equal to "To" date.</p>
            )}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSave} disabled={updateMut.isPending}>
            {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Save
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// ── Absentee PDF button ──
const AbsenteePdfButton = ({ plan, attendance, tally }: {
  plan: SeatingPlanFull;
  attendance: LiveAttRow[];
  tally: { present: number; late: number; absent: number; leave: number; total: number };
}) => {
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    try {
      // Build the absentee list: any student with no attendance row (Not Marked),
      // OR status='absent', OR status='leave'.
      // Same fix as the tally: pick the MOST RECENT row per student, not
      // the "best" status, so a corrected re-mark (e.g. present -> absent
      // after extending the paper) is reflected here too.
      const rowTimestamp = (r: LiveAttRow) => r.scanned_at || (r as any).created_at || "";
      const attMap = new Map<string, LiveAttRow>();
      for (const a of attendance) {
        const existing = attMap.get(a.student_id);
        if (!existing || rowTimestamp(a) >= rowTimestamp(existing)) {
          attMap.set(a.student_id, a);
        }
      }

      const absentees: Array<{
        room_name: string; invigilator: string | null; seat_label: string;
        student_name: string; exam_roll_no: string; class: string; class_roll_no: string;
        status: "absent" | "leave" | "not-scanned";
      }> = [];

      for (const room of plan.rooms) {
        for (const assign of room.assignments) {
          const att = attMap.get(assign.student_id);
          if (!att || att.status === "absent") {
            absentees.push({
              room_name: room.name, invigilator: room.invigilators?.length ? room.invigilators.join(", ") : room.invigilator, seat_label: assign.seat_label,
              student_name: assign.student_name, exam_roll_no: assign.exam_roll_no,
              class: assign.class, class_roll_no: assign.class_roll_no,
              status: att?.status === "absent" ? "absent" : "not-scanned",
            });
          } else if (att.status === "leave") {
            absentees.push({
              room_name: room.name, invigilator: room.invigilators?.length ? room.invigilators.join(", ") : room.invigilator, seat_label: assign.seat_label,
              student_name: assign.student_name, exam_roll_no: assign.exam_roll_no,
              class: assign.class, class_roll_no: assign.class_roll_no,
              status: "leave",
            });
          }
        }
      }

      if (absentees.length === 0) {
        toast.success("No absentees — everyone is present! 🎉");
        setBusy(false);
        return;
      }

      // Sort by room → seat label.
      absentees.sort((a, b) => a.room_name.localeCompare(b.room_name) || a.seat_label.localeCompare(b.seat_label));

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();

      // ── Header ──
      doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30);
      doc.text("Absentee List — Re-Exam Approval", pageW / 2, 16, { align: "center" });
      doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(80);
      doc.text(plan.title, pageW / 2, 22, { align: "center" });
      let subtitle = "";
      if (plan.paper_subject) subtitle += plan.paper_subject;
      if (plan.exam_date) subtitle += (subtitle ? " · " : "") + new Date(plan.exam_date).toLocaleDateString();
      if (subtitle) doc.text(subtitle, pageW / 2, 27, { align: "center" });

      // ── Summary box ──
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(14, 32, pageW - 28, 16, 1.5, 1.5, "F");
      doc.setFontSize(8); doc.setTextColor(80); doc.setFont("helvetica", "normal");
      const absentPct = tally.total > 0 ? Math.round((tally.absent / tally.total) * 100) : 0;
      doc.text(
        `Total: ${tally.total}  ·  Present: ${tally.present}  ·  Absent: ${tally.absent} (${absentPct}%)  ·  Leave: ${tally.leave}  ·  Not Marked: ${tally.notMarked}`,
        pageW / 2, 41, { align: "center" }
      );

      // ── Table grouped by room ──
      autoTable(doc, {
        startY: 52,
        head: [["Room", "Seat", "Exam Roll", "Student Name", "Class", "Class Roll", "Invigilator", "Status"]],
        body: absentees.map(a => [
          a.room_name, a.seat_label, a.exam_roll_no, a.student_name,
          `Class ${a.class}`, a.class_roll_no, a.invigilator ?? "—",
          a.status === "leave" ? "Leave" : a.status === "absent" ? "Absent" : "Not Marked",
        ]),
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [180, 40, 40], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [252, 245, 245] },
        didDrawPage: (data) => {
          // Footer
          doc.setFontSize(6); doc.setTextColor(140);
          doc.text(
            `Generated ${new Date().toLocaleString()}  ·  GHS Babi Khel Exam Seating Engine  ·  Page ${data.pageNumber}`,
            pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" }
          );
        },
      });

      // ── Signature lines (on the last page) ──
      const lastY = (doc as any).lastAutoTable?.finalY ?? 60;
      const sigY = Math.min(lastY + 20, doc.internal.pageSize.getHeight() - 30);
      doc.setDrawColor(120); doc.setLineWidth(0.3);
      doc.line(20, sigY, 80, sigY);
      doc.line(pageW - 80, sigY, pageW - 20, sigY);
      doc.setFontSize(7); doc.setTextColor(80); doc.setFont("helvetica", "normal");
      doc.text("Invigilator Signature", 50, sigY + 5, { align: "center" });
      doc.text("Principal Signature", pageW - 50, sigY + 5, { align: "center" });

      doc.save(`Absentees-${plan.title.replace(/\s+/g, "_")}.pdf`);
      toast.success(`Absentee PDF downloaded — ${absentees.length} student${absentees.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error("Failed: " + (e?.message ?? ""));
    }
    setBusy(false);
  };

  return (
    <Button onClick={handle} disabled={busy} variant="default" size="sm">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      Download Absentee PDF
    </Button>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MCQ Timer — Start button (opens minutes dialog) + Stop/Reset quick actions
// ────────────────────────────────────────────────────────────────────────────
// Lives in the console's Actions row. When the timer is running/stopped, the
// button shows the live MM:SS countdown inline + a Stop action. When idle,
// it shows "MCQ Timer" and opens a small dialog where the admin types the
// number of minutes (e.g. 15) and hits Start. The dialog also offers common
// quick-pick chips (5 / 10 / 15 / 20 / 30 / 60) so on mobile the admin
// doesn't have to type at all — one tap and Start.
type McqTimerApi = ReturnType<typeof useMcqTimer>;

const QUICK_MINUTES = [5, 10, 15, 20, 30, 45, 60];

function McqTimerButton({ timer }: { timer: McqTimerApi }) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("15");

  const { state, remainingMs, start, stop, reset } = timer;
  const isLive = state && (state.status === "running" || state.status === "stopped");
  const isFinished = state?.status === "finished";

  const handleStart = () => {
    const m = parseInt(minutes, 10);
    if (!Number.isFinite(m) || m < 1 || m > 600) {
      toast.error("Enter minutes between 1 and 600");
      return;
    }
    start(m);
    toast.success(`MCQ timer started — ${m} min`);
    setOpen(false);
  };

  // ── Idle state: show "MCQ Timer" button that opens the dialog ──
  if (!state) {
    return (
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Timer className="w-3.5 h-3.5" /> MCQ Timer
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-primary" /> Start MCQ Timer
            </AlertDialogTitle>
            <AlertDialogDescription>
              Set a countdown for an MCQ paper. The remaining time shows on this console
              AND inside the 3D Hall screen. When it reaches zero, the 3D Hall screen
              fires a red siren overlay for 15 seconds.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-1">
            {/* Minutes input */}
            <div>
              <Label className="text-xs">Minutes</Label>
              <Input
                type="number"
                min={1}
                max={600}
                value={minutes}
                onChange={e => setMinutes(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleStart(); }}
                className="mt-1 h-10 text-lg font-bold text-center"
                autoFocus
              />
            </div>

            {/* Quick-pick chips */}
            <div>
              <p className="text-[11px] text-muted-foreground mb-1.5">Quick pick:</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_MINUTES.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMinutes(String(m))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      minutes === String(m)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:bg-secondary/70"
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStart}>
              <Play className="w-4 h-4 mr-1" /> Start
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // ── Live/finished state: show countdown + Stop/Reset inline ──
  // Mobile: text is "MM:SS" only (label hidden). Desktop: "MCQ MM:SS".
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 p-0.5">
      <div className={`px-2.5 py-1.5 text-sm font-mono font-bold flex items-center gap-1.5 rounded ${
        isFinished
          ? "text-red-600 dark:text-red-400 animate-pulse"
          : state.status === "running"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-amber-600 dark:text-amber-400"
      }`}>
        <Timer className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">MCQ</span>
        <span>{isFinished ? "00:00" : formatMcqTime(remainingMs)}</span>
      </div>
      {state.status === "running" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => { stop(); toast("MCQ timer stopped"); }}
          title="Stop timer"
        >
          <Square className="w-3 h-3" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => { reset(); toast.success("MCQ timer reset"); }}
        title="Reset timer"
      >
        <RotateCcw className="w-3 h-3" />
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MCQ Timer — Big countdown card (shown above the tally cards)
// ────────────────────────────────────────────────────────────────────────────
// A dedicated full-width card so the countdown is easy to read from across
// the exam hall. Red-pulsing border when finished (matches the 3D Hall
// siren). Hidden entirely when the timer is idle — the small button in the
// Actions row is enough in that state.
function McqTimerCard({ timer }: { timer: McqTimerApi }) {
  const { state, remainingMs, stop, reset } = timer;
  if (!state) return null;

  const isFinished = state.status === "finished";
  const isRunning = state.status === "running";
  const totalMin = Math.round(state.totalMs / 60000);

  // Progress 0..1 (how much time has elapsed).
  const elapsedMs = state.totalMs - remainingMs;
  const pct = state.totalMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / state.totalMs) * 100)) : 0;

  return (
    <Card className={
      isFinished
        ? "ring-4 ring-red-500 animate-pulse border-red-400"
        : isRunning
        ? "ring-2 ring-emerald-500/50"
        : "ring-2 ring-amber-500/40"
    }>
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Left: label + big countdown */}
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center gap-2 uppercase tracking-wider font-semibold">
              <Timer className="w-4 h-4" />
              MCQ Timer{totalMin > 0 ? ` · ${totalMin} min` : ""}
              {state.status === "stopped" && <span className="text-amber-600 dark:text-amber-400 normal-case tracking-normal">· paused</span>}
              {isFinished && <span className="text-red-600 dark:text-red-400 normal-case tracking-normal">· time up</span>}
            </p>
            <p className={`text-6xl sm:text-7xl font-bold font-mono leading-none ${
              isFinished ? "text-red-600 dark:text-red-400" : isRunning ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
            }`}>
              {isFinished ? "00:00" : formatMcqTime(remainingMs)}
            </p>
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-2 shrink-0">
            {isRunning && (
              <Button variant="outline" size="sm" onClick={() => { stop(); toast("MCQ timer stopped"); }}>
                <Square className="w-3.5 h-3.5" /> Stop
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => { reset(); toast.success("MCQ timer reset"); }}>
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 w-full h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              isFinished ? "bg-red-500" : isRunning ? "bg-emerald-500" : "bg-amber-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Helper text — what happens at zero */}
        <p className="text-[11px] text-muted-foreground mt-2">
          {isFinished
            ? "🚨 Time is up — the 3D Hall screen is showing a red siren for 15 seconds. Tap Reset to clear."
            : isRunning
            ? "When this reaches zero, the 3D Hall screen will fire a red siren overlay for 15 seconds."
            : "Timer is paused. Tap Reset to clear, or set a new timer from the MCQ Timer button."}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Helpers ──
function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default AdminExamConsole;
