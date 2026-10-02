/**
 * AttendanceAnalyticsReport.tsx
 *
 * "Report" button shown inside the Attendance Analytics tab. Opens a dialog
 * where the admin picks one or more classes (6,7,8,9,10 — or "All") and
 * downloads a single, COMBINED multi-page Letter-size PDF with advanced
 * vector charts:
 *
 *   • Cover header with period info & selected classes
 *   • 4 KPI stat cards (combined across all selected classes)
 *   • Class-wise comparison bar chart (each selected class side-by-side)
 *   • Status distribution donut (present / absent / late / halfday / leave)
 *   • Monthly attendance trend area chart (combined, all 12 months of year)
 *   • Day-of-week pattern bar chart (combined, Mon–Fri)
 *   • Daily attendance heat-map calendar for the selected month (combined)
 *   • Daily attendance rate line chart across the days of the month
 *   • Top 10 students requiring attention (combined across selected classes)
 *   • Footer with generated-on timestamp & page numbers
 *
 * When multiple classes are selected (or "All"), every chart aggregates
 * data from ALL of them into one combined view — the PDF is NOT a per-class
 * report repeated N times.
 */

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDown, Loader2 } from "lucide-react";
import jsPDF from "jspdf";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_CLASSES = ["6", "7", "8", "9", "10"];

const MONTH_NAMES_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_WORK = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// ─── PDF color palette — light / pastel, ink-saving ──────────────────────────
// Saturated fills drink ink on print. These tones are deliberately muted so the
// PDF stays readable when printed in B/W or on a colour laser, while still
// differentiating categories on screen.

const PDF = {
  ink:    [40, 40, 40]     as [number, number, number],   // primary text
  sub:    [90, 90, 90]     as [number, number, number],   // secondary text
  muted:  [130, 130, 130]  as [number, number, number],   // tertiary text
  rule:   [205, 205, 210]  as [number, number, number],   // hairlines
  white:  [255, 255, 255]  as [number, number, number],
  gold:   [148, 116, 50]   as [number, number, number],   // soft gold
  pass:   [56, 142, 90]    as [number, number, number],   // muted green
  fail:   [173, 67, 67]    as [number, number, number],   // muted red
  warn:   [168, 138, 30]   as [number, number, number],   // muted amber
  panel:  [248, 249, 251]  as [number, number, number],   // near-white panel
  panel2: [241, 243, 247]  as [number, number, number],   // slightly darker panel
  navy:   [49, 70, 99]     as [number, number, number],   // soft navy (headers)
  primary:[99, 122, 187]   as [number, number, number],   // soft indigo
  purple: [142, 122, 187]  as [number, number, number],   // soft violet
  orange: [205, 132, 70]   as [number, number, number],   // soft orange
  teal:   [70, 152, 152]   as [number, number, number],   // soft teal
  rose:   [180, 100, 115]  as [number, number, number],   // soft rose
  sky:    [90, 145, 180]   as [number, number, number],   // soft sky
};

const CLASS_COLORS: Record<string, [number, number, number]> = {
  "6":  PDF.primary,
  "7":  PDF.purple,
  "8":  PDF.teal,
  "9":  PDF.orange,
  "10": PDF.rose,
};

