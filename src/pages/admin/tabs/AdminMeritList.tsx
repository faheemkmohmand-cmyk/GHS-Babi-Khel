// src/pages/admin/tabs/AdminMeritList.tsx
// ──────────────────────────────────────────────────────────────────────────────
// ADVANCED Merit List Manager — v2 (snapshot-based, decoupled from `results`)
//
// KEY FIX vs v1:
//   Published merit lists are now STORED AS SNAPSHOTS in the `merit_lists.entries`
//   JSONB column at publish time. The student dashboard reads the snapshot — NOT
//   the live `results` table. So when an admin deletes a result in
//   "Manage Result", the published Merit List is UNAFFECTED (it keeps its
//   original ranking data forever, until the admin explicitly deletes it here).
//
// Flow:
//   1. Admin picks scope (Class / Whole School), class, exam_type, year.
//   2. Admin clicks "Generate" → preview the merit list from `results`.
//   3. Admin optionally sets:
//        - Title (e.g. "Annual-I 2026 Toppers")
//        - Notes (shown to students)
//        - Theme color (new — visual accent for the student view)
//        - Publish mode: "Publish now" OR "Schedule for later" (countdown)
//   4. Admin clicks "Publish" → SNAPSHOT of current entries is written into
//      `merit_lists.entries` JSONB. The dashboard reads from this snapshot.
//   5. Students see the merit list ONLY when publish_at <= now().
//   6. Admin can download a professional PDF (minimal colors, clean type).
//
// UI UPGRADES (v2):
//   - Hero header with gradient + animated trophy
//   - Top-3 podium visualization with medals, avatars, and confetti accents
//   - Modern stat cards (4-up grid with icons + colored accents)
//   - Inline search/filter for entries
//   - Glassmorphic publish dialog with live countdown preview
//   - Beautiful "Published" tab cards with status pills + actions
// ──────────────────────────────────────────────────────────────────────────────
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getGradeFromPercentage } from "@/hooks/useResults";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Trophy, Download, Send, School, BookOpen, Clock, Plus, Trash2,
  Calendar, EyeOff, CheckCircle2, Loader2, Search, Users, Award,
  TrendingUp, Target, Sparkles, Crown, Medal,
} from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, formatDistanceToNow, isAfter } from "date-fns";

// ─── Constants ────────────────────────────────────────────────────────────────
const ALL_CLASSES = ["6", "7", "8", "9", "10"];
const getExamTypes = (cls: string) =>
  ["9", "10"].includes(cls) ? ["Annual-I", "Annual-II"] : ["1st Semester", "2nd Semester"];

const medalLabel = (pos: number) =>
  pos === 1 ? "1st" : pos === 2 ? "2nd" : pos === 3 ? "3rd" : `${pos}th`;

// Visual theme presets — admin picks one at publish time, student view inherits
const THEME_PRESETS = [
  { id: "gold",    label: "Royal Gold",    from: "from-amber-500",  to: "to-yellow-600",  accent: "text-amber-600",  ring: "ring-amber-400/40"  },
  { id: "royal",   label: "Royal Blue",    from: "from-blue-600",   to: "to-indigo-700",  accent: "text-blue-600",   ring: "ring-blue-400/40"   },
  { id: "emerald", label: "Emerald Pride", from: "from-emerald-500",to: "to-teal-700",    accent: "text-emerald-600",ring: "ring-emerald-400/40"},
  { id: "rose",    label: "Rose Honour",   from: "from-rose-500",   to: "to-pink-700",    accent: "text-rose-600",   ring: "ring-rose-400/40"   },
  { id: "violet",  label: "Violet Crest",  from: "from-violet-500", to: "to-purple-700",  accent: "text-violet-600", ring: "ring-violet-400/40" },
] as const;
type ThemeId = typeof THEME_PRESETS[number]["id"];

// ─── Types ────────────────────────────────────────────────────────────────────
interface MeritEntry {
  id: string;
  student_id: string;
  full_name: string;
  roll_number: string;
  class: string;
  exam_type: string;
  photo_url: string | null;
  obtained_marks: number;
  total_marks: number;
  percentage: number;
  grade: string;
  is_pass: boolean;
  position: number;
}

interface MeritListRow {
  id: string;
  scope: string;
  class: string;
  exam_type: string | null;
  year: number;
  is_published: boolean;
  publish_at: string | null;
  title: string | null;
  notes: string | null;
  created_at: string;
  // ── NEW snapshot columns (v2) ──
  entries?: MeritEntry[] | null;
  total_students?: number;
  passing_count?: number;
  highest_percentage?: number;
  average_percentage?: number;
  theme?: string | null;
}

