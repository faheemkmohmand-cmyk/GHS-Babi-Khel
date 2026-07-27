// src/pages/admin/tabs/AdminExamSchedule.tsx
// Advanced Exam Date Sheet manager — Auto Fill generates and saves the schedule
// directly (no manual row grid), per-class clear/delete, and a combined
// multi-class PDF export.

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Loader2, Wand2, Calendar, Clock, Shuffle, Download, X } from "lucide-react";
import { format, addDays, isSunday } from "date-fns";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  useAllExamSchedule, useUpsertExamSchedule, useDeleteExamEntry, useDeleteExamScheduleBatch,
} from "@/hooks/useNewFeatures";

const classes = ["6", "7", "8", "9", "10"];
const getExamTypes = (cls: string) => ["9", "10"].includes(cls) ? ["Annual-I", "Annual-II"] : ["1st Semester", "2nd Semester"];
const SUBJECTS_6_8 = ["English", "Urdu", "Islamiyat", "M.Quran", "Arabic", "Geography", "Pashto", "Maths", "History", "G.Science", "Computer Science"];
const SUBJECTS_9_10 = ["English", "Urdu", "Pak-study", "Chemistry", "Physics", "Computer Science", "Biology", "Islamiyat", "M.Quran", "Mathematics"];
const getSubjects = (cls: string) => ["9", "10"].includes(cls) ? SUBJECTS_9_10 : SUBJECTS_6_8;

const currentYear = new Date().getFullYear();