const STATUS_COLORS: Record<string, [number, number, number]> = {
  present: PDF.pass,
  late:    PDF.sky,
  halfday: PDF.warn,
  leave:   PDF.purple,
  absent:  PDF.fail,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawAttendanceRow {
  student_id: string;
  status: string;
  date: string;
}
interface StudentRow {
  id: string;
  full_name: string;
  roll_number: string;
  class: string;
}

interface CombinedClassStat {
  cls: string;
  totalStudents: number;
  totalRecords: number;
  present: number;
  absent: number;
  late: number;
  halfday: number;
  leave: number;
  avgRate: number; // 0-100
}

interface MonthlyTrendPoint {
  month: string;
  monthNum: number;
  totalRecords: number;
  percentage: number;
}

interface DayOfWeekPoint {
  day: string;
  avgAttendanceRate: number;
  totalRecords: number;
}

interface HeatmapDay {
  day: number;
  weekday: number; // 0=Sun..6=Sat
  attendanceRate: number; // 0-100, -1 if no data
  presentCount: number;
  absentCount: number;
  halfdayCount: number;
  totalRecords: number;
}

interface DailyRatePoint {
  day: number;
  rate: number;
}

interface TopAbsentStudent {
  name: string;
  roll: string;
  cls: string;
  percentage: number;
  present: number;
  absent: number;
  halfday: number;
  total: number;
}

interface CombinedReportData {
  classes: string[];
  month: number;
  year: number;
  totalStudents: number;
  totalRecords: number;
  present: number;
  absent: number;
  late: number;
  halfday: number;
  leave: number;
  overallRate: number;
  avgDailyRate: number;
  chronicAbsenteeCount: number;
  chronicAbsenteeRate: number;
  peakAbsenceDay: { date: string; rate: number } | null;
  bestAttendanceDay: { date: string; rate: number } | null;
  classStats: CombinedClassStat[];
  monthlyTrend: MonthlyTrendPoint[];
  dayOfWeek: DayOfWeekPoint[];
  heatmap: HeatmapDay[];
  dailyRates: DailyRatePoint[];
  topAbsent: TopAbsentStudent[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computePercentage(opts: { present: number; late: number; halfday: number; total: number }): number {
  if (opts.total === 0) return 0;
  // present=1, late=1, halfday=0.5, leave=0, absent=0
  const weighted = opts.present + opts.late + opts.halfday * 0.5;
  return Math.round((weighted / opts.total) * 100 * 10) / 10;
}

function heatColorRgb(rate: number): [number, number, number] {
  // Pastel heat scale — soft tints instead of saturated primaries so the
  // calendar doesn't drink ink when printed.
  if (rate >= 95) return [200, 230, 205]; // very light green
  if (rate >= 85) return [218, 235, 215]; // pale green
  if (rate >= 75) return [248, 240, 200]; // pale yellow
  if (rate >= 60) return [248, 220, 198]; // pale orange
  return [245, 205, 205];                  // pale red
}

function heatTextColor(rate: number): [number, number, number] {
  // Dark text on pastel cells (for contrast / legibility)
  if (rate >= 60 && rate < 85) return [70, 70, 70];
  return [50, 50, 50];
}

// ─── Data fetcher (combined across all selected classes) ─────────────────────

async function fetchCombinedReportData(
  classes: string[],
  month: number,
  year: number
): Promise<CombinedReportData> {
  // 1) Pull all students in the selected classes
  const { data: studentsData, error: sErr } = await supabase
    .from("students")
    .select("id, full_name, roll_number, class")
    .in("class", classes)
    .eq("is_active", true);
  if (sErr) throw sErr;
  const students: StudentRow[] = (studentsData ?? []) as StudentRow[];
  if (students.length === 0) {
    return {
      classes, month, year,
      totalStudents: 0, totalRecords: 0,
      present: 0, absent: 0, late: 0, halfday: 0, leave: 0,
      overallRate: 0, avgDailyRate: 0,
      chronicAbsenteeCount: 0, chronicAbsenteeRate: 0,
      peakAbsenceDay: null, bestAttendanceDay: null,
      classStats: [], monthlyTrend: [], dayOfWeek: [],
      heatmap: [], dailyRates: [], topAbsent: [],
    };
  }

  // 2) Pull all attendance for those students for the entire year (so we
  //    can compute both monthly trend AND the focused month's heatmap)
  const studentIds = students.map((s) => s.id);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const { data: attData, error: aErr } = await supabase
    .from("attendance")
    .select("student_id, status, date")
    .in("student_id", studentIds)
    .gte("date", yearStart)
    .lte("date", yearEnd);
  if (aErr) throw aErr;
  const records: RawAttendanceRow[] = (attData ?? []) as RawAttendanceRow[];

  // 3) Per-class stats
  const classStats: CombinedClassStat[] = classes.map((cls) => {
    const clsStudents = students.filter((s) => s.class === cls);
    const clsStudentIds = new Set(clsStudents.map((s) => s.id));
    const clsRecords = records.filter((r) => clsStudentIds.has(r.student_id));
    const present = clsRecords.filter((r) => r.status === "present").length;
    const absent = clsRecords.filter((r) => r.status === "absent").length;
    const late = clsRecords.filter((r) => r.status === "late").length;
    const halfday = clsRecords.filter((r) => r.status === "halfday").length;
    const leave = clsRecords.filter((r) => r.status === "leave").length;
    const total = clsRecords.length;
    return {
      cls,
      totalStudents: clsStudents.length,
      totalRecords: total,
      present, absent, late, halfday, leave,
      avgRate: computePercentage({ present, late, halfday, total }),
    };
  });

  // 4) Combined totals (focus = whole year for trend, month for heatmap)
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const late = records.filter((r) => r.status === "late").length;
  const halfday = records.filter((r) => r.status === "halfday").length;
  const leave = records.filter((r) => r.status === "leave").length;
  const totalRecords = records.length;
  const overallRate = computePercentage({ present, late, halfday, total: totalRecords });

  // 5) Monthly trend (combined across classes, all 12 months of year)
  const monthMap = new Map<number, { present: number; late: number; halfday: number; total: number }>();
  for (let m = 1; m <= 12; m++) monthMap.set(m, { present: 0, late: 0, halfday: 0, total: 0 });
  records.forEach((r) => {
    const m = new Date(r.date).getMonth() + 1;
    const entry = monthMap.get(m);
    if (!entry) return;
    entry.total++;
    if (r.status === "present") entry.present++;
    else if (r.status === "late") entry.late++;
    else if (r.status === "halfday") entry.halfday++;
  });
  const monthlyTrend: MonthlyTrendPoint[] = Array.from(monthMap.entries())
    .filter(([, v]) => v.total > 0)
    .map(([m, v]) => ({
      month: MONTH_NAMES_SHORT[m - 1],
      monthNum: m,
      totalRecords: v.total,
      percentage: computePercentage(v),
    }));

  // 6) Day-of-week pattern (combined, Mon–Fri only)
  const dowMap = new Map<number, { present: number; late: number; halfday: number; total: number }>();
  for (let d = 1; d <= 5; d++) dowMap.set(d, { present: 0, late: 0, halfday: 0, total: 0 });
  records.forEach((r) => {
    const jsDay = new Date(r.date).getDay(); // 0=Sun..6=Sat
    if (jsDay === 0 || jsDay === 6) return;
    const entry = dowMap.get(jsDay);
    if (!entry) return;
    entry.total++;
    if (r.status === "present") entry.present++;
    else if (r.status === "late") entry.late++;
    else if (r.status === "halfday") entry.halfday++;
  });
  const dayOfWeek: DayOfWeekPoint[] = Array.from(dowMap.entries())
    .filter(([, v]) => v.total > 0)
    .map(([dayIndex, v]) => ({
      day: DAY_NAMES_SHORT[dayIndex],
      avgAttendanceRate: v.total > 0 ? Math.round((v.present + v.late + v.halfday * 0.5) / v.total * 100) : 0,
      totalRecords: v.total,
    }));

  // 7) Heatmap for selected month (combined)
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-31`;
  const monthRecords = records.filter((r) => r.date >= monthStart && r.date <= monthEnd);
  const dateMap = new Map<string, { present: number; absent: number; halfday: number; late: number; total: number }>();
  monthRecords.forEach((r) => {
    if (!dateMap.has(r.date)) dateMap.set(r.date, { present: 0, absent: 0, halfday: 0, late: 0, total: 0 });
    const e = dateMap.get(r.date)!;
    e.total++;
    if (r.status === "present") e.present++;
    else if (r.status === "late") e.late++;
    else if (r.status === "absent") e.absent++;
    else if (r.status === "halfday") e.halfday++;
  });
  const daysInMonth = new Date(year, month, 0).getDate();
  const heatmap: HeatmapDay[] = [];
  const dailyRates: DailyRatePoint[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const e = dateMap.get(dateStr);
    const d = new Date(year, month - 1, day);
    if (e && e.total > 0) {
      const rate = computePercentage({ present: e.present, late: e.late, halfday: e.halfday, total: e.total });
      heatmap.push({
        day, weekday: d.getDay(), attendanceRate: rate,
        presentCount: e.present, absentCount: e.absent, halfdayCount: e.halfday,
        totalRecords: e.total,
      });
      dailyRates.push({ day, rate });
    } else {
      heatmap.push({
        day, weekday: d.getDay(), attendanceRate: -1,
        presentCount: 0, absentCount: 0, halfdayCount: 0, totalRecords: 0,
      });
    }
  }

  // 8) Average daily rate (mean of all day rates with data)
  const ratesWithData = heatmap.filter((h) => h.attendanceRate >= 0).map((h) => h.attendanceRate);
  const avgDailyRate = ratesWithData.length > 0
    ? Math.round(ratesWithData.reduce((a, b) => a + b, 0) / ratesWithData.length)
    : 0;

  // 9) Peak absence day & best day (lowest / highest rate)
  let peakAbsenceDay: { date: string; rate: number } | null = null;
  let bestAttendanceDay: { date: string; rate: number } | null = null;
  let lowestRate = 101;
  let highestRate = -1;
  dateMap.forEach((v, date) => {
    if (v.total === 0) return;
    const rate = computePercentage({ present: v.present, late: v.late, halfday: v.halfday, total: v.total });
    if (rate < lowestRate) { lowestRate = rate; peakAbsenceDay = { date, rate }; }
    if (rate > highestRate) { highestRate = rate; bestAttendanceDay = { date, rate }; }
  });

  // 10) Chronic absentees (across the whole year, <75%)
  const studentStatMap = new Map<string, { present: number; late: number; halfday: number; total: number }>();
  records.forEach((r) => {
    if (!studentStatMap.has(r.student_id)) studentStatMap.set(r.student_id, { present: 0, late: 0, halfday: 0, total: 0 });
    const e = studentStatMap.get(r.student_id)!;
    e.total++;
    if (r.status === "present") e.present++;
    else if (r.status === "late") e.late++;
    else if (r.status === "halfday") e.halfday++;
  });
  let chronicAbsenteeCount = 0;
  const topAbsent: TopAbsentStudent[] = students.map((s) => {
    const e = studentStatMap.get(s.id) ?? { present: 0, late: 0, halfday: 0, total: 0 };
    const absent = records.filter((r) => r.student_id === s.id && r.status === "absent").length;
    const pct = computePercentage({ present: e.present, late: e.late, halfday: e.halfday, total: e.total });
    if (pct < 75 && e.total > 0) chronicAbsenteeCount++;
    return {
      name: s.full_name,
      roll: s.roll_number,
      cls: s.class,
      percentage: pct,
      present: e.present + e.late,
      absent,
      halfday: e.halfday,
      total: e.total,
    };
  })
    .filter((s) => s.total > 0)
    .sort((a, b) => a.percentage - b.percentage)
    .slice(0, 10);

  const chronicAbsenteeRate = students.length > 0
    ? Math.round((chronicAbsenteeCount / students.length) * 100)
    : 0;

  return {
    classes, month, year,
    totalStudents: students.length, totalRecords,
    present, absent, late, halfday, leave,
    overallRate, avgDailyRate,
    chronicAbsenteeCount, chronicAbsenteeRate,
    peakAbsenceDay, bestAttendanceDay,
    classStats, monthlyTrend, dayOfWeek,
    heatmap, dailyRates, topAbsent,
  };
}

// ─── PDF drawing primitives ──────────────────────────────────────────────────

function drawDonut(
  doc: jsPDF,
  cx: number, cy: number,
  rOuter: number, rInner: number,
  segments: { value: number; color: [number, number, number] }[]
) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let startAngle = -90;
  const steps = 60;
  for (const seg of segments) {
    const sweep = (seg.value / total) * 360;
    if (sweep <= 0) continue;
    const segSteps = Math.max(2, Math.round((sweep / 360) * steps));
    doc.setFillColor(seg.color[0], seg.color[1], seg.color[2]);
    for (let i = 0; i < segSteps; i++) {
      const a0 = ((startAngle + (sweep * i) / segSteps) * Math.PI) / 180;
      const a1 = ((startAngle + (sweep * (i + 1)) / segSteps) * Math.PI) / 180;
      const x0o = cx + rOuter * Math.cos(a0), y0o = cy + rOuter * Math.sin(a0);
      const x1o = cx + rOuter * Math.cos(a1), y1o = cy + rOuter * Math.sin(a1);
      const x1i = cx + rInner * Math.cos(a1), y1i = cy + rInner * Math.sin(a1);
      const x0i = cx + rInner * Math.cos(a0), y0i = cy + rInner * Math.sin(a0);
      doc.triangle(x0o, y0o, x1o, y1o, x1i, y1i, "F");
      doc.triangle(x0o, y0o, x1i, y1i, x0i, y0i, "F");
    }
    startAngle += sweep;
  }
}

function drawBarChart(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  bars: { label: string; value: number; color: [number, number, number] }[],
  opts: { yMax?: number; yMin?: number; reference?: number; valueSuffix?: string } = {}
) {
  const yMax = opts.yMax ?? 100;
  const yMin = opts.yMin ?? 0;
  const padLeft = 8;
  const padBottom = 12;
  const padTop = 4;
  const chartX = x + padLeft;
  const chartY = y + padTop;
  const chartW = w - padLeft - 2;
  const chartH = h - padTop - padBottom;
  const baseY = chartY + chartH;

  // Gridlines & y-axis labels
  doc.setDrawColor(235, 235, 235);
  doc.setLineWidth(0.15);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const v = yMin + ((yMax - yMin) * i) / gridSteps;
    const gy = baseY - ((v - yMin) / (yMax - yMin)) * chartH;
    doc.line(chartX, gy, chartX + chartW, gy);
    doc.text(`${Math.round(v)}${opts.valueSuffix ?? ""}`, chartX - 1.2, gy + 1, { align: "right" });
  }

  // Reference line (e.g. 75% minimum)
  if (opts.reference !== undefined) {
    const ry = baseY - ((opts.reference - yMin) / (yMax - yMin)) * chartH;
    doc.setDrawColor(PDF.fail[0], PDF.fail[1], PDF.fail[2]);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1.2, 0.8], 0);
    doc.line(chartX, ry, chartX + chartW, ry);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(4.5);
    doc.setTextColor(PDF.fail[0], PDF.fail[1], PDF.fail[2]);
    doc.text(`Min ${opts.reference}${opts.valueSuffix ?? ""}`, chartX + chartW - 1, ry - 0.5, { align: "right" });
  }

  // Bars
  const n = bars.length || 1;
  const gap = 3;
  const barW = (chartW - gap * (n - 1)) / n;
  bars.forEach((b, i) => {
    const bx = chartX + i * (barW + gap);
    const v = Math.max(yMin, Math.min(yMax, b.value));
    const bh = ((v - yMin) / (yMax - yMin)) * chartH;
    if (bh > 0.3) {
      doc.setFillColor(b.color[0], b.color[1], b.color[2]);
      doc.roundedRect(bx, baseY - bh, barW, bh, 0.8, 0.8, "F");
    }
    // Value label on top
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    doc.text(`${b.value}${opts.valueSuffix ?? ""}`, bx + barW / 2, baseY - bh - 1.2, { align: "center" });
    // X label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.2);
    doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
    doc.text(b.label, bx + barW / 2, baseY + 4, { align: "center" });
  });

  // Axes
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.25);
  doc.line(chartX, baseY, chartX + chartW, baseY);
  doc.line(chartX, chartY, chartX, baseY);
}

function drawAreaLineChart(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  points: { label: string; value: number }[],
  color: [number, number, number],
  opts: { yMax?: number; reference?: number; valueSuffix?: string } = {}
) {
  const yMax = opts.yMax ?? 100;
  const padLeft = 8;
  const padBottom = 12;
  const padTop = 4;
  const chartX = x + padLeft;
  const chartY = y + padTop;
  const chartW = w - padLeft - 2;
  const chartH = h - padTop - padBottom;
  const baseY = chartY + chartH;

  // Gridlines
  doc.setDrawColor(235, 235, 235);
  doc.setLineWidth(0.15);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const v = (yMax * i) / gridSteps;
    const gy = baseY - (v / yMax) * chartH;
    doc.line(chartX, gy, chartX + chartW, gy);
    doc.text(`${Math.round(v)}${opts.valueSuffix ?? ""}`, chartX - 1.2, gy + 1, { align: "right" });
  }

  // Reference line
  if (opts.reference !== undefined) {
    const ry = baseY - (opts.reference / yMax) * chartH;
    doc.setDrawColor(PDF.fail[0], PDF.fail[1], PDF.fail[2]);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1.2, 0.8], 0);
    doc.line(chartX, ry, chartX + chartW, ry);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(4.5);
    doc.setTextColor(PDF.fail[0], PDF.fail[1], PDF.fail[2]);
    doc.text(`Min ${opts.reference}${opts.valueSuffix ?? ""}`, chartX + chartW - 1, ry - 0.5, { align: "right" });
  }

  if (points.length === 0) return;

  // Compute point coordinates
  const n = points.length;
  const stepX = n > 1 ? chartW / (n - 1) : 0;
  const pts = points.map((p, i) => ({
    x: chartX + (n > 1 ? i * stepX : chartW / 2),
    y: baseY - (Math.max(0, Math.min(yMax, p.value)) / yMax) * chartH,
    value: p.value, label: p.label,
  }));

  // Area fill (semi-transparent via GState)
  try {
    (doc as any).setGState?.(new (doc as any).GState({ opacity: 0.18 }));
  } catch { /* noop */ }
  doc.setFillColor(color[0], color[1], color[2]);
  if (pts.length >= 2) {
    const path: any[] = [];
    // Start at first point on baseline
    doc.lines([[pts[0].x - chartX, 0]], chartX, baseY, [1, 1], "F", false);
    // Build polygon: bottom-left -> all points left-to-right -> bottom-right
    const polyPts: [number, number][] = [
      [pts[0].x, baseY],
      ...pts.map((p) => [p.x, p.y] as [number, number]),
      [pts[pts.length - 1].x, baseY],
    ];
    for (let i = 1; i < polyPts.length; i++) {
      const dx = polyPts[i][0] - polyPts[i - 1][0];
      const dy = polyPts[i][1] - polyPts[i - 1][1];
      path.push([dx, dy]);
    }
    doc.lines(path, polyPts[0][0], polyPts[0][1], [1, 1], "F", true);
  }
  try {
    (doc as any).setGState?.(new (doc as any).GState({ opacity: 1 }));
  } catch { /* noop */ }

  // Line on top
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.7);
  for (let i = 1; i < pts.length; i++) {
    doc.line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
  }

  // Dots
  doc.setFillColor(color[0], color[1], color[2]);
  pts.forEach((p) => doc.circle(p.x, p.y, 0.8, "F"));

  // X labels (every label if ≤12, else every other)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
  const labelEvery = pts.length > 12 ? 2 : 1;
  pts.forEach((p, i) => {
    if (i % labelEvery === 0 || i === pts.length - 1) {
      doc.text(p.label, p.x, baseY + 4, { align: "center" });
    }
  });

  // Axes
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.25);
  doc.line(chartX, baseY, chartX + chartW, baseY);
  doc.line(chartX, chartY, chartX, baseY);
}

function drawHeatmap(
  doc: jsPDF,
  x: number, y: number, w: number,
  heatmap: HeatmapDay[],
  year: number, month: number,
  opts: { cellH?: number } = {}
) {
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  const gap = 0.8;
  const cellW = (w - 6 * gap) / 7;
  const cellH = opts.cellH ?? cellW * 0.85;

  // Day labels row
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  dayLabels.forEach((d, i) => {
    doc.text(d, x + i * (cellW + gap) + cellW / 2, y + 2.5, { align: "center" });
  });

  // Legend
  const legendY = y + 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.8);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  doc.text("Low", x, legendY + 1.8);
  const legX = x + 6;
  const legCellW = 3.5;
  const legendColors = [
    [245, 205, 205], [248, 220, 198], [248, 240, 200], [218, 235, 215], [200, 230, 205],
  ];
  legendColors.forEach((c, i) => {
    doc.setFillColor(c[0], c[1], c[2]);
    doc.roundedRect(legX + i * legCellW, legendY, legCellW - 0.3, 2, 0.3, 0.3, "F");
  });
  doc.text("High", legX + 5 * legCellW + 0.5, legendY + 1.8);
  doc.text("(95%+ · 85-94% · 75-84% · 60-74% · <60%)", legX + 5 * legCellW + 6, legendY + 1.8);

  // Build 7-col grid
  const gridTop = legendY + 4;
  const dayMap = new Map<number, HeatmapDay>();
  heatmap.forEach((d) => dayMap.set(d.day, d));

  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) currentWeek.push(null);
  for (let day = 1; day <= new Date(year, month, 0).getDate(); day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
  }
  while (currentWeek.length > 0 && currentWeek.length < 7) currentWeek.push(null);
  if (currentWeek.length > 0) weeks.push(currentWeek);

  weeks.forEach((week, wi) => {
    week.forEach((day, di) => {
      const cx = x + di * (cellW + gap);
      const cy = gridTop + wi * (cellH + gap);
      if (day === null) return;
      const data = dayMap.get(day);
      const isWeekend = di === 0 || di === 6;
      if (isWeekend) {
        doc.setFillColor(244, 245, 247);
        doc.roundedRect(cx, cy, cellW, cellH, 0.8, 0.8, "F");
        doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.5);
        doc.text(String(day), cx + cellW / 2, cy + cellH / 2, { align: "center", baseline: "middle" });
        return;
      }
      if (!data || data.attendanceRate < 0) {
        doc.setFillColor(251, 252, 253);
        doc.setDrawColor(228, 230, 234);
        doc.setLineWidth(0.12);
        doc.roundedRect(cx, cy, cellW, cellH, 0.8, 0.8, "FD");
        doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.5);
        doc.text(String(day), cx + cellW / 2, cy + cellH / 2, { align: "center", baseline: "middle" });
        return;
      }
      const c = heatColorRgb(data.attendanceRate);
      doc.setFillColor(c[0], c[1], c[2]);
      doc.roundedRect(cx, cy, cellW, cellH, 0.8, 0.8, "F");
      const tc = heatTextColor(data.attendanceRate);
      doc.setTextColor(tc[0], tc[1], tc[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.text(String(day), cx + cellW / 2, cy + cellH / 2 - 1, { align: "center", baseline: "middle" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      doc.text(`${data.attendanceRate}%`, cx + cellW / 2, cy + cellH / 2 + 2, { align: "center", baseline: "middle" });
    });
  });

  return gridTop + weeks.length * (cellH + gap);
}

// ─── Section header helper (compact, no heavy fill) ──────────────────────────

function sectionHeader(doc: jsPDF, text: string, x: number, y: number, w: number) {
  // Thin underline + bold label — no filled navy bar (saves ink, looks cleaner)
  doc.setDrawColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.setLineWidth(0.4);
  doc.line(x, y + 5.5, x + w, y + 5.5);
  doc.setTextColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(text.toUpperCase(), x, y + 4);
}

function footer(doc: jsPDF, pageNum: number, totalPages: number) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.2);
  doc.line(12, h - 8, w - 12, h - 8);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text("GHS Babi Khel — Attendance Analytics Report", 12, h - 4.5);
  doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`, w / 2, h - 4.5, { align: "center" });
  doc.text(`Page ${pageNum} / ${totalPages}`, w - 12, h - 4.5, { align: "right" });
}

// ─── Main PDF generator — compact 2-page Letter-size report ──────────────────

function generateAttendanceReportPdf(data: CombinedReportData) {
  // Letter size: 215.9 x 279.4 mm
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const margin = 11;
  const innerW = w - margin * 2;
  const totalPages = 2;

  // ═══════════════ PAGE 1 — Header + KPIs + Comparison/Donut + Trend + DoW ═══
  // Thin outer frame (no heavy filled borders)
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.4);
  doc.rect(6, 6, w - 12, h - 12);

  // Gold accent rule
  doc.setDrawColor(PDF.gold[0], PDF.gold[1], PDF.gold[2]);
  doc.setLineWidth(0.8);
  doc.line(margin, 12, w - margin, 12);

  // School name
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("GOVERNMENT HIGH SCHOOL BABI KHEL", w / 2, 18, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
  doc.text("District Mohmand, Khyber Pakhtunkhwa  |  Established 2018", w / 2, 22.5, { align: "center" });

  // Title (text-based, no filled pill)
  doc.setTextColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("ATTENDANCE ANALYTICS REPORT", w / 2, 28, { align: "center" });

  // Period & classes line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
  const periodLine = `${MONTH_NAMES_FULL[data.month - 1]} ${data.year}  ·  Combined View  ·  ${data.totalStudents} Students  ·  ${data.totalRecords} Records`;
  doc.text(periodLine, w / 2, 32.5, { align: "center" });

  // Selected classes line
  const chipsText = data.classes.length === ALL_CLASSES.length
    ? "All Classes (6 – 10)"
    : data.classes.map((c) => `Class ${c}`).join("  ·  ");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.setTextColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.text(`Selected: ${chipsText}`, w / 2, 36, { align: "center" });

  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.2);
  doc.line(margin, 38.5, w - margin, 38.5);

  let y = 41;

  // ── KPI Cards Row (compact) ───────────────────────────────────────────────
  const cardW = (innerW - 3 * 2.5) / 4;
  const cardH = 14;
  const kpis = [
    { label: "Overall Rate", value: `${data.overallRate}%`, color: PDF.navy, sub: "Year-to-date" },
    { label: "Avg Daily Rate", value: `${data.avgDailyRate}%`, color: PDF.primary, sub: MONTH_NAMES_FULL[data.month - 1] },
    { label: "Chronic Absentees", value: `${data.chronicAbsenteeCount}`, color: data.chronicAbsenteeCount === 0 ? PDF.pass : PDF.fail, sub: `${data.chronicAbsenteeRate}% of students` },
    { label: "Total Students", value: `${data.totalStudents}`, color: PDF.gold, sub: `${data.classes.length} class${data.classes.length !== 1 ? "es" : ""}` },
  ];
  kpis.forEach((k, i) => {
    const cx = margin + i * (cardW + 2.5);
    doc.setFillColor(PDF.panel[0], PDF.panel[1], PDF.panel[2]);
    doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
    doc.setLineWidth(0.15);
    doc.roundedRect(cx, y, cardW, cardH, 1, 1, "FD");
    // Accent stripe (thin, not heavy)
    doc.setFillColor(k.color[0], k.color[1], k.color[2]);
    doc.rect(cx, y, 1.2, cardH, "F");
    doc.setTextColor(k.color[0], k.color[1], k.color[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(k.value, cx + cardW / 2, y + 7.5, { align: "center" });
    doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.6);
    doc.text(k.label.toUpperCase(), cx + cardW / 2, y + 11, { align: "center" });
    doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
    doc.setFontSize(5.2);
    doc.text(k.sub, cx + cardW / 2, y + 12.8, { align: "center" });
  });
  y += cardH + 4;

  // ── Row: Class Comparison (left) + Status Donut (right) ───────────────────
  const row1Top = y;
  const colW = (innerW - 4) / 2;

  sectionHeader(doc, "Class-Wise Comparison", margin, row1Top, colW);
  const compBars = data.classStats.map((c) => ({
    label: `C${c.cls}`,
    value: c.avgRate,
    color: CLASS_COLORS[c.cls] ?? PDF.primary,
  }));
  drawBarChart(doc, margin, row1Top + 6, colW, 38, compBars, { yMax: 100, reference: 75, valueSuffix: "%" });

  // Right: Status donut
  const rightX = margin + colW + 4;
  sectionHeader(doc, "Status Distribution", rightX, row1Top, colW);
  const donutCx = rightX + colW * 0.3;
  const donutCy = row1Top + 24;
  const donutSegs = [
    { value: data.present,  color: STATUS_COLORS.present },
    { value: data.late,     color: STATUS_COLORS.late },
    { value: data.halfday,  color: STATUS_COLORS.halfday },
    { value: data.leave,    color: STATUS_COLORS.leave },
    { value: data.absent,   color: STATUS_COLORS.absent },
  ].filter((s) => s.value > 0);
  drawDonut(doc, donutCx, donutCy, 12, 6.5, donutSegs);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`${data.overallRate}%`, donutCx, donutCy + 1.2, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.5);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  doc.text("OVERALL", donutCx, donutCy + 4, { align: "center" });

  // Donut legend — compact 2-column
  const legendX = donutCx + 18;
  let legendY = donutCy - 10;
  const statusRows: { name: string; value: number; color: [number, number, number] }[] = [
    { name: "Present", value: data.present, color: STATUS_COLORS.present },
    { name: "Late",    value: data.late,    color: STATUS_COLORS.late },
    { name: "Halfday", value: data.halfday, color: STATUS_COLORS.halfday },
    { name: "Leave",   value: data.leave,   color: STATUS_COLORS.leave },
    { name: "Absent",  value: data.absent,  color: STATUS_COLORS.absent },
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  statusRows.forEach((r, i) => {
    const ly = legendY + i * 4.5;
    doc.setFillColor(r.color[0], r.color[1], r.color[2]);
    doc.rect(legendX, ly, 2.5, 2.5, "F");
    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    const pct = data.totalRecords > 0 ? Math.round((r.value / data.totalRecords) * 100) : 0;
    doc.text(`${r.name}: ${r.value} (${pct}%)`, legendX + 3.5, ly + 2);
  });

  y = row1Top + 46;
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.15);
  doc.line(margin, y, w - margin, y);
  y += 3;

  // ── Monthly Trend (full width, compact) ───────────────────────────────────
  sectionHeader(doc, `Monthly Attendance Trend — ${data.year}`, margin, y, innerW);
  y += 6;
  const trendPoints = data.monthlyTrend.map((m) => ({ label: m.month, value: m.percentage }));
  if (trendPoints.length > 0) {
    drawAreaLineChart(doc, margin, y, innerW, 48, trendPoints, PDF.primary, { yMax: 100, reference: 75, valueSuffix: "%" });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
    doc.text("No trend data available for this year.", margin + 4, y + 22);
  }
  y += 53;
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.15);
  doc.line(margin, y, w - margin, y);
  y += 3;

  // ── Row: Day-of-Week (left) + Class Summary table (right) ─────────────────
  const row2Top = y;
  const dowColW = (innerW - 4) * 0.6;
  sectionHeader(doc, "Day-of-Week Pattern", margin, row2Top, dowColW);
  const dowBars = data.dayOfWeek.map((d) => ({
    label: d.day,
    value: d.avgAttendanceRate,
    color: d.avgAttendanceRate >= 90 ? PDF.pass : d.avgAttendanceRate >= 80 ? PDF.primary : PDF.fail,
  }));
  if (dowBars.length > 0) {
    drawBarChart(doc, margin, row2Top + 6, dowColW, 42, dowBars, { yMax: 100, reference: 75, valueSuffix: "%" });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
    doc.text("No day-of-week data available.", margin + 4, row2Top + 22);
  }

  // Right: per-class summary table (compact)
  const tblX = margin + dowColW + 4;
  const tblW = innerW - dowColW - 4;
  sectionHeader(doc, "Class Summary", tblX, row2Top, tblW);
  const tHeaderY = row2Top + 6.5;
  doc.setFillColor(PDF.panel2[0], PDF.panel2[1], PDF.panel2[2]);
  doc.rect(tblX, tHeaderY, tblW, 5, "F");
  doc.setTextColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.text("Class", tblX + 2, tHeaderY + 3.4);
  doc.text("Sts", tblX + 18, tHeaderY + 3.4, { align: "right" });
  doc.text("Rec", tblX + 28, tHeaderY + 3.4, { align: "right" });
  doc.text("Rate", tblX + tblW - 2, tHeaderY + 3.4, { align: "right" });

  let trY = tHeaderY + 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  data.classStats.forEach((c, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(PDF.panel[0], PDF.panel[1], PDF.panel[2]);
      doc.rect(tblX, trY, tblW, 5.5, "F");
    }
    const col = CLASS_COLORS[c.cls] ?? PDF.primary;
    doc.setFillColor(col[0], col[1], col[2]);
    doc.rect(tblX + 1, trY + 1.2, 1.5, 3, "F");
    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    doc.text(`Class ${c.cls}`, tblX + 4, trY + 3.5);
    doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
    doc.text(String(c.totalStudents), tblX + 18, trY + 3.5, { align: "right" });
    doc.text(String(c.totalRecords), tblX + 28, trY + 3.5, { align: "right" });
    const rateColor = c.avgRate >= 85 ? PDF.pass : c.avgRate >= 75 ? PDF.warn : PDF.fail;
    doc.setTextColor(rateColor[0], rateColor[1], rateColor[2]);
    doc.setFont("helvetica", "bold");
    doc.text(`${c.avgRate}%`, tblX + tblW - 2, trY + 3.5, { align: "right" });
    doc.setFont("helvetica", "normal");
    trY += 5.5;
  });
  // Combined total row
  doc.setFillColor(PDF.panel2[0], PDF.panel2[1], PDF.panel2[2]);
  doc.rect(tblX, trY, tblW, 5.5, "F");
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.2);
  doc.line(tblX, trY, tblX + tblW, trY);
  doc.setTextColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.setFont("helvetica", "bold");
  doc.text("Combined", tblX + 4, trY + 3.5);
  doc.text(String(data.totalStudents), tblX + 18, trY + 3.5, { align: "right" });
  doc.text(String(data.totalRecords), tblX + 28, trY + 3.5, { align: "right" });
  doc.text(`${data.overallRate}%`, tblX + tblW - 2, trY + 3.5, { align: "right" });

  // Highlights strip — bottom of page 1 (text only, no fills)
  y = Math.max(row2Top + 50, trY + 9);
  sectionHeader(doc, "Highlights & Insights", margin, y, innerW);
  y += 6;
  const insights = [
    { label: "Peak Absence Day", value: data.peakAbsenceDay ? `${data.peakAbsenceDay.date} (${data.peakAbsenceDay.rate}%)` : "No data", color: PDF.fail },
    { label: "Best Attendance Day", value: data.bestAttendanceDay ? `${data.bestAttendanceDay.date} (${data.bestAttendanceDay.rate}%)` : "No data", color: PDF.pass },
    { label: "Chronic Absentee Rate", value: `${data.chronicAbsenteeRate}% (${data.chronicAbsenteeCount} students)`, color: data.chronicAbsenteeRate > 15 ? PDF.fail : data.chronicAbsenteeRate > 5 ? PDF.warn : PDF.pass },
    { label: "Records Analyzed", value: `${data.totalRecords} (${data.totalStudents} students)`, color: PDF.navy },
  ];
  const insCardW = (innerW - 3 * 2.5) / 4;
  insights.forEach((ins, i) => {
    const cx = margin + i * (insCardW + 2.5);
    doc.setFillColor(PDF.panel[0], PDF.panel[1], PDF.panel[2]);
    doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
    doc.setLineWidth(0.15);
    doc.roundedRect(cx, y, insCardW, 12, 1, 1, "FD");
    // Small colored dot instead of filled circle (saves ink)
    doc.setFillColor(ins.color[0], ins.color[1], ins.color[2]);
    doc.circle(cx + 3, y + 4, 1.3, "F");
    doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.text(ins.label.toUpperCase(), cx + 5.5, y + 4.8);
    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const valLines = doc.splitTextToSize(ins.value, insCardW - 4) as string[];
    valLines.forEach((ln, li) => doc.text(ln, cx + 3, y + 8.5 + li * 3));
  });

  footer(doc, 1, totalPages);

  // ═══════════════ PAGE 2 — Heatmap + Daily Rate + Top Absent + Recs ═════════
  doc.addPage();
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.4);
  doc.rect(6, 6, w - 12, h - 12);
  doc.setDrawColor(PDF.gold[0], PDF.gold[1], PDF.gold[2]);
  doc.setLineWidth(0.8);
  doc.line(margin, 12, w - margin, 12);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Daily Detail & Recommendations — ${MONTH_NAMES_FULL[data.month - 1]} ${data.year}`, margin, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
  doc.text(`Combined across: ${data.classes.map((c) => "Class " + c).join(", ")}`, margin, 22);
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.2);
  doc.line(margin, 24.5, w - margin, 24.5);

  y = 27;

  // ── Heatmap calendar (left) + Daily rate line (right) ─────────────────────
  const row3Top = y;
  const heatColW = (innerW - 4) * 0.55;
  sectionHeader(doc, `Heat Map — ${MONTH_NAMES_FULL[data.month - 1]} ${data.year}`, margin, row3Top, heatColW);
  const heatEndY = drawHeatmap(doc, margin, row3Top + 6, heatColW, data.heatmap, data.year, data.month, { cellH: 8 });

  // Right: daily rate trend
  const dailyX = margin + heatColW + 4;
  const dailyW = innerW - heatColW - 4;
  sectionHeader(doc, "Daily Rate Trend", dailyX, row3Top, dailyW);
  const dailyPts = data.dailyRates.map((d) => ({ label: String(d.day), value: d.rate }));
  if (dailyPts.length > 0) {
    drawAreaLineChart(doc, dailyX, row3Top + 6, dailyW, 48, dailyPts, PDF.teal, { yMax: 100, reference: 75, valueSuffix: "%" });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
    doc.text("No daily rate data available.", dailyX + 4, row3Top + 26);
  }

  y = Math.max(heatEndY, row3Top + 56) + 4;
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.15);
  doc.line(margin, y, w - margin, y);
  y += 3;

  // ── Top absent students table (full width, compact) ──────────────────────
  sectionHeader(doc, "Top Students Requiring Attention (Lowest Attendance)", margin, y, innerW);
  y += 6;

  // Table header
  doc.setFillColor(PDF.panel2[0], PDF.panel2[1], PDF.panel2[2]);
  doc.rect(margin, y, innerW, 5.5, "F");
  doc.setTextColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.text("#", margin + 3, y + 3.6);
  doc.text("Class", margin + 10, y + 3.6);
  doc.text("Roll", margin + 22, y + 3.6);
  doc.text("Name", margin + 36, y + 3.6);
  doc.text("Present", margin + 95, y + 3.6, { align: "right" });
  doc.text("Absent", margin + 112, y + 3.6, { align: "right" });
  doc.text("Total", margin + 130, y + 3.6, { align: "right" });
  doc.text("Rate", margin + innerW - 2, y + 3.6, { align: "right" });
  y += 5.5;

  if (data.topAbsent.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(PDF.pass[0], PDF.pass[1], PDF.pass[2]);
    doc.text("All students have healthy attendance — no warnings to report.", margin + 4, y + 8);
    y += 14;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    data.topAbsent.slice(0, 8).forEach((s, i) => {
      const rowH = 6;
      if (i % 2 === 0) {
        doc.setFillColor(PDF.panel[0], PDF.panel[1], PDF.panel[2]);
        doc.rect(margin, y, innerW, rowH, "F");
      }
      // Rank number (no filled circle — text only, saves ink)
      doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.text(String(i + 1), margin + 3, y + 3.6);

      // Class chip (compact)
      const cCol = CLASS_COLORS[s.cls] ?? PDF.primary;
      doc.setFillColor(cCol[0], cCol[1], cCol[2]);
      doc.roundedRect(margin + 10, y + 1.5, 7, 3, 0.6, 0.6, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.2);
      doc.text(`C${s.cls}`, margin + 13.5, y + 3.3, { align: "center" });

      doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(s.roll, margin + 22, y + 3.6);

      doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
      doc.setFont("helvetica", "bold");
      const nameShort = s.name.length > 26 ? s.name.slice(0, 25) + "…" : s.name;
      doc.text(nameShort, margin + 36, y + 3.6);

      doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
      doc.setFont("helvetica", "normal");
      doc.text(String(s.present), margin + 95, y + 3.6, { align: "right" });
      doc.text(String(s.absent), margin + 112, y + 3.6, { align: "right" });
      doc.text(String(s.total), margin + 130, y + 3.6, { align: "right" });

      const rateColor = s.percentage < 50 ? PDF.fail : s.percentage < 75 ? PDF.warn : s.percentage < 85 ? PDF.sky : PDF.pass;
      doc.setTextColor(rateColor[0], rateColor[1], rateColor[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.text(`${s.percentage}%`, margin + innerW - 2, y + 3.6, { align: "right" });
      y += rowH;
    });
  }

  y += 4;
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.15);
  doc.line(margin, y, w - margin, y);
  y += 3;

  // ── Recommendations ───────────────────────────────────────────────────────
  sectionHeader(doc, "Recommendations & Action Items", margin, y, innerW);
  y += 6;

  const recs: { tone: [number, number, number]; text: string }[] = [];
  if (data.chronicAbsenteeRate > 15) {
    recs.push({ tone: PDF.fail, text: `High chronic absentee rate (${data.chronicAbsenteeRate}%). Initiate parent contact for the ${data.chronicAbsenteeCount} students below 75%.` });
  } else if (data.chronicAbsenteeRate > 5) {
    recs.push({ tone: PDF.warn, text: `Moderate chronic absentee rate (${data.chronicAbsenteeRate}%). Schedule counselling sessions for at-risk students.` });
  } else {
    recs.push({ tone: PDF.pass, text: `Healthy absentee rate (${data.chronicAbsenteeRate}%). Continue current engagement strategy.` });
  }
  if (data.peakAbsenceDay) {
    recs.push({ tone: PDF.orange, text: `Peak absence on ${data.peakAbsenceDay.date} (${data.peakAbsenceDay.rate}%). Investigate root cause — weather, event, or assessment day.` });
  }
  const weakestClass = data.classStats.slice().sort((a, b) => a.avgRate - b.avgRate)[0];
  if (weakestClass && weakestClass.avgRate < 75) {
    recs.push({ tone: PDF.fail, text: `Class ${weakestClass.cls} has the lowest attendance (${weakestClass.avgRate}%). Targeted intervention recommended.` });
  }
  const strongestClass = data.classStats.slice().sort((a, b) => b.avgRate - a.avgRate)[0];
  if (strongestClass && strongestClass.avgRate >= 85) {
    recs.push({ tone: PDF.pass, text: `Class ${strongestClass.cls} is performing well (${strongestClass.avgRate}%). Recognize and share best practices.` });
  }
  if (data.dayOfWeek.length > 0) {
    const worst = data.dayOfWeek.slice().sort((a, b) => a.avgAttendanceRate - b.avgAttendanceRate)[0];
    const best = data.dayOfWeek.slice().sort((a, b) => b.avgAttendanceRate - a.avgAttendanceRate)[0];
    if (worst && best) {
      recs.push({ tone: PDF.primary, text: `${worst.day} has the lowest attendance (${worst.avgAttendanceRate}%) while ${best.day} is highest (${best.avgAttendanceRate}%). Review timetable & co-curricular load on ${worst.day}.` });
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const maxTextW = innerW - 8;
  let recY = y;
  recs.slice(0, 5).forEach((r, i) => {
    // Bullet dot (small, not filled circle)
    doc.setFillColor(r.tone[0], r.tone[1], r.tone[2]);
    doc.circle(margin + 2, recY + 2, 1, "F");
    doc.setTextColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(String(i + 1) + ".", margin + 5, recY + 2.6);
    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    const lines = doc.splitTextToSize(r.text, maxTextW) as string[];
    lines.forEach((ln, li) => {
      doc.text(ln, margin + 9, recY + 2.6 + li * 3.2);
    });
    recY += Math.max(lines.length * 3.2, 5) + 1.5;
  });

  footer(doc, 2, totalPages);

  // ── Save ──────────────────────────────────────────────────────────────────
  const classesLabel = data.classes.length === ALL_CLASSES.length ? "AllClasses" : data.classes.join("-");
  const fileName = `AttendanceReport_${MONTH_NAMES_SHORT[data.month - 1]}${data.year}_Class${classesLabel}.pdf`;
  doc.save(fileName);
}
// ─── React component ─────────────────────────────────────────────────────────

interface AttendanceAnalyticsReportButtonProps {
  /** Currently-selected month in the Analytics tab (1-12). */
  month: number;
  /** Currently-selected year in the Analytics tab. */
  year: number;
}

export default function AttendanceAnalyticsReportButton({
  month,
  year,
}: AttendanceAnalyticsReportButtonProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string>("");

  const handleExport = async () => {
    if (selectedClasses.length === 0) return;
    setIsExporting(true);
    setProgressMsg("Fetching attendance data...");
    try {
      // Preserve the order 6 → 10 regardless of how the user toggled them
      const ordered = ALL_CLASSES.filter((c) => selectedClasses.includes(c));
      setProgressMsg("Building charts & generating PDF...");
      // Yield to the browser so the spinner can paint before the (sync, heavy)
      // jsPDF drawing work blocks the main thread for ~1 second.
      await new Promise((r) => setTimeout(r, 50));
      const data = await fetchCombinedReportData(ordered, month, year);
      if (data.totalStudents === 0) {
        setProgressMsg("No students found in selected classes.");
        await new Promise((r) => setTimeout(r, 1200));
        return;
      }
      setProgressMsg("Rendering PDF...");
      await new Promise((r) => setTimeout(r, 30));
      generateAttendanceReportPdf(data);
      setShowPicker(false);
    } catch (err) {
      console.error("[AttendanceAnalyticsReport]", err);
      setProgressMsg("Failed to generate report. Check console for details.");
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      setIsExporting(false);
      setProgressMsg("");
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => { setSelectedClasses([]); setShowPicker(true); }}
        className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm"
        size="sm"
      >
        <FileDown className="w-4 h-4" />
        Report
      </Button>

      <Dialog open={showPicker} onOpenChange={(open) => { if (!isExporting) setShowPicker(open); }}>
        <DialogContent className="max-w-sm w-[92vw] sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileDown className="w-4 h-4 text-primary" />
              Attendance Report — {MONTH_NAMES_FULL[month - 1]} {year}
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground -mt-2">
            Pick one or more classes. The PDF combines data from{" "}
            <strong>all</strong> selected classes into a single report —
            it does <strong>not</strong> generate separate reports per class.
          </p>

          <div>
            <label className="text-xs font-semibold text-foreground">Classes</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-1.5">
              {ALL_CLASSES.map((c) => {
                const checked = selectedClasses.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={isExporting}
                    onClick={() =>
                      setSelectedClasses((prev) =>
                        checked ? prev.filter((x) => x !== c) : [...prev, c]
                      )
                    }
                    className={`rounded-xl border px-2 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                      checked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-background border-input text-foreground hover:bg-accent"
                    }`}
                  >
                    Class {c}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                disabled={isExporting}
                className="text-xs text-primary font-medium disabled:opacity-50"
                onClick={() => setSelectedClasses([...ALL_CLASSES])}
              >
                Select All
              </button>
              <button
                type="button"
                disabled={isExporting}
                className="text-xs text-muted-foreground font-medium disabled:opacity-50"
                onClick={() => setSelectedClasses([])}
              >
                Clear
              </button>
            </div>
          </div>

          <Button
            disabled={selectedClasses.length === 0 || isExporting}
            onClick={handleExport}
            className="w-full justify-center gap-2 mt-1"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {progressMsg || "Generating..."}
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4" />
                Download{" "}
                {selectedClasses.length > 1
                  ? `(${selectedClasses.length} classes — combined)`
                  : selectedClasses.length === 1
                  ? `(Class ${selectedClasses[0]})`
                  : ""}
              </>
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
