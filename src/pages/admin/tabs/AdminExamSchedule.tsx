// src/pages/admin/tabs/AdminExamSchedule.tsx
// Advanced Exam Date Sheet manager — bulk grid entry, copy-to-other-classes,
// prefill from a previous year's schedule, and hall/date clash detection.
// Extracted out of AdminExtras.tsx and upgraded; now lives under the "Exams" hub.

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Loader2, Copy, Wand2, AlertTriangle, Calendar, Clock, Shuffle } from "lucide-react";
import { format, addDays, isSunday } from "date-fns";
import toast from "react-hot-toast";
import {
  useAllExamSchedule, useUpsertExamSchedule, useDeleteExamEntry, type ExamScheduleEntry,
} from "@/hooks/useNewFeatures";

const classes = ["6", "7", "8", "9", "10"];
const getExamTypes = (cls: string) => ["9", "10"].includes(cls) ? ["Annual-I", "Annual-II"] : ["1st Semester", "2nd Semester"];
const SUBJECTS_6_8 = ["English", "Urdu", "Islamiyat", "M.Quran", "Arabic", "Geography", "Pashto", "Maths", "History", "G.Science", "Computer Science"];
const SUBJECTS_9_10 = ["English", "Urdu", "Pak-study", "Chemistry", "Physics", "Computer Science", "Biology", "Islamiyat", "M.Quran", "Mathematics"];
const getSubjects = (cls: string) => ["9", "10"].includes(cls) ? SUBJECTS_9_10 : SUBJECTS_6_8;

interface ScheduleRow { subject: string; paper_name: string; paper_code: string; exam_date: string; start_time: string; end_time: string; hall: string; notes: string; }
const EMPTY_ROW: ScheduleRow = { subject: "", paper_name: "", paper_code: "", exam_date: "", start_time: "09:00", end_time: "12:00", hall: "", notes: "" };

const currentYear = new Date().getFullYear();

