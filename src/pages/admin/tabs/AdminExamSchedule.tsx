// src/pages/admin/tabs/AdminExamSchedule.tsx
// Advanced Exam Date Sheet manager — Auto Fill generates and saves the schedule
// directly (no manual row grid), per-class clear/delete, and a combined
// multi-class PDF export.

import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Minus, Check, Info, Sparkles, CalendarDays, Trash2, Loader2, Wand2, Calendar, Clock, Shuffle, Download, X } from "lucide-react";
import { format, addDays, isSunday } from "date-fns";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { examTypeLabel } from "@/utils/examTypeLabel";
import {
  useAllExamSchedule, useUpsertExamSchedule, useDeleteExamEntry, useDeleteExamScheduleBatch,
} from "@/hooks/useNewFeatures";

const classes = ["6", "7", "8", "9", "10"];
const getExamTypes = (cls: string) => ["9", "10"].includes(cls) ? ["Annual-I", "Annual-II"] : ["1st Semester", "2nd Semester"];
const SUBJECTS_6_8 = ["English", "Urdu", "Islamiyat", "M.Quran", "Arabic", "Geography", "Pashto", "Maths", "History", "G.Science", "Computer Science"];
const SUBJECTS_9_10 = ["English", "Urdu", "Pak-study", "Chemistry", "Physics", "Computer Science", "Biology", "Islamiyat", "M.Quran", "Mathematics"];
const getSubjects = (cls: string) => ["9", "10"].includes(cls) ? SUBJECTS_9_10 : SUBJECTS_6_8;

const currentYear = new Date().getFullYear();

// Shared mobile-safe field + thin-button styles (16px font on mobile prevents iOS focus-zoom)
const fieldCls = "h-9 w-full min-w-0 rounded-lg px-2.5 text-base sm:text-sm [&::-webkit-date-and-time-value]:text-left";
const thinBtn = "h-8 gap-1.5 px-3 text-xs [&_svg]:size-3.5";

