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
 *
 * Navigation: Admin → STUDENTS → 🖥️ Live Exam Console
 */
import { useState, useEffect, useMemo } from "react";
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
  Settings2,
} from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  useAllSeatingPlans, useSeatingPlan, useLiveAttendance, useUpdatePaperTimes,
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

  // Live attendance — filtered by exam_date + session_id + subject partial
  // match. This ensures the Live Console ONLY shows attendance that belongs
  // to THIS plan's session and THIS plan's paper — not stale rows from a
  // previous session, and not rows from a different paper earlier the same
  // day. Without this filter, the console would show non-zero counts even
  // before any attendance had been taken for this paper.
  const examDate = plan?.exam_date;
  const sessionId = plan?.session_id;
  const paperSubject = plan?.paper_subject;
  const { data: attendance = [], isLoading: loadingAtt } = useLiveAttendance(examDate, sessionId, paperSubject);

  // ── Compute tally ──
  // Categories: Present (marked present), Absent (marked absent),
  // Leave (marked leave), NotMarked (no attendance row yet — WARNING).
  // No "Late" — that was causing manually-marked-present students to show
  // as Late just because scanned_at > paper_start_at.
  const tally = useMemo(() => {
    if (!plan) return { present: 0, absent: 0, leave: 0, notMarked: 0, total: 0, rooms: [] as any[] };

    // Build a per-student attendance map. A student might have multiple rows
    // (different papers on the same day). We prefer 'present' > 'leave' > 'absent'.
    const priority: Record<string, number> = { present: 3, leave: 2, absent: 1 };
    const attMap = new Map<string, LiveAttRow>();
    for (const a of attendance) {
      const existing = attMap.get(a.student_id);
      if (!existing) {
        attMap.set(a.student_id, a);
      } else {
        const aP = priority[a.status] ?? 0;
        const eP = priority[existing.status] ?? 0;
        if (aP > eP) {
          attMap.set(a.student_id, a);
        }
      }
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
        roomId: room.id, roomName: room.name, invigilator: room.invigilator,
        present: rp, absent: ra, leave: rv, notMarked: rn, total: room.assignments.length,
      });
    }

    const total = present + absent + leave + notMarked;
    return { present, absent, leave, notMarked, total, rooms: perRoom };
  }, [plan, attendance]);

  const absentPct = tally.total > 0 ? Math.round((tally.absent / tally.total) * 100) : 0;
  const thresholdBreached = absentPct > threshold && tally.total > 0;

  // ── Countdown logic ──
  const startTime = plan?.paper_start_at ? new Date(plan.paper_start_at).getTime() : null;
  const endTime = plan?.paper_end_at ? new Date(plan.paper_end_at).getTime() : null;

  const countdown = useMemo(() => {
    if (!startTime && !endTime) return { phase: "no-times" as const, label: "No paper times set", value: "", color: "text-muted-foreground" };
    if (startTime && now < startTime) {
      return { phase: "before-start" as const, label: "Paper starts in", value: formatDuration(startTime - now), color: "text-blue-600 dark:text-blue-400" };
    }
    if (endTime && now < endTime) {
      return { phase: "during" as const, label: "Paper ends in", value: formatDuration(endTime - now), color: "text-emerald-600 dark:text-emerald-400" };
    }
    if (endTime && now >= endTime) {
      return { phase: "ended" as const, label: "Paper ended", value: formatDuration(now - endTime) + " ago", color: "text-muted-foreground" };
    }
    if (startTime && now >= startTime) {
      return { phase: "during" as const, label: "Paper in progress", value: "No end time set", color: "text-amber-600 dark:text-amber-400" };
    }
    return { phase: "no-times" as const, label: "No paper times set", value: "", color: "text-muted-foreground" };
  }, [startTime, endTime, now]);

  if (loadingPlan || !plan) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4" /> Back</Button>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  // Live attendance requires exam_date (mandatory), plus session_id and
  // paper_subject for proper filtering. session_id is always present on a
  // generated plan; paper_subject may be blank if the admin skipped it.
  const missingPaperInfo = !plan.exam_date;

  return (
    <div className="space-y-5">
      {/* ── Header (stacks vertically on mobile) ── */}
      <div className="space-y-2">
        {/* Row 1: Back + Title + LIVE + Paper Times */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0 px-2">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg sm:text-xl font-heading font-bold text-foreground truncate flex-1 min-w-0">
            {plan.title}
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium shrink-0">
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

      {/* ── Threshold alert ── */}
      {thresholdBreached && (
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
    }
  }, [open, plan.paper_start_at, plan.paper_end_at]);

  const handleSave = async () => {
    try {
      await updateMut.mutateAsync({
        planId: plan.id,
        paperStartAt: startAt ? new Date(startAt).toISOString() : null,
        paperEndAt: endAt ? new Date(endAt).toISOString() : null,
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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Set Paper Times</AlertDialogTitle>
          <AlertDialogDescription>
            Used by the console for paper-start and paper-end countdowns.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Paper Start</Label>
            <Input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} className="mt-1 h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Paper End</Label>
            <Input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} className="mt-1 h-9 text-sm" />
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
      // Same priority logic as the tally (present > leave > absent).
      const priority: Record<string, number> = { present: 3, leave: 2, absent: 1 };
      const attMap = new Map<string, LiveAttRow>();
      for (const a of attendance) {
        const existing = attMap.get(a.student_id);
        if (!existing) {
          attMap.set(a.student_id, a);
        } else {
          const aP = priority[a.status] ?? 0;
          const eP = priority[existing.status] ?? 0;
          if (aP > eP) {
            attMap.set(a.student_id, a);
          }
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
              room_name: room.name, invigilator: room.invigilator, seat_label: assign.seat_label,
              student_name: assign.student_name, exam_roll_no: assign.exam_roll_no,
              class: assign.class, class_roll_no: assign.class_roll_no,
              status: att?.status === "absent" ? "absent" : "not-scanned",
            });
          } else if (att.status === "leave") {
            absentees.push({
              room_name: room.name, invigilator: room.invigilator, seat_label: assign.seat_label,
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