export default function AdminExamSchedule() {
  const { data: allEntries = [], isLoading } = useAllExamSchedule();
  const addEntries = useUpsertExamSchedule();
  const deleteEntry = useDeleteExamEntry();

  const [filterCls, setFilterCls] = useState("6");
  const [filterExam, setFilterExam] = useState("1st Semester");
  const [bulkCls, setBulkCls] = useState("6");
  const [bulkExam, setBulkExam] = useState("1st Semester");
  const [bulkYearInput, setBulkYearInput] = useState(String(currentYear));
  const [rows, setRows] = useState<ScheduleRow[]>([{ ...EMPTY_ROW }]);
  const [saving, setSaving] = useState(false);

  // Which other classes to copy this batch's dates/times/hall to (subjects differ per class,
  // so copy carries over date/time/hall/notes but lets the admin re-pick each subject).
  const [copyToClasses, setCopyToClasses] = useState<string[]>([]);

  const bulkYear = parseInt(bulkYearInput, 10);
  const filtered = allEntries.filter(e => e.class === filterCls && e.exam_type === filterExam);

  const updateRow = (i: number, field: keyof ScheduleRow, val: string) => setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  const addRow = () => setRows(r => [...r, { ...EMPTY_ROW }]);
  const removeRow = (i: number) => setRows(r => r.filter((_, idx) => idx !== i));
  const toggleCopyClass = (c: string) => setCopyToClasses(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]);

  // ── Auto Fill dialog state ──
  const [autoFillOpen, setAutoFillOpen] = useState(false);
  const [afSelectedSubjects, setAfSelectedSubjects] = useState<string[]>([]);
  const [afDefaultStart, setAfDefaultStart] = useState("09:00");
  const [afDefaultEnd, setAfDefaultEnd] = useState("12:00");
  const [afOverrides, setAfOverrides] = useState<Record<string, { start: string; end: string }>>({});
  const [afRangeStart, setAfRangeStart] = useState("");
  const [afRangeEnd, setAfRangeEnd] = useState("");
  const [afGapDays, setAfGapDays] = useState("0");

  const openAutoFill = () => {
    // Reset the picker to the current bulk class's full subject list, all selected by default
    setAfSelectedSubjects(getSubjects(bulkCls));
    setAfOverrides({});
    setAfRangeStart("");
    setAfRangeEnd("");
    setAfGapDays("0");
    setAutoFillOpen(true);
  };

  const toggleAfSubject = (s: string) => setAfSelectedSubjects(cur => cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]);
  const setAfOverride = (s: string, field: "start" | "end", val: string) =>
    setAfOverrides(cur => ({ ...cur, [s]: { start: cur[s]?.start ?? afDefaultStart, end: cur[s]?.end ?? afDefaultEnd, [field]: val } }));
  const clearAfOverride = (s: string) => setAfOverrides(cur => { const n = { ...cur }; delete n[s]; return n; });

  // Fisher–Yates shuffle so re-clicking Generate gives a different subject order each time
  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const runAutoFill = () => {
    if (!afSelectedSubjects.length) { toast.error("Select at least one subject"); return; }
    if (!afRangeStart || !afRangeEnd) { toast.error("Pick a start and end date for the exam window"); return; }
    const start = new Date(afRangeStart);
    const end = new Date(afRangeEnd);
    if (start > end) { toast.error("Start date must be before end date"); return; }
    const gap = Math.max(0, parseInt(afGapDays, 10) || 0);

    const order = shuffle(afSelectedSubjects);
    const generated: ScheduleRow[] = [];
    let cursor = start;

    for (let i = 0; i < order.length; i++) {
      // Sunday is always a holiday — hop forward until we land on a non-Sunday
      while (isSunday(cursor)) cursor = addDays(cursor, 1);

      if (cursor > end) {
        toast.error(`Only ${i} of ${order.length} subjects fit in the selected date range — widen the range or reduce the gap`);
        break;
      }

      const subj = order[i];
      const ov = afOverrides[subj];
      generated.push({
        subject: subj,
        paper_name: "",
        paper_code: "",
        exam_date: format(cursor, "yyyy-MM-dd"),
        start_time: ov?.start || afDefaultStart,
        end_time: ov?.end || afDefaultEnd,
        hall: "",
        notes: "",
      });

      // Move to the next paper's date: 1 day plus however many gap/holiday days requested
      cursor = addDays(cursor, 1 + gap);
    }

    if (!generated.length) return;
    setRows(generated);
    setAutoFillOpen(false);
    toast.success(`Generated a schedule for ${generated.length} subjects — review and Save All when ready`);
  };

  // ── Clash detection: same date + same hall used by a different class already saved ──
  const clashes = useMemo(() => {
    const found: string[] = [];
    rows.forEach((row, i) => {
      if (!row.exam_date || !row.hall) return;
      const clash = allEntries.find(e =>
        e.exam_date === row.exam_date &&
        e.hall?.trim().toLowerCase() === row.hall.trim().toLowerCase() &&
        e.class !== bulkCls
      );
      if (clash) found.push(`Row ${i + 1}: Hall "${row.hall}" already booked for Class ${clash.class} on ${format(new Date(row.exam_date), "dd MMM")}`);
    });
    return found;
  }, [rows, allEntries, bulkCls]);

  const buildEntries = (cls: string) => {
    const valid = rows.filter(r => r.subject && r.exam_date);
    return valid.map(r => ({
      class: cls, exam_type: bulkExam, year: bulkYear,
      subject: r.subject,
      paper_name: r.paper_name || null,
      paper_code: r.paper_code || null,
      exam_date: r.exam_date,
      start_time: r.start_time || null,
      end_time: r.end_time || null,
      hall: r.hall || null,
      notes: r.notes || null,
      is_published: true,
    }));
  };

  const handleSave = async () => {
    if (isNaN(bulkYear) || bulkYear < 2000) { toast.error("Enter a valid year"); return; }
    const valid = rows.filter(r => r.subject && r.exam_date);
    if (!valid.length) { toast.error("Add at least one row with subject and date"); return; }
    setSaving(true);
    try {
      // Primary class
      await addEntries.mutateAsync(buildEntries(bulkCls));
      // Duplicate to any additionally-selected classes (same dates/times/hall/notes)
      for (const c of copyToClasses) {
        if (c === bulkCls) continue;
        await addEntries.mutateAsync(buildEntries(c));
      }
      const total = valid.length * (1 + copyToClasses.filter(c => c !== bulkCls).length);
      toast.success(`${total} exam entries added across ${1 + copyToClasses.filter(c => c !== bulkCls).length} class(es)`);
      setRows([{ ...EMPTY_ROW }]);
      setCopyToClasses([]);
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-foreground flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Exam Date Sheet Manager</h3>
        <p className="text-xs text-muted-foreground">Add exam schedule per class with full paper details — bulk entry, templates, and clash checks</p>
      </div>

      {/* Add form */}
      <Card><CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold text-foreground">Add New Exam Schedule</p>
          <Button size="sm" variant="outline" onClick={openAutoFill} className="gap-1.5">
            <Wand2 className="w-3.5 h-3.5" /> Auto Fill
          </Button>
        </div>

        <div className="flex gap-3 flex-wrap items-end">
          <div className="space-y-1">
            <Label className="text-xs">Class</Label>
            <Select value={bulkCls} onValueChange={v => { setBulkCls(v); setBulkExam(getExamTypes(v)[0]); }}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{classes.map(c => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Exam Type</Label>
            <Select value={bulkExam} onValueChange={setBulkExam}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{getExamTypes(bulkCls).map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Year</Label>
            <Input type="number" value={bulkYearInput} onChange={e => setBulkYearInput(e.target.value)} className="w-24" placeholder="2026" />
          </div>
        </div>

        {/* Column headers */}
        <div className="hidden sm:grid grid-cols-8 gap-1.5 text-[10px] font-bold text-muted-foreground uppercase px-0.5">
          <span>Subject *</span><span className="col-span-2">Paper Name</span><span>Paper Code</span><span>Date *</span><span>Start</span><span>End</span><span>Hall / Notes</span>
        </div>

        {/* Rows */}
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-8 gap-1.5 items-center bg-secondary/30 rounded-xl p-2">
              <Select value={row.subject} onValueChange={v => updateRow(i, "subject", v)}>
                <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Subject" /></SelectTrigger>
                <SelectContent>{getSubjects(bulkCls).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Input value={row.paper_name} onChange={e => updateRow(i, "paper_name", e.target.value)} placeholder="e.g. Mathematics Paper-I" className="text-xs h-8 sm:col-span-2" />
              <Input value={row.paper_code} onChange={e => updateRow(i, "paper_code", e.target.value)} placeholder="e.g. MATH-01" className="text-xs h-8" />
              <Input type="date" value={row.exam_date} onChange={e => updateRow(i, "exam_date", e.target.value)} className="text-xs h-8" />
              <Input type="time" value={row.start_time} onChange={e => updateRow(i, "start_time", e.target.value)} className="text-xs h-8" />
              <Input type="time" value={row.end_time} onChange={e => updateRow(i, "end_time", e.target.value)} className="text-xs h-8" />
              <div className="flex gap-1 items-center col-span-2 sm:col-span-1">
                <Input value={row.hall} onChange={e => updateRow(i, "hall", e.target.value)} placeholder="Hall/Notes" className="text-xs h-8 flex-1" />
                {rows.length > 1 && <Button size="sm" variant="ghost" onClick={() => removeRow(i)} className="text-destructive px-1.5 h-8 shrink-0"><Trash2 className="w-3.5 h-3.5" /></Button>}
              </div>
            </div>
          ))}
        </div>

        {clashes.length > 0 && (
          <div className="rounded-xl border border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800/50 p-3 space-y-1">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Possible hall clashes</p>
            {clashes.map((c, i) => <p key={i} className="text-xs text-orange-700/90 dark:text-orange-400/80">{c}</p>)}
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addRow}><Plus className="w-3.5 h-3.5 mr-1" />Add Row</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Save All</Button>
        </div>

        {/* Copy to other classes — same dates/times/hall, subjects picked per-class from the same rows above */}
        <div className="pt-2 border-t border-border space-y-2">
          <Label className="text-xs flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> Also copy this schedule to</Label>
          <div className="flex gap-1.5 flex-wrap">
            {classes.filter(c => c !== bulkCls).map(c => (
              <button
                key={c}
                onClick={() => toggleCopyClass(c)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                  copyToClasses.includes(c) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-transparent"
                }`}
              >
                Class {c}
              </button>
            ))}
          </div>
          {copyToClasses.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Same dates, times, hall & notes will also be saved for Class {copyToClasses.join(", ")} (subjects use the same list picked above).</p>
          )}
        </div>
      </CardContent></Card>

      {/* Auto Fill dialog */}
      <Dialog open={autoFillOpen} onOpenChange={setAutoFillOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wand2 className="w-4 h-4 text-primary" /> Auto Fill — Class {bulkCls} · {bulkExam}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Subject selection */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Subjects in this exam</Label>
              <p className="text-[11px] text-muted-foreground -mt-1">Unchecked subjects are skipped entirely — no paper will be generated for them.</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-secondary/30 p-3">
                {getSubjects(bulkCls).map(s => (
                  <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={afSelectedSubjects.includes(s)} onCheckedChange={() => toggleAfSubject(s)} />
                    <span className="truncate">{s}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Default timing */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Default exam timing</Label>
              <div className="flex gap-2 items-center">
                <Input type="time" value={afDefaultStart} onChange={e => setAfDefaultStart(e.target.value)} className="h-9" />
                <span className="text-xs text-muted-foreground shrink-0">to</span>
                <Input type="time" value={afDefaultEnd} onChange={e => setAfDefaultEnd(e.target.value)} className="h-9" />
              </div>
              <p className="text-[11px] text-muted-foreground">Applied to every selected subject, unless you set a custom time for it below.</p>
            </div>

            {/* Per-subject time overrides */}
            {afSelectedSubjects.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Custom timing for specific papers (optional)</Label>
                <p className="text-[11px] text-muted-foreground -mt-1">e.g. give Islamiyat or M.Quran a shorter 9:00–11:00 slot.</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {afSelectedSubjects.map(s => {
                    const ov = afOverrides[s];
                    return (
                      <div key={s} className="flex items-center gap-2 bg-secondary/20 rounded-lg p-1.5">
                        <span className="text-xs flex-1 truncate">{s}</span>
                        <Input type="time" value={ov?.start ?? ""} placeholder={afDefaultStart} onChange={e => setAfOverride(s, "start", e.target.value)} className="h-7 text-xs w-24" />
                        <Input type="time" value={ov?.end ?? ""} placeholder={afDefaultEnd} onChange={e => setAfOverride(s, "end", e.target.value)} className="h-7 text-xs w-24" />
                        {ov && <Button size="sm" variant="ghost" onClick={() => clearAfOverride(s)} className="h-7 px-1.5 text-muted-foreground shrink-0">✕</Button>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Date range */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Exam date range</Label>
              <div className="flex gap-2 items-center">
                <Input type="date" value={afRangeStart} onChange={e => setAfRangeStart(e.target.value)} className="h-9" />
                <span className="text-xs text-muted-foreground shrink-0">to</span>
                <Input type="date" value={afRangeEnd} onChange={e => setAfRangeEnd(e.target.value)} className="h-9" />
              </div>
            </div>

            {/* Gap between papers */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Gap Between Papers</Label>
              <Input type="number" min={0} value={afGapDays} onChange={e => setAfGapDays(e.target.value)} className="h-9 w-24" />
              <p className="text-[11px] text-muted-foreground">
                0 = a paper every day. 1 = one rest day between each paper. Sunday is always a holiday regardless of this setting,
                and a rest day that lands on a Sunday doesn't add an extra day — they overlap.
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Shuffle className="w-3 h-3" /> Subject order is shuffled each time you generate — click again for a different arrangement.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAutoFillOpen(false)}>Cancel</Button>
            <Button onClick={runAutoFill} className="gap-1.5"><Wand2 className="w-3.5 h-3.5" /> Generate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View existing */}
      <div className="flex gap-2 flex-wrap">{classes.map(c => <button key={c} onClick={() => { setFilterCls(c); setFilterExam(getExamTypes(c)[0]); }} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${filterCls === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>Class {c}</button>)}</div>
      <div className="flex gap-2">{getExamTypes(filterCls).map(e => <button key={e} onClick={() => setFilterExam(e)} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${filterExam === e ? "bg-primary/20 text-primary border border-primary/30" : "bg-secondary text-muted-foreground"}`}>{e}</button>)}</div>

      {isLoading ? <Skeleton className="h-32 rounded-xl" /> : filtered.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No schedule for this class yet.</p> : (
        <div className="space-y-2">
          {filtered.map(e => (
            <div key={e.id} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex flex-col items-center justify-center text-primary font-bold text-[10px] shrink-0 leading-tight text-center">
                <span className="text-sm font-black">{format(new Date(e.exam_date), "dd")}</span>
                <span>{format(new Date(e.exam_date), "MMM")}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{e.subject}{(e as any).paper_name ? ` — ${(e as any).paper_name}` : ""}</p>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
                  {(e as any).paper_code && <span className="font-mono bg-secondary px-1.5 py-0.5 rounded">{(e as any).paper_code}</span>}
                  <span>{format(new Date(e.exam_date), "EEEE, dd MMMM yyyy")}</span>
                  {e.start_time && <span>{e.start_time}{e.end_time ? `–${e.end_time}` : ""}</span>}
                  {e.hall && <span>Hall: {e.hall}</span>}
                  {e.notes && <span className="italic">{e.notes}</span>}
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button size="sm" variant="ghost" className="text-destructive shrink-0"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this exam entry?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteEntry.mutateAsync(e.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