function Section({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-2.5 rounded-2xl border border-border bg-secondary/30 p-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h4 className="flex min-w-0 items-center gap-2 text-xs font-semibold text-foreground">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{n}</span>
          <span className="break-words">{title}</span>
        </h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

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
      toast.success(`Cleared the ${examTypeLabel(filterExam)} schedule for Class ${filterCls}`);
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
      { label: "EXAM", value: examTypeLabel(examType) },
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
      tableWidth: w - 24,
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
        0: { cellWidth: (w - 24) * 0.08 },
        1: { cellWidth: (w - 24) * 0.30 },
        2: { cellWidth: (w - 24) * 0.24 },
        3: { cellWidth: (w - 24) * 0.20 },
        4: { cellWidth: (w - 24) * 0.18 },
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: 12, right: 12, bottom: 20 },
    });

    return true;
  };

  // ── All-classes PDF: compact grid of per-class mini date-sheets, 2 per row,
  // so everything fits on 1–2 landscape pages instead of one long scrolling table ──
  const buildCombinedPdf = (doc: jsPDF) => {
    type ClassBlock = { cls: string; examType: string; rows: { subject: string; date: string; day: string; time: string }[] };
    const blocks: ClassBlock[] = [];
    for (const cls of classes) {
      for (const ex of getExamTypes(cls)) {
        const entries = allEntries
          .filter(e => e.class === cls && e.exam_type === ex && e.year === bulkYear)
          .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
        if (entries.length) {
          blocks.push({
            cls, examType: ex,
            rows: entries.map(e => ({
              subject: e.subject,
              date: format(new Date(e.exam_date), "dd MMM yyyy"),
              day: format(new Date(e.exam_date), "EEE"),
              time: `${e.start_time || "-"}–${e.end_time || "-"}`,
            })),
          });
        }
      }
    }
    if (!blocks.length) return false;

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;
    const gutter = 6;
    const cols = 2;
    const colW = (pageW - margin * 2 - gutter * (cols - 1)) / cols;
    const topOfPage = 26; // reserved for the school header, drawn once per page

    const drawPageHeader = () => {
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.7);
      doc.line(0, 20, pageW, 20);
      doc.setLineWidth(0.3);
      doc.line(0, 21.3, pageW, 21.3);
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Government High School Babi Khel", pageW / 2, 9, { align: "center" });
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text("District Mohmand, KPK", pageW / 2, 14, { align: "center" });
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`EXAM DATE SHEET — ALL CLASSES · ${bulkYear}`, pageW / 2, 18.5, { align: "center" });
    };

    drawPageHeader();

    let col = 0;
    let x = margin;
    let y = topOfPage;
    let rowMaxHeight = 0;

    const estimateBlockHeight = (rows: number) => 8 + 5.2 * (rows + 1) + 4;

    blocks.forEach((block, i) => {
      // Only check for a page break when starting a fresh row (left column) — this keeps
      // both columns of a row on the same page, so the 2-column layout never splits mid-row.
      if (col === 0) {
        const estH = estimateBlockHeight(block.rows.length);
        if (y + estH > pageH - 14 && y > topOfPage) {
          doc.addPage();
          drawPageHeader();
          y = topOfPage;
        }
      }

      // Block title: "Class 6 · 1st Semester"
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(x, y, colW, 6.5, 1, 1, "F");
      doc.setDrawColor(190, 190, 190);
      doc.setLineWidth(0.25);
      doc.roundedRect(x, y, colW, 6.5, 1, 1, "S");
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(`Class ${block.cls}  ·  ${examTypeLabel(block.examType)}`, x + colW / 2, y + 4.4, { align: "center" });

      const tableBody = block.rows.map((r, idx) => [String(idx + 1), r.subject, r.date, r.day, r.time]);

      autoTable(doc, {
        startY: y + 7.5,
        head: [["#", "Subject", "Date", "Day", "Time"]],
        body: tableBody,
        tableWidth: colW,
        margin: { left: x, right: pageW - x - colW },
        styles: {
          fontSize: 6.6,
          cellPadding: 1.3,
          valign: "middle",
          halign: "center",
          textColor: [40, 40, 40],
          overflow: "linebreak",
          lineColor: [205, 205, 205],
          lineWidth: 0.25,
        },
        headStyles: {
          fillColor: [250, 250, 250],
          textColor: [70, 70, 70],
          fontStyle: "bold",
          fontSize: 6.3,
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: colW * 0.08 },
          1: { cellWidth: colW * 0.34, halign: "center" },
          2: { cellWidth: colW * 0.24 },
          3: { cellWidth: colW * 0.16 },
          4: { cellWidth: colW * 0.18 },
        },
        alternateRowStyles: { fillColor: [252, 252, 252] },
      });

      const finalY = (doc as any).lastAutoTable.finalY as number;
      const blockBottom = finalY + 4;
      rowMaxHeight = Math.max(rowMaxHeight, blockBottom - y);

      const isLastBlock = i === blocks.length - 1;

      // Advance to next column, or wrap to a new row of blocks
      if (col === cols - 1 || isLastBlock) {
        col = 0;
        x = margin;
        y = y + rowMaxHeight;
        rowMaxHeight = 0;
      } else {
        col = 1;
        x = margin + colW + gutter;
        // y stays the same — second block sits beside the first
      }
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

  // ── Display helpers ──
  const sortedFiltered = [...filtered].sort((a, b) => a.exam_date.localeCompare(b.exam_date));
  const firstDate = sortedFiltered[0]?.exam_date;
  const lastDate = sortedFiltered[sortedFiltered.length - 1]?.exam_date;

  // Live "will it fit?" hint for the Auto Fill dialog — mirrors runAutoFill's Sunday/gap walk
  const afFit: number | null = (() => {
    if (!afRangeStart || !afRangeEnd) return null;
    const s = new Date(afRangeStart);
    const e = new Date(afRangeEnd);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return null;
    const gap = Math.max(0, parseInt(afGapDays, 10) || 0);
    let c = s;
    let n = 0;
    for (;;) {
      while (isSunday(c)) c = addDays(c, 1);
      if (c > e) break;
      n++;
      c = addDays(c, 1 + gap);
    }
    return n;
  })();

  const gapNum = Math.max(0, parseInt(afGapDays, 10) || 0);
  const afAvailableToCustomize = afSelectedSubjects.filter(s => !afOverrides[s]);

  return (
    <div className="space-y-4 min-w-0">
      {/* ── Premium header banner ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-dark via-primary to-primary-light p-4 text-primary-foreground shadow-md">
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-primary-foreground/10" />
        <div className="pointer-events-none absolute -right-2 bottom-0 h-16 w-16 rounded-full bg-gold/25" />
        <div className="relative flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15 ring-1 ring-primary-foreground/25">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold leading-tight">Exam Date Sheet</h3>
            <p className="mt-0.5 text-[11px] leading-snug opacity-85">Auto-generate, review and export exam schedules for every class.</p>
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          <span className="inline-flex h-6 items-center rounded-full bg-primary-foreground/15 px-2.5 text-[11px] font-medium">Class {filterCls}</span>
          <span className="inline-flex h-6 items-center rounded-full bg-primary-foreground/15 px-2.5 text-[11px] font-medium">{examTypeLabel(filterExam)}</span>
          <span className="inline-flex h-6 items-center rounded-full bg-primary-foreground/15 px-2.5 text-[11px] font-medium">
            {filtered.length} {filtered.length === 1 ? "paper" : "papers"}
          </span>
          {firstDate && lastDate && (
            <span className="inline-flex h-6 items-center rounded-full bg-primary-foreground/15 px-2.5 text-[11px] font-medium">
              {format(new Date(firstDate), "dd MMM")} – {format(new Date(lastDate), "dd MMM")}
            </span>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-gold via-gold-soft to-transparent" />
      </div>

      {/* ── Generator card ── */}
      <Card className="overflow-hidden rounded-2xl border-border/80">
        <CardContent className="space-y-3 p-3.5 sm:p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gold-soft text-gold-strong">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <p className="text-sm font-semibold text-foreground">Create Schedule</p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <div className="min-w-0 space-y-1">
              <Label className="text-[11px] text-muted-foreground">Class</Label>
              <Select value={bulkCls} onValueChange={v => { setBulkCls(v); setBulkExam(getExamTypes(v)[0]); }}>
                <SelectTrigger className="h-9 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{classes.map(c => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-[11px] text-muted-foreground">Exam Type</Label>
              <Select value={bulkExam} onValueChange={setBulkExam}>
                <SelectTrigger className="h-9 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{getExamTypes(bulkCls).map(e => <SelectItem key={e} value={e}>{examTypeLabel(e)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
              <Label className="text-[11px] text-muted-foreground">Year</Label>
              <Input type="number" inputMode="numeric" value={bulkYearInput} onChange={e => setBulkYearInput(e.target.value)} className={fieldCls} placeholder="2026" />
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={openAutoFill} className={`${thinBtn} flex-1 sm:flex-none`}>
              <Wand2 /> Auto Fill
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setExportCls(bulkCls); setExportExam(bulkExam); setExportOpen(true); }} className={`${thinBtn} flex-1 sm:flex-none`}>
              <Download /> Download PDF
            </Button>
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Auto Fill generates and saves a shuffled schedule for the selected class — Sundays are skipped automatically.
          </p>
        </CardContent>
      </Card>

      {/* ── Auto Fill dialog ── */}
      <Dialog open={autoFillOpen} onOpenChange={setAutoFillOpen}>
        <DialogContent className="flex max-h-[88dvh] w-[calc(100vw-1.5rem)] max-w-md flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-lg">
          <DialogHeader className="space-y-1 border-b border-border bg-gradient-to-b from-secondary/70 to-transparent px-4 pb-3 pt-4 pr-11 text-left">
            <DialogTitle className="flex items-center gap-2 text-base leading-snug">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wand2 className="h-3.5 w-3.5" />
              </span>
              Auto Fill Schedule
            </DialogTitle>
            <DialogDescription className="text-xs">
              Class {bulkCls} · {examTypeLabel(bulkExam)} · {bulkYearInput || "—"}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
            {/* 1 · Subjects */}
            <Section
              n={1}
              title="Subjects"
              aside={
                <div className="flex shrink-0 items-center gap-2.5 text-[11px] font-semibold">
                  <span className="text-muted-foreground">{afSelectedSubjects.length}/{getSubjects(bulkCls).length}</span>
                  <button type="button" onClick={() => setAfSelectedSubjects(getSubjects(bulkCls))} className="text-primary">All</button>
                  <button type="button" onClick={() => setAfSelectedSubjects([])} className="text-muted-foreground">None</button>
                </div>
              }
            >
              <div className="flex flex-wrap gap-1.5">
                {getSubjects(bulkCls).map(s => {
                  const on = afSelectedSubjects.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleAfSubject(s)}
                      className={`inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {s}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">Unselected subjects are skipped — no paper is generated for them.</p>
            </Section>

            {/* 2 · Timing */}
            <Section n={2} title="Exam timing">
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0 space-y-1">
                  <Label className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" /> Start</Label>
                  <Input type="time" value={afDefaultStart} onChange={e => setAfDefaultStart(e.target.value)} className={fieldCls} />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" /> End</Label>
                  <Input type="time" value={afDefaultEnd} onChange={e => setAfDefaultEnd(e.target.value)} className={fieldCls} />
                </div>
              </div>

              <div className="space-y-1.5 border-t border-dashed border-border pt-2.5">
                <Label className="text-[11px] text-muted-foreground">Custom time for one paper (optional)</Label>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Select value={afCustomizing} onValueChange={setAfCustomizing}>
                      <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue placeholder="Choose a subject…" /></SelectTrigger>
                      <SelectContent>
                        {afAvailableToCustomize.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!afCustomizing}
                    aria-label="Add custom time"
                    onClick={() => {
                      if (!afCustomizing) return;
                      const subj = afCustomizing;
                      setAfOverrides(cur => ({ ...cur, [subj]: { start: afDefaultStart, end: afDefaultEnd } }));
                      setAfCustomizing("");
                    }}
                    className="h-9 w-9 shrink-0 p-0"
                  >
                    <Plus />
                  </Button>
                </div>

                {Object.keys(afOverrides).length > 0 && (
                  <div className="space-y-1.5 pt-0.5">
                    {Object.entries(afOverrides).map(([s, ov]) => (
                      <div key={s} className="space-y-1.5 rounded-xl border border-border bg-card p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 break-words text-xs font-semibold text-foreground">{s}</span>
                          <button
                            type="button"
                            aria-label={`Remove custom time for ${s}`}
                            onClick={() => { clearAfOverride(s); setAfCustomizing(""); }}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input type="time" value={ov.start} onChange={e => setAfOverride(s, "start", e.target.value)} className={fieldCls} />
                          <Input type="time" value={ov.end} onChange={e => setAfOverride(s, "end", e.target.value)} className={fieldCls} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>

            {/* 3 · Dates */}
            <Section n={3} title="Exam dates">
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0 space-y-1">
                  <Label className="flex items-center gap-1 text-[11px] text-muted-foreground"><Calendar className="h-3 w-3" /> From</Label>
                  <Input type="date" value={afRangeStart} onChange={e => setAfRangeStart(e.target.value)} className={fieldCls} />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label className="flex items-center gap-1 text-[11px] text-muted-foreground"><Calendar className="h-3 w-3" /> To</Label>
                  <Input type="date" value={afRangeEnd} onChange={e => setAfRangeEnd(e.target.value)} className={fieldCls} />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-dashed border-border pt-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">Rest days between papers</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">0 = a paper every day</p>
                </div>
                <div className="inline-flex shrink-0 items-center rounded-full border border-border bg-card">
                  <button
                    type="button"
                    aria-label="Decrease rest days"
                    onClick={() => setAfGapDays(String(Math.max(0, gapNum - 1)))}
                    className="flex h-8 w-8 items-center justify-center text-muted-foreground active:text-primary"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Rest days between papers"
                    value={afGapDays}
                    onChange={e => setAfGapDays(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    className="h-8 w-9 bg-transparent text-center text-base font-semibold text-foreground outline-none sm:text-sm"
                  />
                  <button
                    type="button"
                    aria-label="Increase rest days"
                    onClick={() => setAfGapDays(String(Math.min(99, gapNum + 1)))}
                    className="flex h-8 w-8 items-center justify-center text-muted-foreground active:text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {afFit !== null && (
                <p className={`flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] leading-snug ${afFit >= afSelectedSubjects.length ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>
                    {afFit >= afSelectedSubjects.length
                      ? `${afSelectedSubjects.length} papers fit — ${afFit} exam days available.`
                      : `Only ${afFit} of ${afSelectedSubjects.length} papers fit — widen the range or reduce the rest days.`}
                  </span>
                </p>
              )}
            </Section>

            <p className="flex items-start gap-1.5 px-1 text-[11px] leading-snug text-muted-foreground">
              <Shuffle className="mt-px h-3 w-3 shrink-0" />
              <span>Subject order is shuffled each time — generate again for a different arrangement.</span>
            </p>
          </div>

          <DialogFooter className="flex-row gap-2 border-t border-border bg-card px-4 py-3 sm:justify-end sm:space-x-0">
            <Button variant="outline" size="sm" onClick={() => setAutoFillOpen(false)} className={`${thinBtn} flex-1 sm:flex-none`}>Cancel</Button>
            <Button size="sm" onClick={runAutoFill} disabled={saving} className={`${thinBtn} flex-1 sm:flex-none`}>
              {saving ? <Loader2 className="animate-spin" /> : <Wand2 />} Generate &amp; Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Export PDF dialog ── */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="flex max-h-[88dvh] w-[calc(100vw-1.5rem)] max-w-md flex-col gap-0 overflow-hidden rounded-2xl p-0">
          <DialogHeader className="space-y-1 border-b border-border bg-gradient-to-b from-secondary/70 to-transparent px-4 pb-3 pt-4 pr-11 text-left">
            <DialogTitle className="flex items-center gap-2 text-base leading-snug">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Download className="h-3.5 w-3.5" />
              </span>
              Download Date Sheet
            </DialogTitle>
            <DialogDescription className="text-xs">PDF for year {bulkYearInput || "—"}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <div className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">
              <button
                type="button"
                onClick={() => setExportScope("single")}
                className={`h-8 whitespace-nowrap rounded-full text-xs font-semibold transition-colors ${exportScope === "single" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
              >
                Single Class
              </button>
              <button
                type="button"
                onClick={() => setExportScope("all")}
                className={`h-8 whitespace-nowrap rounded-full text-xs font-semibold transition-colors ${exportScope === "all" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
              >
                All Classes
              </button>
            </div>

            {exportScope === "single" && (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="min-w-0 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Class</Label>
                  <Select value={exportCls} onValueChange={v => { setExportCls(v); setExportExam(getExamTypes(v)[0]); }}>
                    <SelectTrigger className="h-9 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{classes.map(c => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Exam Type</Label>
                  <Select value={exportExam} onValueChange={setExportExam}>
                    <SelectTrigger className="h-9 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{getExamTypes(exportCls).map(e => <SelectItem key={e} value={e}>{examTypeLabel(e)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {exportScope === "all" && (
              <p className="rounded-xl bg-secondary/40 p-3 text-xs leading-snug text-muted-foreground">
                Combines every class's schedule for <strong className="text-foreground">{bulkYear}</strong> into one landscape PDF, one section per class.
              </p>
            )}
          </div>

          <DialogFooter className="flex-row gap-2 border-t border-border bg-card px-4 py-3 sm:justify-end sm:space-x-0">
            <Button variant="outline" size="sm" onClick={() => setExportOpen(false)} className={`${thinBtn} flex-1 sm:flex-none`}>Cancel</Button>
            <Button size="sm" onClick={runExport} className={`${thinBtn} flex-1 sm:flex-none`}><Download /> Download</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Class + exam selectors ── */}
      <div className="space-y-2.5">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-hide">
          {classes.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => { setFilterCls(c); setFilterExam(getExamTypes(c)[0]); }}
              className={`h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition-colors ${filterCls === c ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-muted-foreground"}`}
            >
              Class {c}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex max-w-full rounded-full bg-secondary p-0.5">
            {getExamTypes(filterCls).map(e => (
              <button
                key={e}
                type="button"
                onClick={() => setFilterExam(e)}
                className={`h-7 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-colors ${filterExam === e ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
              >
                {examTypeLabel(e)}
              </button>
            ))}
          </div>

          {filtered.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs text-destructive hover:text-destructive [&_svg]:size-3.5">
                  <Trash2 /> Delete Schedule
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-base">Delete Class {filterCls} · {examTypeLabel(filterExam)} schedule?</AlertDialogTitle>
                  <AlertDialogDescription>This removes all {filtered.length} exam entries for this class and exam type at once. This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row gap-2 sm:space-x-0">
                  <AlertDialogCancel className="mt-0 h-9 flex-1 text-xs sm:flex-none">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteClassSchedule} disabled={deletingClass} className="h-9 flex-1 bg-destructive text-xs text-destructive-foreground sm:flex-none">
                    {deletingClass && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* ── Schedule list ── */}
      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : sortedFiltered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-secondary/20 px-4 py-8 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarDays className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-foreground">No schedule yet</p>
          <p className="max-w-xs text-xs leading-snug text-muted-foreground">
            Class {filterCls} · {examTypeLabel(filterExam)} has no papers. Use Auto Fill to generate one.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedFiltered.map(e => (
            <div key={e.id} className="flex items-stretch gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-sm">
              <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-b from-primary to-primary-dark py-1.5 text-primary-foreground">
                <span className="text-[9px] font-semibold uppercase tracking-wider opacity-80">{format(new Date(e.exam_date), "EEE")}</span>
                <span className="text-lg font-black leading-none">{format(new Date(e.exam_date), "dd")}</span>
                <span className="text-[10px] font-semibold uppercase">{format(new Date(e.exam_date), "MMM")}</span>
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <p className="break-words text-sm font-semibold leading-snug text-foreground">{e.subject}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{format(new Date(e.exam_date), "EEEE, dd MMMM yyyy")}</p>
                {(e.start_time || e.hall) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {e.start_time && (
                      <span className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2 text-[11px] font-medium text-primary">
                        <Clock className="h-3 w-3" />
                        {e.start_time}{e.end_time ? ` – ${e.end_time}` : ""}
                      </span>
                    )}
                    {e.hall && (
                      <span className="inline-flex h-5 items-center whitespace-nowrap rounded-full bg-gold-soft px-2 text-[11px] font-medium text-gold-strong">
                        Hall: {e.hall}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${e.subject}`} className="h-8 w-8 shrink-0 self-start p-0 text-muted-foreground hover:text-destructive [&_svg]:size-3.5">
                    <Trash2 />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-base">Delete this exam entry?</AlertDialogTitle>
                    <AlertDialogDescription>{e.subject} · {format(new Date(e.exam_date), "dd MMM yyyy")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-row gap-2 sm:space-x-0">
                    <AlertDialogCancel className="mt-0 h-9 flex-1 text-xs sm:flex-none">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteEntry.mutateAsync(e.id)} className="h-9 flex-1 bg-destructive text-xs text-destructive-foreground sm:flex-none">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
