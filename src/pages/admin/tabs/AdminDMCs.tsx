/**
 * AdminDMCs.tsx — GHS Babi Khel
 *
 * Replaces the old AdminReportCards.tsx.
 *
 * ─ Generates official DMCs (Detail Marks Certificates) as real PDFs, drawn
 *   with jsPDF to visually match the site's official DMC HTML template
 *   (the same style used by ResultCard.tsx / ResultCardTab.tsx): blue
 *   banner header with school logo, exam info bar, student info grid,
 *   subject-wise marks table, summary boxes, pass/fail status bar,
 *   signature section, footer.
 * ─ No attendance section, no teacher remarks section — DMC only.
 * ─ Single student, single class (batch), or WHOLE SCHOOL (all classes)
 *   scopes, each downloadable as one PDF or a ZIP of PDFs.
 * ─ Whole-school ZIPs are organised into one subfolder per class.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDown, Loader2, Users, User, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface SubjectMark { obtained: number; total: number; }

interface ResultRecord {
  id: string;
  student_id: string;
  class: string;
  exam_type: string;
  year: number;
  total_marks: number;
  obtained_marks: number;
  percentage: number;
  grade: string | null;
  position: number | null;
  is_pass: boolean;
  remarks: string | null;
  subject_marks: Record<string, SubjectMark> | null;
  exam_roll_no: string | null;
  students: {
    full_name: string;
    roll_number: string;
    photo_url: string | null;
    father_name: string | null;
  } | null;
}

interface SchoolInfo {
  school_name: string;
  address: string;
  emis_code: string;
  logo_url: string | null;
  phone: string | null;
}

interface AdminDMCsProps {
  cls: string;
  examType: string;
  year: number;
}

const ALL_CLASSES = ["6", "7", "8", "9", "10"];

// Classes 6-8 record results under "1st/2nd Semester"; classes 9-10 record
// under "Annual-I/Annual-II". These are DIFFERENT label sets — using one
// shared exam_type string across all classes (as this screen used to) meant
// Whole School and By Class only ever found results for the class group
// matching whichever label happened to be selected, leaving the other
// group's classes empty even though results existed for them.
const getExamTypesForClass = (cls: string) =>
  ["9", "10"].includes(cls) ? ["Annual-I", "Annual-II"] : ["1st Semester", "2nd Semester"];

// "Term" here means "1st" or "2nd" — index 0 or 1 into the pair above.
// This lets Whole School resolve the correct label PER class group instead
// of using one exam_type for every class.
type Term = 0 | 1;
const examTypeForClassAndTerm = (cls: string, term: Term) => getExamTypesForClass(cls)[term];

// ─── Helpers ────────────────────────────────────────────────────────────────────

const gradeFromPct = (pct: number) => {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 60) return "B";
  if (pct >= 45) return "C";
  if (pct >= 33) return "D";
  return "Fail";
};

// jsPDF RGB triples matching the HTML template's palette exactly
const GRADE_RGB = (g: string | null): [number, number, number] => {
  switch (g) {
    case "A+": return [3, 105, 161];   // #0369A1
    case "A":  return [14, 165, 233];  // #0EA5E9
    case "B":  return [13, 148, 136];  // #0D9488
    case "C":  return [30, 58, 138];   // #1e3a8a
    case "D":  return [234, 88, 12];   // #EA580C
    default:   return [220, 38, 38];   // #DC2626
  }
};

const sanitizeFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");

// Convert an image URL to a data URL so jsPDF can embed it.
async function toDataURL(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── Draw one DMC page (matches the site's official DMC HTML template) ─────────

function drawDMC(
  doc: jsPDF,
  r: ResultRecord,
  school: SchoolInfo,
  logoDataUrl: string | null,
  photoDataUrl: string | null,
  schoolRank: number | null,
): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const cardW = w - marginX * 2;
  const cardX = marginX;
  let cardTop = 10;

  const studentName = r.students?.full_name || "—";
  const fatherName  = r.students?.father_name || "—";
  const classRollNo = r.students?.roll_number || "—";
  const examRollNo  = r.exam_roll_no || "—";

  // Filter out subjects where both obtained AND total are 0 (not entered)
  const subjects = r.subject_marks
    ? Object.entries(r.subject_marks).filter(([, m]) => !(m.obtained === 0 && m.total === 0))
    : [];

  // ── Outer card border (rounded rect, like .dmc in the HTML) ────────────────
  const cardBottom = h - 12;
  doc.setDrawColor(31, 31, 31);
  doc.setLineWidth(0.9);
  doc.roundedRect(cardX, cardTop, cardW, cardBottom - cardTop, 3, 3, "S");

  let y = cardTop;

  // ── Header banner (white background, no logo — per request) ────────────────
  const headerH = 26;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(cardX, y, cardW, headerH, 3, 3, "F");
  // square off the bottom corners so it reads as one continuous banner
  doc.rect(cardX, y + headerH - 4, cardW, 4, "F");
  // thin rule under the header so it still reads as a distinct band on
  // white paper, now that there's no fill-color contrast to separate it
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(cardX, y + headerH, cardX + cardW, y + headerH);

  // Student photo box (right) — only if a real photo exists, otherwise
  // nothing is drawn there (matches the "no placeholder letter" fix)
  const photoW = 15, photoH = 19;
  const photoX = cardX + cardW - 16 - photoW / 2;
  const photoY = y + headerH / 2 - photoH / 2;
  if (photoDataUrl) {
    doc.setDrawColor(31, 31, 31);
    doc.setLineWidth(0.6);
    doc.roundedRect(photoX, photoY, photoW, photoH, 1, 1, "S");
    try {
      doc.addImage(photoDataUrl, photoX, photoY, photoW, photoH);
    } catch { /* ignore broken image */ }
  }

  // Centered school name / address / "DETAIL MARKS CERTIFICATE" / EMIS line
  // — centered on the full card width (no logo circle on the left anymore,
  // so this now sits at the true visual center of the header).
  const centerX = cardX + cardW / 2;
  doc.setTextColor(31, 31, 31);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(school.school_name, centerX, y + 8, { align: "center" });

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(82, 82, 82);
  doc.text(school.address, centerX, y + 12, { align: "center" });

  // "DETAIL MARKS CERTIFICATE" pill badge
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const badgeText = "DETAIL MARKS CERTIFICATE";
  const badgeW = doc.getTextWidth(badgeText) + 10;
  const badgeX = centerX - badgeW / 2;
  const badgeY = y + 14.5;
  doc.setFillColor(31, 31, 31);
  doc.roundedRect(badgeX, badgeY, badgeW, 5.5, 2.5, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(badgeText, centerX, badgeY + 3.8, { align: "center" });

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(82, 82, 82);
  const emisLine = `EMIS: ${school.emis_code}${school.phone ? `   |   Ph: ${school.phone}` : ""}`;
  doc.text(emisLine, centerX, y + 23.5, { align: "center" });

  y += headerH;

  // ── Exam info bar (5 columns, white background — was dark/blue) ────────────
  const examBarH = 9;
  doc.setFillColor(255, 255, 255);
  doc.rect(cardX, y, cardW, examBarH, "F");
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(cardX, y + examBarH, cardX + cardW, y + examBarH);
  const examCols = [
    ["EXAMINATION", r.exam_type],
    ["YEAR", String(r.year)],
    ["CLASS", r.class],
    ["EXAM ROLL NO", examRollNo],
    ["CLASS ROLL NO", classRollNo],
  ];
  const colW = cardW / examCols.length;
  examCols.forEach(([label, val], i) => {
    const cx = cardX + colW * i + colW / 2;
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.text(label, cx, y + 3.5, { align: "center" });
    doc.setTextColor(31, 31, 31);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(val, cx, y + 7, { align: "center" });
  });
  y += examBarH;

  // ── Student info grid (2x2, matches .stu-grid) ──────────────────────────────
  const gridH = 15;
  doc.setFillColor(248, 250, 255);
  doc.rect(cardX, y, cardW, gridH, "F");
  doc.setDrawColor(224, 242, 254);
  doc.setLineWidth(0.3);
  doc.line(cardX, y + gridH, cardX + cardW, y + gridH);

  const gridPad = 6;
  const gridColW = cardW / 2;
  const drawInfoRow = (label: string, val: string, gx: number, gy: number) => {
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(label, gx, gy);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(val, gx + 28, gy);
  };
  drawInfoRow("STUDENT NAME", studentName, cardX + gridPad, y + 6);
  drawInfoRow("FATHER NAME", fatherName, cardX + gridColW + gridPad, y + 6);
  drawInfoRow("CLASS", r.class, cardX + gridPad, y + 12);
  drawInfoRow("SESSION", `${r.exam_type} ${r.year}`, cardX + gridColW + gridPad, y + 12);
  y += gridH + 4;

  // ── Subject-wise marks table (matches .tbl-wrap / table) ────────────────────
  doc.setTextColor(3, 105, 161);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("SUBJECT-WISE MARKS", cardX + 6, y);
  y += 4;

  const tableX = cardX + 6;
  const tableW = cardW - 12;
  const colWidths = [0.34, 0.16, 0.16, 0.15, 0.10, 0.09].map(f => f * tableW);
  const headers = ["Subject", "Total", "Obtained", "Percentage", "Grade", "Result"];
  const rowH = 6.5;

  // Header row
  doc.setFillColor(3, 105, 161);
  doc.rect(tableX, y, tableW, rowH, "F");
  let cx = tableX;
  headers.forEach((hLabel, i) => {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    const align = i === 0 ? "left" : "center";
    const tx = i === 0 ? cx + 2 : cx + colWidths[i] / 2;
    doc.text(hLabel.toUpperCase(), tx, y + rowH / 2 + 1.2, { align });
    cx += colWidths[i];
  });
  y += rowH;

  if (subjects.length === 0) {
    doc.setFillColor(248, 250, 255);
    doc.setDrawColor(224, 242, 254);
    doc.rect(tableX, y, tableW, 12, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text("Subject-wise marks not entered. See summary below.", tableX + tableW / 2, y + 7, { align: "center" });
    y += 12;
  } else {
    subjects.forEach(([name, m], idx) => {
      const pct = m.total > 0 ? Math.round((m.obtained / m.total) * 100) : 0;
      const grade = gradeFromPct(pct);
      const pass = pct >= 33;

      doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 255 : 255);
      doc.rect(tableX, y, tableW, rowH, "F");
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.15);
      doc.rect(tableX, y, tableW, rowH, "S");

      cx = tableX;
      // Subject name
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.text(name, cx + 2, y + rowH / 2 + 1);
      cx += colWidths[0];
      // Total
      doc.text(String(m.total), cx + colWidths[1] / 2, y + rowH / 2 + 1, { align: "center" });
      cx += colWidths[1];
      // Obtained (blue bold)
      doc.setTextColor(3, 105, 161);
      doc.setFont("helvetica", "bold");
      doc.text(String(m.obtained), cx + colWidths[2] / 2, y + rowH / 2 + 1, { align: "center" });
      cx += colWidths[2];
      // Percentage
      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "normal");
      doc.text(`${pct}%`, cx + colWidths[3] / 2, y + rowH / 2 + 1, { align: "center" });
      cx += colWidths[3];
      // Grade (colored)
      const [gr, gg, gb] = GRADE_RGB(grade);
      doc.setTextColor(gr, gg, gb);
      doc.setFont("helvetica", "bold");
      doc.text(grade, cx + colWidths[4] / 2, y + rowH / 2 + 1, { align: "center" });
      cx += colWidths[4];
      // Result (Pass/Fail)
      doc.setTextColor(...(pass ? [22, 163, 74] as [number, number, number] : [220, 38, 38] as [number, number, number]));
      doc.setFont("helvetica", "bold");
      doc.text(pass ? "Pass" : "Fail", cx + colWidths[5] / 2, y + rowH / 2 + 1, { align: "center" });

      y += rowH;
    });

    // Grand total row
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(147, 197, 253);
    doc.setLineWidth(0.3);
    doc.rect(tableX, y, tableW, rowH, "FD");
    cx = tableX;
    doc.setTextColor(3, 105, 161);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("GRAND TOTAL", cx + 2, y + rowH / 2 + 1);
    cx += colWidths[0];
    doc.text(String(r.total_marks), cx + colWidths[1] / 2, y + rowH / 2 + 1, { align: "center" });
    cx += colWidths[1];
    doc.text(String(r.obtained_marks), cx + colWidths[2] / 2, y + rowH / 2 + 1, { align: "center" });
    cx += colWidths[2];
    doc.text(`${r.percentage}%`, cx + colWidths[3] / 2, y + rowH / 2 + 1, { align: "center" });
    y += rowH;
  }
  y += 4;

  // ── Summary boxes (4 across, matches .summary) ──────────────────────────────
  const sumH = 15;
  const sumGap = 3;
  const sumW = (tableW - sumGap * 3) / 4;
  const summaryItems: Array<[string, string, [number, number, number]]> = [
    ["TOTAL MARKS", String(r.total_marks), [3, 105, 161]],
    ["OBTAINED", String(r.obtained_marks), [14, 165, 233]],
    ["PERCENTAGE", `${r.percentage}%`, [3, 105, 161]],
    ["GRADE", r.grade || "—", r.is_pass ? [22, 163, 74] : [220, 38, 38]],
  ];
  summaryItems.forEach(([label, val, rgb], i) => {
    const bx = tableX + (sumW + sumGap) * i;
    const isGradeBox = i === 3;
    doc.setFillColor(isGradeBox ? (r.is_pass ? 240 : 254) : 248, isGradeBox ? (r.is_pass ? 253 : 242) : 250, isGradeBox ? (r.is_pass ? 244 : 242) : 255);
    doc.setDrawColor(isGradeBox ? (r.is_pass ? 187 : 254) : 224, isGradeBox ? (r.is_pass ? 247 : 202) : 242, isGradeBox ? (r.is_pass ? 208 : 202) : 254);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, y, sumW, sumH, 1.5, 1.5, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.text(label, bx + sumW / 2, y + 5, { align: "center" });
    doc.setTextColor(...rgb);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(val, bx + sumW / 2, y + 11.5, { align: "center" });
  });
  y += sumH + 4;

  // ── Pass/Fail status bar (matches .status-bar) ──────────────────────────────
  // Single row, vertically centered: Rank (school-wide) on the left,
  // PASS/FAIL centered in the middle, Position (in-class) on the right.
  const statusH = 11;
  doc.setFillColor(r.is_pass ? 240 : 254, r.is_pass ? 253 : 242, r.is_pass ? 244 : 242);
  doc.setDrawColor(r.is_pass ? 187 : 254, r.is_pass ? 247 : 202, r.is_pass ? 208 : 202);
  doc.setLineWidth(0.5);
  doc.roundedRect(tableX, y, tableW, statusH, 1.5, 1.5, "FD");

  const midY = y + statusH / 2 + 1.5;

  // Centered PASS/FAIL
  const statusText = r.is_pass ? "PASS" : "FAIL";
  doc.setTextColor(...(r.is_pass ? [22, 163, 74] as [number, number, number] : [220, 38, 38] as [number, number, number]));
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(statusText, tableX + tableW / 2, midY, { align: "center" });

  // Rank (school-wide) — left side
  if (schoolRank) {
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Rank #${schoolRank} in School`, tableX + 6, midY, { align: "left" });
  }

  // Position (in-class) — right side
  if (r.position) {
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Position #${r.position} in Class`, tableX + tableW - 6, midY, { align: "right" });
  }

  y += statusH + 4;

  // ── Signature section (matches .sig-section) ────────────────────────────────
  const sigY = cardBottom - 14;
  const sigColW = tableW / 3;
  const sigLabels = ["CLASS TEACHER", "EXAM IN-CHARGE", "HEADMASTER / PRINCIPAL"];
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(tableX, sigY - 4, tableX + tableW, sigY - 4);
  sigLabels.forEach((label, i) => {
    const sx = tableX + sigColW * i;
    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.3);
    doc.line(sx + 8, sigY + 2, sx + sigColW - 8, sigY + 2);
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.text(label, sx + sigColW / 2, sigY + 6, { align: "center" });
  });

  // ── Footer (matches .footer) ─────────────────────────────────────────────────
  const footY = cardBottom - 5;
  doc.setFillColor(241, 245, 249);
  doc.rect(cardX, footY - 2, cardW, 7, "F");
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(cardX, footY - 2, cardX + cardW, footY - 2);
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.text(`${school.school_name}  |  ${school.address}`, cardX + 4, footY + 2);
  doc.setTextColor(3, 105, 161);
  doc.setFont("helvetica", "bold");
  doc.text(`Official DMC  |  ${r.exam_type} ${r.year}`, cardX + cardW - 5, footY + 2, { align: "right" });
}

