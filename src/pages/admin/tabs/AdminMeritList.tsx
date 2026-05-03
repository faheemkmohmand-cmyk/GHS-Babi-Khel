// src/pages/admin/tabs/AdminMeritList.tsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { usePublishMeritList, useMeritLists } from "@/hooks/useNewFeatures";
import { getGradeFromPercentage } from "@/hooks/useResults";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trophy, Download, Send, School, BookOpen } from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Constants ────────────────────────────────────────────────────────────────
const ALL_CLASSES = ["6", "7", "8", "9", "10"];
const getExamTypes = (cls: string) =>
  ["9", "10"].includes(cls) ? ["Annual-I", "Annual-II"] : ["1st Semester", "2nd Semester"];
const ALL_EXAM_TYPES = ["1st Semester", "2nd Semester", "Annual-I", "Annual-II"];

const medalLabel = (pos: number) =>
  pos === 1 ? "1st" : pos === 2 ? "2nd" : pos === 3 ? "3rd" : `#${pos}`;

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

// ─── Raw fetch — no is_published filter so admin sees ALL results ─────────────
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

      // Deduplicate: keep highest percentage per student
      const best = new Map<string, any>();
      for (const r of rows) {
        if (!best.has(r.student_id) || r.percentage > best.get(r.student_id).percentage) {
          best.set(r.student_id, r);
        }
      }
      return Array.from(best.values())
        .sort((a, b) => b.percentage - a.percentage)
        .map((r: any, i: number) => ({
          id: r.id,
          student_id: r.student_id,
          full_name: r.students?.full_name || "Unknown",
          roll_number: r.students?.roll_number || "-",
          class: r.class,
          exam_type: r.exam_type,
          photo_url: r.students?.photo_url || null,
          obtained_marks: r.obtained_marks,
          total_marks: r.total_marks,
          percentage: Number(r.percentage) || 0,
          grade: r.grade || getGradeFromPercentage(r.percentage),
          is_pass: r.is_pass,
          position: i + 1,
        }));
    },
    enabled: !!cls && !!examType && year >= 2000,
  });
}

// Fetch ALL classes for a year — used in Whole School tab
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

      // Group by class, then deduplicate per class
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
            id: r.id,
            student_id: r.student_id,
            full_name: r.students?.full_name || "Unknown",
            roll_number: r.students?.roll_number || "-",
            class: r.class,
            exam_type: r.exam_type,
            photo_url: r.students?.photo_url || null,
            obtained_marks: r.obtained_marks,
            total_marks: r.total_marks,
            percentage: Number(r.percentage) || 0,
            grade: r.grade || getGradeFromPercentage(r.percentage),
            is_pass: r.is_pass,
            position: i + 1,
          }));
      }
      return result;
    },
    enabled: year >= 2000,
  });
}

// ─── PDF helpers ───────────────────────────────────────────────────────────────
function drawPDFHeader(doc: jsPDF, title: string, subtitle: string, w: number) {
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(1.2);
  doc.line(12, 8, w - 12, 8);

  doc.setTextColor(10, 10, 10);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("GOVERNMENT HIGH SCHOOL BABI KHEL", w / 2, 16, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text("District Mohmand, Khyber Pakhtunkhwa  |  Established 2018", w / 2, 22, { align: "center" });

  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.3);
  doc.line(12, 26, w - 12, 26);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 10, 10);
  doc.text(title, w / 2, 33, { align: "center" });

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(subtitle, w / 2, 39, { align: "center" });

  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(1.2);
  doc.line(12, 43, w - 12, 43);
}

function drawPDFFooter(doc: jsPDF, w: number, h: number, pageNum: number, totalPages: number) {
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  doc.line(12, h - 12, w - 12, h - 12);
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("GHS Babi Khel — Official Merit List", 12, h - 7);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, w / 2, h - 7, { align: "center" });
  doc.text(`Page ${pageNum} / ${totalPages}`, w - 12, h - 7, { align: "right" });
}

