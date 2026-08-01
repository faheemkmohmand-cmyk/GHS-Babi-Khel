/**
 * AdminExamSeating.tsx
 * Exam Seating Plan Engine — admin tab.
 *
 * Capabilities:
 *  1. Create a seating plan tied to an existing exam session.
 *  2. Define rooms (name, rows × cols grid, blocked cells, invigilator).
 *  3. Auto-generate seating — anti-cheat class mixing (no two same-class
 *     students sit orthogonally adjacent), respects capacity, snake-fill
 *     desk order.
 *  4. View per-room desk-layout grid (color-coded by class).
 *  5. Print desk-layout map (PDF) per room — for pasting on the hall wall.
 *  6. Print/export "Roll No → Seat → Room" lookup (PDF + CSV). 
 *  7. Print per-desk QR sticker sheet (PDF) — one sticker per desk so
 *     invigilators can scan to mark attendance against that exact seat.
 *  8. Publish the plan so students can look up their own seat.
 *
 * Integrates with the existing exam_roll_sessions table (no schema change
 * to existing tables — only adds the three new seating_* tables).
 */
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  LayoutGrid, Plus, Trash2, Loader2, RefreshCw, Printer, Wand2, Send, ArrowLeft,
  Building2, Users, AlertTriangle, CheckCircle2, Grid3x3, Tag, FileText, Search, Monitor,
  CalendarDays, Boxes,
} from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import AdminExamConsole from "./AdminExamConsole";
import Hall3DView from "@/components/exam-seating/Hall3DView";
import {
  useExamSessions,
} from "@/hooks/useExamAttendance";
import { useAllExamSchedule, type ExamScheduleEntry } from "@/hooks/useNewFeatures";
import {
  useSeatingPlans, useSeatingPlan,
  useCreateSeatingPlan, useDeleteSeatingPlan, useUpsertRoom, useDeleteRoom,
  useGenerateSeating, usePublishSeatingPlan, useUpdateSeatingPlanStaff,
  autoSplitColDuties, resolveColDuties,
  resolveClassPaperTime, listPlanPaperTimes,
  SUPERINTENDENT_DUTY, DEPUTY_SUPERINTENDENT_DUTY, INVIGILATOR_DUTY,
  type SeatingRoom, type RoomWithAssignments, type SeatingPlanFull, type ClassPaperTime,
} from "@/hooks/useExamSeating";