export default function AdminExamSchedule() {
  const { data: allEntries = [], isLoading } = useAllExamSchedule();
  const addEntries = useUpsertExamSchedule();
  const deleteEntry = useDeleteExamEntry();
  const deleteBatch = useDeleteExamScheduleBatch();

  const [filterCls, setFilterCls] = useState("6");
  const [filterExam, setFilterExam] = useState("1st Semester");
  const [bulkCls, setBulkCls] = useState("6");
  const [bulkExam, setBulkExam] = useState("1st Semester");
  const [bulkYearInput, setBulkYearInput] = useState(String(currentYear));
  const [saving, setSaving] = useState(false);
  const [deletingClass, setDeletingClass] = useState(false);

  const bulkYear = parseInt(bulkYearInput, 10);
  const filtered = allEntries.filter(e => e.class === filterCls && e.exam_type === filterExam);

  // ── Auto Fill dialog state ──
  const [autoFillOpen, setAutoFillOpen] = useState(false);
  const [afSelectedSubjects, setAfSelectedSubjects] = useState<string[]>([]);
  const [afDefaultStart, setAfDefaultStart] = useState("09:00");
  const [afDefaultEnd, setAfDefaultEnd] = useState("12:00");
  const [afOverrides, setAfOverrides] = useState<Record<string, { start: string; end: string }>>({});
  const [afCustomizing, setAfCustomizing] = useState<string>(""); // subject currently being given a custom time, via a small picker
  const [afRangeStart, setAfRangeStart] = useState("");
  const [afRangeEnd, setAfRangeEnd] = useState("");
  const [afGapDays, setAfGapDays] = useState("0");

  const openAutoFill = () => {
    setAfSelectedSubjects(getSubjects(bulkCls));
    setAfOverrides({});
    setAfCustomizing("");
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

  const runAutoFill = async () => {
    if (isNaN(bulkYear) || bulkYear < 2000) { toast.error("Enter a valid year"); return; }
    if (!afSelectedSubjects.length) { toast.error("Select at least one subject"); return; }
    if (!afRangeStart || !afRangeEnd) { toast.error("Pick a start and end date for the exam window"); return; }
    const start = new Date(afRangeStart);
    const end = new Date(afRangeEnd);
    if (start > end) { toast.error("Start date must be before end date"); return; }
    const gap = Math.max(0, parseInt(afGapDays, 10) || 0);

    const order = shuffle(afSelectedSubjects);
    const generated: { subject: string; exam_date: string; start_time: string; end_time: string }[] = [];
    let cursor = start;

    for (let i = 0; i < order.length; i++) {
      // Sunday is always a holiday — hop forward until we land on a non-Sunday
      while (isSunday(cursor)) cursor = addDays(cursor, 1);

      if (cursor > end) {
        toast.error(`Only ${i} of ${order.length} subjects fit in the selected date range — widen the range or reduce the gap`);
        return;
      }

      const subj = order[i];
      const ov = afOverrides[subj];
      generated.push({
        subject: subj,
        exam_date: format(cursor, "yyyy-MM-dd"),
        start_time: ov?.start || afDefaultStart,
        end_time: ov?.end || afDefaultEnd,
      });

      // Move to the next paper's date: 1 day plus however many gap/holiday days requested
      cursor = addDays(cursor, 1 + gap);
    }

    if (!generated.length) return;

    setSaving(true);
    try {
      await addEntries.mutateAsync(generated.map(r => ({
        class: bulkCls, exam_type: bulkExam, year: bulkYear,
        subject: r.subject,
        paper_name: null,
        paper_code: null,
        exam_date: r.exam_date,
        start_time: r.start_time,
        end_time: r.end_time,
        hall: null,
        notes: null,
        is_published: true,
      })));
      toast.success(`Generated and saved a schedule for ${generated.length} subjects`);
      setAutoFillOpen(false);
      setFilterCls(bulkCls);
      setFilterExam(bulkExam);
    } catch {
      toast.error("Failed to save the generated schedule");
    }
    setSaving(false);
  };

  const handleDeleteClassSchedule = async () => {
    if (isNaN(bulkYear) || bulkYear < 2000) { toast.error("Enter a valid year first"); return; }
    setDeletingClass(true);
    try {
      await deleteBatch.mutateAsync({ cls: filterCls, examType: filterExam, year: bulkYear });
      toast.success(`Cleared the ${filterExam} schedule for Class ${filterCls}`);
    } catch {
      toast.error("Failed to clear schedule");
    }
    setDeletingClass(false);
  };

  // ── PDF export: single class or all classes combined ──
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"single" | "all">("single");
  const [exportCls, setExportCls] = useState("6");
  const [exportExam, setExportExam] = useState("1st Semester");

  // ── Single-class PDF section: # / Subject / Date / Day / Time, all centered ──
  const buildPdfForClass = (doc: jsPDF, cls: string, examType: string) => {
    const entries = allEntries
      .filter(e => e.class === cls && e.exam_type === examType && e.year === bulkYear)
      .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
    if (!entries.length) return false;

    const w = doc.internal.pageSize.getWidth();

    // ── Header — clean grayscale, double-line accent, matches other school PDFs ──
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.8);
    doc.line(0, 36, w, 36);
    doc.setLineWidth(0.3);
    doc.line(0, 37.5, w, 37.5);

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Government High School Babi Khel", w / 2, 14, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("District Mohmand, KPK", w / 2, 21, { align: "center" });

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("EXAM DATE SHEET", w / 2, 30, { align: "center" });

    // ── Info box ──
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(12, 42, w - 24, 16, 2, 2, "F");
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.roundedRect(12, 42, w - 24, 16, 2, 2, "S");

    const infoItems = [
      { label: "CLASS", value: `Class ${cls}` },
      { label: "EXAM", value: examType },
      { label: "YEAR", value: String(bulkYear) },
      { label: "PAPERS", value: String(entries.length) },
    ];
    const infoW = (w - 24) / infoItems.length;
    infoItems.forEach((item, i) => {
      const cx = 12 + i * infoW + infoW / 2;
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text(item.label, cx, 47.5, { align: "center" });
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(item.value, cx, 54, { align: "center" });
    });

    const tableBody = entries.map((e, idx) => [
      String(idx + 1),
      e.subject,
      format(new Date(e.exam_date), "dd MMM yyyy"),
      format(new Date(e.exam_date), "EEEE"),
      `${e.start_time || "-"} – ${e.end_time || "-"}`,
    ]);

    autoTable(doc, {
      startY: 64,
      head: [["#", "Subject", "Date", "Day", "Time"]],
      body: tableBody,
      styles: {
        fontSize: 9,
        cellPadding: 3,
        valign: "middle",
        halign: "center",
        textColor: [40, 40, 40],
        overflow: "linebreak",
        lineColor: [200, 200, 200],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: [60, 60, 60],
        fontStyle: "bold",
        fontSize: 8,
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 46 },
        2: { cellWidth: 34 },
        3: { cellWidth: 30 },
        4: { cellWidth: 36 },
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: 12, right: 12, bottom: 20 },
    });

    return true;
  };

  // ── All-classes PDF: one single combined table on one page (landscape), Class column added ──
  const buildCombinedPdf = (doc: jsPDF) => {
    const rows: { cls: string; examType: string; subject: string; exam_date: string; start_time: string | null; end_time: string | null }[] = [];
    for (const cls of classes) {
      for (const ex of getExamTypes(cls)) {
        allEntries
          .filter(e => e.class === cls && e.exam_type === ex && e.year === bulkYear)
          .forEach(e => rows.push({ cls, examType: ex, subject: e.subject, exam_date: e.exam_date, start_time: e.start_time, end_time: e.end_time }));
      }
    }
    if (!rows.length) return false;

    rows.sort((a, b) => (parseInt(a.cls) - parseInt(b.cls)) || a.exam_date.localeCompare(b.exam_date));

    const w = doc.internal.pageSize.getWidth();

    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.8);
    doc.line(0, 26, w, 26);
    doc.setLineWidth(0.3);
    doc.line(0, 27.5, w, 27.5);

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Government High School Babi Khel", w / 2, 12, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("District Mohmand, KPK", w / 2, 18, { align: "center" });
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`EXAM DATE SHEET — ALL CLASSES · ${bulkYear}`, w / 2, 24, { align: "center" });

    const tableBody = rows.map((r, idx) => [
      String(idx + 1),
      `Class ${r.cls}`,
      r.examType,
      r.subject,
      format(new Date(r.exam_date), "dd MMM yyyy"),
      format(new Date(r.exam_date), "EEEE"),
      `${r.start_time || "-"} – ${r.end_time || "-"}`,
    ]);

    autoTable(doc, {
      startY: 34,
      head: [["#", "Class", "Exam", "Subject", "Date", "Day", "Time"]],
      body: tableBody,
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
        valign: "middle",
        halign: "center",
        textColor: [40, 40, 40],
        overflow: "linebreak",
        lineColor: [200, 200, 200],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: [60, 60, 60],
        fontStyle: "bold",
        fontSize: 8,
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 24 },
        2: { cellWidth: 28 },
        3: { cellWidth: 44 },
        4: { cellWidth: 32 },
        5: { cellWidth: 32 },
        6: { cellWidth: 34 },
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: 10, right: 10, bottom: 16 },
    });

    return true;
  };

  const runExport = () => {
    if (isNaN(bulkYear) || bulkYear < 2000) { toast.error("Enter a valid year first"); return; }

    if (exportScope === "single") {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const wrote = buildPdfForClass(doc, exportCls, exportExam);
      if (!wrote) { toast.error(`No schedule found for Class ${exportCls} · ${exportExam} · ${bulkYear}`); return; }
      finalizeAndSave(doc, `Exam-Date-Sheet-Class-${exportCls}-${exportExam.replace(/\s+/g, "-")}-${bulkYear}.pdf`);
    } else {
      // Landscape so one combined table fits every class on a single page
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const wrote = buildCombinedPdf(doc);
      if (!wrote) { toast.error(`No exam schedule found for ${bulkYear} yet`); return; }
      finalizeAndSave(doc, `Exam-Date-Sheet-All-Classes-${bulkYear}.pdf`);
    }
  };

  const finalizeAndSave = (doc: jsPDF, filename: string) => {
    // ── Footer page numbers, muted ──
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(10, h - 14, w - 10, h - 14);
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      doc.text(`Page ${p} of ${totalPages}`, w - 10, h - 8, { align: "right" });
      doc.text("Generated by GHS Babi Khel Admin Panel", 10, h - 8);
    }
    doc.save(filename);
    setExportOpen(false);
    toast.success("Exam schedule PDF downloaded");
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-foreground flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Exam Date Sheet Manager</h3>
        <p className="text-xs text-muted-foreground">Auto-generate a full exam schedule per class — shuffled dates, Sunday holidays, and PDF export</p>
      </div>

      <Card><CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold text-foreground">Generate Exam Schedule</p>
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
          <Button size="sm" variant="outline" onClick={() => { setExportCls(bulkCls); setExportExam(bulkExam); setExportOpen(true); }} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Download PDF
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">Click <strong>Auto Fill</strong> above to generate and save a schedule for this class — no manual row entry needed.</p>
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
              <p className="text-[11px] text-muted-foreground">Applied to every selected subject, unless overridden below.</p>
            </div>

            {/* Compact custom-timing picker: pick a subject from a dropdown, then set its time — instead of listing every subject */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Custom timing for a specific paper (optional)</Label>
              <p className="text-[11px] text-muted-foreground -mt-1">e.g. give Islamiyat or M.Quran a shorter 9:00–11:00 slot.</p>

              <div className="flex gap-2">
                <Select value={afCustomizing} onValueChange={setAfCustomizing}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Choose a subject to customize…" /></SelectTrigger>
                  <SelectContent>
                    {afSelectedSubjects.filter(s => !afOverrides[s]).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!afCustomizing}
                  onClick={() => { if (afCustomizing) { setAfOverride(afCustomizing, "start", afDefaultStart); setAfOverride(afCustomizing, "end", afDefaultEnd); } }}
                  className="h-8 text-xs shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>

              {Object.keys(afOverrides).length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {Object.entries(afOverrides).map(([s, ov]) => (
                    <div key={s} className="flex items-center gap-1.5 bg-secondary/20 rounded-lg p-1.5">
                      <span className="text-xs flex-1 truncate">{s}</span>
                      <Input type="time" value={ov.start} onChange={e => setAfOverride(s, "start", e.target.value)} className="h-7 text-xs w-[5.5rem] px-1.5" />
                      <span className="text-[10px] text-muted-foreground shrink-0">to</span>
                      <Input type="time" value={ov.end} onChange={e => setAfOverride(s, "end", e.target.value)} className="h-7 text-xs w-[5.5rem] px-1.5" />
                      <Button size="sm" variant="ghost" onClick={() => { clearAfOverride(s); setAfCustomizing(""); }} className="h-7 w-7 p-0 text-muted-foreground shrink-0"><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
            <Button onClick={runAutoFill} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Generate & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export PDF dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Download className="w-4 h-4 text-primary" /> Download Exam Date Sheet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="flex gap-2">
              <button onClick={() => setExportScope("single")} className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${exportScope === "single" ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-transparent"}`}>Single Class</button>
              <button onClick={() => setExportScope("all")} className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${exportScope === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-transparent"}`}>All Classes</button>
            </div>

            {exportScope === "single" && (
              <div className="flex gap-3">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Class</Label>
                  <Select value={exportCls} onValueChange={v => { setExportCls(v); setExportExam(getExamTypes(v)[0]); }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{classes.map(c => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Exam Type</Label>
                  <Select value={exportExam} onValueChange={setExportExam}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{getExamTypes(exportCls).map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {exportScope === "all" && (
              <p className="text-xs text-muted-foreground">Combines every class's schedule for year <strong>{bulkYear}</strong> into one PDF, one section per class.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button onClick={runExport} className="gap-1.5"><Download className="w-3.5 h-3.5" /> Download</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View existing */}
      <div className="flex gap-2 flex-wrap">{classes.map(c => <button key={c} onClick={() => { setFilterCls(c); setFilterExam(getExamTypes(c)[0]); }} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${filterCls === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>Class {c}</button>)}</div>
      <div className="flex items-center gap-2 flex-wrap">
        {getExamTypes(filterCls).map(e => <button key={e} onClick={() => setFilterExam(e)} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${filterExam === e ? "bg-primary/20 text-primary border border-primary/30" : "bg-secondary text-muted-foreground"}`}>{e}</button>)}

        {filtered.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="text-destructive gap-1 h-7 px-2 text-xs ml-auto">
                <Trash2 className="w-3.5 h-3.5" /> Delete Schedule
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all Class {filterCls} · {filterExam} schedule?</AlertDialogTitle>
                <AlertDialogDescription>This removes all {filtered.length} exam entries for this class and exam type at once. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteClassSchedule} disabled={deletingClass} className="bg-destructive text-destructive-foreground">
                  {deletingClass && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Delete All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {isLoading ? <Skeleton className="h-32 rounded-xl" /> : filtered.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No schedule for this class yet.</p> : (
        <div className="space-y-2">
          {filtered.map(e => (
            <div key={e.id} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex flex-col items-center justify-center text-primary font-bold text-[10px] shrink-0 leading-tight text-center">
                <span className="text-sm font-black">{format(new Date(e.exam_date), "dd")}</span>
                <span>{format(new Date(e.exam_date), "MMM")}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{e.subject}</p>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
                  <span>{format(new Date(e.exam_date), "EEEE, dd MMMM yyyy")}</span>
                  {e.start_time && <span>{e.start_time}{e.end_time ? `–${e.end_time}` : ""}</span>}
                  {e.hall && <span>Hall: {e.hall}</span>}
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