// Single-class PDF
function generateClassPDF(entries: MeritEntry[], cls: string, examType: string, year: number) {
  if (!entries.length) { toast.error("No data to export"); return; }
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  drawPDFHeader(doc, `MERIT LIST — CLASS ${cls}`, `${examType}  |  Year ${year}  |  ${entries.length} Students`, w);

  const passing = entries.filter(e => e.is_pass || e.percentage >= 33);
  const avg = Math.round(entries.reduce((s, e) => s + e.percentage, 0) / entries.length);
  const highest = Math.max(...entries.map(e => e.percentage));
  const passRate = entries.length ? Math.round((passing.length / entries.length) * 100) : 0;

  doc.setTextColor(40, 40, 40);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Total: ${entries.length}  |  Passed: ${passing.length}  |  Failed: ${entries.length - passing.length}  |  Highest: ${highest.toFixed(1)}%  |  Average: ${avg}%  |  Pass Rate: ${passRate}%`,
    w / 2, 49, { align: "center" }
  );

  autoTable(doc, {
    startY: 53,
    head: [["Rank", "Roll No", "Student Name", "Marks", "%", "Grade", "Status"]],
    body: entries.map((e, i) => [
      medalLabel(i + 1),
      e.roll_number,
      e.full_name,
      `${e.obtained_marks} / ${e.total_marks}`,
      `${Number(e.percentage).toFixed(1)}%`,
      e.grade,
      e.is_pass || e.percentage >= 33 ? "Pass" : "Fail",
    ]),
    headStyles: {
      fillColor: [4, 44, 83],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "center",
      cellPadding: 3.5,
    },
    bodyStyles: { fontSize: 8.5, cellPadding: 3, textColor: [20, 20, 20] },
    alternateRowStyles: { fillColor: [246, 247, 250] },
    columnStyles: {
      0: { halign: "center", cellWidth: 13, fontStyle: "bold" },
      1: { halign: "center", cellWidth: 22 },
      2: { halign: "center",   cellWidth: 68, overflow: "linebreak" },
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
          data.cell.styles.textColor = val === "Pass" ? [0, 128, 0] : [200, 0, 0];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    margin: { left: 12, right: 12, bottom: 16 },
    didDrawPage: (data) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      drawPDFFooter(doc, w, h, data.pageNumber, pageCount);
    },
  });

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) { doc.setPage(p); drawPDFFooter(doc, w, h, p, totalPages); }
  doc.save(`MeritList_Class${cls}_${examType.replace(/\s/g,"")}_${year}.pdf`);
}

// All-classes PDF — combined ranked list of ALL students across all classes
function generateAllClassesPDF(byClass: Record<string, MeritEntry[]>, year: number) {
  const sortedClasses = Object.keys(byClass).sort();
  if (!sortedClasses.length) { toast.error("No data to export"); return; }

  // Merge ALL students from all classes, sort by percentage descending
  const allStudents: MeritEntry[] = [];
  for (const cls of sortedClasses) {
    allStudents.push(...(byClass[cls] || []));
  }
  allStudents.sort((a, b) => b.percentage - a.percentage);

  if (!allStudents.length) { toast.error("No data to export"); return; }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  const passing = allStudents.filter(e => e.is_pass || e.percentage >= 33);
  const avg = Math.round(allStudents.reduce((s, e) => s + e.percentage, 0) / allStudents.length);
  const highest = Math.max(...allStudents.map(e => e.percentage));
  const passRate = Math.round((passing.length / allStudents.length) * 100);

  drawPDFHeader(
    doc,
    "WHOLE SCHOOL MERIT LIST",
    `Year ${year}  |  All Classes Combined  |  ${allStudents.length} Students`,
    w
  );

  doc.setTextColor(40, 40, 40);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Total: ${allStudents.length}  |  Passed: ${passing.length}  |  Failed: ${allStudents.length - passing.length}  |  Highest: ${highest.toFixed(1)}%  |  Average: ${avg}%  |  Pass Rate: ${passRate}%`,
    w / 2, 49, { align: "center" }
  );

  // Single combined table — all students ranked 1 to N
  autoTable(doc, {
    startY: 53,
    head: [["Rank", "Class", "Roll No", "Student Name", "Marks", "%", "Grade", "Status"]],
    body: allStudents.map((e, i) => [
      medalLabel(i + 1),
      `Cls ${e.class}`,
      e.roll_number,
      e.full_name,
      `${e.obtained_marks} / ${e.total_marks}`,
      `${Number(e.percentage).toFixed(1)}%`,
      e.grade,
      (e.is_pass || e.percentage >= 33) ? "Pass" : "Fail",
    ]),
    headStyles: {
      fillColor: [4, 44, 83],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      cellPadding: 3,
    },
    bodyStyles: { fontSize: 8, cellPadding: 2.8, textColor: [20, 20, 20] },
    alternateRowStyles: { fillColor: [246, 247, 250] },
    columnStyles: {
      0: { halign: "center", cellWidth: 13, fontStyle: "bold" },
      1: { halign: "center", cellWidth: 16 },
      2: { halign: "center", cellWidth: 20 },
      3: { halign: "center",   cellWidth: 60, overflow: "linebreak" },
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
          data.cell.styles.textColor = val === "Pass" ? [0, 128, 0] : [200, 0, 0];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    margin: { left: 12, right: 12, bottom: 16 },
    didDrawPage: (data) => {
      const pc = (doc as any).internal.getNumberOfPages();
      drawPDFFooter(doc, w, h, data.pageNumber, pc);
    },
  });

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) { doc.setPage(p); drawPDFFooter(doc, w, h, p, totalPages); }
  doc.save(`School_MeritList_${year}.pdf`);
}