// Distinct, accessible colors for up to 8 classes. Beyond 8, fall back to a hash.
const CLASS_COLORS: Record<string, { bg: string; text: string; pdfRgb: [number, number, number] }> = {
  "6":  { bg: "bg-blue-100 dark:bg-blue-900/40",       text: "text-blue-700 dark:text-blue-300",       pdfRgb: [219, 234, 254] },
  "7":  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", pdfRgb: [209, 250, 229] },
  "8":  { bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300",     pdfRgb: [254, 243, 199] },
  "9":  { bg: "bg-rose-100 dark:bg-rose-900/40",       text: "text-rose-700 dark:text-rose-300",       pdfRgb: [254, 205, 211] },
  "10": { bg: "bg-violet-100 dark:bg-violet-900/40",   text: "text-violet-700 dark:text-violet-300",   pdfRgb: [237, 233, 254] },
};
const colorFor = (cls: string) =>
  CLASS_COLORS[cls] ?? { bg: "bg-slate-100 dark:bg-slate-900/40", text: "text-slate-700 dark:text-slate-300", pdfRgb: [226, 232, 240] };

// ────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────────────────────
const AdminExamSeating = () => {
  const [topTab, setTopTab] = useState<"seating" | "console">("seating");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(undefined);

  return (
    <div className="space-y-4">
      {/* Mobile-friendly pill toggle — mirrors the pattern used in Exam Attendance / Announcements */}
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
        <button onClick={() => setTopTab("seating")}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            topTab === "seating" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}>
          <LayoutGrid className="w-3.5 h-3.5" /> Seating Plans
        </button>
        <button onClick={() => setTopTab("console")}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            topTab === "console" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}>
          <Monitor className="w-3.5 h-3.5" /> Live Console
        </button>
      </div>

      {topTab === "console" ? (
        <AdminExamConsole />
      ) : selectedPlanId ? (
        <PlanEditor planId={selectedPlanId} onBack={() => setSelectedPlanId(null)} />
      ) : (
        <PlansList selectedSessionId={selectedSessionId} setSelectedSessionId={setSelectedSessionId} onOpenPlan={setSelectedPlanId} />
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// 1. PLANS LIST
// ────────────────────────────────────────────────────────────────────────────
const PlansList = ({
  selectedSessionId, setSelectedSessionId, onOpenPlan,
}: {
  selectedSessionId: string | undefined;
  setSelectedSessionId: (id: string | undefined) => void;
  onOpenPlan: (id: string) => void;
}) => {
  const { data: sessions = [], isLoading: loadingSessions } = useExamSessions();
  const { data: plans = [], isLoading: loadingPlans } = useSeatingPlans(selectedSessionId);

  // Pick the most recent session by default.
  const effectiveSessionId = selectedSessionId ?? sessions[0]?.id;
  const { data: plansForDefault = [] } = useSeatingPlans(effectiveSessionId);

  const plansToShow = selectedSessionId ? plans : plansForDefault;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-primary" /> Exam Seating Plans
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Auto-generate room-wise seating with anti-cheat class mixing and per-desk QR codes
          </p>
        </div>
      </div>

      {/* Session picker + create-new */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Exam Session</Label>
            <select
              value={effectiveSessionId ?? ""}
              onChange={e => setSelectedSessionId(e.target.value || undefined)}
              className="mt-1 w-full max-w-md px-3 py-2 rounded-lg border border-input bg-background text-sm"
            >
              <option value="">— Select a session —</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.exam_term} {s.exam_year}) · {s.classes.length} classes
                </option>
              ))}
            </select>
          </div>
          {effectiveSessionId && <CreatePlanForm sessionId={effectiveSessionId} onCreated={onOpenPlan} />}
        </CardContent>
      </Card>

      {/* Plans list — mobile cards, desktop table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Existing Plans
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingPlans ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : plansToShow.length === 0 ? (
            <div className="text-center py-10">
              <LayoutGrid className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-semibold text-foreground">No seating plans yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create one above to get started</p>
            </div>
          ) : (
            <>
              {/* ── Mobile: card-based layout ── */}
              <div className="sm:hidden space-y-2">
                {plansToShow.map(p => (
                  <button
                    key={p.id}
                    onClick={() => onOpenPlan(p.id)}
                    className="w-full text-left p-3 rounded-xl border border-border hover:border-primary/40 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="font-semibold text-sm text-foreground truncate flex-1">{p.title}</p>
                      {p.is_recurring ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 shrink-0">
                          ALL PAPERS
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0">
                          SINGLE DAY
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      <span className="font-mono">{p.total_seated}/{p.total_students}</span>
                      <span>·</span>
                      <StatusBadge status={p.status} />
                      {p.exam_date && (
                        <>
                          <span>·</span>
                          <span>{new Date(p.exam_date).toLocaleDateString()}</span>
                        </>
                      )}
                      {(p as any).exam_date_from && (p as any).exam_date_to && (
                        <>
                          <span>·</span>
                          <span className="text-violet-600 dark:text-violet-400 font-medium">
                            {(p as any).exam_date_from} → {(p as any).exam_date_to}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {p.classes.map(c => (
                        <Badge key={c} variant="secondary" className={`text-[9px] px-1 py-0 ${colorFor(c).bg} ${colorFor(c).text}`}>Cl {c}</Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>

              {/* ── Desktop: table layout ── */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Classes</TableHead>
                      <TableHead>Seated</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plansToShow.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          {p.title}
                        </TableCell>
                        <TableCell>
                          {p.is_recurring ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                              All Papers
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              Single Day
                            </span>
                          )}
                          {(p as any).exam_date_from && (p as any).exam_date_to && (
                            <div className="text-[10px] text-violet-600 dark:text-violet-400 mt-0.5">
                              {(p as any).exam_date_from} → {(p as any).exam_date_to}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {p.classes.map(c => (
                              <Badge key={c} variant="secondary" className={colorFor(c).bg + " " + colorFor(c).text}>Class {c}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{p.total_seated}/{p.total_students}</span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.status} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => onOpenPlan(p.id)}>
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; cls: string }> = {
    draft:     { label: "Draft",     cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    generated: { label: "Generated", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    published: { label: "Published", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    archived:  { label: "Archived",  cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  };
  const v = map[status] ?? map.draft;
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${v.cls}`}>{v.label}</span>;
};

// ────────────────────────────────────────────────────────────────────────────
// 2. CREATE PLAN FORM
// ────────────────────────────────────────────────────────────────────────────
const CreatePlanForm = ({ sessionId, onCreated }: { sessionId: string; onCreated: (id: string) => void }) => {
  const { data: sessions = [] } = useExamSessions();
  const session = sessions.find(s => s.id === sessionId);
  const [title, setTitle] = useState("");

  // ── FULLY AUTOMATIC TIMING — no manual Exam Type / Year / Paper pickers.
  // The admin just picks classes to mix. For each class, we auto-match the
  // Exam Date Sheet using this session's own exam_term + exam_year (already
  // set up in Exam Roll Numbers), then pick the paper automatically:
  //   • Single Day Exam → today's date-sheet paper for that class (or the
  //     next upcoming one if nothing is scheduled for today).
  //   • All Papers (Multi-Day) → every date-sheet paper for that class under
  //     this exam term/year, spanning start to finish.
  const { data: dateSheetEntries = [] } = useAllExamSchedule();

  type PlanMode = "single" | "all";
  const [mode, setMode] = useState<PlanMode>("single");

  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const createMut = useCreateSeatingPlan();

  const toggleClass = (c: string) => {
    setSelectedClasses(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  };

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Loose match between the session's exam_term (e.g. "1st Semester 2026")
  // and the date sheet's exam_type (e.g. "1st Semester") — same matching
  // style used elsewhere in the app (case-insensitive, bidirectional).
  const examTermMatches = (examType: string, term: string) => {
    const a = examType.trim().toLowerCase();
    const b = term.trim().toLowerCase();
    if (!a || !b) return false;
    return a === b || b.includes(a) || a.includes(b);
  };

  // All date-sheet entries for a class that belong to THIS session's exam
  // term + year — the automatic source of truth, no picking required.
  const entriesFor = (cls: string): ExamScheduleEntry[] => {
    if (!session) return [];
    return dateSheetEntries.filter(
      e => e.class === cls && e.year === session.exam_year && examTermMatches(e.exam_type, session.exam_term)
    );
  };

  // Single-day mode: the paper scheduled for TODAY, or (if none today) the
  // next upcoming paper for that class — so creating the plan a day or two
  // early still works sensibly.
  const singleDayEntryFor = (cls: string): ExamScheduleEntry | null => {
    const entries = [...entriesFor(cls)].sort((a, b) => a.exam_date.localeCompare(b.exam_date));
    if (entries.length === 0) return null;
    return entries.find(e => e.exam_date === todayStr) ?? entries.find(e => e.exam_date >= todayStr) ?? entries[entries.length - 1];
  };

  const allSelectedReady = selectedClasses.length > 0 && selectedClasses.every(cls => {
    if (mode === "single") {
      const entry = singleDayEntryFor(cls);
      return !!entry && !!entry.start_time && !!entry.end_time;
    }
    return entriesFor(cls).length > 0;
  });

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("Give the plan a title"); return; }
    if (selectedClasses.length < 2) { toast.error("Select at least 2 classes — anti-cheat mixing needs multiple classes"); return; }
    if (!allSelectedReady) { toast.error("The Exam Date Sheet has no matching papers for one or more selected classes — add them there first"); return; }

    const toIso = (date: string, time: string | null): string | null => {
      if (!date || !time) return null;
      return new Date(`${date}T${time}:00`).toISOString();
    };

    // Build the per-class timing map automatically from the Date Sheet.
    const classPaperTimes: Record<string, ClassPaperTime> = {};
    let overallFirstEntry: ExamScheduleEntry | null = null;
    let overallLastEntry: ExamScheduleEntry | null = null;

    for (const cls of selectedClasses) {
      if (mode === "single") {
        const entry = singleDayEntryFor(cls)!;
        classPaperTimes[cls] = {
          subject: entry.subject,
          exam_date: entry.exam_date,
          start_time: entry.start_time!,
          end_time: entry.end_time!,
        };
        if (!overallFirstEntry || entry.exam_date < overallFirstEntry.exam_date) overallFirstEntry = entry;
        if (!overallLastEntry || entry.exam_date > overallLastEntry.exam_date) overallLastEntry = entry;
      } else {
        const sorted = [...entriesFor(cls)].sort((a, b) => a.exam_date.localeCompare(b.exam_date));
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        if (first?.start_time && first?.end_time) {
          classPaperTimes[cls] = {
            subject: first.subject,
            exam_date: first.exam_date,
            start_time: first.start_time,
            end_time: first.end_time,
          };
        }
        if (!overallFirstEntry || first.exam_date < overallFirstEntry.exam_date) overallFirstEntry = first;
        if (!overallLastEntry || last.exam_date > overallLastEntry.exam_date) overallLastEntry = last;
      }
    }

    try {
      const plan = await createMut.mutateAsync({
        sessionId,
        title: title.trim(),
        classes: selectedClasses,
        paperSubject: overallFirstEntry?.subject ?? null,
        examDate: mode === "single" ? (overallFirstEntry?.exam_date ?? null) : null,
        paperStartAt: overallFirstEntry ? toIso(overallFirstEntry.exam_date, overallFirstEntry.start_time) : null,
        paperEndAt: overallFirstEntry ? toIso(overallFirstEntry.exam_date, overallFirstEntry.end_time) : null,
        isRecurring: mode === "all",
        examDateFrom: mode === "all" ? (overallFirstEntry?.exam_date ?? null) : null,
        examDateTo:   mode === "all" ? (overallLastEntry?.exam_date ?? null) : null,
        classPaperTimes,
      });
      onCreated(plan.id);
    } catch { /* toast handled in hook */ }
  };

  return (
    <div className="border-t border-border pt-4 space-y-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Seating Plan</p>

      {/* ── MODE TOGGLE ── */}
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            mode === "single" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" /> Single Day Exam
        </button>
        <button
          type="button"
          onClick={() => setMode("all")}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            mode === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <RefreshCw className="w-3.5 h-3.5" /> All Papers (Multi-Day)
        </button>
      </div>

      {/* ── SHARED FIELDS (both modes) ── */}
      <div className="grid gap-3 sm:grid-cols-1">
        <div>
          <Label className="text-xs">Plan Title</Label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={session ? `${session.exam_term} ${session.exam_year} — Seating` : "e.g. Annual 2026 — Seating"}
            className="mt-1"
          />
        </div>
      </div>

      {/* ── CLASSES (pick first — each gets its own paper/timing below) ── */}
      <div>
        <Label className="text-xs">Classes to mix (select at least 2 for anti-cheat)</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {(session?.classes ?? ["6","7","8","9","10"]).map(c => (
            <button
              key={c}
              type="button"
              onClick={() => toggleClass(c)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                selectedClasses.includes(c)
                  ? colorFor(c).bg + " " + colorFor(c).text + " border-current"
                  : "bg-card border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              Class {c}
            </button>
          ))}
        </div>
      </div>

      {/* ── AUTO-DETECTED TIMING — no pickers. Each selected class's paper
          is matched automatically from the Exam Date Sheet using THIS
          session's own exam term + year (already set up in Exam Roll
          Numbers). Classes mixed into the same rooms can be sitting
          different papers at different times on the same day (e.g. Class 6
          Urdu 9-12, Class 10 Mutalia Quran 9-11) — each shows its own
          detected result below, read-only. ── */}
      {selectedClasses.length > 0 && (
        <div className="space-y-2">
          <p className={`text-xs font-semibold flex items-center gap-1.5 ${
            mode === "single" ? "text-blue-700 dark:text-blue-400" : "text-violet-700 dark:text-violet-400"
          }`}>
            {mode === "single" ? <CalendarDays className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Auto-detected from Exam Date Sheet
          </p>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Matched automatically using <strong>{session?.exam_term ?? "this session"} {session?.exam_year ?? ""}</strong> — nothing to select.
            Set the date sheet first if a class below shows no match.
          </p>
          <div className="space-y-1.5">
            {selectedClasses.map(cls => {
              if (mode === "single") {
                const entry = singleDayEntryFor(cls);
                return (
                  <div
                    key={cls}
                    className={`rounded-lg border p-2.5 flex items-center gap-2 text-xs ${
                      entry?.start_time && entry?.end_time
                        ? "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20"
                        : "border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20"
                    }`}
                  >
                    <span className={`font-bold px-2 py-0.5 rounded-full shrink-0 ${colorFor(cls).bg} ${colorFor(cls).text}`}>
                      Class {cls}
                    </span>
                    {entry?.start_time && entry?.end_time ? (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        ✓ {entry.subject} — {entry.exam_date}, {entry.start_time}–{entry.end_time}
                      </span>
                    ) : entry ? (
                      <span className="text-red-600 dark:text-red-400">
                        ⚠ {entry.subject} on {entry.exam_date} has no start/end time set in the Date Sheet
                      </span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400">⚠ No matching paper found in the Exam Date Sheet</span>
                    )}
                  </div>
                );
              }
              const entries = [...entriesFor(cls)].sort((a, b) => a.exam_date.localeCompare(b.exam_date));
              return (
                <div
                  key={cls}
                  className={`rounded-lg border p-2.5 flex items-center gap-2 text-xs ${
                    entries.length > 0
                      ? "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20"
                      : "border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20"
                  }`}
                >
                  <span className={`font-bold px-2 py-0.5 rounded-full shrink-0 ${colorFor(cls).bg} ${colorFor(cls).text}`}>
                    Class {cls}
                  </span>
                  {entries.length > 0 ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      ✓ {entries.length} paper(s) found — {entries[0].exam_date} to {entries[entries.length - 1].exam_date}
                    </span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400">⚠ No papers found in the Exam Date Sheet</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Button onClick={handleCreate} disabled={createMut.isPending} className="w-full sm:w-auto">
        {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Create {mode === "single" ? "Single Day" : "All Papers"} Plan
      </Button>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// 3. PLAN EDITOR (rooms + generate + outputs)
// ────────────────────────────────────────────────────────────────────────────
const PlanEditor = ({ planId, onBack }: { planId: string; onBack: () => void }) => {
  const { data: plan, isLoading } = useSeatingPlan(planId);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [show3DHall, setShow3DHall] = useState(false);

  if (isLoading || !plan) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4" /> Back</Button>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const activeRoom = plan.rooms.find(r => r.id === activeRoomId) ?? plan.rooms[0] ?? null;

  return (
    <div className="space-y-5">
      {/* Header — stacks cleanly on mobile. Title takes full width on small
          screens so long titles like "1st Semester 2026 - Seating" don't get
          squeezed into one-character-per-line by the flex layout. */}
      <div className="flex items-start gap-2 sm:gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0 px-2">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base sm:text-xl font-heading font-bold text-foreground leading-tight">
            {plan.title}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {plan.classes.map(c => `Class ${c}`).join(" · ")}
            {plan.paper_subject ? ` · ${plan.paper_subject}` : ""}
            {plan.exam_date ? ` · ${new Date(plan.exam_date).toLocaleDateString()}` : ""}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {plan.is_recurring && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                All Papers
              </span>
            )}
            {(plan as any).exam_date_from && (plan as any).exam_date_to && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                {(plan as any).exam_date_from} → {(plan as any).exam_date_to}
              </span>
            )}
            <StatusBadge status={plan.status} />
          </div>
        </div>
      </div>

      {/* Plan-wide exam staff: Superintendent / Deputy Superintendent */}
      <PlanStaffEditor plan={plan} />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Building2 className="w-4 h-4" />} label="Rooms" value={plan.rooms.length} />
        <StatCard icon={<Users className="w-4 h-4" />} label="Students" value={plan.total_students} />
        <StatCard icon={<Grid3x3 className="w-4 h-4" />} label="Seated" value={plan.total_seated} />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Capacity"
          value={plan.rooms.reduce((s, r) => s + r.capacity, 0)}
        />
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <GenerateSeatingButton plan={plan} />
        <PublishButton plan={plan} />
        <Button
          onClick={() => setShow3DHall(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          <Boxes className="w-4 h-4" />
          3D Hall
        </Button>
        <QrStickerSheetButton plan={plan} />
        <DutiesPdfButton plan={plan} />
        <DeletePlanButton planId={plan.id} sessionId={plan.session_id} onDeleted={onBack} />
      </div>

      {show3DHall && (
        <Hall3DView planId={plan.id} onClose={() => setShow3DHall(false)} />
      )}

      {/* Rooms list + room editor */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-5 min-w-0">
        <div className="min-w-0">
          <RoomSidebar plan={plan} activeRoomId={activeRoom?.id ?? null} onSelect={setActiveRoomId} />
        </div>
        <div className="space-y-5 min-w-0">
          {activeRoom ? (
            <RoomDeskMap key={activeRoom.id} room={activeRoom} plan={plan} />
          ) : (
            <Card>
              <CardContent className="p-10 text-center">
                <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="font-semibold text-foreground">No rooms yet</p>
                <p className="text-sm text-muted-foreground mt-1">Add a room on the left to begin</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

    </div>
  );
};

/**
 * Plan-wide exam staff: Superintendent and Deputy Superintendent — these are
 * overall roles for the whole seating plan (distinct from per-room
 * invigilators, which are assigned inside each room). Saves on blur, same
 * pattern as the room notes/invigilator fields.
 */
const PlanStaffEditor = ({ plan }: { plan: SeatingPlanFull }) => {
  const updateStaff = useUpdateSeatingPlanStaff();
  const [superintendent, setSuperintendent] = useState((plan as any).superintendent ?? "");
  const [deputy, setDeputy] = useState((plan as any).deputy_superintendent ?? "");
  // Duty text defaults to the standard responsibilities (see hook) whenever
  // the plan doesn't have a custom override saved — admin can edit it if a
  // particular exam needs different instructions.
  const [superintendentDuty, setSuperintendentDuty] = useState(
    (plan as any).superintendent_duty ?? SUPERINTENDENT_DUTY
  );
  const [deputyDuty, setDeputyDuty] = useState(
    (plan as any).deputy_superintendent_duty ?? DEPUTY_SUPERINTENDENT_DUTY
  );
  const [showDuties, setShowDuties] = useState(false);
  useEffect(() => {
    setSuperintendent((plan as any).superintendent ?? "");
    setDeputy((plan as any).deputy_superintendent ?? "");
    setSuperintendentDuty((plan as any).superintendent_duty ?? SUPERINTENDENT_DUTY);
    setDeputyDuty((plan as any).deputy_superintendent_duty ?? DEPUTY_SUPERINTENDENT_DUTY);
  }, [plan.id]);

  const save = async (next: {
    superintendent?: string; deputy?: string;
    superintendentDuty?: string; deputyDuty?: string;
  }) => {
    const s  = next.superintendent ?? superintendent;
    const d  = next.deputy ?? deputy;
    const sd = next.superintendentDuty ?? superintendentDuty;
    const dd = next.deputyDuty ?? deputyDuty;
    const unchanged =
      s === ((plan as any).superintendent ?? "") &&
      d === ((plan as any).deputy_superintendent ?? "") &&
      sd === ((plan as any).superintendent_duty ?? SUPERINTENDENT_DUTY) &&
      dd === ((plan as any).deputy_superintendent_duty ?? DEPUTY_SUPERINTENDENT_DUTY);
    if (unchanged) return;
    await updateStaff.mutateAsync({
      planId: plan.id,
      sessionId: plan.session_id,
      superintendent: s || null,
      deputySuperintendent: d || null,
      // Only save duty text if it differs from the standard default, so we
      // don't clutter the DB with the default text on every plan — null
      // means "use the standard default", which the UI already handles.
      superintendentDuty: sd !== SUPERINTENDENT_DUTY ? sd : null,
      deputySuperintendentDuty: dd !== DEPUTY_SUPERINTENDENT_DUTY ? dd : null,
    });
  };

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Exam Staff (overall)
          </p>
          <Button
            type="button" size="sm" variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => setShowDuties(s => !s)}
          >
            {showDuties ? "Hide duties" : "Edit duties"}
          </Button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Superintendent</Label>
            <Input
              value={superintendent}
              onChange={e => setSuperintendent(e.target.value)}
              onBlur={() => save({ superintendent })}
              placeholder="e.g. Mr. Principal Khan"
              className="mt-1 h-8 text-sm"
            />
            {showDuties && (
              <textarea
                value={superintendentDuty}
                onChange={e => setSuperintendentDuty(e.target.value)}
                onBlur={() => save({ superintendentDuty })}
                rows={3}
                className="mt-1.5 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-[11px] text-muted-foreground resize-y"
                placeholder="Duty description"
              />
            )}
          </div>
          <div>
            <Label className="text-xs">Deputy Superintendent</Label>
            <Input
              value={deputy}
              onChange={e => setDeputy(e.target.value)}
              onBlur={() => save({ deputy })}
              placeholder="e.g. Mr. Vice Principal"
              className="mt-1 h-8 text-sm"
            />
            {showDuties && (
              <textarea
                value={deputyDuty}
                onChange={e => setDeputyDuty(e.target.value)}
                onBlur={() => save({ deputyDuty })}
                rows={3}
                className="mt-1.5 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-[11px] text-muted-foreground resize-y"
                placeholder="Duty description"
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const StatCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </CardContent>
  </Card>
);

// ────────────────────────────────────────────────────────────────────────────
// 4. ROOM SIDEBAR
// ────────────────────────────────────────────────────────────────────────────
const RoomSidebar = ({ plan, activeRoomId, onSelect }: {
  plan: SeatingPlanFull;
  activeRoomId: string | null;
  onSelect: (id: string) => void;
}) => {
  const upsert = useUpsertRoom();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [rows, setRows] = useState(6);
  const [cols, setCols] = useState(5);
  // Multiple invigilators per room: an array of names, one input per entry.
  // Starts with a single empty field; "+ Add Invigilator" appends another.
  const [invigilators, setInvigilators] = useState<string[]>([""]);

  const handleAdd = async () => {
    if (!name.trim()) { toast.error("Room name required"); return; }
    try {
      const cleanInvigilators = invigilators.map(s => s.trim()).filter(Boolean);
      await upsert.mutateAsync({ planId: plan.id, room: { name: name.trim(), rows, cols, invigilators: cleanInvigilators } });
      setName(""); setRows(6); setCols(5); setInvigilators([""]);
      setShowForm(false);
    } catch { /* handled */ }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Rooms</h3>
        <Button size="sm" variant="outline" onClick={() => setShowForm(s => !s)}>
          {showForm ? <ArrowLeft className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? "Done" : "Add"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div>
              <Label className="text-xs">Room name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hall A" className="mt-1 h-8 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Rows</Label>
                <Input type="number" min={1} max={30} value={rows} onChange={e => setRows(Math.max(1, +e.target.value || 1))} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Cols</Label>
                <Input type="number" min={1} max={30} value={cols} onChange={e => setCols(Math.max(1, +e.target.value || 1))} className="mt-1 h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Invigilator(s) (optional)</Label>
              <div className="mt-1 space-y-1.5">
                {invigilators.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <Input
                      value={val}
                      onChange={e => setInvigilators(list => list.map((v, i) => i === idx ? e.target.value : v))}
                      placeholder={idx === 0 ? "e.g. Mr. Ahmad" : `Invigilator ${idx + 1}`}
                      className="h-8 text-sm"
                    />
                    {invigilators.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => setInvigilators(list => list.filter((_, i) => i !== idx))}
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs"
                  onClick={() => setInvigilators(list => [...list, ""])}
                >
                  <Plus className="w-3 h-3" /> Add Invigilator
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Capacity: {rows * cols} desks</p>
            <Button size="sm" onClick={handleAdd} disabled={upsert.isPending} className="w-full">
              {upsert.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add Room
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-1.5">
        {plan.rooms.length === 0 && !showForm && (
          <p className="text-xs text-muted-foreground text-center py-4">Click "Add" to define your first room</p>
        )}
        {plan.rooms.map(r => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={`w-full text-left p-2.5 rounded-lg border text-sm transition-colors ${
              activeRoomId === r.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium truncate">{r.name}</span>
              <Badge variant="secondary" className="text-[10px]">{r.assignments.length}/{r.capacity}</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {r.rows}×{r.cols} grid{(r.block_layout?.length ?? 0) > 0 ? ` · ${r.block_layout.length} blocked` : ""}
              {r.invigilators?.length ? ` · ${r.invigilators.join(", ")}` : ""}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// 5. ROOM DESK MAP (visual grid editor + viewer)
// ────────────────────────────────────────────────────────────────────────────
const RoomDeskMap = ({ room, plan }: { room: RoomWithAssignments; plan: SeatingPlanFull }) => {
  const upsert = useUpsertRoom();
  const delRoom = useDeleteRoom();

  // Controlled local copies of invigilators/notes, re-synced whenever the
  // active room changes (by id) — this fixes a bug where switching rooms
  // without a remount left the previous room's invigilator name showing in
  // the input (defaultValue only applies once, on mount).
  const [invigilatorsInput, setInvigilatorsInput] = useState<string[]>(
    room.invigilators?.length ? room.invigilators : [""]
  );
  const [notesInput, setNotesInput] = useState(room.notes ?? "");
  // Column duty range per invigilator (index-aligned with invigilatorsInput).
  // Starts from the saved value if present, otherwise an even auto-split —
  // same fallback the hook itself uses, kept in sync here for editing.
  const [dutiesInput, setDutiesInput] = useState<{ col_start: number; col_end: number }[]>(
    resolveColDuties(room)
  );
  useEffect(() => {
    setInvigilatorsInput(room.invigilators?.length ? room.invigilators : [""]);
    setNotesInput(room.notes ?? "");
    setDutiesInput(resolveColDuties(room));
  }, [room.id]);

  const saveInvigilators = async (next: string[]) => {
    try {
      const cleanNext = next.map(s => s.trim()).filter(Boolean);
      // Re-flow duty ranges to match the new invigilator count so a newly
      // added/removed invigilator immediately gets a sensible column range
      // instead of an empty one.
      const nextDuties = autoSplitColDuties(room.cols, cleanNext.length);
      setDutiesInput(nextDuties);
      await upsert.mutateAsync({
        planId: plan.id,
        room: { id: room.id, name: room.name, rows: room.rows, cols: room.cols, block_layout: room.block_layout, invigilators: cleanNext, invigilator_duties: nextDuties, notes: room.notes },
      });
    } catch { /* handled */ }
  };

  const saveDuties = async (next: { col_start: number; col_end: number }[]) => {
    try {
      await upsert.mutateAsync({
        planId: plan.id,
        room: { id: room.id, name: room.name, rows: room.rows, cols: room.cols, block_layout: room.block_layout, invigilators: room.invigilators, invigilator_duties: next, notes: room.notes },
      });
    } catch { /* handled */ }
  };

  const toggleBlocked = async (r: number, c: number) => {
    if (plan.status === "published") { toast.error("Cannot edit a published plan — archive or recreate"); return; }
    const cur = room.block_layout ?? [];
    const exists = cur.some(([rr, cc]) => rr === r && cc === c);
    const next = exists ? cur.filter(([rr, cc]) => !(rr === r && cc === c)) : [...cur, [r, c]];
    try {
      await upsert.mutateAsync({
        planId: plan.id,
        room: { id: room.id, name: room.name, rows: room.rows, cols: room.cols, block_layout: next, invigilators: room.invigilators, invigilator_duties: room.invigilator_duties, notes: room.notes },
      });
    } catch { /* handled */ }
  };

  // Build a 2D lookup: assignments[(row,col)] = student
  const grid = useMemo(() => {
    const m = new Map<string, typeof room.assignments[number]>();
    for (const a of room.assignments) m.set(`${a.row_idx}:${a.col_idx}`, a);
    return m;
  }, [room.assignments]);

  // Which invigilator (by index) is responsible for a given 0-indexed column,
  // used to color-band the grid so duty coverage is visible at a glance.
  const invigilatorForCol = (colIdx0: number) => {
    const colNum = colIdx0 + 1; // duties are 1-indexed
    const idx = dutiesInput.findIndex(d => colNum >= d.col_start && colNum <= d.col_end);
    return idx;
  };
  const DUTY_BAND_COLORS = [
    "border-t-4 border-t-blue-400", "border-t-4 border-t-emerald-400",
    "border-t-4 border-t-amber-400", "border-t-4 border-t-rose-400",
    "border-t-4 border-t-violet-400", "border-t-4 border-t-cyan-400",
  ];


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Grid3x3 className="w-4 h-4" /> {room.name}
              <Badge variant="secondary" className="ml-2">{room.assignments.length}/{room.capacity} seated</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <PrintDeskMapButton room={room} plan={plan} />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete room "{room.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      All {room.assignments.length} seat assignments in this room will be removed. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => { await delRoom.mutateAsync({ planId: plan.id, roomId: room.id }); }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {plan.status !== "published" && (
            <p className="text-xs text-muted-foreground mb-2">
              Click a desk to mark it as blocked (aisle/pillar/broken). Click again to unblock.
            </p>
          )}
          {invigilatorsInput.filter(Boolean).length > 1 && (
            <div className="flex flex-wrap items-center gap-3 mb-2 text-[11px] text-muted-foreground">
              <span className="font-semibold">Duty areas:</span>
              {invigilatorsInput.map((name, i) => name.trim() && (
                <span key={i} className="flex items-center gap-1">
                  <span className={`inline-block w-2.5 h-2.5 rounded-sm ${DUTY_BAND_COLORS[i % DUTY_BAND_COLORS.length].replace("border-t-4 border-t-", "bg-")}`} />
                  {name.trim()} (Cols {dutiesInput[i]?.col_start ?? "—"}–{dutiesInput[i]?.col_end ?? "—"})
                </span>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <div
              className="inline-grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${room.cols}, minmax(64px, 1fr))` }}
            >
              {Array.from({ length: room.rows * room.cols }).map((_, idx) => {
                const r = Math.floor(idx / room.cols);
                const c = idx % room.cols;
                const isBlocked = (room.block_layout ?? []).some(([rr, cc]) => rr === r && cc === c);
                const assign = grid.get(`${r}:${c}`);
                const multiInvigilator = invigilatorsInput.filter(Boolean).length > 1;
                const bandIdx = invigilatorForCol(c);
                const bandClass = multiInvigilator && r === 0 && bandIdx >= 0
                  ? DUTY_BAND_COLORS[bandIdx % DUTY_BAND_COLORS.length]
                  : "";
                if (isBlocked) {
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleBlocked(r, c)}
                      className={`aspect-[4/3] rounded-md bg-foreground/10 dark:bg-foreground/20 flex items-center justify-center text-[10px] text-muted-foreground cursor-pointer border border-dashed border-border ${bandClass}`}
                      title="Blocked — click to unblock"
                    >
                      ✕
                    </div>
                  );
                }
                if (assign) {
                  const cc = colorFor(assign.class);
                  return (
                    <div
                      key={idx}
                      className={`aspect-[4/3] rounded-md border ${cc.bg} ${cc.text} p-1 flex flex-col justify-between text-[10px] leading-tight ${bandClass}`}
                      title={`${assign.student_name} · Class ${assign.class} · ${assign.seat_label}`}
                    >
                      <span className="font-bold">R{r + 1}·S{c + 1}</span>
                      <span className="font-semibold truncate">{assign.student_name}</span>
                      <span className="opacity-70 font-mono">{assign.exam_roll_no}</span>
                    </div>
                  );
                }
                return (
                  <div
                    key={idx}
                    onClick={() => toggleBlocked(r, c)}
                    className={`aspect-[4/3] rounded-md bg-secondary/40 border border-border flex items-center justify-center text-[10px] text-muted-foreground cursor-pointer hover:bg-secondary ${bandClass}`}
                    title={`Empty desk R${r + 1}·S${c + 1} — click to block`}
                  >
                    R{r + 1}·S{c + 1}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Invigilator editor — supports multiple invigilators per room,
              each with a row-duty range when there's more than one. */}
          <div className="mt-4 pt-3 border-t border-border grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Invigilator(s)</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5 mb-1">
                {INVIGILATOR_DUTY} With more than one, each is assigned a column range below.
              </p>
              <div className="mt-1 space-y-1.5">
                {invigilatorsInput.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <Input
                      value={val}
                      onChange={e => setInvigilatorsInput(list => list.map((v, i) => i === idx ? e.target.value : v))}
                      onBlur={() => {
                        const current = room.invigilators ?? [];
                        const next = invigilatorsInput.map(s => s.trim()).filter(Boolean);
                        if (JSON.stringify(next) !== JSON.stringify(current)) saveInvigilators(invigilatorsInput);
                      }}
                      placeholder={idx === 0 ? "Assigned invigilator name" : `Invigilator ${idx + 1}`}
                      className="h-8 text-sm"
                    />
                    {invigilatorsInput.filter(Boolean).length > 1 && dutiesInput[idx] && (
                      <div className="flex items-center gap-1 shrink-0" title="Columns this invigilator is responsible for">
                        <span className="text-[10px] text-muted-foreground">Cols</span>
                        <Input
                          type="number" min={1} max={room.cols}
                          value={dutiesInput[idx].col_start === 0 ? "" : dutiesInput[idx].col_start}
                          onChange={e => {
                            const raw = e.target.value;
                            const v = raw === "" ? 0 : Math.max(0, Math.min(room.cols, +raw));
                            setDutiesInput(list => list.map((d, i) => i === idx ? { ...d, col_start: v } : d));
                          }}
                          onBlur={() => {
                            const clamped = Math.max(1, Math.min(room.cols, dutiesInput[idx].col_start || 1));
                            const next = dutiesInput.map((d, i) => i === idx ? { ...d, col_start: clamped } : d);
                            setDutiesInput(next);
                            saveDuties(next);
                          }}
                          className="h-8 w-12 text-xs px-1 text-center"
                        />
                        <span className="text-[10px] text-muted-foreground">–</span>
                        <Input
                          type="number" min={1} max={room.cols}
                          value={dutiesInput[idx].col_end === 0 ? "" : dutiesInput[idx].col_end}
                          onChange={e => {
                            const raw = e.target.value;
                            const v = raw === "" ? 0 : Math.max(0, Math.min(room.cols, +raw));
                            setDutiesInput(list => list.map((d, i) => i === idx ? { ...d, col_end: v } : d));
                          }}
                          onBlur={() => {
                            const clamped = Math.max(1, Math.min(room.cols, dutiesInput[idx].col_end || 1));
                            const next = dutiesInput.map((d, i) => i === idx ? { ...d, col_end: clamped } : d);
                            setDutiesInput(next);
                            saveDuties(next);
                          }}
                          className="h-8 w-12 text-xs px-1 text-center"
                        />
                      </div>
                    )}
                    {invigilatorsInput.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => {
                          const next = invigilatorsInput.filter((_, i) => i !== idx);
                          setInvigilatorsInput(next);
                          saveInvigilators(next);
                        }}
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs"
                  onClick={() => setInvigilatorsInput(list => [...list, ""])}
                >
                  <Plus className="w-3 h-3" /> Add Invigilator
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Room notes</Label>
              <Input
                value={notesInput}
                onChange={e => setNotesInput(e.target.value)}
                onBlur={async (e) => {
                  if (e.target.value !== (room.notes ?? "")) {
                    await upsert.mutateAsync({
                      planId: plan.id,
                      room: { id: room.id, name: room.name, rows: room.rows, cols: room.cols, block_layout: room.block_layout, invigilators: room.invigilators, invigilator_duties: room.invigilator_duties, notes: e.target.value || null },
                    });
                  }
                }}
                placeholder="e.g. Near staff room, no AC"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// 6. ACTION BUTTONS
// ────────────────────────────────────────────────────────────────────────────

/** Pull all exam_roll_numbers for the plan's classes+session, run algorithm, persist. */
const GenerateSeatingButton = ({ plan }: { plan: SeatingPlanFull }) => {
  const genMut = useGenerateSeating();
  const qc = useQueryClient();
  // isUpdate = true when the plan ALREADY has seated students (regardless of
  // recurring vs single-day). In that case the button says "Update Seating"
  // and the algorithm applies a random rotation so the new arrangement is
  // visibly different from the previous one.
  const isUpdate = plan.total_seated > 0;

  const handleGenerate = async () => {
    if (plan.rooms.length === 0) { toast.error("Add at least one room first"); return; }
    const totalCapacity = plan.rooms.reduce((s, r) => s + r.capacity, 0);

    // Pull every roll number for this session that belongs to one of the plan's classes.
    const { data: rolls, error } = await supabase
      .from("exam_roll_numbers")
      .select("student_id, student_name, class, class_roll_no, exam_roll_no")
      .eq("session_id", plan.session_id)
      .in("class", plan.classes)
      .order("class", { ascending: true })
      .order("class_roll_no", { ascending: true });
    if (error) { toast.error(error.message); return; }
    if (!rolls || rolls.length === 0) { toast.error("No students found in this session for the selected classes"); return; }

    if (rolls.length > totalCapacity) {
      const ok = window.confirm(
        `${rolls.length} students but only ${totalCapacity} seatable desks. ` +
        `${rolls.length - totalCapacity} students will be unassigned. Generate anyway?`
      );
      if (!ok) return;
    }

    if (isUpdate) {
      const ok = window.confirm(
        "This will re-shuffle seating for the next paper (new anti-cheat arrangement). " +
        "Existing seat QR codes will be replaced. Continue?"
      );
      if (!ok) return;
    }

    try {
      const result = await genMut.mutateAsync({
        planId: plan.id,
        sessionId: plan.session_id,
        students: rolls,
        rooms: plan.rooms,
        // Pass isUpdate so the seating algorithm applies a random rotation
        // — producing a DIFFERENT desk arrangement than last time.
        // For first Auto-Generate (isUpdate=false), the canonical roll-no
        // order is used.
        isUpdate,
      });
      // Show conflict detail if any.
      if (result.conflicts > 0) {
        toast(`⚠️ ${result.conflicts} seat(s) have same-class adjacency — review the grid`, { duration: 6000 });
      }
      qc.invalidateQueries({ queryKey: ["seating-plan", plan.id] });
    } catch { /* handled */ }
  };

  // Allow re-generation (Update Seating) even on published plans, as long as
  // it's an update (plan already has seated students). The old gate blocked
  // single-day published plans from being regenerated — but the admin needs
  // to be able to update seating if something changed (e.g. a student was
  // added/removed, or the arrangement needs to be shuffled for anti-cheat).
  const disabled = genMut.isPending;

  return (
    <Button onClick={handleGenerate} disabled={disabled}>
      {genMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (isUpdate ? <RefreshCw className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />)}
      {isUpdate ? "Update Seating (New Arrangement)" : "Auto-Generate Seating"}
    </Button>
  );
};

const PublishButton = ({ plan }: { plan: SeatingPlanFull }) => {
  const pubMut = usePublishSeatingPlan();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [publishAt, setPublishAt] = useState<string>("");
  const [countdownLabel, setCountdownLabel] = useState<string>("");

  const disabled = plan.status === "published" || plan.total_seated === 0;

  // Pre-fill the datetime input to "1 hour from now" the first time the
  // dialog opens in schedule mode, so the user has something to work with.
  useEffect(() => {
    if (open && mode === "schedule" && !publishAt) {
      const d = new Date(Date.now() + 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setPublishAt(local);
    }
  }, [open, mode, publishAt]);

  const handleConfirm = async () => {
    if (mode === "schedule" && !publishAt) { toast.error("Pick a date and time"); return; }
    const iso = mode === "schedule" ? new Date(publishAt).toISOString() : undefined;
    if (mode === "schedule" && iso && new Date(iso).getTime() <= Date.now()) {
      toast.error("Scheduled time must be in the future");
      return;
    }
    try {
      await pubMut.mutateAsync({
        planId: plan.id,
        sessionId: plan.session_id,
        mode,
        publishAt: iso,
        countdownLabel: countdownLabel.trim() || undefined,
      });
      setOpen(false);
    } catch { /* handled in hook */ }
  };

  // Already published — show a disabled "Published" pill.
  if (plan.status === "published") {
    return (
      <Button disabled variant="secondary">
        <CheckCircle2 className="w-4 h-4" /> Published
      </Button>
    );
  }

  // Scheduled but not yet published — show countdown info + a "Publish Now" override.
  if (plan.status !== "published" && plan.publish_at) {
    const remaining = new Date(plan.publish_at).getTime() - Date.now();
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300">
          Scheduled · {remaining > 0
            ? `publishes in ${Math.ceil(remaining / 60000)} min`
            : "publishing…"}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => pubMut.mutate({ planId: plan.id, sessionId: plan.session_id, mode: "now" })}
          disabled={pubMut.isPending}
        >
          {pubMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Publish Now
        </Button>
      </div>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled || pubMut.isPending}>
          {pubMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Publish to Students
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Publish “{plan.title}”</AlertDialogTitle>
          <AlertDialogDescription>
            Choose whether students see their seats immediately, or after a countdown.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg border border-border hover:bg-secondary/50">
            <input
              type="radio"
              name="publish-mode"
              checked={mode === "now"}
              onChange={() => setMode("now")}
              className="mt-0.5"
            />
            <div className="text-sm">
              <p className="font-medium text-foreground">Publish now</p>
              <p className="text-xs text-muted-foreground">All students can see their seats immediately.</p>
            </div>
          </label>

          <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg border border-border hover:bg-secondary/50">
            <input
              type="radio"
              name="publish-mode"
              checked={mode === "schedule"}
              onChange={() => setMode("schedule")}
              className="mt-0.5"
            />
            <div className="text-sm flex-1">
              <p className="font-medium text-foreground">Schedule with countdown</p>
              <p className="text-xs text-muted-foreground mb-2">Students see a countdown timer; seats reveal automatically when it hits zero.</p>
              {mode === "schedule" && (
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Publish at</Label>
                    <Input
                      type="datetime-local"
                      value={publishAt}
                      onChange={e => setPublishAt(e.target.value)}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Countdown label (optional)</Label>
                    <Input
                      value={countdownLabel}
                      onChange={e => setCountdownLabel(e.target.value)}
                      placeholder="e.g. Seating will be revealed in"
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pubMut.isPending}
          >
            {pubMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {mode === "now" ? "Publish Now" : "Schedule Publish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const DeletePlanButton = ({ planId, sessionId, onDeleted }: { planId: string; sessionId: string; onDeleted: () => void }) => {
  const delMut = useDeleteSeatingPlan();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <Trash2 className="w-4 h-4" /> Delete Plan
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this seating plan?</AlertDialogTitle>
          <AlertDialogDescription>
            All rooms and seat assignments will be permanently deleted. Students will lose access to their seat lookup.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => { await delMut.mutateAsync({ planId, sessionId }); onDeleted(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete Plan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// 7. PDF / CSV EXPORTS
// ────────────────────────────────────────────────────────────────────────────

/** Printable desk-layout map for ONE room — for pasting on the hall wall. */
const PrintDeskMapButton = ({ room, plan }: { room: SeatingRoom; plan: SeatingPlanFull }) => {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try {
      // Pull fresh assignments for this room.
      const { data: assigns } = await supabase
        .from("exam_seating_assignments")
        .select("*")
        .eq("room_id", room.id);
      const aMap = new Map<string, typeof assigns[number]>();
      for (const a of assigns ?? []) aMap.set(`${a.row_idx}:${a.col_idx}`, a);

      const doc = new jsPDF({ orientation: room.cols > 6 ? "landscape" : "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 10;
      // Header — centered
      doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 30, 30);
      doc.text(plan.title, pageW / 2, 14, { align: "center" });
      doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(80);
      doc.text(`${room.name}  ·  ${room.rows}×${room.cols} grid  ·  ${room.assignments.length} seated`, pageW / 2, 20, { align: "center" });
      let headerBottom = 22.5;
      const invigilatorList: string[] = (room as any).invigilators?.length ? (room as any).invigilators : (room.invigilator ? [room.invigilator] : []);
      if (invigilatorList.length) {
        const duties = resolveColDuties(room as any);
        const label = invigilatorList.length > 1 ? "Invigilators" : "Invigilator";
        const text = invigilatorList.length > 1
          ? invigilatorList.map((name, i) => duties[i] ? `${name} (Cols ${duties[i].col_start}–${duties[i].col_end})` : name).join(", ")
          : invigilatorList[0];
        doc.setFontSize(9); doc.setTextColor(110);
        doc.text(`${label}: ${text}`, pageW / 2, 25.5, { align: "center" });
        headerBottom = 28;
      }
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
      doc.line(margin, headerBottom, pageW - margin, headerBottom);

      // Grid
      const gridTop = headerBottom + 6;
      const gridW = pageW - margin * 2;
      const cellW = gridW / room.cols;
      const cellH = Math.min(22, (doc.internal.pageSize.getHeight() - gridTop - 16) / room.rows);

      for (let r = 0; r < room.rows; r++) {
        for (let c = 0; c < room.cols; c++) {
          const x = margin + c * cellW;
          const y = gridTop + r * cellH;
          const isBlocked = (room.block_layout ?? []).some(([rr, cc]) => rr === r && cc === c);
          const a = aMap.get(`${r}:${c}`);

          if (isBlocked) {
            doc.setFillColor(255, 255, 255);
            doc.rect(x, y, cellW - 1, cellH - 1, "F");
            doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2);
            doc.rect(x, y, cellW - 1, cellH - 1, "S");
            doc.setFontSize(7); doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold");
            doc.text("BLOCKED", x + cellW / 2, y + cellH / 2, { align: "center" });
          } else if (a) {
            doc.setFillColor(255, 255, 255);
            doc.rect(x, y, cellW - 1, cellH - 1, "F");
            doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);
            doc.rect(x, y, cellW - 1, cellH - 1, "S");
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
            doc.text(`R${r + 1}·S${c + 1}`, x + cellW / 2, y + 4, { align: "center" });
            doc.setFont("helvetica", "normal"); doc.setFontSize(7);
            const nm = a.student_name.length > 18 ? a.student_name.slice(0, 17) + "…" : a.student_name;
            doc.text(nm, x + cellW / 2, y + 9, { align: "center" });
            doc.setFont("helvetica", "bold"); doc.setFontSize(9);
            doc.text(a.exam_roll_no, x + cellW / 2, y + 14.5, { align: "center" });
            doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(60, 60, 60);
            doc.text(`Class ${a.class}`, x + cellW / 2, y + 18.5, { align: "center" });
          }
          // Unassigned (empty) cells are intentionally skipped —
          // Print Desk Map should only show filled cells (plus blocked cells),
          // so empty seats disappear from the downloaded PDF.
        }
      }

      // Footer
      doc.setFontSize(6); doc.setTextColor(140); doc.setFont("helvetica", "normal");
      doc.text("Generated by GHS Babi Khel · Exam Seating Plan Engine", pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });

      doc.save(`DeskMap-${room.name.replace(/\s+/g, "_")}.pdf`);
      toast.success("Desk-layout map PDF downloaded");
    } catch (e: any) {
      toast.error("Failed to generate desk map: " + (e?.message ?? ""));
    }
    setBusy(false);
  };
  return (
    <Button size="sm" variant="outline" onClick={handle} disabled={busy}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
      Print Desk Map
    </Button>
  );
};

/** Per-desk sticker sheet — simple rectangle stickers, 3 per row, as many
 *  rows as fit per A4 page. Each sticker just shows the student name, class
 *  and exam roll number, with a thin black border (no QR code). */
const QrStickerSheetButton = ({ plan }: { plan: SeatingPlanFull }) => {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try {
      // Flatten assignments across all rooms.
      const all = plan.rooms.flatMap(r => r.assignments.map(a => ({ ...a, room_name: r.name })));
      if (all.length === 0) { toast.error("No assignments yet — generate seating first"); return; }

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 8;
      const cols = 3;                       // exactly 3 stickers per row
      const stickerH = 18;                  // thin rectangle, rows flow as many as fit
      const gap = 4;                        // small gap between stickers
      const stickerW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
      const rowsPerPage = Math.max(1, Math.floor((pageH - margin * 2 + gap) / (stickerH + gap)));

      // Style: thin black border, simple black text, two centered lines.
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2);  // thin black border
      doc.setTextColor(0, 0, 0);

      const drawSticker = (a: typeof all[number], x: number, y: number) => {
        // Thin black rectangle border
        doc.rect(x, y, stickerW, stickerH, "S");

        // Centered text block — name on top, class+roll on the line below
        const cx = x + stickerW / 2;
        // Name (bold, slightly larger)
        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        let nm = a.student_name ?? "";
        if (doc.getTextWidth(nm) > stickerW - 4) {
          while (nm.length > 1 && doc.getTextWidth(nm + "…") > stickerW - 4) nm = nm.slice(0, -1);
          nm = nm + "…";
        }
        doc.text(nm, cx, y + 7.5, { align: "center" });

        // Class · Exam Roll No (normal weight)
        doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        doc.text(`Class ${a.class}    ${a.exam_roll_no}`, cx, y + 13.5, { align: "center" });
      };

      let i = 0;
      for (const a of all) {
        if (i > 0 && i % (cols * rowsPerPage) === 0) doc.addPage();
        const idxOnPage = i % (cols * rowsPerPage);
        const r = Math.floor(idxOnPage / cols);
        const c = idxOnPage % cols;
        const x = margin + c * (stickerW + gap);
        const y = margin + r * (stickerH + gap);
        drawSticker(a, x, y);
        i++;
      }

      doc.save(`Desk-Stickers-${plan.title.replace(/\s+/g, "_")}.pdf`);
      toast.success(`Desk sticker sheet (${all.length} stickers) downloaded`);
    } catch (e: any) {
      toast.error("Failed: " + (e?.message ?? ""));
    }
    setBusy(false);
  };
  return (
    <Button size="sm" variant="outline" onClick={handle} disabled={busy}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />}
      Desk Sticker
    </Button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DUTIES PDF — beautiful professional single-page (or multi-page if needed)
// download of all exam staff duties: Superintendent, Deputy Superintendent,
// and all Invigilators (per room, with column-duty ranges). Includes a
// Principal signature line at the bottom.
//
// Design goals (per the user's request):
//   • "beautiful advance stylish professional one single page pdf"
//   • Shows ALL teachers' duties in one place
//   • Has an empty space at the end for the Principal's signature
//   • Mobile-friendly: the button is the same size as the other export
//     buttons; the PDF itself is A4 portrait which prints/reads well on
//     any device.
// ─────────────────────────────────────────────────────────────────────────────
const DutiesPdfButton = ({ plan }: { plan: SeatingPlanFull }) => {
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();   // 210
      const pageH = doc.internal.pageSize.getHeight();  // 297
      const margin = 15;
      const contentW = pageW - margin * 2;
      let y = margin;

      // ── HEADER BANNER (gradient-look via stacked rects) ──
      doc.setFillColor(15, 76, 129); // deep blue
      doc.rect(0, 0, pageW, 38, "F");
      doc.setFillColor(13, 148, 136); // teal accent
      doc.rect(0, 36, pageW, 2, "F");

      // School name
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Government High School Babi Khel", pageW / 2, 16, { align: "center" });
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("District Mohmand, KPK", pageW / 2, 23, { align: "center" });
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("EXAMINATION DUTY ASSIGNMENT SHEET", pageW / 2, 32, { align: "center" });

      // ── PLAN INFO BOX ──
      y = 48;
      doc.setTextColor(40, 40, 40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(plan.title, margin, y);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      const classesText = plan.classes.map(c => `Class ${c}`).join(", ");

      // ── Classes gets its own full-width, wrapped row (can be long) ──
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text("Classes:", margin, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      const classesLines = doc.splitTextToSize(classesText, contentW - 28);
      doc.text(classesLines, margin + 28, y);
      y += Math.max(6, classesLines.length * 5) + 2;

      // Info table (2 columns) — everything except Classes, which is above
      const infoColW = contentW / 2;
      const infoRowH = 6;
      const infoItems = [
        { label: "Rooms:", value: String(plan.rooms.length) },
        { label: "Students Seated:", value: String(plan.total_seated) },
        { label: "Paper Time:", value: plan.paper_start_at && plan.paper_end_at
          ? `${plan.paper_start_at.slice(11, 16)} — ${plan.paper_end_at.slice(11, 16)}`
          : "—" },
      ];
      const infoRows = Math.ceil(infoItems.length / 2);
      infoItems.forEach((item, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = margin + col * infoColW;
        const ry = y + row * infoRowH;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(item.label, x, ry);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 30, 30);
        const valueMaxW = infoColW - 28 - 4;
        const valueLines = doc.splitTextToSize(item.value, valueMaxW);
        doc.text(valueLines, x + 28, ry);
      });
      y += infoRowH * infoRows + 4;

      // ── DIVIDER ──
      doc.setDrawColor(15, 76, 129);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      // ── SUPERINTENDENT SECTION ──
      const drawStaffCard = (title: string, name: string, duty: string, accentColor: [number, number, number]) => {
        // Check if we need a new page
        if (y > pageH - 60) {
          doc.addPage();
          y = margin;
        }

        const cardH = 8 + Math.max(10, Math.ceil(duty.length / 90) * 4) + 6;
        // Background card
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(220, 220, 220);
        doc.roundedRect(margin, y, contentW, cardH, 2, 2, "FD");
        // Accent left bar
        doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.rect(margin, y, 3, cardH, "F");

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.text(title, margin + 6, y + 6);

        // Name
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(20, 20, 20);
        doc.text(name || "—", margin + 6, y + 12);

        // Duty
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(70, 70, 70);
        const dutyLines = doc.splitTextToSize(`Duty: ${duty}`, contentW - 12);
        doc.text(dutyLines, margin + 6, y + 18);

        y += cardH + 4;
      };

      drawStaffCard(
        "SUPERINTENDENT",
        (plan as any).superintendent || "—",
        (plan as any).superintendent_duty || SUPERINTENDENT_DUTY,
        [15, 76, 129]
      );

      drawStaffCard(
        "DEPUTY SUPERINTENDENT",
        (plan as any).deputy_superintendent || "—",
        (plan as any).deputy_superintendent_duty || DEPUTY_SUPERINTENDENT_DUTY,
        [13, 148, 136]
      );

      // ── INVIGILATORS SECTION ──
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(15, 76, 129);
      doc.text("INVIGILATORS", margin, y);
      y += 3;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      // Per-room invigilator cards
      plan.rooms.forEach((room, idx) => {
        const invigilators = room.invigilators?.length ? room.invigilators : (room.invigilator ? [room.invigilator] : []);
        const duties = resolveColDuties(room);
        if (invigilators.length === 0) return;

        // Check page break
        if (y > pageH - 40) {
          doc.addPage();
          y = margin;
        }

        // Room header
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 76, 129);
        doc.text(`Room ${idx + 1}: ${room.name}`, margin, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(`(${room.rows}×${room.cols} grid · ${room.capacity} seats)`, pageW - margin, y, { align: "right" });
        y += 5;

        // Invigilator list
        invigilators.forEach((name, i) => {
          if (y > pageH - 25) {
            doc.addPage();
            y = margin;
          }

          const duty = duties[i];
          const dutyText = duty
            ? `Columns ${duty.col_start}–${duty.col_end}`
            : "All columns";

          // Bullet
          doc.setFillColor(13, 148, 136);
          doc.circle(margin + 2, y - 1, 1.2, "F");

          // Name
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(30, 30, 30);
          doc.text(name || `Invigilator ${i + 1}`, margin + 6, y);

          // Duty range
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(100, 100, 100);
          doc.text(`(${dutyText})`, margin + 6 + doc.getTextWidth(name || `Invigilator ${i + 1}`) + 3, y);

          y += 5;
        });

        // Room notes (if any)
        if (room.notes) {
          if (y > pageH - 20) {
            doc.addPage();
            y = margin;
          }
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(120, 120, 120);
          const noteLines = doc.splitTextToSize(`Notes: ${room.notes}`, contentW - 6);
          doc.text(noteLines, margin + 6, y);
          y += noteLines.length * 4;
        }

        y += 4;
      });

      // ── INVIGILATOR GENERAL DUTY NOTE ──
      if (y > pageH - 30) {
        doc.addPage();
        y = margin;
      }
      doc.setFillColor(255, 247, 237); // warm amber background
      doc.setDrawColor(251, 191, 36);
      doc.roundedRect(margin, y, contentW, 14, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(180, 83, 9);
      doc.text("INVIGILATOR DUTY (ALL):", margin + 4, y + 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120, 53, 15);
      const invDutyLines = doc.splitTextToSize(INVIGILATOR_DUTY, contentW - 8);
      doc.text(invDutyLines, margin + 4, y + 9);
      y += 18;

      // ── PRINCIPAL SIGNATURE BLOCK ──
      // Push to bottom of page (or at least leave enough space).
      const sigBlockH = 30;
      if (y > pageH - sigBlockH - 10) {
        doc.addPage();
        y = margin;
      } else {
        y = pageH - sigBlockH - 15;
      }

      // Date on the left, Principal signature on the right
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text(`Date: ____________________`, margin, y);

      // Signature line
      doc.setDrawColor(60, 60, 60);
      doc.setLineWidth(0.4);
      const sigX = pageW - margin - 70;
      doc.line(sigX, y, pageW - margin, y);
      doc.text("Principal Signature", sigX, y + 5);

      // ── FOOTER ──
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Generated on ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} · GHS Babi Khel Exam Seating System`,
        pageW / 2,
        pageH - 6,
        { align: "center" }
      );

      doc.save(`Exam-Duties-${plan.title.replace(/\s+/g, "_")}.pdf`);
      toast.success("Duties PDF downloaded");
    } catch (e: any) {
      toast.error("Failed: " + (e?.message ?? ""));
    }
    setBusy(false);
  };

  return (
    <Button size="sm" variant="outline" onClick={handle} disabled={busy}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
      Duties PDF
    </Button>
  );
};

export default AdminExamSeating;