// ─── Raw fetch — class merit ──────────────────────────────────────────────────
function useMeritData(cls: string, examType: string, year: number) {
  return useQuery<MeritEntry[]>({
    queryKey: ["merit-data", cls, examType, year],
    queryFn: async () => {
      if (!year || year < 2000) return [];
      const { data, error } = await supabase
        .from("results")
        .select("id, student_id, obtained_marks, total_marks, percentage, grade, position, class, exam_type, is_pass, students(full_name, roll_number, photo_url)")
        .eq("class", cls)
        .eq("exam_type", examType)
        .eq("year", year)
        .order("percentage", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const best = new Map<string, any>();
      for (const r of rows) {
        if (!best.has(r.student_id) || r.percentage > best.get(r.student_id).percentage) {
          best.set(r.student_id, r);
        }
      }
      return Array.from(best.values())
        .sort((a, b) => b.percentage - a.percentage)
        .map((r: any, i: number) => ({
          id: r.id, student_id: r.student_id,
          full_name: r.students?.full_name || "Unknown",
          roll_number: r.students?.roll_number || "-",
          class: r.class, exam_type: r.exam_type,
          photo_url: r.students?.photo_url || null,
          obtained_marks: r.obtained_marks, total_marks: r.total_marks,
          percentage: Number(r.percentage) || 0,
          grade: r.grade || getGradeFromPercentage(r.percentage),
          is_pass: r.is_pass, position: i + 1,
        }));
    },
    enabled: !!cls && !!examType && year >= 2000,
  });
}

// ─── Raw fetch — all classes for a year (school-wide) ────────────────────────
function useAllClassesMerit(year: number) {
  return useQuery<Record<string, MeritEntry[]>>({
    queryKey: ["merit-all-classes", year],
    queryFn: async () => {
      if (!year || year < 2000) return {};
      const { data, error } = await supabase
        .from("results")
        .select("id, student_id, obtained_marks, total_marks, percentage, grade, class, exam_type, is_pass, students(full_name, roll_number, photo_url)")
        .eq("year", year)
        .order("percentage", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const byClass: Record<string, Map<string, any>> = {};
      for (const r of rows) {
        const cls = r.class;
        if (!byClass[cls]) byClass[cls] = new Map();
        const map = byClass[cls];
        if (!map.has(r.student_id) || r.percentage > map.get(r.student_id).percentage) {
          map.set(r.student_id, r);
        }
      }
      const result: Record<string, MeritEntry[]> = {};
      for (const cls of Object.keys(byClass)) {
        result[cls] = Array.from(byClass[cls].values())
          .sort((a, b) => b.percentage - a.percentage)
          .map((r: any, i: number) => ({
            id: r.id, student_id: r.student_id,
            full_name: r.students?.full_name || "Unknown",
            roll_number: r.students?.roll_number || "-",
            class: r.class, exam_type: r.exam_type,
            photo_url: r.students?.photo_url || null,
            obtained_marks: r.obtained_marks, total_marks: r.total_marks,
            percentage: Number(r.percentage) || 0,
            grade: r.grade || getGradeFromPercentage(r.percentage),
            is_pass: r.is_pass, position: i + 1,
          }));
      }
      return result;
    },
    enabled: year >= 2000,
  });
}

// ─── Fetch all published/scheduled merit lists (admin view) ──────────────────
function useMeritListRecords() {
  return useQuery<MeritListRow[]>({
    queryKey: ["merit-list-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merit_lists")
        .select(`
          id, scope, class, exam_type, year, is_published, publish_at,
          title, notes, created_at,
          entries, total_students, passing_count,
          highest_percentage, average_percentage, theme
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MeritListRow[];
    },
  });
}

// ─── Save (publish or schedule) a merit list — now with SNAPSHOT ─────────────
function useSaveMeritList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      scope: "class" | "school";
      cls: string;
      examType: string | null;
      year: number;
      title: string;
      notes: string | null;
      publishAt: string | null;
      theme: ThemeId;
      entries: MeritEntry[];          // ← SNAPSHOT to persist
    }) => {
      const passingCount = params.entries.filter(e => e.is_pass || e.percentage >= 33).length;
      const highest = params.entries.length
        ? Math.max(...params.entries.map(e => e.percentage)) : 0;
      const avg = params.entries.length
        ? Math.round(params.entries.reduce((s, e) => s + e.percentage, 0) / params.entries.length * 10) / 10
        : 0;

      const payload = {
        scope: params.scope,
        class: params.cls,
        exam_type: params.examType,
        year: params.year,
        title: params.title || null,
        notes: params.notes || null,
        is_published: true,
        publish_at: params.publishAt,
        published_at: new Date().toISOString(),
        theme: params.theme,
        // ── SNAPSHOT fields (the actual fix) ────────────────────────────────
        entries: params.entries as unknown as any,        // JSONB — array of MeritEntry
        total_students: params.entries.length,
        passing_count: passingCount,
        highest_percentage: highest,
        average_percentage: avg,
        schema_version: 2,
      };
      const { error } = await supabase
        .from("merit_lists")
        .upsert(payload, { onConflict: "scope,class,exam_type,year" })
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["merit-list-records"] });
      qc.invalidateQueries({ queryKey: ["merit-lists"] });
      qc.invalidateQueries({ queryKey: ["published-merit-lists"] });
    },
  });
}

// ─── Delete a merit list ─────────────────────────────────────────────────────
function useDeleteMeritList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("merit_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["merit-list-records"] });
      qc.invalidateQueries({ queryKey: ["merit-lists"] });
      qc.invalidateQueries({ queryKey: ["published-merit-lists"] });
    },
  });
}

// ─── Professional PDF helpers (unchanged minimal palette) ────────────────────
const PDF_COLOR = {
  ink:    [10, 10, 10] as [number, number, number],
  head:   [31, 31, 31] as [number, number, number],
  sub:    [82, 82, 82] as [number, number, number],
  muted:  [120, 120, 120] as [number, number, number],
  altRow: [246, 247, 248] as [number, number, number],
  pass:   [15, 81, 50] as [number, number, number],
  fail:   [139, 0, 0] as [number, number, number],
  white:  [255, 255, 255] as [number, number, number],
  rule:   [180, 180, 180] as [number, number, number],
};

function drawPDFHeader(doc: jsPDF, title: string, subtitle: string, w: number) {
  doc.setDrawColor(PDF_COLOR.ink[0], PDF_COLOR.ink[1], PDF_COLOR.ink[2]);
  doc.setLineWidth(1.0);
  doc.line(14, 10, w - 14, 10);
  doc.setTextColor(PDF_COLOR.ink[0], PDF_COLOR.ink[1], PDF_COLOR.ink[2]);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("GOVERNMENT HIGH SCHOOL BABI KHEL", w / 2, 17, { align: "center" });
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(PDF_COLOR.sub[0], PDF_COLOR.sub[1], PDF_COLOR.sub[2]);
  doc.text("District Mohmand, Khyber Pakhtunkhwa  |  Established 2018", w / 2, 22, { align: "center" });
  doc.setDrawColor(PDF_COLOR.rule[0], PDF_COLOR.rule[1], PDF_COLOR.rule[2]);
  doc.setLineWidth(0.25);
  doc.line(14, 25, w - 14, 25);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(PDF_COLOR.ink[0], PDF_COLOR.ink[1], PDF_COLOR.ink[2]);
  doc.text(title, w / 2, 31, { align: "center" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(PDF_COLOR.sub[0], PDF_COLOR.sub[1], PDF_COLOR.sub[2]);
  doc.text(subtitle, w / 2, 36, { align: "center" });
  doc.setDrawColor(PDF_COLOR.ink[0], PDF_COLOR.ink[1], PDF_COLOR.ink[2]);
  doc.setLineWidth(1.0);
  doc.line(14, 39, w - 14, 39);
}

function drawPDFStats(doc: jsPDF, entries: MeritEntry[], y: number, w: number) {
  const passing = entries.filter(e => e.is_pass || e.percentage >= 33);
  const avg = Math.round(entries.reduce((s, e) => s + e.percentage, 0) / entries.length);
  const highest = Math.max(...entries.map(e => e.percentage));
  const passRate = entries.length ? Math.round((passing.length / entries.length) * 100) : 0;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(PDF_COLOR.sub[0], PDF_COLOR.sub[1], PDF_COLOR.sub[2]);
  doc.text(
    `Total: ${entries.length}    Passed: ${passing.length}    Failed: ${entries.length - passing.length}    Highest: ${highest.toFixed(1)}%    Average: ${avg}%    Pass Rate: ${passRate}%`,
    w / 2, y, { align: "center" }
  );
}

function drawPDFFooter(doc: jsPDF, w: number, h: number, pageNum: number, totalPages: number) {
  doc.setDrawColor(PDF_COLOR.rule[0], PDF_COLOR.rule[1], PDF_COLOR.rule[2]);
  doc.setLineWidth(0.25);
  doc.line(14, h - 12, w - 14, h - 12);
  doc.setTextColor(PDF_COLOR.muted[0], PDF_COLOR.muted[1], PDF_COLOR.muted[2]);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.text("GHS Babi Khel  —  Official Merit List", 14, h - 7);
  doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy")}`, w / 2, h - 7, { align: "center" });
  doc.text(`Page ${pageNum} / ${totalPages}`, w - 14, h - 7, { align: "right" });
}

function generateClassPDF(entries: MeritEntry[], cls: string, examType: string, year: number, title?: string | null) {
  if (!entries.length) { toast.error("No data to export"); return; }
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  drawPDFHeader(doc, title || `MERIT LIST — CLASS ${cls}`, `${examType}  |  Year ${year}  |  ${entries.length} Students`, w);
  drawPDFStats(doc, entries, 44, w);
  autoTable(doc, {
    startY: 49,
    head: [["Rank", "Roll No", "Student Name", "Marks", "%", "Grade", "Status"]],
    body: entries.map((e, i) => [
      medalLabel(i + 1), e.roll_number, e.full_name,
      `${e.obtained_marks} / ${e.total_marks}`,
      `${Number(e.percentage).toFixed(1)}%`, e.grade,
      e.is_pass || e.percentage >= 33 ? "Pass" : "Fail",
    ]),
    headStyles: { fillColor: PDF_COLOR.head, textColor: PDF_COLOR.white, fontStyle: "bold", fontSize: 8.5, halign: "center", cellPadding: 3.5 },
    bodyStyles: { fontSize: 8.5, cellPadding: 3, textColor: PDF_COLOR.ink },
    alternateRowStyles: { fillColor: PDF_COLOR.altRow },
    columnStyles: {
      0: { halign: "center", cellWidth: 14, fontStyle: "bold" },
      1: { halign: "center", cellWidth: 22 },
      2: { halign: "left",   cellWidth: 68, overflow: "linebreak" },
      3: { halign: "center", cellWidth: 28 },
      4: { halign: "center", cellWidth: 18, fontStyle: "bold" },
      5: { halign: "center", cellWidth: 15 },
      6: { halign: "center", cellWidth: 15 },
    },
    didParseCell: (data) => {
      if (data.section === "body") {
        if (data.row.index < 3) data.cell.styles.fontStyle = "bold";
        if (data.column.index === 6) {
          const val = String(data.cell.raw);
          data.cell.styles.textColor = val === "Pass" ? PDF_COLOR.pass : PDF_COLOR.fail;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    margin: { left: 14, right: 14, bottom: 18 },
    didDrawPage: (data) => {
      const pc = (doc as any).internal.getNumberOfPages();
      drawPDFFooter(doc, w, h, data.pageNumber, pc);
    },
  });
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) { doc.setPage(p); drawPDFFooter(doc, w, h, p, totalPages); }
  doc.save(`MeritList_Class${cls}_${examType.replace(/\s/g,"")}_${year}.pdf`);
}

function generateAllClassesPDF(byClass: Record<string, MeritEntry[]>, year: number, title?: string | null) {
  const sortedClasses = Object.keys(byClass).sort();
  if (!sortedClasses.length) { toast.error("No data to export"); return; }
  const allStudents: MeritEntry[] = [];
  for (const cls of sortedClasses) allStudents.push(...(byClass[cls] || []));
  allStudents.sort((a, b) => b.percentage - a.percentage);
  if (!allStudents.length) { toast.error("No data to export"); return; }
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  drawPDFHeader(doc, title || "WHOLE SCHOOL MERIT LIST", `Year ${year}  |  All Classes Combined  |  ${allStudents.length} Students`, w);
  drawPDFStats(doc, allStudents, 44, w);
  autoTable(doc, {
    startY: 49,
    head: [["Rank", "Class", "Roll No", "Student Name", "Marks", "%", "Grade", "Status"]],
    body: allStudents.map((e, i) => [
      medalLabel(i + 1), `Cls ${e.class}`, e.roll_number, e.full_name,
      `${e.obtained_marks} / ${e.total_marks}`,
      `${Number(e.percentage).toFixed(1)}%`, e.grade,
      (e.is_pass || e.percentage >= 33) ? "Pass" : "Fail",
    ]),
    headStyles: { fillColor: PDF_COLOR.head, textColor: PDF_COLOR.white, fontStyle: "bold", fontSize: 8, halign: "center", cellPadding: 3 },
    bodyStyles: { fontSize: 8, cellPadding: 2.8, textColor: PDF_COLOR.ink },
    alternateRowStyles: { fillColor: PDF_COLOR.altRow },
    columnStyles: {
      0: { halign: "center", cellWidth: 13, fontStyle: "bold" },
      1: { halign: "center", cellWidth: 16 },
      2: { halign: "center", cellWidth: 20 },
      3: { halign: "left",   cellWidth: 58, overflow: "linebreak" },
      4: { halign: "center", cellWidth: 26 },
      5: { halign: "center", cellWidth: 18, fontStyle: "bold" },
      6: { halign: "center", cellWidth: 14 },
      7: { halign: "center", cellWidth: 14 },
    },
    didParseCell: (data) => {
      if (data.section === "body") {
        if (data.row.index < 3) data.cell.styles.fontStyle = "bold";
        if (data.column.index === 7) {
          const val = String(data.cell.raw);
          data.cell.styles.textColor = val === "Pass" ? PDF_COLOR.pass : PDF_COLOR.fail;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    margin: { left: 14, right: 14, bottom: 18 },
    didDrawPage: (data) => {
      const pc = (doc as any).internal.getNumberOfPages();
      drawPDFFooter(doc, w, h, data.pageNumber, pc);
    },
  });
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) { doc.setPage(p); drawPDFFooter(doc, w, h, p, totalPages); }
  doc.save(`School_MeritList_${year}.pdf`);
}

// ─── Countdown helper ────────────────────────────────────────────────────────
function useNowTick(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function CountdownBadge({ publishAt }: { publishAt: string }) {
  const now = useNowTick(1000);
  const target = new Date(publishAt);
  if (!isAfter(target, now)) {
    return <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle2 className="w-3 h-3" /> Published</Badge>;
  }
  const diff = target.getTime() - now.getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const label = days > 0
    ? `${days}d ${hours}h ${mins}m`
    : hours > 0
      ? `${hours}h ${mins}m ${secs}s`
      : `${mins}m ${secs}s`;
  return (
    <Badge className="bg-amber-100 text-amber-800 gap-1 animate-pulse">
      <Clock className="w-3 h-3" /> {label}
    </Badge>
  );
}

// ─── Stats Card (modern, iconified) ──────────────────────────────────────────
function StatCard({ icon: Icon, label, value, accent, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number; accent: string; sub?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full ${accent} opacity-10`} />
      <div className="relative">
        <div className={`w-9 h-9 rounded-xl ${accent} flex items-center justify-center mb-2.5`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <p className="text-xl md:text-2xl font-black tabular-nums leading-none">{value}</p>
        <p className="text-[11px] font-medium text-muted-foreground mt-1.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StatsRow({ entries }: { entries: MeritEntry[] }) {
  if (!entries.length) return null;
  const passing = entries.filter(e => e.is_pass || e.percentage >= 33);
  const avg = Math.round(entries.reduce((s, e) => s + e.percentage, 0) / entries.length);
  const highest = Math.max(...entries.map(e => e.percentage));
  const passRate = Math.round((passing.length / entries.length) * 100);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard icon={Users}       label="Total Students" value={entries.length}                accent="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300" />
      <StatCard icon={CheckCircle2} label="Pass Rate"     value={`${passRate}%`} sub={`${passing.length} passed`} accent="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300" />
      <StatCard icon={TrendingUp}  label="Highest %"      value={`${highest.toFixed(1)}%`}      accent="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300" />
      <StatCard icon={Target}      label="Average %"      value={`${avg}%`}                     accent="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300" />
    </div>
  );
}

// ─── Top-3 Podium (advanced visual) ──────────────────────────────────────────
function Top3Podium({ entries, showClass = false }: { entries: MeritEntry[]; showClass?: boolean }) {
  if (entries.length < 1) return null;
  const top3 = entries.slice(0, 3);
  // Display order: 2nd, 1st, 3rd
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  const heights = ["h-24", "h-32", "h-20"]; // 2nd, 1st, 3rd
  const medalColors = [
    "from-gray-300 to-gray-400",   // 2nd - silver
    "from-amber-400 to-yellow-500", // 1st - gold
    "from-orange-400 to-amber-600", // 3rd - bronze
  ];
  const medalEmojis = ["🥈", "🥇", "🥉"];
  const podiumRanks = [2, 1, 3];

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-amber-50/50 via-card to-yellow-50/30 dark:from-amber-950/20 dark:to-yellow-950/10 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Crown className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-bold">Top 3 Achievers</h3>
        <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
      </div>
      <div className="flex items-end justify-center gap-3 sm:gap-6">
        {order.map((entry, idx) => {
          const rank = podiumRanks[idx];
          const isFirst = rank === 1;
          return (
            <div key={`${entry.student_id}-${rank}`} className="flex flex-col items-center text-center flex-1 max-w-[120px]">
              {/* Avatar */}
              <div className="relative mb-2">
                <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${medalColors[idx]} blur-md opacity-50`} />
                <div className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full p-0.5 bg-gradient-to-br ${medalColors[idx]}`}>
                  {entry.photo_url
                    ? <img src={entry.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                    : <div className="w-full h-full rounded-full bg-card flex items-center justify-center font-bold text-lg">
                        {(entry.full_name || "?")[0]}
                      </div>}
                </div>
                <span className={`absolute -bottom-1 -right-1 text-lg sm:text-xl ${isFirst ? "scale-125" : ""}`}>
                  {medalEmojis[idx]}
                </span>
              </div>
              {/* Name & details */}
              <p className={`text-xs sm:text-sm font-bold leading-tight truncate w-full ${isFirst ? "text-amber-700 dark:text-amber-300" : ""}`}>
                {entry.full_name}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                {showClass && <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">Cls {entry.class}</span>}
                <span className="text-[10px] text-muted-foreground font-mono">{entry.roll_number}</span>
              </div>
              <p className={`text-sm sm:text-base font-black tabular-nums mt-1 ${isFirst ? "text-amber-600" : "text-foreground"}`}>
                {Number(entry.percentage).toFixed(1)}%
              </p>
              {/* Podium pillar */}
              <div className={`mt-2 w-full ${heights[idx]} rounded-t-lg bg-gradient-to-br ${medalColors[idx]} flex items-start justify-center pt-1.5`}>
                <span className="text-white font-black text-base sm:text-lg drop-shadow">{rank}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Merit Table UI (refined, with search) ───────────────────────────────────
function MeritTable({ entries, showClass = false }: { entries: MeritEntry[]; showClass?: boolean }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase().trim();
    return entries.filter(e =>
      e.full_name.toLowerCase().includes(q) ||
      e.roll_number.toLowerCase().includes(q) ||
      String(e.class).includes(q)
    );
  }, [entries, search]);

  if (!entries.length) return (
    <Card><CardContent className="p-10 text-center">
      <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
      <p className="text-muted-foreground text-sm">No results found for this selection.</p>
      <p className="text-xs text-muted-foreground mt-1">Make sure results are entered in Manage Results tab.</p>
    </CardContent></Card>
  );

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search by name, roll no${showClass ? ", or class" : ""}…`}
          className="pl-9 text-sm"
        />
        {search && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {filtered.length}/{entries.length}
          </span>
        )}
      </div>

      <Card><CardContent className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-foreground text-background">
                <th className="p-3 text-center font-semibold w-12">Rank</th>
                {showClass && <th className="p-3 text-left font-semibold">Class</th>}
                <th className="p-3 text-left font-semibold">Roll No</th>
                <th className="p-3 text-left font-semibold">Student Name</th>
                <th className="p-3 text-center font-semibold">Marks</th>
                <th className="p-3 text-center font-semibold">%</th>
                <th className="p-3 text-center font-semibold">Grade</th>
                <th className="p-3 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                const originalIdx = entries.indexOf(e);
                return (
                  <tr key={`${e.student_id}-${i}`} className={`border-b border-border transition-colors ${
                    originalIdx === 0 ? "bg-yellow-50 dark:bg-yellow-900/20" :
                    originalIdx === 1 ? "bg-gray-50 dark:bg-gray-900/20" :
                    originalIdx === 2 ? "bg-orange-50 dark:bg-orange-900/20" :
                    "hover:bg-muted/30"
                  }`}>
                    <td className="p-3 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                        originalIdx === 0 ? "bg-yellow-400 text-yellow-900" :
                        originalIdx === 1 ? "bg-gray-300 text-gray-800" :
                        originalIdx === 2 ? "bg-orange-300 text-orange-900" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {originalIdx < 3 ? ["🥇","🥈","🥉"][originalIdx] : originalIdx + 1}
                      </span>
                    </td>
                    {showClass && <td className="p-3"><span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">Cls {e.class}</span></td>}
                    <td className="p-3 text-muted-foreground font-mono text-xs">{e.roll_number}</td>
                    <td className="p-3 text-foreground">
                      <div className="flex items-center gap-2">
                        {e.photo_url
                          ? <img src={e.photo_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                          : <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">{(e.full_name || "?")[0]}</div>
                        }
                        <span className={originalIdx < 3 ? "font-semibold" : ""}>{e.full_name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-center text-xs font-mono">{e.obtained_marks}/{e.total_marks}</td>
                    <td className="p-3 text-center font-bold">{Number(e.percentage).toFixed(1)}%</td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className="text-xs">{e.grade}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        (e.is_pass || e.percentage >= 33)
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {(e.is_pass || e.percentage >= 33) ? "Pass" : "Fail"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={showClass ? 8 : 7} className="p-6 text-center text-sm text-muted-foreground">No students match "{search}".</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
    </div>
  );
}

// ─── Publish Dialog (advanced, with theme picker + countdown preview) ────────
function PublishDialog({
  open, onClose, scope, cls, examType, year, entries, byClass,
}: {
  open: boolean;
  onClose: () => void;
  scope: "class" | "school";
  cls: string;
  examType: string;
  year: number;
  entries: MeritEntry[];
  byClass?: Record<string, MeritEntry[]>;
}) {
  const saveMut = useSaveMeritList();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const [theme, setTheme] = useState<ThemeId>("gold");
  const [scheduleAt, setScheduleAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  useEffect(() => {
    if (open) {
      setTitle(scope === "school"
        ? `Whole School Merit List ${year}`
        : `Class ${cls} Merit List — ${examType} ${year}`);
      setNotes("");
      setPublishMode("now");
      setTheme("gold");
    }
  }, [open, scope, cls, examType, year]);

  const totalStudents = scope === "school"
    ? Object.values(byClass || {}).reduce((s, arr) => s + arr.length, 0)
    : entries.length;

  // For school scope, the snapshot must contain ALL classes combined
  const snapshotEntries: MeritEntry[] = useMemo(() => {
    if (scope === "school") {
      const all: MeritEntry[] = [];
      for (const c of Object.keys(byClass || {})) all.push(...(byClass?.[c] || []));
      return all.sort((a, b) => b.percentage - a.percentage).map((e, i) => ({ ...e, position: i + 1 }));
    }
    return entries;
  }, [scope, entries, byClass]);

  const handleSave = async () => {
    if (!totalStudents) { toast.error("No students to publish"); return; }
    if (!snapshotEntries.length) { toast.error("Nothing to snapshot — aborting"); return; }
    let publishAt: string | null = null;
    if (publishMode === "schedule") {
      if (!scheduleAt) { toast.error("Pick a date and time for the countdown"); return; }
      const d = new Date(scheduleAt);
      if (isNaN(d.getTime())) { toast.error("Invalid date"); return; }
      if (d.getTime() <= Date.now()) { toast.error("Schedule time must be in the future"); return; }
      publishAt = d.toISOString();
    }
    try {
      await saveMut.mutateAsync({
        scope,
        cls: scope === "school" ? "school" : cls,
        examType: scope === "school" ? null : examType,
        year,
        title,
        notes: notes || null,
        publishAt,
        theme,
        entries: snapshotEntries,        // ← SNAPSHOT
      });
      toast.success(
        publishMode === "now"
          ? "Merit list published — students can see it now!"
          : `Merit list scheduled — goes live ${format(new Date(publishAt!), "dd MMM, h:mm a")}`
      );
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to publish");
    }
  };

  if (!open) return null;

  const selectedTheme = THEME_PRESETS.find(t => t.id === theme) || THEME_PRESETS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-elevated max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient accent */}
        <div className={`p-5 border-b border-border bg-gradient-to-br ${selectedTheme.from} ${selectedTheme.to} text-white`}>
          <h3 className="font-heading font-bold text-base flex items-center gap-2">
            <Send className="w-4 h-4" />
            {scope === "school" ? "Publish Whole School Merit List" : `Publish Class ${cls} Merit List`}
          </h3>
          <p className="text-xs text-white/80 mt-1">
            {totalStudents} students will be snapshotted. {scope === "school" ? "All classes combined." : `${examType} · ${year}`}
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Title (shown to students)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Annual-I 2026 Toppers"
              className="text-sm"
            />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Notes (optional, shown to students)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Congratulations to all toppers!"
              className="text-sm min-h-[60px]"
            />
          </div>

          {/* Theme picker */}
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Visual theme</Label>
            <div className="grid grid-cols-5 gap-2">
              {THEME_PRESETS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                    theme === t.id
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-foreground/30"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${t.from} ${t.to}`} />
                  <span className="text-[9px] font-medium text-muted-foreground leading-tight text-center">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Publish mode */}
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">When should it go live?</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPublishMode("now")}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  publishMode === "now"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                <Send className="w-4 h-4" /> Publish now
              </button>
              <button
                onClick={() => setPublishMode("schedule")}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  publishMode === "schedule"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                <Clock className="w-4 h-4" /> Schedule with countdown
              </button>
            </div>
          </div>

          {/* Schedule datetime picker */}
          {publishMode === "schedule" && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
              <Label className="text-xs font-semibold mb-1.5 block text-amber-800 dark:text-amber-300">Publish at (date & time)</Label>
              <Input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="text-sm bg-card"
              />
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Students will see a live countdown on their dashboard until this moment.
              </p>
            </div>
          )}

          {/* Snapshot notice */}
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3">
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                <strong>Permanent snapshot:</strong> Once published, this merit list
                is decoupled from the results table. Deleting results in
                "Manage Result" will <strong>not</strong> affect this merit list.
              </span>
            </p>
          </div>
        </div>

        <div className="p-5 border-t border-border flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saveMut.isPending} className="gap-1.5">
            {saveMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {publishMode === "now" ? "Publish Now" : "Schedule Publish"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Published merit lists list (admin view, upgraded cards) ─────────────────
function PublishedList({ records }: { records: MeritListRow[] }) {
  const deleteMut = useDeleteMeritList();
  if (!records.length) return (
    <Card><CardContent className="p-10 text-center">
      <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
      <p className="text-muted-foreground text-sm">No merit lists published yet.</p>
      <p className="text-xs text-muted-foreground mt-1">
        Use the Class Merit or Whole School tab above to generate and publish one.
      </p>
    </CardContent></Card>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {records.map((r) => {
        const now = new Date();
        const isScheduled = r.publish_at && isAfter(new Date(r.publish_at), now);
        const isLive = r.is_published && (!r.publish_at || !isScheduled);
        const studentCount = r.total_students ?? (Array.isArray(r.entries) ? r.entries.length : 0);
        const passCount = r.passing_count ?? 0;
        const theme = THEME_PRESETS.find(t => t.id === r.theme) || THEME_PRESETS[0];
        return (
          <div
            key={r.id}
            className={`relative overflow-hidden rounded-2xl border border-border bg-card transition-all hover:shadow-md hover:-translate-y-0.5`}
          >
            {/* Top accent bar */}
            <div className={`h-1.5 bg-gradient-to-r ${theme.from} ${theme.to}`} />
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${theme.from} ${theme.to} text-white flex items-center justify-center shrink-0 shadow-sm`}>
                  {r.scope === "school" ? <School className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground leading-tight">
                    {r.title || (r.scope === "school"
                      ? `Whole School Merit List ${r.year}`
                      : `Class ${r.class} — ${r.exam_type || "Exam"} ${r.year}`)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.scope === "school" ? "Whole School" : `Class ${r.class}`}
                    {r.exam_type && ` · ${r.exam_type}`}
                    {` · Year ${r.year}`}
                  </p>
                  {r.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">"{r.notes}"</p>
                  )}
                  {/* Stats line */}
                  {studentCount > 0 && (
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {studentCount}</span>
                      <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {passCount} passed</span>
                      {r.highest_percentage != null && Number(r.highest_percentage) > 0 && (
                        <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {Number(r.highest_percentage).toFixed(1)}%</span>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground/70 mt-1.5">
                    Created {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={async () => {
                    if (!confirm("Delete this merit list? Students will no longer see it.")) return;
                    try {
                      await deleteMut.mutateAsync(r.id);
                      toast.success("Merit list deleted");
                    } catch (err: any) {
                      toast.error(err?.message || "Delete failed");
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {isLive && (
                  <Badge className="bg-emerald-100 text-emerald-700 gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Live
                  </Badge>
                )}
                {isScheduled && r.publish_at && (
                  <CountdownBadge publishAt={r.publish_at} />
                )}
                {!r.is_published && (
                  <Badge variant="secondary" className="gap-1">
                    <EyeOff className="w-3 h-3" /> Hidden
                  </Badge>
                )}
                {/* Snapshot badge */}
                {Array.isArray(r.entries) && r.entries.length > 0 && (
                  <Badge variant="outline" className="gap-1 text-[10px] border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400">
                    <Award className="w-3 h-3" /> Snapshot ({r.entries.length})
                  </Badge>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Hero Banner ──────────────────────────────────────────────────────────────
function HeroBanner({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-yellow-500 to-orange-500 dark:from-amber-700 dark:via-yellow-700 dark:to-orange-700 p-5 text-white shadow-lg">
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-12 translate-x-12" />
      <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/5 translate-y-8 -translate-x-8" />
      <div className="relative flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
          <Trophy className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-heading font-black leading-tight">{title}</h2>
          <p className="text-sm text-white/90 mt-0.5">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Class Merit Tab ──────────────────────────────────────────────────────────
function ClassMeritTab() {
  const [cls, setCls] = useState("6");
  const [examType, setExamType] = useState("1st Semester");
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear()));
  const [publishOpen, setPublishOpen] = useState(false);
  const year = parseInt(yearInput, 10);
  const validYear = !isNaN(year) && year >= 2000 && year <= 2099;

  const { data: entries = [], isLoading } = useMeritData(cls, examType, validYear ? year : 0);
  const { data: records = [] } = useMeritListRecords();

  const existing = records.find(
    r => r.scope === "class" && r.class === cls && r.exam_type === examType && r.year === year
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card><CardContent className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[100px]">
            <Label className="text-xs text-muted-foreground mb-1 block">Class</Label>
            <Select value={cls} onValueChange={v => { setCls(v); setExamType(getExamTypes(v)[0]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ALL_CLASSES.map(c => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[130px]">
            <Label className="text-xs text-muted-foreground mb-1 block">Exam Type</Label>
            <Select value={examType} onValueChange={setExamType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{getExamTypes(cls).map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="w-28">
            <Label className="text-xs text-muted-foreground mb-1 block">Year</Label>
            <Input type="number" value={yearInput} onChange={e => setYearInput(e.target.value)}
              placeholder="2025" min={2000} max={2099}
              className={!validYear && yearInput.length > 0 ? "border-destructive" : ""} />
          </div>
        </div>
      </CardContent></Card>

      {/* Actions */}
      {!isLoading && entries.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <Button onClick={() => generateClassPDF(entries, cls, examType, year, existing?.title)} variant="outline" className="gap-1.5">
            <Download className="w-4 h-4" /> Download PDF
          </Button>
          <Button onClick={() => setPublishOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            {existing ? "Update Published Merit List" : "Publish to Student Dashboard"}
          </Button>
          {existing && (
            <Badge className="self-center bg-emerald-100 text-emerald-700 gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {existing.publish_at && isAfter(new Date(existing.publish_at), new Date())
                ? "Scheduled"
                : "Published"}
            </Badge>
          )}
        </div>
      )}

      {/* Stats */}
      {!isLoading && <StatsRow entries={entries} />}

      {/* Top-3 podium */}
      {!isLoading && entries.length > 0 && <Top3Podium entries={entries} />}

      {/* Table */}
      {!validYear ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Enter a valid year (e.g. 2025) to generate merit list.</CardContent></Card>
      ) : isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : (
        <MeritTable entries={entries} />
      )}

      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        scope="class"
        cls={cls}
        examType={examType}
        year={year}
        entries={entries}
      />
    </div>
  );
}

// ─── Whole School Merit Tab ────────────────────────────────────────────────────
function SchoolMeritTab() {
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear()));
  const [viewMode, setViewMode] = useState<"combined"|"class">("combined");
  const [selectedClass, setSelectedClass] = useState("6");
  const [publishOpen, setPublishOpen] = useState(false);
  const year = parseInt(yearInput, 10);
  const validYear = !isNaN(year) && year >= 2000 && year <= 2099;

  const { data: byClass = {}, isLoading } = useAllClassesMerit(validYear ? year : 0);
  const { data: records = [] } = useMeritListRecords();
  const sortedClasses = Object.keys(byClass).sort();

  const allEntries = useMemo(() => {
    const all: MeritEntry[] = [];
    for (const cls of sortedClasses) { all.push(...(byClass[cls] || [])); }
    return all.sort((a, b) => b.percentage - a.percentage).map((e, i) => ({ ...e, position: i + 1 }));
  }, [byClass, sortedClasses]);

  const totalStudents = allEntries.length;
  const passing = allEntries.filter(e => e.is_pass || e.percentage >= 33);

  const displayEntries = useMemo(() => {
    if (viewMode === "combined") return allEntries;
    return (byClass[selectedClass] || []);
  }, [viewMode, selectedClass, allEntries, byClass]);

  const existing = records.find(
    r => r.scope === "school" && r.class === "school" && r.year === year
  );

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-28">
            <Label className="text-xs text-muted-foreground mb-1 block">Year</Label>
            <Input type="number" value={yearInput} onChange={e => setYearInput(e.target.value)}
              placeholder="2025" min={2000} max={2099}
              className={!validYear && yearInput.length > 0 ? "border-destructive" : ""} />
          </div>
          <div className="flex-1 min-w-[140px]">
            <Label className="text-xs text-muted-foreground mb-1 block">View Mode</Label>
            <Select value={viewMode} onValueChange={v => setViewMode(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="combined">All Students Combined (ranked together)</SelectItem>
                <SelectItem value="class">Single Class</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {viewMode === "class" && (
            <div className="flex-1 min-w-[100px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Class</Label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sortedClasses.map(c => <SelectItem key={c} value={c}>Class {c} ({byClass[c]?.length || 0} students)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardContent></Card>

      {/* Actions */}
      {!isLoading && totalStudents > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <Button onClick={() => generateAllClassesPDF(byClass, year, existing?.title)} variant="outline" className="gap-1.5">
            <Download className="w-4 h-4" /> Download Combined PDF
          </Button>
          <Button onClick={() => setPublishOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            {existing ? "Update Published Merit List" : "Publish Whole School to Dashboard"}
          </Button>
          {existing && (
            <Badge className="self-center bg-emerald-100 text-emerald-700 gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {existing.publish_at && isAfter(new Date(existing.publish_at), new Date())
                ? "Scheduled"
                : "Published"}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground self-center">
            {sortedClasses.length} classes · {totalStudents} students · {passing.length} passed
          </span>
        </div>
      )}

      {/* Stats */}
      {!isLoading && displayEntries.length > 0 && <StatsRow entries={displayEntries} />}

      {/* Top-3 podium (only in combined view to keep class view focused on its own top-3) */}
      {!isLoading && viewMode === "combined" && allEntries.length > 0 && <Top3Podium entries={allEntries} showClass />}

      {/* Table */}
      {!validYear ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Enter a valid year to view school merit list.</CardContent></Card>
      ) : isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : totalStudents === 0 ? (
        <Card><CardContent className="p-10 text-center">
          <School className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No results found for year {year}.</p>
          <p className="text-xs text-muted-foreground mt-1">Go to Manage Results and add results for this year.</p>
        </CardContent></Card>
      ) : (
        <MeritTable entries={displayEntries} showClass={viewMode === "combined"} />
      )}

      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        scope="school"
        cls="school"
        examType=""
        year={year}
        entries={allEntries}
        byClass={byClass}
      />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
const AdminMeritList = () => {
  const { data: records = [] } = useMeritListRecords();
  return (
    <div className="space-y-5">
      <HeroBanner
        title="Merit List Manager"
        subtitle="Generate, snapshot, and publish ranked merit lists with countdowns and PDFs."
      />

      <Tabs defaultValue="class">
        <TabsList className="grid grid-cols-3 w-full sm:w-auto sm:inline-grid">
          <TabsTrigger value="class" className="gap-1.5"><BookOpen className="w-4 h-4" /> Class Merit</TabsTrigger>
          <TabsTrigger value="school" className="gap-1.5"><School className="w-4 h-4" /> Whole School</TabsTrigger>
          <TabsTrigger value="published" className="gap-1.5"><Calendar className="w-4 h-4" /> Published ({records.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="class" className="mt-4"><ClassMeritTab /></TabsContent>
        <TabsContent value="school" className="mt-4"><SchoolMeritTab /></TabsContent>
        <TabsContent value="published" className="mt-4">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              All merit lists you've published or scheduled. Live ones are visible to students now;
              scheduled ones show a live countdown on student dashboards until the publish time.
              Each published list is a <strong>permanent snapshot</strong> — deleting results in
              "Manage Result" will not affect them.
            </p>
            <PublishedList records={records} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminMeritList;