async function generateDMCPDF(
  r: ResultRecord,
  school: SchoolInfo,
  logoDataUrl: string | null,
  schoolRank: number | null,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const photoUrl = r.students?.photo_url || null;
  const photoDataUrl = photoUrl ? await toDataURL(photoUrl) : null;
  drawDMC(doc, r, school, logoDataUrl, photoDataUrl, schoolRank);
  return doc;
}

// ─── Main Component ─────────────────────────────────────────────────────────────

function AdminDMCs({ cls, examType, year }: AdminDMCsProps) {
  const [selectedStudentId, setSelectedStudentId] = useState<string>("all");
  const [scope, setScope] = useState<"class" | "school">("class");
  // The class to use when scope is "class" — defaults to whatever class tab
  // was open in Manage Results, but the admin can change it here without
  // having to leave this screen and switch tabs.
  const [selectedClass, setSelectedClass] = useState<string>(cls);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");

  // ── Term (1st/2nd) — replaces the old fixed `examType` prop ─────────────
  // FIX: classes 6-8 use "1st/2nd Semester" while 9-10 use "Annual-I/II".
  // Passing one shared examType string to every class's query meant Whole
  // School (and switching class under By Class) silently found zero
  // results for whichever class group didn't match that label. Instead we
  // track a term INDEX (0 = first, 1 = second) and resolve the correct
  // label per class at query time.
  const initialTerm: Term = getExamTypesForClass(cls).indexOf(examType) === 1 ? 1 : 0;
  const [term, setTerm] = useState<Term>(initialTerm);

  // The exam_type actually used for "By Class" scope — always matches
  // whichever class is selected, so switching class never leaves a stale
  // label from a different class group behind.
  const classExamType = examTypeForClassAndTerm(selectedClass, term);
  const termLabelPair = getExamTypesForClass(selectedClass);

  const { data: settings } = useSchoolSettings();
  const school: SchoolInfo = {
    school_name: settings?.school_name || "GHS Babi Khel",
    address: settings?.address || "Babi Khel, District Mohmand, KPK, Pakistan",
    emis_code: settings?.emis_code || "—",
    logo_url: settings?.logo_url || null,
    phone: settings?.phone || null,
  };

  // Pre-convert the school logo to a data URL in the background (so it's
  // usually already cached and ready before the user clicks Generate).
  const { data: cachedLogoDataUrl = null } = useQuery({
    queryKey: ["dmc-logo", school.logo_url],
    queryFn: () => (school.logo_url ? toDataURL(school.logo_url) : Promise.resolve(null)),
    enabled: !!school.logo_url,
    staleTime: 30 * 60 * 1000,
  });

  // ── Resolve the logo data URL, awaiting it fresh if needed ─────────────────
  // FIX: previously the component read the React Query result directly at
  // generation time. If the user clicked "Generate" before that background
  // query had finished (e.g. right after opening the tab), logoDataUrl was
  // still null and the PDF was generated with the "GHS" text placeholder
  // instead of the real logo — even though a logo was set in School
  // Settings. This helper always returns a real, awaited result: it uses the
  // already-cached value if available, otherwise fetches it fresh on the
  // spot before generation proceeds.
  const resolveLogoDataUrl = async (): Promise<string | null> => {
    if (cachedLogoDataUrl) return cachedLogoDataUrl;
    if (!school.logo_url) return null;
    return await toDataURL(school.logo_url);
  };

  // ── Fetch results (single class, or every class for whole-school) ──────────
  // FIX: Whole School now issues ONE query per class group (6-8 semester
  // label, 9-10 annual label) instead of a single .eq("exam_type", ...)
  // across all 5 classes — previously that only ever matched one group,
  // leaving the other group's classes empty.
  const { data: results = [], isLoading, error: fetchError } = useQuery<ResultRecord[]>({
    queryKey: ["admin-dmcs", scope, selectedClass, classExamType, term, year],
    queryFn: async () => {
      const baseSelect = "id, student_id, class, exam_type, year, total_marks, obtained_marks, percentage, grade, position, is_pass, remarks, subject_marks, exam_roll_no, students(full_name, roll_number, photo_url, father_name)";

      let rows: ResultRecord[];
      if (scope === "school") {
        // Group classes by which label set they use, and query each group
        // with its own correct exam_type for the selected term.
        const groups = new Map<string, string[]>(); // exam_type -> classes
        for (const c of ALL_CLASSES) {
          const et = examTypeForClassAndTerm(c, term);
          if (!groups.has(et)) groups.set(et, []);
          groups.get(et)!.push(c);
        }
        const chunks = await Promise.all(
          Array.from(groups.entries()).map(async ([et, classesInGroup]) => {
            const { data, error } = await supabase
              .from("results")
              .select(baseSelect)
              .eq("exam_type", et)
              .eq("year", year)
              .in("class", classesInGroup)
              .order("class", { ascending: true })
              .order("percentage", { ascending: false });
            if (error) throw error;
            return (data ?? []) as unknown as ResultRecord[];
          })
        );
        rows = chunks.flat();
      } else {
        const { data, error } = await supabase
          .from("results")
          .select(baseSelect)
          .eq("exam_type", classExamType)
          .eq("year", year)
          .eq("class", selectedClass)
          .order("percentage", { ascending: false });
        if (error) throw error;
        rows = (data ?? []) as unknown as ResultRecord[];
      }

      // ── Fallback: fill in missing exam_roll_no from the exam_roll_numbers
      // table (the "Exam Roll Numbers" feature) for any student whose
      // result row never had one manually entered. Previously a student
      // with a real, published exam roll number could still show "—" on
      // their DMC just because it wasn't copied onto their result row.
      const missingIds = Array.from(new Set(rows.filter(r => !r.exam_roll_no).map(r => r.student_id)));
      if (missingIds.length) {
        const { data: rollRows } = await supabase
          .from("exam_roll_numbers")
          .select("student_id, exam_roll_no, created_at")
          .in("student_id", missingIds)
          .order("created_at", { ascending: false });
        const latestByStudent = new Map<string, string>();
        for (const rr of rollRows ?? []) {
          if (!latestByStudent.has(rr.student_id)) latestByStudent.set(rr.student_id, rr.exam_roll_no);
        }
        rows = rows.map(r =>
          !r.exam_roll_no && latestByStudent.has(r.student_id)
            ? { ...r, exam_roll_no: latestByStudent.get(r.student_id)! }
            : r
        );
      }

      return rows;
    },
    enabled: !!year && (scope === "school" || !!selectedClass),
    staleTime: 10 * 60 * 1000,
  });

  // ── Whole-school results, ALWAYS fetched regardless of scope ────────────────
  // Used purely to compute each student's rank across the entire school (not
  // just within their own class), so a single-class DMC can still show
  // "Rank #X in whole school" alongside "Position #Y in Class". Same
  // per-class-group fix applies here.
  const { data: schoolWideResults = [] } = useQuery<ResultRecord[]>({
    queryKey: ["admin-dmcs-schoolwide-rank", term, year],
    queryFn: async () => {
      const groups = new Map<string, string[]>();
      for (const c of ALL_CLASSES) {
        const et = examTypeForClassAndTerm(c, term);
        if (!groups.has(et)) groups.set(et, []);
        groups.get(et)!.push(c);
      }
      const chunks = await Promise.all(
        Array.from(groups.entries()).map(async ([et, classesInGroup]) => {
          const { data, error } = await supabase
            .from("results")
            .select("id, student_id, class, percentage")
            .eq("exam_type", et)
            .eq("year", year)
            .in("class", classesInGroup);
          if (error) throw error;
          return (data ?? []) as unknown as ResultRecord[];
        })
      );
      return chunks.flat();
    },
    enabled: !!year,
    staleTime: 10 * 60 * 1000,
  });

  // Map of student_id -> rank across the whole school (highest percentage
  // per student, deduplicated, sorted descending).
  const schoolRankMap = (() => {
    const seen = new Map<string, number>();
    for (const r of schoolWideResults) {
      const existing = seen.get(r.student_id);
      if (existing === undefined || r.percentage > existing) {
        seen.set(r.student_id, r.percentage);
      }
    }
    const sorted = Array.from(seen.entries()).sort((a, b) => b[1] - a[1]);
    const map = new Map<string, number>();
    sorted.forEach(([studentId], i) => map.set(studentId, i + 1));
    return map;
  })();

  // ── Deduplicated & ranked results (ranked WITHIN each class, never mixed) ──
  const rankedResults = (() => {
    const seen = new Map<string, ResultRecord>();
    for (const r of results) {
      if (!seen.has(r.student_id) || r.percentage > seen.get(r.student_id)!.percentage) {
        seen.set(r.student_id, r);
      }
    }
    const deduped = Array.from(seen.values());
    const byClass = new Map<string, ResultRecord[]>();
    for (const r of deduped) {
      if (!byClass.has(r.class)) byClass.set(r.class, []);
      byClass.get(r.class)!.push(r);
    }
    const out: ResultRecord[] = [];
    for (const [, group] of Array.from(byClass.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
      const ranked = group.sort((a, b) => b.percentage - a.percentage)
        .map((r, i) => ({ ...r, position: r.position ?? i + 1 }));
      out.push(...ranked);
    }
    return out;
  })();

  // Which classes actually turned up results, vs which are missing — shown
  // in whole-school scope so it's clear when a class is absent because it
  // simply has no results entered yet (not because of a bug).
  const classesWithData = Array.from(new Set(rankedResults.map(r => r.class))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const classesMissing = scope === "school" ? ALL_CLASSES.filter(c => !classesWithData.includes(c)) : [];

  // ── Generate single DMC ──────────────────────────────────────────────────
  const handleGenerateSingle = async () => {
    const target = selectedStudentId === "all"
      ? rankedResults[0]
      : rankedResults.find(r => r.student_id === selectedStudentId);

    if (!target) {
      toast.error("No student selected or no results found");
      return;
    }

    setGenerating(true);
    setProgressLabel("Generating DMC...");
    setProgress(40);

    try {
      const logoDataUrl = await resolveLogoDataUrl();
      const doc = await generateDMCPDF(target, school, logoDataUrl, schoolRankMap.get(target.student_id) ?? null);
      setProgress(90);

      const fileName = `DMC_Class${target.class}_${sanitizeFileName(target.students?.full_name || "Student")}_${target.exam_type.replace(/\s/g, "")}_${year}.pdf`;
      doc.save(fileName);

      setProgress(100);
      toast.success("DMC PDF generated!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate DMC");
    } finally {
      setTimeout(() => {
        setGenerating(false);
        setProgress(0);
        setProgressLabel("");
      }, 800);
    }
  };

  // ── Generate batch ZIP (single class, or whole school with per-class subfolders) ──
  const handleGenerateBatch = async () => {
    if (rankedResults.length === 0) {
      toast.error("No results found for this selection");
      return;
    }

    setGenerating(true);
    setProgress(0);
    setProgressLabel("Initializing...");

    try {
      const logoDataUrl = await resolveLogoDataUrl();
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const zipLabel = scope === "school" ? "WholeSchool" : `Class${selectedClass}`;
      const termLabel = term === 0 ? "Term1" : "Term2";
      const rootFolder = zip.folder(`DMCs_${zipLabel}_${termLabel}_${year}`);

      const perClassCounter = new Map<string, number>();

      for (let i = 0; i < rankedResults.length; i++) {
        const r = rankedResults[i];
        const studentName = r.students?.full_name || "Unknown";
        setProgressLabel(`Generating: ${studentName} (Class ${r.class}) — ${i + 1}/${rankedResults.length}`);
        setProgress(Math.round(((i + 0.3) / rankedResults.length) * 90));

        const doc = await generateDMCPDF(r, school, logoDataUrl, schoolRankMap.get(r.student_id) ?? null);
        const pdfBlob = doc.output("blob");

        const idx = (perClassCounter.get(r.class) ?? 0) + 1;
        perClassCounter.set(r.class, idx);
        const fileName = `${String(idx).padStart(2, "0")}_${sanitizeFileName(studentName)}.pdf`;

        const targetFolder = scope === "school"
          ? rootFolder!.folder(`Class ${r.class}`)!
          : rootFolder!;
        targetFolder.file(fileName, pdfBlob);

        setProgress(Math.round(((i + 1) / rankedResults.length) * 90));
      }

      setProgressLabel("Creating ZIP file...");
      setProgress(93);

      const blob = await zip.generateAsync({ type: "blob" });
      setProgress(97);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = `DMCs_${zipLabel}_${termLabel}_${year}.zip`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);

      setProgress(100);
      toast.success(`${rankedResults.length} DMCs bundled into ZIP!`);
    } catch (err: any) {
      toast.error(err?.message || "Batch generation failed");
    } finally {
      setTimeout(() => {
        setGenerating(false);
        setProgress(0);
        setProgressLabel("");
      }, 800);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileDown className="w-5 h-5 text-primary" />
            DMC Generation
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Generate official Detail Marks Certificates (DMCs) &middot; {scope === "class" ? classExamType : (term === 0 ? "1st Term" : "2nd Term")} {year}
          </p>
        </div>
        {rankedResults.length > 0 && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Users className="w-3.5 h-3.5" />
            {rankedResults.length} student{rankedResults.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Scope: single class vs whole school */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
              Scope
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                size="sm"
                variant={scope === "class" ? "default" : "outline"}
                onClick={() => { setScope("class"); setSelectedStudentId("all"); }}
                className="flex-1 min-w-0 whitespace-normal h-auto py-2"
              >
                By Class
              </Button>
              <Button
                type="button"
                size="sm"
                variant={scope === "school" ? "default" : "outline"}
                onClick={() => { setScope("school"); setSelectedStudentId("all"); }}
                className="flex-1 min-w-0 whitespace-normal h-auto py-2"
              >
                Whole School (Classes {ALL_CLASSES[0]}–{ALL_CLASSES[ALL_CLASSES.length - 1]})
              </Button>
            </div>

            {/* Term selector — replaces the old fixed examType label.
                Classes 6-8 use "1st/2nd Semester"; 9-10 use "Annual-I/II".
                This picks the right label automatically per class/group. */}
            <div className="mt-3">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
                Term
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button" size="sm"
                  variant={term === 0 ? "default" : "outline"}
                  onClick={() => setTerm(0)}
                  className="flex-1 min-w-0 whitespace-normal h-auto py-2 text-center"
                >
                  {scope === "class" ? termLabelPair[0] : "1st Term (Semester I / Annual-I)"}
                </Button>
                <Button
                  type="button" size="sm"
                  variant={term === 1 ? "default" : "outline"}
                  onClick={() => setTerm(1)}
                  className="flex-1 min-w-0 whitespace-normal h-auto py-2 text-center"
                >
                  {scope === "class" ? termLabelPair[1] : "2nd Term (Semester II / Annual-II)"}
                </Button>
              </div>
            </div>

            {/* Class picker — only shown/relevant when scope is "By Class".
                This lets the admin pick ANY class here, instead of being
                stuck with whatever class tab happened to be open in Manage
                Results when they clicked into DMCs. */}
            {scope === "class" && (
              <div className="mt-3">
                <label className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
                  Which Class
                </label>
                <Select value={selectedClass} onValueChange={(v) => { setSelectedClass(v); setSelectedStudentId("all"); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose class..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_CLASSES.map(c => (
                      <SelectItem key={c} value={c}>Class {c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scope === "school" && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Generates DMCs for every class ({ALL_CLASSES.join(", ")}) &middot; {year}. Classes 6–8 use the matching Semester, classes 9–10 use the matching Annual exam. The ZIP will contain one subfolder per class — 6, 7, 8, 9, and 10 (any class with no results for this term/year will simply be empty).
              </p>
            )}
            {scope === "school" && classesMissing.length > 0 && (
              <p className="text-[11px] text-orange-600 dark:text-orange-400 mt-1 font-medium">
                No results found yet for Class {classesMissing.join(", ")} — those classes won't have DMCs until results are added in Manage Results.
              </p>
            )}
          </div>

          {/* Student selector */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
                Select Student
              </label>
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose student..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Students (Batch)</SelectItem>
                  {rankedResults.map(r => (
                    <SelectItem key={r.student_id} value={r.student_id}>
                      {scope === "school" ? `Class ${r.class} — ` : ""}{r.students?.full_name || "Unknown"} &middot; Roll: {r.students?.roll_number || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Single-DMC button only appears once a specific student is
                picked — previously it defaulted to "Generate First
                Student's DMC" when "All Students" was selected, which was
                confusing since it silently generated a DMC for whichever
                student happened to be first in the ranked list. */}
            {selectedStudentId !== "all" && (
              <Button
                onClick={handleGenerateSingle}
                disabled={generating || rankedResults.length === 0}
                className="gap-2 flex-1"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                Generate DMC
              </Button>
            )}

            <Button
              onClick={handleGenerateBatch}
              disabled={generating || rankedResults.length === 0}
              variant="outline"
              className="gap-2 flex-1 border-primary/30 hover:bg-primary/5"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              {scope === "school"
                ? `Generate Whole School (${rankedResults.length}) & ZIP`
                : `Generate All (${rankedResults.length}) & ZIP`}
            </Button>
          </div>

          {/* Progress bar */}
          {generating && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2.5" />
              <p className="text-xs text-muted-foreground text-center animate-pulse">
                {progressLabel} &middot; {progress}%
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {/* Error state */}
      {fetchError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-5 text-center">
            <ShieldAlert className="w-10 h-10 text-destructive/50 mx-auto mb-2" />
            <p className="font-semibold text-foreground">Could not load results</p>
            <p className="text-sm text-muted-foreground mt-1">{(fetchError as any)?.message || "Database error — please check your connection and try again."}</p>
          </CardContent>
        </Card>
      )}

      {/* Student preview list */}
      {!isLoading && rankedResults.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-border bg-primary/5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {scope === "school" ? "All students in school" : "Students in this class"} &middot; {scope === "class" ? classExamType : (term === 0 ? "1st Term" : "2nd Term")} {year}
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {rankedResults.map((r, idx) => {
                const gradeColor = r.is_pass
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors"
                  >
                    <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {r.students?.full_name || "Unknown"}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {scope === "school" && `Class ${r.class} \u00B7 `}
                        Roll: {r.students?.roll_number || "—"}
                        {r.students?.father_name && ` \u00B7 Father: ${r.students.father_name}`}
                        {r.exam_roll_no && ` \u00B7 Exam Roll: ${r.exam_roll_no}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <span className="text-sm font-bold text-primary">{r.percentage}%</span>
                      <Badge className={`text-[10px] px-1.5 py-0.5 ${gradeColor}`}>
                        {r.is_pass ? "Pass" : "Fail"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && rankedResults.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <FileDown className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground">No Results Found</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
              No results are available for {scope === "school" ? "any class in the school" : `Class ${selectedClass}`} &middot; {scope === "class" ? classExamType : (term === 0 ? "1st Term" : "2nd Term")} &middot; {year}.
              Please add results in the Manage Results tab first.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AdminDMCs;
