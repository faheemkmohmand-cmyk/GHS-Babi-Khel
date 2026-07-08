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
  LayoutGrid, Plus, Trash2, Loader2, RefreshCw, Download, Printer, Wand2, Send, ArrowLeft,
  Building2, Users, AlertTriangle, CheckCircle2, Grid3x3, QrCode, FileText, Search, Monitor,
  CalendarDays,
} from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import AdminExamConsole from "./AdminExamConsole";
import {
  useExamSessions,
} from "@/hooks/useExamAttendance";
import {
  useSeatingPlans, useSeatingPlan,
  useCreateSeatingPlan, useDeleteSeatingPlan, useUpsertRoom, useDeleteRoom,
  useGenerateSeating, usePublishSeatingPlan,
  encodeSeatingQRData,
  type SeatingRoom, type RoomWithAssignments, type SeatingPlanFull,
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
  const [paperSubject, setPaperSubject] = useState("");

  // ── MODE TOGGLE (Problem 1 fix): Single Day vs All Papers ──────────────
  // The admin picks ONE of two plan types up front. Each mode shows ONLY the
  // fields relevant to it — no more confusing jumble of single-day + range
  // fields all visible at once.
  //
  //   "single"  → Single Day Exam: one paper on one specific date.
  //               Fields: Exam Date, Paper Start, Paper End.
  //               is_recurring = false, no date range.
  //
  //   "all"     → All Papers (Multi-Day): the paper runs at the same time
  //               every day in a date range [from, to].
  //               Fields: Exam Date From, Exam Date To, Paper Start, Paper End.
  //               is_recurring = true, exam_date = null (the range replaces it).
  type PlanMode = "single" | "all";
  const [mode, setMode] = useState<PlanMode>("single");

  // Single-day fields
  const [examDate, setExamDate] = useState("");
  // Multi-day range fields
  const [examDateFrom, setExamDateFrom] = useState("");
  const [examDateTo, setExamDateTo] = useState("");
  // Shared timing fields (both modes use these)
  const [paperStartAt, setPaperStartAt] = useState("");
  const [paperEndAt, setPaperEndAt] = useState("");

  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

  const createMut = useCreateSeatingPlan();

  const toggleClass = (c: string) => {
    setSelectedClasses(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  };

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("Give the plan a title"); return; }
    if (selectedClasses.length < 2) { toast.error("Select at least 2 classes — anti-cheat mixing needs multiple classes"); return; }

    // Mode-specific validation
    if (mode === "all") {
      if (!examDateFrom || !examDateTo) { toast.error("Set both 'From' and 'To' dates for the multi-day range"); return; }
      if (examDateFrom > examDateTo) { toast.error("'From' date must be before or equal to 'To' date"); return; }
    }

    try {
      const plan = await createMut.mutateAsync({
        sessionId,
        title: title.trim(),
        classes: selectedClasses,
        paperSubject: paperSubject.trim() || null,
        // Single-day mode: pass examDate. All-Papers mode: examDate = null
        // (the range replaces it), is_recurring = true.
        examDate: mode === "single" ? (examDate || null) : null,
        paperStartAt: paperStartAt ? new Date(paperStartAt).toISOString() : null,
        paperEndAt: paperEndAt ? new Date(paperEndAt).toISOString() : null,
        isRecurring: mode === "all",
        // Date range: only set in All-Papers mode. In single-day mode, pass
        // null so the columns are explicitly cleared (in case the admin
        // switched modes before creating).
        examDateFrom: mode === "all" ? (examDateFrom || null) : null,
        examDateTo:   mode === "all" ? (examDateTo   || null) : null,
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
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Plan Title</Label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={session ? `${session.exam_term} ${session.exam_year} — Seating` : "e.g. Annual 2026 — Seating"}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Paper / Subject (optional)</Label>
          <Input value={paperSubject} onChange={e => setPaperSubject(e.target.value)} placeholder="e.g. Mathematics — Paper 1" className="mt-1" />
        </div>
      </div>

      {/* ── SINGLE DAY MODE ── */}
      {mode === "single" && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10 p-3 space-y-3">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" /> Single Day Exam
          </p>
          <p className="text-[11px] text-muted-foreground">
            One paper on one specific date. Set the date and paper timing below.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Exam Date</Label>
              <Input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Paper Start</Label>
              <Input type="datetime-local" value={paperStartAt} onChange={e => setPaperStartAt(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Paper End</Label>
              <Input type="datetime-local" value={paperEndAt} onChange={e => setPaperEndAt(e.target.value)} className="mt-1" />
            </div>
          </div>
        </div>
      )}

      {/* ── ALL PAPERS (MULTI-DAY) MODE ── */}
      {mode === "all" && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-900/10 p-3 space-y-3">
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> All Papers (Multi-Day)
          </p>
          <p className="text-[11px] text-muted-foreground">
            The paper runs at the same start/end TIME every day in the date range.
            The Live Console and Exam Attendance automatically use today's date —
            no need to update anything each morning.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Exam Date From (first paper day)</Label>
              <Input type="date" value={examDateFrom} onChange={e => setExamDateFrom(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Exam Date To (last paper day)</Label>
              <Input type="date" value={examDateTo} onChange={e => setExamDateTo(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Paper Start (time-of-day)</Label>
              <Input type="datetime-local" value={paperStartAt} onChange={e => setPaperStartAt(e.target.value)} className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">Only the TIME portion is used each day</p>
            </div>
            <div>
              <Label className="text-xs">Paper End (time-of-day)</Label>
              <Input type="datetime-local" value={paperEndAt} onChange={e => setPaperEndAt(e.target.value)} className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">Only the TIME portion is used each day</p>
            </div>
          </div>
          {examDateFrom && examDateTo && examDateFrom > examDateTo && (
            <p className="text-[11px] text-red-500 font-semibold">⚠ "From" date must be before or equal to "To" date.</p>
          )}
          {examDateFrom && examDateTo && examDateFrom <= examDateTo && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20 p-2.5 text-[11px] text-emerald-700 dark:text-emerald-400">
              ✓ Multi-day mode: the paper will run every day from <strong>{examDateFrom}</strong> to <strong>{examDateTo}</strong> at the same start/end time.
            </div>
          )}
        </div>
      )}

      {/* ── CLASSES (shared) ── */}
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
        <LookupExportButton plan={plan} />
        <QrStickerSheetButton plan={plan} />
        <DeletePlanButton planId={plan.id} sessionId={plan.session_id} onDeleted={onBack} />
      </div>

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
  const [invigilator, setInvigilator] = useState("");

  const handleAdd = async () => {
    if (!name.trim()) { toast.error("Room name required"); return; }
    try {
      await upsert.mutateAsync({ planId: plan.id, room: { name: name.trim(), rows, cols, invigilator: invigilator.trim() || null } });
      setName(""); setRows(6); setCols(5); setInvigilator("");
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
              <Label className="text-xs">Invigilator (optional)</Label>
              <Input value={invigilator} onChange={e => setInvigilator(e.target.value)} placeholder="e.g. Mr. Ahmad" className="mt-1 h-8 text-sm" />
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
              {r.invigilator ? ` · ${r.invigilator}` : ""}
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

  // Controlled local copies of invigilator/notes, re-synced whenever the
  // active room changes (by id) — this fixes a bug where switching rooms
  // without a remount left the previous room's invigilator name showing in
  // the input (defaultValue only applies once, on mount).
  const [invigilatorInput, setInvigilatorInput] = useState(room.invigilator ?? "");
  const [notesInput, setNotesInput] = useState(room.notes ?? "");
  useEffect(() => {
    setInvigilatorInput(room.invigilator ?? "");
    setNotesInput(room.notes ?? "");
  }, [room.id]);

  const toggleBlocked = async (r: number, c: number) => {
    if (plan.status === "published") { toast.error("Cannot edit a published plan — archive or recreate"); return; }
    const cur = room.block_layout ?? [];
    const exists = cur.some(([rr, cc]) => rr === r && cc === c);
    const next = exists ? cur.filter(([rr, cc]) => !(rr === r && cc === c)) : [...cur, [r, c]];
    try {
      await upsert.mutateAsync({
        planId: plan.id,
        room: { id: room.id, name: room.name, rows: room.rows, cols: room.cols, block_layout: next, invigilator: room.invigilator, notes: room.notes },
      });
    } catch { /* handled */ }
  };

  // Build a 2D lookup: assignments[(row,col)] = student
  const grid = useMemo(() => {
    const m = new Map<string, typeof room.assignments[number]>();
    for (const a of room.assignments) m.set(`${a.row_idx}:${a.col_idx}`, a);
    return m;
  }, [room.assignments]);

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
                if (isBlocked) {
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleBlocked(r, c)}
                      className="aspect-[4/3] rounded-md bg-foreground/10 dark:bg-foreground/20 flex items-center justify-center text-[10px] text-muted-foreground cursor-pointer border border-dashed border-border"
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
                      className={`aspect-[4/3] rounded-md border ${cc.bg} ${cc.text} p-1 flex flex-col justify-between text-[10px] leading-tight`}
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
                    className="aspect-[4/3] rounded-md bg-secondary/40 border border-border flex items-center justify-center text-[10px] text-muted-foreground cursor-pointer hover:bg-secondary"
                    title={`Empty desk R${r + 1}·S${c + 1} — click to block`}
                  >
                    R{r + 1}·S{c + 1}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Invigilator editor */}
          <div className="mt-4 pt-3 border-t border-border grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Invigilator</Label>
              <Input
                value={invigilatorInput}
                onChange={e => setInvigilatorInput(e.target.value)}
                onBlur={async (e) => {
                  if (e.target.value !== (room.invigilator ?? "")) {
                    await upsert.mutateAsync({
                      planId: plan.id,
                      room: { id: room.id, name: room.name, rows: room.rows, cols: room.cols, block_layout: room.block_layout, invigilator: e.target.value || null, notes: room.notes },
                    });
                  }
                }}
                placeholder="Assigned invigilator name"
                className="mt-1 h-8 text-sm"
              />
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
                      room: { id: room.id, name: room.name, rows: room.rows, cols: room.cols, block_layout: room.block_layout, invigilator: room.invigilator, notes: e.target.value || null },
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
      if (room.invigilator) {
        doc.setFontSize(9); doc.setTextColor(110);
        doc.text(`Invigilator: ${room.invigilator}`, pageW / 2, 25.5, { align: "center" });
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
            doc.setFillColor(220, 220, 220);
            doc.rect(x, y, cellW - 1, cellH - 1, "F");
            doc.setFontSize(7); doc.setTextColor(150); doc.setFont("helvetica", "bold");
            doc.text("BLOCKED", x + cellW / 2, y + cellH / 2, { align: "center" });
          } else if (a) {
            const cc = colorFor(a.class);
            doc.setFillColor(cc.pdfRgb[0], cc.pdfRgb[1], cc.pdfRgb[2]);
            doc.rect(x, y, cellW - 1, cellH - 1, "F");
            doc.setDrawColor(120); doc.setLineWidth(0.2);
            doc.rect(x, y, cellW - 1, cellH - 1, "S");
            doc.setTextColor(40);
            doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
            doc.text(`R${r + 1}·S${c + 1}`, x + 1.5, y + 4);
            doc.setFont("helvetica", "normal"); doc.setFontSize(7);
            const nm = a.student_name.length > 18 ? a.student_name.slice(0, 17) + "…" : a.student_name;
            doc.text(nm, x + 1.5, y + 9);
            doc.setFont("helvetica", "bold"); doc.setFontSize(8);
            doc.text(a.exam_roll_no, x + 1.5, y + 14);
            doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(90);
            doc.text(`Class ${a.class}`, x + 1.5, y + 18);
          } else {
            doc.setDrawColor(180); doc.setLineWidth(0.2);
            doc.rect(x, y, cellW - 1, cellH - 1, "S");
            doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "normal");
            doc.text(`R${r + 1}·S${c + 1}`, x + cellW / 2, y + cellH / 2, { align: "center" });
          }
        }
      }

      // Legend
      const legendY = gridTop + room.rows * cellH + 6;
      let lx = margin;
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(40);
      doc.text("Legend:", lx, legendY + 3); lx += 18;
      for (const cls of plan.classes) {
        const cc = colorFor(cls);
        doc.setFillColor(cc.pdfRgb[0], cc.pdfRgb[1], cc.pdfRgb[2]);
        doc.rect(lx, legendY - 2, 4, 4, "F");
        doc.text(`Class ${cls}`, lx + 6, legendY + 3);
        lx += 30;
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

/** "Roll No → Seat → Room" lookup — both PDF and CSV. */
const LookupExportButton = ({ plan }: { plan: SeatingPlanFull }) => {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"pdf" | "csv" | null>(null);

  const all = useMemo(() => {
    const rows: Array<{ exam_roll_no: string; student_name: string; class: string; class_roll_no: string; room_name: string; seat_label: string; row_idx: number; col_idx: number; invigilator: string | null }> = [];
    for (const r of plan.rooms) {
      for (const a of r.assignments) {
        rows.push({
          exam_roll_no: a.exam_roll_no,
          student_name: a.student_name,
          class: a.class,
          class_roll_no: a.class_roll_no,
          room_name: r.name,
          seat_label: a.seat_label,
          row_idx: a.row_idx,
          col_idx: a.col_idx,
          invigilator: r.invigilator,
        });
      }
    }
    rows.sort((a, b) => a.exam_roll_no.localeCompare(b.exam_roll_no, undefined, { numeric: true }));
    return rows;
  }, [plan]);

  const run = async (m: "pdf" | "csv") => {
    setBusy(true); setMode(m);
    try {
      if (m === "pdf") {
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const w = doc.internal.pageSize.getWidth();

        // ── Centered header ──
        doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 30, 30);
        doc.text(`${plan.title} — Seat Lookup`, w / 2, 14, { align: "center" });
        doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(110, 110, 110);
        doc.text(`Generated ${new Date().toLocaleString()}  ·  ${all.length} students seated`, w / 2, 19.5, { align: "center" });
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
        doc.line(10, 22.5, w - 10, 22.5);

        autoTable(doc, {
          startY: 26,
          head: [["Exam Roll", "Student", "Class", "Class Roll", "Room", "Seat", "Invigilator"]],
          body: all.map(r => [r.exam_roll_no, r.student_name, `Class ${r.class}`, r.class_roll_no, r.room_name, r.seat_label, r.invigilator ?? "—"]),
          styles: { fontSize: 7.5, cellPadding: 2, halign: "center", valign: "middle", textColor: [40, 40, 40], lineColor: [210, 210, 210], lineWidth: 0.2 },
          headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: "bold", halign: "center", valign: "middle" },
          columnStyles: {
            1: { halign: "center", fontStyle: "bold" }, // Student name — explicitly centered
          },
          alternateRowStyles: { fillColor: [245, 245, 245] },
          margin: { left: 10, right: 10 },
          didDrawPage: (data) => {
            doc.setFontSize(6); doc.setTextColor(140);
            doc.text("GHS Babi Khel · Exam Seating Plan Engine", w / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });
          },
        });
        doc.save(`Seat-Lookup-${plan.title.replace(/\s+/g, "_")}.pdf`);
        toast.success("Seat lookup PDF downloaded");
      } else {
        // CSV (browser-side).
        const header = ["Exam Roll No", "Student Name", "Class", "Class Roll No", "Room", "Seat Label", "Row", "Col", "Invigilator"];
        const lines = [header.join(",")];
        for (const r of all) {
          const row = [
            r.exam_roll_no,
            `"${r.student_name.replace(/"/g, '""')}"`,
            r.class,
            r.class_roll_no,
            `"${r.room_name.replace(/"/g, '""')}"`,
            r.seat_label,
            String(r.row_idx + 1),
            String(r.col_idx + 1),
            r.invigilator ? `"${r.invigilator.replace(/"/g, '""')}"` : "",
          ];
          lines.push(row.join(","));
        }
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = `Seat-Lookup-${plan.title.replace(/\s+/g, "_")}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Seat lookup CSV downloaded");
      }
    } catch (e: any) {
      toast.error("Export failed: " + (e?.message ?? ""));
    }
    setBusy(false); setMode(null);
  };

  return (
    <div className="inline-flex items-center gap-1">
      <Button size="sm" variant="outline" onClick={() => run("pdf")} disabled={busy}>
        {busy && mode === "pdf" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
        Roll→Seat PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => run("csv")} disabled={busy}>
        {busy && mode === "csv" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        CSV
      </Button>
    </div>
  );
};

/** Per-desk QR sticker sheet — print, cut, stick on each desk. */
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
      const cols = 3, rows = 4; // 12 stickers per page
      const cellW = (pageW - margin * 2) / cols;
      const cellH = (pageH - margin * 2) / rows;
      // Sticker inner area (matches the rounded-rect border we draw below).
      const innerW = cellW - 6;     // 3mm padding on each side
      const innerH = cellH - 6;     // 3mm padding on each side
      // Shrink the QR so all text fits comfortably inside the border with
      // breathing room. Older version used 50mm which pushed the roll number
      // past the bottom border. 34mm leaves ~28mm of label space below.
      const stickerSize = Math.min(innerW - 6, 34);
      const stickerInnerTop = 3;   // top padding inside the sticker

      let i = 0;
      for (const a of all) {
        if (i > 0 && i % (cols * rows) === 0) doc.addPage();
        const idxOnPage = i % (cols * rows);
        const r = Math.floor(idxOnPage / cols);
        const c = idxOnPage % cols;
        const x = margin + c * cellW;
        const y = margin + r * cellH;

        // Sticker border (slightly inset so the border doesn't touch the cell edge)
        doc.setDrawColor(80); doc.setLineWidth(0.3);
        doc.roundedRect(x + 1.5, y + 1.5, cellW - 3, cellH - 3, 2, 2, "S");

        // Inner content origin — everything is positioned relative to (ix, iy)
        const ix = x + 3;
        const iy = y + 3;

        // QR — horizontally centered in the inner area, with top padding.
        const qrData = encodeSeatingQRData({
          planId: plan.id, roomId: a.room_id, seatLabel: a.seat_label,
          studentId: a.student_id, examRollNo: a.exam_roll_no,
        });
        const qrDataURL = await QRCode.toDataURL(qrData, { width: 300, margin: 0, errorCorrectionLevel: "M" });
        const qrX = ix + (innerW - stickerSize) / 2;
        const qrY = iy + stickerInnerTop;
        doc.addImage(qrDataURL, "PNG", qrX, qrY, stickerSize, stickerSize);

        // Labels — anchored from the BOTTOM of the inner area upward,
        // so they never spill past the border regardless of font metrics.
        const centerX = ix + innerW / 2;
        const bottomY = iy + innerH - 2;   // 2mm bottom padding
        // Stack from bottom up: "Scan to mark attendance" → class+room → roll → name → seat label
        doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(120);
        doc.text("Scan to mark attendance", centerX, bottomY, { align: "center" });

        doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(110);
        doc.text(`Class ${a.class} · ${a.room_name}`, centerX, bottomY - 4, { align: "center" });

        // Roll number — bold, with 2mm clearance below it (the original bug)
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(30);
        doc.text(a.exam_roll_no, centerX, bottomY - 8, { align: "center" });

        // Student name — truncate to fit innerW
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(60);
        const maxNameW = innerW - 2;
        let nm = a.student_name;
        if (doc.getTextWidth(nm) > maxNameW) {
          while (nm.length > 1 && doc.getTextWidth(nm + "…") > maxNameW) nm = nm.slice(0, -1);
          nm = nm + "…";
        }
        doc.text(nm, centerX, bottomY - 12, { align: "center" });

        // Seat label — directly under the QR, bold
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(30);
        doc.text(a.seat_label, centerX, qrY + stickerSize + 5, { align: "center" });

        i++;
      }

      doc.save(`Desk-QR-Stickers-${plan.title.replace(/\s+/g, "_")}.pdf`);
      toast.success(`QR sticker sheet (${all.length} stickers) downloaded`);
    } catch (e: any) {
      toast.error("Failed: " + (e?.message ?? ""));
    }
    setBusy(false);
  };
  return (
    <Button size="sm" variant="outline" onClick={handle} disabled={busy}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
      Desk QR Stickers
    </Button>
  );
};

export default AdminExamSeating;
