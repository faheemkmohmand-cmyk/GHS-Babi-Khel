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

// ─── PDF color palette (matches existing school PDF theme) ───────────────────

const PDF = {
  ink:    [26, 26, 26]    as [number, number, number],
  sub:    [90, 90, 90]    as [number, number, number],
  muted:  [120, 120, 120] as [number, number, number],
  rule:   [180, 180, 180] as [number, number, number],
  white:  [255, 255, 255] as [number, number, number],
  gold:   [180, 140, 40]  as [number, number, number],
  pass:   [15, 129, 74]   as [number, number, number],
  fail:   [178, 34, 34]   as [number, number, number],
  warn:   [234, 179, 8]   as [number, number, number],
  panel:  [247, 247, 249] as [number, number, number],
  navy:   [24, 42, 74]    as [number, number, number],
  primary:[99, 102, 241]  as [number, number, number],
  purple: [139, 92, 246]  as [number, number, number],
  orange: [249, 115, 22]  as [number, number, number],
  teal:   [20, 184, 166]  as [number, number, number],
  rose:   [244, 63, 94]   as [number, number, number],
  sky:    [14, 165, 233]  as [number, number, number],
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
  if (rate >= 95) return [34, 197, 94];      // green-500
  if (rate >= 85) return [74, 222, 128];     // green-400
  if (rate >= 75) return [250, 204, 21];     // yellow-400
  if (rate >= 60) return [251, 146, 60];     // orange-400
  return [239, 68, 68];                       // red-500
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
  year: number, month: number
) {
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  const cellW = (w - 6 * 1.2) / 7;
  const cellH = cellW * 0.95;

  // Day labels row
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  dayLabels.forEach((d, i) => {
    doc.text(d, x + i * (cellW + 1.2) + cellW / 2, y + 3, { align: "center" });
  });

  // Legend
  const legendY = y + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  doc.text("Low", x, legendY + 2);
  const legX = x + 7;
  const legCellW = 4;
  [
    [239, 68, 68], [251, 146, 60], [250, 204, 21], [74, 222, 128], [34, 197, 94],
  ].forEach((c, i) => {
    doc.setFillColor(c[0], c[1], c[2]);
    doc.roundedRect(legX + i * legCellW, legendY, legCellW - 0.4, 2.4, 0.3, 0.3, "F");
  });
  doc.text("High", legX + 5 * legCellW + 1, legendY + 2);
  doc.text("(95%+ green · 85-94% light green · 75-84% yellow · 60-74% orange · <60% red)", legX + 5 * legCellW + 8, legendY + 2);

  // Build 7-col grid
  const gridTop = legendY + 5;
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
      const cx = x + di * (cellW + 1.2);
      const cy = gridTop + wi * (cellH + 1.2);
      if (day === null) return;
      const data = dayMap.get(day);
      const isWeekend = di === 0 || di === 6;
      if (isWeekend) {
        doc.setFillColor(245, 245, 247);
        doc.roundedRect(cx, cy, cellW, cellH, 1, 1, "F");
        doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.text(String(day), cx + cellW / 2, cy + cellH / 2, { align: "center", baseline: "middle" });
        return;
      }
      if (!data || data.attendanceRate < 0) {
        doc.setFillColor(250, 250, 252);
        doc.setDrawColor(225, 225, 230);
        doc.setLineWidth(0.15);
        doc.roundedRect(cx, cy, cellW, cellH, 1, 1, "FD");
        doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.text(String(day), cx + cellW / 2, cy + cellH / 2, { align: "center", baseline: "middle" });
        return;
      }
      const c = heatColorRgb(data.attendanceRate);
      doc.setFillColor(c[0], c[1], c[2]);
      doc.roundedRect(cx, cy, cellW, cellH, 1, 1, "F");
      const txtColor = data.attendanceRate >= 60 && data.attendanceRate < 85 ? PDF.ink : PDF.white;
      doc.setTextColor(txtColor[0], txtColor[1], txtColor[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.text(String(day), cx + cellW / 2, cy + cellH / 2 - 1.2, { align: "center", baseline: "middle" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.text(`${data.attendanceRate}%`, cx + cellW / 2, cy + cellH / 2 + 2.4, { align: "center", baseline: "middle" });
    });
  });

  return gridTop + weeks.length * (cellH + 1.2);
}

// ─── Section header helper ───────────────────────────────────────────────────