// ─── Merit Table UI ────────────────────────────────────────────────────────────
function MeritTable({ entries, showClass = false }: { entries: MeritEntry[]; showClass?: boolean }) {
  if (!entries.length) return (
    <Card><CardContent className="p-10 text-center">
      <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
      <p className="text-muted-foreground text-sm">No results found for this selection.</p>
      <p className="text-xs text-muted-foreground mt-1">Make sure results are entered in Manage Results tab.</p>
    </CardContent></Card>
  );

  return (
    <Card><CardContent className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary text-white">
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
            {entries.map((e, i) => (
              <tr key={`${e.student_id}-${i}`} className={`border-b border-border transition-colors ${
                i === 0 ? "bg-yellow-50 dark:bg-yellow-900/20" :
                i === 1 ? "bg-gray-50 dark:bg-gray-900/20" :
                i === 2 ? "bg-orange-50 dark:bg-orange-900/20" :
                "hover:bg-muted/30"
              }`}>
                <td className="p-3 text-center">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                    i === 0 ? "bg-yellow-400 text-yellow-900" :
                    i === 1 ? "bg-gray-300 text-gray-800" :
                    i === 2 ? "bg-orange-300 text-orange-900" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {i < 3 ? ["🥇","🥈","🥉"][i] : i + 1}
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
                    <span className={i < 3 ? "font-semibold" : ""}>{e.full_name}</span>
                  </div>
                </td>
                <td className="p-3 text-center text-xs font-mono">{e.obtained_marks}/{e.total_marks}</td>
                <td className="p-3 text-center font-bold">{Number(e.percentage).toFixed(1)}%</td>
                <td className="p-3 text-center">
                  <Badge className={
                    e.grade === "A+" ? "bg-primary text-white" :
                    e.grade === "A" ? "bg-primary text-white" :
                    e.grade === "B" ? "bg-green-500 text-white" :
                    e.grade === "C" ? "bg-blue-500 text-white" : "bg-muted text-foreground"
                  }>{e.grade}</Badge>
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
            ))}
          </tbody>
        </table>
      </div>
    </CardContent></Card>
  );
}

// ─── Stats row ─────────────────────────────────────────────────────────────────
function StatsRow({ entries }: { entries: MeritEntry[] }) {
  if (!entries.length) return null;
  const passing = entries.filter(e => e.is_pass || e.percentage >= 33);
  const avg = Math.round(entries.reduce((s, e) => s + e.percentage, 0) / entries.length);
  const highest = Math.max(...entries.map(e => e.percentage));
  const passRate = Math.round((passing.length / entries.length) * 100);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Total Students", value: entries.length, color: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" },
        { label: "Passed", value: `${passing.length} (${passRate}%)`, color: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300" },
        { label: "Highest %", value: `${highest.toFixed(1)}%`, color: "bg-blue-50 text-blue-800 dark:bg-blue-950/20 dark:text-blue-300" },
        { label: "Average %", value: `${avg}%`, color: "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300" },
      ].map(s => (
        <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
          <p className="text-lg md:text-xl font-bold">{s.value}</p>
          <p className="text-xs font-medium">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Class Merit Tab ──────────────────────────────────────────────────────────
function ClassMeritTab() {
  const [cls, setCls] = useState("6");
  const [examType, setExamType] = useState("1st Semester");
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear()));
  const year = parseInt(yearInput, 10);
  const validYear = !isNaN(year) && year >= 2000 && year <= 2099;

  const { data: entries = [], isLoading } = useMeritData(cls, examType, validYear ? year : 0);
  const publishMerit = usePublishMeritList();
  const { data: published = [] } = useMeritLists();
  const isPublished = published.some(
    m => m.class === cls && m.exam_type === examType && m.year === year && m.is_published
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
          <Button onClick={() => generateClassPDF(entries, cls, examType, year)} variant="outline" className="gap-1.5">
            <Download className="w-4 h-4" /> Download PDF
          </Button>
          <Button onClick={async () => {
            if (!validYear) { toast.error("Enter a valid year first"); return; }
            try { await publishMerit.mutateAsync({ cls, examType, year }); toast.success("Merit list published to student dashboard!"); }
            catch { toast.error("Failed to publish"); }
          }} disabled={isPublished || publishMerit.isPending} className="gap-1.5">
            <Send className="w-4 h-4" />
            {isPublished ? "Published ✓" : "Publish to Dashboard"}
          </Button>
          {isPublished && <Badge className="self-center bg-green-500">✓ Live on student dashboard</Badge>}
        </div>
      )}

      {/* Stats */}
      {!isLoading && <StatsRow entries={entries} />}

      {/* Table */}
      {!validYear ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Enter a valid year (e.g. 2025) to generate merit list.</CardContent></Card>
      ) : isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : (
        <MeritTable entries={entries} />
      )}
    </div>
  );
}

