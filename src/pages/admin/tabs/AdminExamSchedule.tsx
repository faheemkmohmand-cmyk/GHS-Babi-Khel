// src/pages/admin/tabs/AdminExamSchedule.tsx
// Advanced Exam Date Sheet manager — bulk grid entry, copy-to-other-classes,
// prefill from a previous year's schedule, and hall/date clash detection.
// Extracted out of AdminExtras.tsx and upgraded; now lives under the "Exams" hub.

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Loader2, Copy, Wand2, AlertTriangle, Calendar } from "lucide-react";
import { format } from "date-fns";
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

  // ── Prefill from last year's same exam type (template) ──
  const prefillFromLastYear = () => {
    const lastYearEntries = allEntries.filter(
      e => e.class === bulkCls && e.exam_type === bulkExam && e.year === bulkYear - 1
    );
    if (!lastYearEntries.length) {
      toast.error(`No ${bulkYear - 1} schedule found for Class ${bulkCls} · ${bulkExam}`);
      return;
    }
    setRows(lastYearEntries.map(e => ({
      subject: e.subject,
      paper_name: e.paper_name || "",
      paper_code: e.paper_code || "",
      exam_date: "", // dates must be re-entered for the new year
      start_time: e.start_time || "09:00",
      end_time: e.end_time || "12:00",
      hall: e.hall || "",
      notes: e.notes || "",
    })));
    toast.success(`Prefilled ${lastYearEntries.length} subjects from ${bulkYear - 1} — set new dates below`);
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
          <Button size="sm" variant="outline" onClick={prefillFromLastYear} className="gap-1.5">
            <Wand2 className="w-3.5 h-3.5" /> Prefill from {bulkYear - 1}
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