function sectionHeader(doc: jsPDF, text: string, x: number, y: number, w: number) {
  doc.setFillColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.roundedRect(x, y, w, 6.5, 1, 1, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(text.toUpperCase(), x + 3, y + 4.5);
}

function footer(doc: jsPDF, pageNum: number, totalPages: number) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.2);
  doc.line(12, h - 10, w - 12, h - 10);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text("GHS Babi Khel — Attendance Analytics Report", 12, h - 5.5);
  doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`, w / 2, h - 5.5, { align: "center" });
  doc.text(`Page ${pageNum} / ${totalPages}`, w - 12, h - 5.5, { align: "right" });
}

// ─── Main PDF generator ──────────────────────────────────────────────────────

function generateAttendanceReportPdf(data: CombinedReportData) {
  // Letter size: 215.9 x 279.4 mm
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const margin = 12;
  const innerW = w - margin * 2;

  // We render into 4 pages so each section has room to breathe.
  const totalPages = 4;

  // ═══════════════ PAGE 1 — Cover / KPIs / Class comparison / Donut ═════════
  // Outer frame
  doc.setDrawColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setLineWidth(0.8);
  doc.rect(6, 6, w - 12, h - 12);

  // Gold rule
  doc.setDrawColor(PDF.gold[0], PDF.gold[1], PDF.gold[2]);
  doc.setLineWidth(1.1);
  doc.line(margin, 13, w - margin, 13);

  // School name
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("GOVERNMENT HIGH SCHOOL BABI KHEL", w / 2, 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
  doc.text("District Mohmand, Khyber Pakhtunkhwa  |  Established 2018", w / 2, 25.5, { align: "center" });

  // Title pill
  doc.setFillColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.roundedRect(w / 2 - 60, 28.5, 120, 8.5, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.text("ATTENDANCE ANALYTICS REPORT", w / 2, 34.2, { align: "center" });

  // Period & classes line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
  const periodLine = `${MONTH_NAMES_FULL[data.month - 1]} ${data.year}  ·  Combined View  ·  ${data.totalStudents} Students  ·  ${data.totalRecords} Attendance Records`;
  doc.text(periodLine, w / 2, 40.5, { align: "center" });

  // Selected classes chips
  const chipsY = 44.5;
  const chipsText = data.classes.length === ALL_CLASSES.length
    ? "All Classes (6 – 10)"
    : data.classes.map((c) => `Class ${c}`).join("  ·  ");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.text(`Selected: ${chipsText}`, w / 2, chipsY, { align: "center" });

  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.25);
  doc.line(margin, 47, w - margin, 47);

  let y = 51;

  // ── KPI Cards Row ─────────────────────────────────────────────────────────
  sectionHeader(doc, "Key Performance Indicators (Combined)", margin, y, innerW);
  y += 9;

  const cardW = (innerW - 3 * 3) / 4;
  const cardH = 19;
  const kpis = [
    { label: "Overall Rate", value: `${data.overallRate}%`, color: PDF.navy, sub: "Year-to-date" },
    { label: "Avg Daily Rate", value: `${data.avgDailyRate}%`, color: PDF.primary, sub: MONTH_NAMES_FULL[data.month - 1] },
    { label: "Chronic Absentees", value: `${data.chronicAbsenteeCount}`, color: data.chronicAbsenteeCount === 0 ? PDF.pass : PDF.fail, sub: `${data.chronicAbsenteeRate}% of students` },
    { label: "Total Students", value: `${data.totalStudents}`, color: PDF.gold, sub: `${data.classes.length} class${data.classes.length !== 1 ? "es" : ""}` },
  ];
  kpis.forEach((k, i) => {
    const cx = margin + i * (cardW + 3);
    doc.setFillColor(PDF.panel[0], PDF.panel[1], PDF.panel[2]);
    doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, "FD");
    doc.setFillColor(k.color[0], k.color[1], k.color[2]);
    doc.rect(cx, y, 1.6, cardH, "F");
    doc.setTextColor(k.color[0], k.color[1], k.color[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(k.value, cx + cardW / 2, y + 11, { align: "center" });
    doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.3);
    doc.text(k.label.toUpperCase(), cx + cardW / 2, y + 15.5, { align: "center" });
    doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
    doc.setFontSize(5.6);
    doc.text(k.sub, cx + cardW / 2, y + 18, { align: "center" });
  });
  y += cardH + 6;

  // ── Class Comparison + Status Donut ───────────────────────────────────────
  const row1Top = y;
  const colW = (innerW - 4) / 2;

  // Left: Class comparison bar chart
  sectionHeader(doc, "Class-Wise Comparison", margin, row1Top, colW);
  const compBars = data.classStats.map((c) => ({
    label: `C${c.cls}`,
    value: c.avgRate,
    color: CLASS_COLORS[c.cls] ?? PDF.primary,
  }));
  drawBarChart(doc, margin, row1Top + 7, colW, 48, compBars, { yMax: 100, reference: 75, valueSuffix: "%" });
  // Class counts below
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  data.classStats.forEach((c, i) => {
    const lx = margin + 8 + i * 22;
    doc.setFillColor(CLASS_COLORS[c.cls]?.[0] ?? 99, CLASS_COLORS[c.cls]?.[1] ?? 102, CLASS_COLORS[c.cls]?.[2] ?? 241);
    doc.rect(lx, row1Top + 58, 2.5, 2.5, "F");
    doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
    doc.text(`C${c.cls}: ${c.totalStudents} sts · ${c.totalRecords} rec`, lx + 3.5, row1Top + 60.3);
  });

  // Right: Status donut
  const rightX = margin + colW + 4;
  sectionHeader(doc, "Status Distribution", rightX, row1Top, colW);
  const donutCx = rightX + colW * 0.32;
  const donutCy = row1Top + 33;
  const donutSegs = [
    { value: data.present,  color: STATUS_COLORS.present },
    { value: data.late,     color: STATUS_COLORS.late },
    { value: data.halfday,  color: STATUS_COLORS.halfday },
    { value: data.leave,    color: STATUS_COLORS.leave },
    { value: data.absent,   color: STATUS_COLORS.absent },
  ].filter((s) => s.value > 0);
  drawDonut(doc, donutCx, donutCy, 16, 9, donutSegs);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`${data.overallRate}%`, donutCx, donutCy + 1.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  doc.text("OVERALL", donutCx, donutCy + 5, { align: "center" });

  // Donut legend
  const legendX = donutCx + 22;
  let legendY = donutCy - 12;
  const statusRows: { name: string; value: number; color: [number, number, number] }[] = [
    { name: "Present", value: data.present, color: STATUS_COLORS.present },
    { name: "Late",    value: data.late,    color: STATUS_COLORS.late },
    { name: "Halfday", value: data.halfday, color: STATUS_COLORS.halfday },
    { name: "Leave",   value: data.leave,   color: STATUS_COLORS.leave },
    { name: "Absent",  value: data.absent,  color: STATUS_COLORS.absent },
  ];
  statusRows.forEach((r) => {
    doc.setFillColor(r.color[0], r.color[1], r.color[2]);
    doc.rect(legendX, legendY, 3, 3, "F");
    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    const pct = data.totalRecords > 0 ? Math.round((r.value / data.totalRecords) * 100) : 0;
    doc.text(`${r.name}: ${r.value} (${pct}%)`, legendX + 4.5, legendY + 2.3);
    legendY += 5;
  });

  y = row1Top + 68;
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.2);
  doc.line(margin, y, w - margin, y);
  y += 5;

  // ── Highlights band ───────────────────────────────────────────────────────
  sectionHeader(doc, "Highlights & Insights", margin, y, innerW);
  y += 9;
  const insights = [
    {
      label: "Peak Absence Day",
      value: data.peakAbsenceDay ? `${data.peakAbsenceDay.date} (${data.peakAbsenceDay.rate}%)` : "No data",
      color: PDF.fail,
      icon: "▼",
    },
    {
      label: "Best Attendance Day",
      value: data.bestAttendanceDay ? `${data.bestAttendanceDay.date} (${data.bestAttendanceDay.rate}%)` : "No data",
      color: PDF.pass,
      icon: "▲",
    },
    {
      label: "Chronic Absentee Rate",
      value: `${data.chronicAbsenteeRate}%  (${data.chronicAbsenteeCount} students)`,
      color: data.chronicAbsenteeRate > 15 ? PDF.fail : data.chronicAbsenteeRate > 5 ? PDF.warn : PDF.pass,
      icon: "!",
    },
    {
      label: "Records Analyzed",
      value: `${data.totalRecords}  (${data.totalStudents} students)`,
      color: PDF.navy,
      icon: "∑",
    },
  ];
  const insCardW = (innerW - 3 * 3) / 4;
  insights.forEach((ins, i) => {
    const cx = margin + i * (insCardW + 3);
    doc.setFillColor(PDF.panel[0], PDF.panel[1], PDF.panel[2]);
    doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(cx, y, insCardW, 16, 1.5, 1.5, "FD");
    doc.setFillColor(ins.color[0], ins.color[1], ins.color[2]);
    doc.circle(cx + 5, y + 8, 2.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(ins.icon, cx + 5, y + 9.5, { align: "center" });
    doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
    doc.setFontSize(5.6);
    doc.text(ins.label.toUpperCase(), cx + 9, y + 6);
    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(ins.value, cx + 9, y + 11);
  });

  footer(doc, 1, totalPages);

  // ═══════════════ PAGE 2 — Monthly Trend + Day-of-Week Pattern ═════════════
  doc.addPage();
  // Frame
  doc.setDrawColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setLineWidth(0.8);
  doc.rect(6, 6, w - 12, h - 12);
  doc.setDrawColor(PDF.gold[0], PDF.gold[1], PDF.gold[2]);
  doc.setLineWidth(1.1);
  doc.line(margin, 13, w - margin, 13);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Attendance Trends — " + MONTH_NAMES_FULL[data.month - 1] + " " + data.year, margin, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
  doc.text(`Combined across: ${data.classes.map((c) => "Class " + c).join(", ")}`, margin, 26);
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.25);
  doc.line(margin, 29, w - margin, 29);

  y = 33;

  // Monthly trend area chart (full width)
  sectionHeader(doc, `Monthly Attendance Trend — Full Year ${data.year}`, margin, y, innerW);
  y += 9;
  const trendPoints = data.monthlyTrend.map((m) => ({ label: m.month, value: m.percentage }));
  // If only some months have data, still show all 12
  if (trendPoints.length > 0) {
    drawAreaLineChart(doc, margin, y, innerW, 70, trendPoints, PDF.primary, { yMax: 100, reference: 75, valueSuffix: "%" });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
    doc.text("No trend data available for this year.", margin + 4, y + 30);
  }
  y += 80;
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.2);
  doc.line(margin, y, w - margin, y);
  y += 5;

  // Day-of-week pattern (left) + Per-class rate table (right)
  const dowTop = y;
  const dowColW = (innerW - 4) * 0.62;
  sectionHeader(doc, "Day-of-Week Attendance Pattern", margin, dowTop, dowColW);
  const dowBars = data.dayOfWeek.map((d) => ({
    label: d.day,
    value: d.avgAttendanceRate,
    color: d.avgAttendanceRate >= 90 ? PDF.pass : d.avgAttendanceRate >= 80 ? PDF.primary : PDF.fail,
  }));
  if (dowBars.length > 0) {
    drawBarChart(doc, margin, dowTop + 7, dowColW, 60, dowBars, { yMax: 100, reference: 75, valueSuffix: "%" });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
    doc.text("No day-of-week data available.", margin + 4, dowTop + 30);
  }

  // Right: per-class summary table
  const tblX = margin + dowColW + 4;
  const tblW = innerW - dowColW - 4;
  sectionHeader(doc, "Class Summary", tblX, dowTop, tblW);
  // Table header
  const tHeaderY = dowTop + 9;
  doc.setFillColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.rect(tblX, tHeaderY, tblW, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.text("Class", tblX + 2, tHeaderY + 4);
  doc.text("Sts", tblX + 16, tHeaderY + 4, { align: "right" });
  doc.text("Rec", tblX + 24, tHeaderY + 4, { align: "right" });
  doc.text("Rate", tblX + tblW - 2, tHeaderY + 4, { align: "right" });

  let trY = tHeaderY + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  data.classStats.forEach((c, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(PDF.panel[0], PDF.panel[1], PDF.panel[2]);
      doc.rect(tblX, trY, tblW, 7, "F");
    }
    const col = CLASS_COLORS[c.cls] ?? PDF.primary;
    doc.setFillColor(col[0], col[1], col[2]);
    doc.rect(tblX + 1, trY + 1.5, 2, 4, "F");
    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    doc.text(`Class ${c.cls}`, tblX + 5, trY + 4.5);
    doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
    doc.text(String(c.totalStudents), tblX + 16, trY + 4.5, { align: "right" });
    doc.text(String(c.totalRecords), tblX + 24, trY + 4.5, { align: "right" });
    const rateColor = c.avgRate >= 85 ? PDF.pass : c.avgRate >= 75 ? PDF.warn : PDF.fail;
    doc.setTextColor(rateColor[0], rateColor[1], rateColor[2]);
    doc.setFont("helvetica", "bold");
    doc.text(`${c.avgRate}%`, tblX + tblW - 2, trY + 4.5, { align: "right" });
    doc.setFont("helvetica", "normal");
    trY += 7;
  });
  // Overall row
  doc.setFillColor(PDF.gold[0], PDF.gold[1], PDF.gold[2]);
  doc.rect(tblX, trY, tblW, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("Combined", tblX + 5, trY + 4.5);
  doc.text(String(data.totalStudents), tblX + 16, trY + 4.5, { align: "right" });
  doc.text(String(data.totalRecords), tblX + 24, trY + 4.5, { align: "right" });
  doc.text(`${data.overallRate}%`, tblX + tblW - 2, trY + 4.5, { align: "right" });

  footer(doc, 2, totalPages);

  // ═══════════════ PAGE 3 — Heatmap calendar + Daily rate line ═══════════════
  doc.addPage();
  doc.setDrawColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setLineWidth(0.8);
  doc.rect(6, 6, w - 12, h - 12);
  doc.setDrawColor(PDF.gold[0], PDF.gold[1], PDF.gold[2]);
  doc.setLineWidth(1.1);
  doc.line(margin, 13, w - margin, 13);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Daily Attendance Heat Map — ${MONTH_NAMES_FULL[data.month - 1]} ${data.year}`, margin, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
  doc.text(`Each cell shows the combined attendance rate for that day across all selected classes.`, margin, 26);
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.25);
  doc.line(margin, 29, w - margin, 29);

  y = 33;
  sectionHeader(doc, `Calendar Heat Map — ${MONTH_NAMES_FULL[data.month - 1]} ${data.year}`, margin, y, innerW);
  y += 9;
  const heatEndY = drawHeatmap(doc, margin, y, innerW, data.heatmap, data.year, data.month);
  y = heatEndY + 6;

  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.2);
  doc.line(margin, y, w - margin, y);
  y += 5;

  // Daily rate line chart
  sectionHeader(doc, `Daily Attendance Rate Trend — ${MONTH_NAMES_FULL[data.month - 1]} ${data.year}`, margin, y, innerW);
  y += 9;
  const dailyPts = data.dailyRates.map((d) => ({ label: String(d.day), value: d.rate }));
  if (dailyPts.length > 0) {
    drawAreaLineChart(doc, margin, y, innerW, 70, dailyPts, PDF.teal, { yMax: 100, reference: 75, valueSuffix: "%" });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
    doc.text("No daily rate data available for this month.", margin + 4, y + 30);
  }

  footer(doc, 3, totalPages);

  // ═══════════════ PAGE 4 — Top absent students + Recommendations ═══════════
  doc.addPage();
  doc.setDrawColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setLineWidth(0.8);
  doc.rect(6, 6, w - 12, h - 12);
  doc.setDrawColor(PDF.gold[0], PDF.gold[1], PDF.gold[2]);
  doc.setLineWidth(1.1);
  doc.line(margin, 13, w - margin, 13);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Students Requiring Attention & Recommendations", margin, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
  doc.text(`Top 10 students with the lowest attendance across selected classes — sorted by year-to-date percentage.`, margin, 26);
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.25);
  doc.line(margin, 29, w - margin, 29);

  y = 33;
  sectionHeader(doc, "Top 10 Students — Lowest Attendance", margin, y, innerW);
  y += 9;

  // Table header
  doc.setFillColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.rect(margin, y, innerW, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("#", margin + 3, y + 4.8);
  doc.text("Class", margin + 12, y + 4.8);
  doc.text("Roll", margin + 26, y + 4.8);
  doc.text("Name", margin + 42, y + 4.8);
  doc.text("Present", margin + 110, y + 4.8, { align: "right" });
  doc.text("Absent", margin + 130, y + 4.8, { align: "right" });
  doc.text("Total", margin + 150, y + 4.8, { align: "right" });
  doc.text("Rate", margin + innerW - 3, y + 4.8, { align: "right" });
  y += 7;

  if (data.topAbsent.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(PDF.pass[0], PDF.pass[1], PDF.pass[2]);
    doc.text("All students have healthy attendance — no warnings to report.", margin + 4, y + 10);
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    data.topAbsent.forEach((s, i) => {
      const rowH = 9;
      if (i % 2 === 0) {
        doc.setFillColor(PDF.panel[0], PDF.panel[1], PDF.panel[2]);
        doc.rect(margin, y, innerW, rowH, "F");
      }
      // Rank badge
      const badgeColor = i < 3 ? PDF.fail : i < 6 ? PDF.warn : PDF.muted;
      doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
      doc.circle(margin + 6, y + rowH / 2 + 0.5, 2.3, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.text(String(i + 1), margin + 6, y + rowH / 2 + 1.8, { align: "center" });

      // Class chip
      const cCol = CLASS_COLORS[s.cls] ?? PDF.primary;
      doc.setFillColor(cCol[0], cCol[1], cCol[2]);
      doc.roundedRect(margin + 12, y + rowH / 2 - 1.8, 9, 3.6, 0.8, 0.8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.text(`C${s.cls}`, margin + 16.5, y + rowH / 2 + 0.7, { align: "center" });

      doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.text(s.roll, margin + 26, y + rowH / 2 + 0.7);

      doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
      doc.setFont("helvetica", "bold");
      const nameShort = s.name.length > 28 ? s.name.slice(0, 27) + "…" : s.name;
      doc.text(nameShort, margin + 42, y + rowH / 2 + 0.7);

      doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
      doc.setFont("helvetica", "normal");
      doc.text(String(s.present), margin + 110, y + rowH / 2 + 0.7, { align: "right" });
      doc.text(String(s.absent), margin + 130, y + rowH / 2 + 0.7, { align: "right" });
      doc.text(String(s.total), margin + 150, y + rowH / 2 + 0.7, { align: "right" });

      const rateColor = s.percentage < 50 ? PDF.fail : s.percentage < 75 ? PDF.warn : s.percentage < 85 ? PDF.sky : PDF.pass;
      doc.setTextColor(rateColor[0], rateColor[1], rateColor[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text(`${s.percentage}%`, margin + innerW - 3, y + rowH / 2 + 0.7, { align: "right" });
      y += rowH;
    });
  }

  y += 6;
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.2);
  doc.line(margin, y, w - margin, y);
  y += 5;

  // Recommendations block
  sectionHeader(doc, "Recommendations & Action Items", margin, y, innerW);
  y += 9;

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
  // Per-class recommendation
  const weakestClass = data.classStats.slice().sort((a, b) => a.avgRate - b.avgRate)[0];
  if (weakestClass && weakestClass.avgRate < 75) {
    recs.push({ tone: PDF.fail, text: `Class ${weakestClass.cls} has the lowest attendance (${weakestClass.avgRate}%). Targeted intervention recommended.` });
  }
  const strongestClass = data.classStats.slice().sort((a, b) => b.avgRate - a.avgRate)[0];
  if (strongestClass && strongestClass.avgRate >= 85) {
    recs.push({ tone: PDF.pass, text: `Class ${strongestClass.cls} is performing well (${strongestClass.avgRate}%). Recognize and share best practices.` });
  }
  // Day-of-week insight
  if (data.dayOfWeek.length > 0) {
    const worst = data.dayOfWeek.slice().sort((a, b) => a.avgAttendanceRate - b.avgAttendanceRate)[0];
    const best = data.dayOfWeek.slice().sort((a, b) => b.avgAttendanceRate - a.avgAttendanceRate)[0];
    if (worst && best) {
      recs.push({ tone: PDF.primary, text: `${worst.day} has the lowest attendance (${worst.avgAttendanceRate}%) while ${best.day} is highest (${best.avgAttendanceRate}%). Review timetable & co-curricular load on ${worst.day}.` });
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  recs.forEach((r, i) => {
    const ry = y + i * 9;
    doc.setFillColor(r.tone[0], r.tone[1], r.tone[2]);
    doc.circle(margin + 3, ry + 3.5, 1.8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(String(i + 1), margin + 3, ry + 4.5, { align: "center" });
    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    // Wrap text
    const maxTextW = innerW - 10;
    const lines = doc.splitTextToSize(r.text, maxTextW) as string[];
    lines.forEach((ln, li) => {
      doc.text(ln, margin + 7, ry + 4 + li * 3.6);
    });
  });

  footer(doc, 4, totalPages);

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