// ─── Whole School Merit Tab ────────────────────────────────────────────────────
function SchoolMeritTab() {
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear()));
  // Default = "combined" — all students ranked together as one list
  const [viewMode, setViewMode] = useState<"combined"|"class">("combined");
  const [selectedClass, setSelectedClass] = useState("6");
  const year = parseInt(yearInput, 10);
  const validYear = !isNaN(year) && year >= 2000 && year <= 2099;

  const { data: byClass = {}, isLoading } = useAllClassesMerit(validYear ? year : 0);
  const sortedClasses = Object.keys(byClass).sort();

  // ALL students merged and ranked by percentage — this is the combined view
  const allEntries = useMemo(() => {
    const all: MeritEntry[] = [];
    for (const cls of sortedClasses) { all.push(...(byClass[cls] || [])); }
    return all.sort((a, b) => b.percentage - a.percentage).map((e, i) => ({ ...e, position: i + 1 }));
  }, [byClass, sortedClasses]);

  const totalStudents = allEntries.length;
  const passing = allEntries.filter(e => e.is_pass || e.percentage >= 33);

  // Table data: combined = all students ranked together; class = only selected class
  const displayEntries = useMemo(() => {
    if (viewMode === "combined") return allEntries;
    return (byClass[selectedClass] || []);
  }, [viewMode, selectedClass, allEntries, byClass]);

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
                <SelectItem value="combined">🏆 All Students Combined (ranked together)</SelectItem>
                <SelectItem value="class">📋 Single Class</SelectItem>
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

      {/* Download */}
      {!isLoading && totalStudents > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <Button onClick={() => generateAllClassesPDF(byClass, year)} variant="outline" className="gap-1.5">
            <Download className="w-4 h-4" /> Download Combined PDF
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            {sortedClasses.length} classes · {totalStudents} students · {passing.length} passed
          </span>
        </div>
      )}

      {/* Stats */}
      {!isLoading && displayEntries.length > 0 && <StatsRow entries={displayEntries} />}

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
        // Always show Class column — in combined mode all students are together
        <MeritTable entries={displayEntries} showClass={viewMode === "combined"} />
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
const AdminMeritList = () => (
  <div className="space-y-5">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
        <Trophy className="w-5 h-5 text-blue-500" /> Merit List Generator
      </h2>
      <p className="text-sm text-muted-foreground mt-0.5">
        Auto-generated from results — download professional PDF or publish to student dashboard
      </p>
    </div>

    <Tabs defaultValue="class">
      <TabsList className="grid grid-cols-2 w-full sm:w-auto sm:inline-grid">
        <TabsTrigger value="class" className="gap-1.5"><BookOpen className="w-4 h-4" /> Class Merit</TabsTrigger>
        <TabsTrigger value="school" className="gap-1.5"><School className="w-4 h-4" /> Whole School</TabsTrigger>
      </TabsList>
      <TabsContent value="class" className="mt-4"><ClassMeritTab /></TabsContent>
      <TabsContent value="school" className="mt-4"><SchoolMeritTab /></TabsContent>
    </Tabs>
  </div>
);

export default AdminMeritList;
