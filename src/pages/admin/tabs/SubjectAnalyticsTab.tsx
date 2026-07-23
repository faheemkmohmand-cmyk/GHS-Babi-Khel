import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, BarChart3, FileDown, Loader2 } from "lucide-react";
import type { ResultWithStudent } from "@/hooks/useResultsEnhanced";
import jsPDF from "jspdf";

// ─── Subject lists per class group ───────────────────────────────────────────
const SUBJECTS_6_TO_8 = [
  "English",
  "Urdu",
  "Islamiyat",
  "M.Quran",
  "Arabic",
  "Geography",
  "Pashto",
  "Maths",
  "History",
  "G.Science",
  "Computer Science",
];

const SUBJECTS_9_TO_10 = [
  "English",
  "Urdu",
  "Pak-study",
  "Chemistry",
  "Physics",
  "Computer Science",
  "Biology",
  "Islamiyat",
  "M.Quran",
  "Mathematics",
];

function getSubjects(cls: string): string[] {
  return ["9", "10"].includes(cls) ? SUBJECTS_9_TO_10 : SUBJECTS_6_TO_8;
}

// ─── Color palette for chart bars ────────────────────────────────────────────
const SUBJECT_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
];

// ─── PDF color palette (matches Merit List / DMC PDF theme) ────────────────
const PDF = {
  ink:    [26, 26, 26]    as [number, number, number],
  sub:    [90, 90, 90]    as [number, number, number],
  muted:  [120, 120, 120] as [number, number, number],
  rule:   [180, 180, 180] as [number, number, number],
  white:  [255, 255, 255] as [number, number, number],
  gold:   [180, 140, 40]  as [number, number, number],
  pass:   [15, 129, 74]   as [number, number, number],
  fail:   [178, 34, 34]   as [number, number, number],
  panel:  [247, 247, 249] as [number, number, number],
  navy:   [24, 42, 74]    as [number, number, number],
};

const PDF_SUBJECT_COLORS: [number, number, number][] = [
  [99, 102, 241], [139, 92, 246], [236, 72, 153], [244, 63, 94],
  [249, 115, 22], [234, 179, 8], [34, 197, 94], [20, 184, 166],
  [6, 182, 212], [59, 130, 246],
];

interface AnalyticsPdfInput {
  cls: string;
  year: number;
  subjects: string[];
  results: ResultWithStudent[];
}

function computeAnalyticsPdfData({ cls, year, subjects, results }: AnalyticsPdfInput) {
  const total = results.length;
  const passCount = results.filter((r) => r.is_pass).length;
  const failCount = total - passCount;
  const passRate = total > 0 ? Math.round((passCount / total) * 1000) / 10 : 0;
  const avgPct =
    total > 0
      ? Math.round((results.reduce((s, r) => s + (r.percentage || 0), 0) / total) * 10) / 10
      : 0;
  const highest = total > 0 ? Math.max(...results.map((r) => r.percentage || 0)) : 0;
  const lowest = total > 0 ? Math.min(...results.map((r) => r.percentage || 0)) : 0;

  const gradeBuckets = [
    { label: "A+/A (80-100)", min: 80, max: 100.001, color: PDF.pass },
    { label: "B (60-79)", min: 60, max: 80, color: [59, 130, 246] as [number, number, number] },
    { label: "C (40-59)", min: 40, max: 60, color: [234, 179, 8] as [number, number, number] },
    { label: "Below 40", min: 0, max: 40, color: PDF.fail },
  ].map((b) => ({
    ...b,
    count: results.filter((r) => (r.percentage || 0) >= b.min && (r.percentage || 0) < b.max).length,
  }));

  const subjectAverages = subjects.map((subject, idx) => {
    let totalPct = 0;
    let count = 0;
    for (const r of results) {
      const sm = r.subject_marks?.[subject];
      if (sm && sm.total > 0) {
        totalPct += (sm.obtained / sm.total) * 100;
        count++;
      }
    }
    return {
      subject,
      average: count > 0 ? Math.round((totalPct / count) * 10) / 10 : 0,
      color: PDF_SUBJECT_COLORS[idx % PDF_SUBJECT_COLORS.length],
    };
  });

  const topStudents = [...results]
    .sort((a, b) => (b.percentage || 0) - (a.percentage || 0))
    .slice(0, 5)
    .map((r, i) => ({
      rank: i + 1,
      name: r.students?.full_name ?? "—",
      roll: r.students?.roll_number ?? "—",
      pct: r.percentage || 0,
    }));

  const strongestSubject = subjectAverages.reduce(
    (best, s) => (s.average > (best?.average ?? -1) ? s : best),
    null as (typeof subjectAverages)[number] | null
  );
  const weakestSubject = subjectAverages.reduce(
    (worst, s) => (s.average < (worst?.average ?? 101) ? s : worst),
    null as (typeof subjectAverages)[number] | null
  );

  return {
    cls, year, total, passCount, failCount, passRate, avgPct, highest, lowest,
    gradeBuckets, subjectAverages, topStudents, strongestSubject, weakestSubject,
  };
}

// ─── Draw a filled donut/ring chart (pure vector, no external libs) ─────────
function drawDonut(
  doc: jsPDF,
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  segments: { value: number; color: [number, number, number] }[]
) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let startAngle = -90;
  const steps = 60; // resolution per full circle
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

// ─── Draw a radar/spider polygon for one subject-average series ────────────
function drawRadarSeries(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  values: number[], // 0-100
  color: [number, number, number],
  fillOpacityHex: string | null
) {
  const n = values.length;
  const pts = values.map((v, i) => {
    const angle = -90 + (i * 360) / n;
    const rad = (angle * Math.PI) / 180;
    const dist = (Math.max(0, Math.min(100, v)) / 100) * r;
    return [cx + dist * Math.cos(rad), cy + dist * Math.sin(rad)];
  });
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.6);
  if (fillOpacityHex) {
    doc.setFillColor(color[0], color[1], color[2]);
    (doc as any).setGState?.(new (doc as any).GState({ opacity: 0.18 }));
  }
  const lines: any[] = [];
  for (let i = 1; i < pts.length; i++) lines.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  lines.push([pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]]);
  doc.lines(lines, pts[0][0], pts[0][1], [1, 1], fillOpacityHex ? "FD" : "D", true);
  if (fillOpacityHex) (doc as any).setGState?.(new (doc as any).GState({ opacity: 1 }));
  doc.setFillColor(color[0], color[1], color[2]);
  for (const [x, y] of pts) doc.circle(x, y, 0.7, "F");
}

function generateClassAnalyticsPdf(data: ReturnType<typeof computeAnalyticsPdfData>) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const margin = 12;

  // ── Outer frame ──────────────────────────────────────────────────────────
  doc.setDrawColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setLineWidth(0.8);
  doc.rect(6, 6, w - 12, h - 12);

  // ── Header ───────────────────────────────────────────────────────────────
  doc.setDrawColor(PDF.gold[0], PDF.gold[1], PDF.gold[2]);
  doc.setLineWidth(1.1);
  doc.line(margin, 13, w - margin, 13);

  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("GOVERNMENT HIGH SCHOOL BABI KHEL", w / 2, 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
  doc.text("District Mohmand, Khyber Pakhtunkhwa  |  Established 2018", w / 2, 25.5, { align: "center" });

  doc.setFillColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.roundedRect(w / 2 - 46, 28.5, 92, 8.5, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.text(`CLASS ${data.cls} — RESULT ANALYTICS`, w / 2, 34.2, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
  doc.text(`Academic Year ${data.year}  |  Diagrammatic Performance Overview  |  ${data.total} Students`, w / 2, 40.5, { align: "center" });

  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.25);
  doc.line(margin, 43, w - margin, 43);

  let y = 47;

  // ── Row 1: 4 KPI stat cards ─────────────────────────────────────────────
  const cardW = (w - margin * 2 - 3 * 3) / 4;
  const cardH = 18;
  const kpis: { label: string; value: string; color: [number, number, number] }[] = [
    { label: "Class Average", value: `${data.avgPct}%`, color: PDF.navy },
    { label: "Pass Rate", value: `${data.passRate}%`, color: PDF.pass },
    { label: "Highest Score", value: `${data.highest}%`, color: PDF.gold },
    { label: "Lowest Score", value: `${data.lowest}%`, color: PDF.fail },
  ];
  kpis.forEach((k, i) => {
    const x = margin + i * (cardW + 3);
    doc.setFillColor(PDF.panel[0], PDF.panel[1], PDF.panel[2]);
    doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, "FD");
    doc.setFillColor(k.color[0], k.color[1], k.color[2]);
    doc.rect(x, y, 1.6, cardH, "F");
    doc.setTextColor(k.color[0], k.color[1], k.color[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(k.value, x + cardW / 2, y + 10.5, { align: "center" });
    doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.3);
    doc.text(k.label.toUpperCase(), x + cardW / 2, y + 15, { align: "center" });
  });
  y += cardH + 6;

  // ── Row 2: Pass/Fail Donut + Grade Distribution Bars ─────────────────────
  const rowTop = y;
  const colW = (w - margin * 2 - 4) / 2;

  // Left: donut
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.text("PASS / FAIL BREAKDOWN", margin, rowTop);
  const donutCy = rowTop + 20;
  const donutCx = margin + colW * 0.32;
  drawDonut(doc, donutCx, donutCy, 15, 8, [
    { value: data.passCount, color: PDF.pass },
    { value: data.failCount, color: PDF.fail },
  ]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.text(`${data.passRate}%`, donutCx, donutCy + 1.5, { align: "center" });
  doc.setFontSize(5.2);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  doc.text("PASSED", donutCx, donutCy + 5, { align: "center" });

  const legendX = donutCx + 22;
  doc.setFillColor(PDF.pass[0], PDF.pass[1], PDF.pass[2]);
  doc.rect(legendX, donutCy - 8, 3, 3, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.text(`Passed: ${data.passCount}`, legendX + 4.5, donutCy - 5.7);
  doc.setFillColor(PDF.fail[0], PDF.fail[1], PDF.fail[2]);
  doc.rect(legendX, donutCy - 2, 3, 3, "F");
  doc.text(`Failed: ${data.failCount}`, legendX + 4.5, donutCy + 0.3);
  doc.setFillColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.rect(legendX, donutCy + 4, 3, 3, "F");
  doc.text(`Total: ${data.total}`, legendX + 4.5, donutCy + 6.3);

  // Right: grade distribution horizontal bars
  const rightX = margin + colW + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.text("GRADE DISTRIBUTION", rightX, rowTop);
  const maxCount = Math.max(1, ...data.gradeBuckets.map((b) => b.count));
  const barMaxW = colW - 34;
  data.gradeBuckets.forEach((b, i) => {
    const by = rowTop + 6 + i * 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.3);
    doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
    doc.text(b.label, rightX, by + 3.2);
    const bw = (b.count / maxCount) * barMaxW;
    doc.setFillColor(230, 230, 232);
    doc.roundedRect(rightX + 30, by, barMaxW, 4.2, 0.8, 0.8, "F");
    if (bw > 0.5) {
      doc.setFillColor(b.color[0], b.color[1], b.color[2]);
      doc.roundedRect(rightX + 30, by, Math.max(bw, 2), 4.2, 0.8, 0.8, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    doc.text(String(b.count), rightX + 30 + barMaxW + 2.5, by + 3.2);
  });

  y = rowTop + 42;
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.2);
  doc.line(margin, y, w - margin, y);
  y += 5;

  // ── Row 3: Subject Averages Bar Chart (vertical) ─────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.text("SUBJECT-WISE CLASS AVERAGE", margin, y);
  y += 4;
  const chartH = 32;
  const chartBaseY = y + chartH;
  const chartX0 = margin + 2;
  const chartW = w - margin * 2 - 4;
  const nSubj = data.subjectAverages.length || 1;
  const gap = 2;
  const barW = (chartW - gap * (nSubj - 1)) / nSubj;

  // gridlines
  doc.setDrawColor(235, 235, 235);
  doc.setLineWidth(0.15);
  [0, 25, 50, 75, 100].forEach((v) => {
    const gy = chartBaseY - (v / 100) * chartH;
    doc.line(chartX0, gy, chartX0 + chartW, gy);
    doc.setFontSize(4.8);
    doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
    doc.text(`${v}`, chartX0 - 2, gy + 1, { align: "right" });
  });

  data.subjectAverages.forEach((s, i) => {
    const bx = chartX0 + i * (barW + gap);
    const bh = (s.average / 100) * chartH;
    doc.setFillColor(s.color[0], s.color[1], s.color[2]);
    doc.roundedRect(bx, chartBaseY - bh, barW, Math.max(bh, 0.5), 0.6, 0.6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    doc.text(`${s.average}`, bx + barW / 2, chartBaseY - bh - 1.2, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.6);
    doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
    const label = s.subject.length > 9 ? s.subject.slice(0, 8) + "…" : s.subject;
    doc.text(label, bx + barW / 2, chartBaseY + 3.4, {
      align: "center",
      angle: 40,
    });
  });

  y = chartBaseY + 9;
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.2);
  doc.line(margin, y, w - margin, y);
  y += 5;

  // ── Row 4: Radar (strongest/weakest visual) + Top 5 table ───────────────
  const row4Top = y;
  const radarColW = (w - margin * 2) * 0.42;
  const tableColX = margin + radarColW + 6;
  const tableColW = w - margin - tableColX;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.text("SUBJECT PROFILE (RADAR)", margin, row4Top);
  const radarCx = margin + radarColW / 2;
  const radarCy = row4Top + 26;
  const radarR = 20;

  // radar grid rings
  doc.setDrawColor(225, 225, 225);
  doc.setLineWidth(0.15);
  [0.25, 0.5, 0.75, 1].forEach((f) => doc.circle(radarCx, radarCy, radarR * f, "D"));
  const subjLabels = data.subjectAverages.map((s) => s.subject);
  const n = subjLabels.length || 1;
  subjLabels.forEach((label, i) => {
    const angle = -90 + (i * 360) / n;
    const rad = (angle * Math.PI) / 180;
    const ex = radarCx + radarR * Math.cos(rad);
    const ey = radarCy + radarR * Math.sin(rad);
    doc.line(radarCx, radarCy, ex, ey);
    const lx = radarCx + (radarR + 4.5) * Math.cos(rad);
    const ly = radarCy + (radarR + 4.5) * Math.sin(rad);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.4);
    doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
    const short = label.length > 8 ? label.slice(0, 7) + "…" : label;
    doc.text(short, lx, ly, { align: "center" });
  });
  drawRadarSeries(
    doc, radarCx, radarCy, radarR,
    data.subjectAverages.map((s) => s.average),
    PDF.navy, "fill"
  );

  if (data.strongestSubject || data.weakestSubject) {
    const infoY = radarCy + radarR + 14;
    if (data.strongestSubject) {
      doc.setFillColor(PDF.pass[0], PDF.pass[1], PDF.pass[2]);
      doc.circle(margin + 2, infoY - 1, 1.2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(PDF.pass[0], PDF.pass[1], PDF.pass[2]);
      doc.text(`Strongest: ${data.strongestSubject.subject} (${data.strongestSubject.average}%)`, margin + 5, infoY);
    }
    if (data.weakestSubject) {
      doc.setFillColor(PDF.fail[0], PDF.fail[1], PDF.fail[2]);
      doc.circle(margin + 2, infoY + 4.5, 1.2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(PDF.fail[0], PDF.fail[1], PDF.fail[2]);
      doc.text(`Focus Area: ${data.weakestSubject.subject} (${data.weakestSubject.average}%)`, margin + 5, infoY + 5.5);
    }
  }

  // Right: Top 5 performers table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.text("TOP 5 PERFORMERS", tableColX, row4Top);

  doc.setFillColor(PDF.navy[0], PDF.navy[1], PDF.navy[2]);
  doc.rect(tableColX, row4Top + 3, tableColW, 5.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.text("#", tableColX + 3, row4Top + 6.7);
  doc.text("Roll", tableColX + 10, row4Top + 6.7);
  doc.text("Name", tableColX + 26, row4Top + 6.7);
  doc.text("%", tableColX + tableColW - 6, row4Top + 6.7, { align: "right" });

  data.topStudents.forEach((s, i) => {
    const ry = row4Top + 8.5 + i * 7.2;
    if (i % 2 === 0) {
      doc.setFillColor(PDF.panel[0], PDF.panel[1], PDF.panel[2]);
      doc.rect(tableColX, ry, tableColW, 7.2, "F");
    }
    const medalColor: [number, number, number] =
      s.rank === 1 ? PDF.gold : s.rank === 2 ? [150, 150, 150] : s.rank === 3 ? [150, 100, 50] : PDF.muted;
    doc.setFillColor(medalColor[0], medalColor[1], medalColor[2]);
    doc.circle(tableColX + 3.2, ry + 3.6, 2.3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.text(String(s.rank), tableColX + 3.2, ry + 4.5, { align: "center" });

    doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.text(s.roll, tableColX + 10, ry + 4.5);

    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    doc.setFont("helvetica", "bold");
    const nameShort = s.name.length > 16 ? s.name.slice(0, 15) + "…" : s.name;
    doc.text(nameShort, tableColX + 26, ry + 4.5);

    doc.setTextColor(PDF.pass[0], PDF.pass[1], PDF.pass[2]);
    doc.text(`${s.pct}%`, tableColX + tableColW - 6, ry + 4.5, { align: "right" });
  });

  // ── Footer ───────────────────────────────────────────────────────────────
  doc.setDrawColor(PDF.rule[0], PDF.rule[1], PDF.rule[2]);
  doc.setLineWidth(0.25);
  doc.line(margin, h - 12, w - margin, h - 12);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text("GHS Babi Khel — Official Class Result Analytics", margin, h - 7);
  doc.text(
    `Generated: ${new Date().toLocaleDateString("en-GB")}`,
    w / 2, h - 7, { align: "center" }
  );
  doc.text("Page 1 / 1", w - margin, h - 7, { align: "right" });

  doc.save(`ClassAnalytics_Class${data.cls}_${data.year}.pdf`);
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface SubjectAnalyticsTabProps {
  cls: string;
  year: number;
}

export default function SubjectAnalyticsTab({
  cls,
  year,
}: SubjectAnalyticsTabProps) {
  const subjects = useMemo(() => getSubjects(cls), [cls]);

  // ── Student selection state ───────────────────────────────────────────────
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // ── Fetch all results for this class + year ──────────────────────────────
  const {
    data: results = [],
    isLoading,
    isError,
  } = useQuery<ResultWithStudent[]>({
    queryKey: ["subject-analytics", cls, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, student_id, class, exam_type, year, total_marks, obtained_marks, percentage, grade, is_pass, subject_marks, students(full_name, roll_number)"
        )
        .eq("class", cls)
        .eq("year", year);
      if (error) throw error;
      return (data ?? []) as unknown as ResultWithStudent[];
    },
    enabled: !!cls && !!year,
    staleTime: 10 * 60 * 1000,
  });

  // ── Unique students list ─────────────────────────────────────────────────
  const students = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; roll: string }
    >();
    for (const r of results) {
      if (r.students && !map.has(r.student_id)) {
        map.set(r.student_id, {
          id: r.student_id,
          name: r.students.full_name,
          roll: r.students.roll_number,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.roll.localeCompare(b.roll, undefined, { numeric: true })
    );
  }, [results]);

  // ── 1. Subject Average Bar Chart data ────────────────────────────────────
  const subjectAverageData = useMemo(() => {
    if (results.length === 0) return [];

    return subjects.map((subject, idx) => {
      let totalPct = 0;
      let count = 0;

      for (const r of results) {
        const sm = r.subject_marks?.[subject];
        if (sm && sm.total > 0) {
          totalPct += (sm.obtained / sm.total) * 100;
          count++;
        }
      }

      const avg = count > 0 ? Math.round((totalPct / count) * 10) / 10 : 0;

      return {
        subject: subject.length > 8 ? subject.slice(0, 7) + "…" : subject,
        fullName: subject,
        average: avg,
        fill: SUBJECT_COLORS[idx % SUBJECT_COLORS.length],
      };
    });
  }, [results, subjects]);

  // ── 2. Radar Chart data: student vs class average ────────────────────────
  const radarData = useMemo(() => {
    // Class average per subject
    const classAvg: Record<string, number> = {};
    for (const subject of subjects) {
      let totalPct = 0;
      let count = 0;
      for (const r of results) {
        const sm = r.subject_marks?.[subject];
        if (sm && sm.total > 0) {
          totalPct += (sm.obtained / sm.total) * 100;
          count++;
        }
      }
      classAvg[subject] = count > 0 ? Math.round((totalPct / count) * 10) / 10 : 0;
    }

    // Selected student's per-subject percentage
    const studentAvg: Record<string, number> = {};
    if (selectedStudentId) {
      const studentResults = results.filter(
        (r) => r.student_id === selectedStudentId
      );
      for (const subject of subjects) {
        let totalPct = 0;
        let count = 0;
        for (const r of studentResults) {
          const sm = r.subject_marks?.[subject];
          if (sm && sm.total > 0) {
            totalPct += (sm.obtained / sm.total) * 100;
            count++;
          }
        }
        studentAvg[subject] =
          count > 0 ? Math.round((totalPct / count) * 10) / 10 : 0;
      }
    }

    return subjects.map((subject) => ({
      subject: subject.length > 10 ? subject.slice(0, 9) + "…" : subject,
      fullName: subject,
      student: studentAvg[subject] ?? 0,
      classAverage: classAvg[subject] ?? 0,
    }));
  }, [results, subjects, selectedStudentId]);

  // ── 3. Strongest / Weakest subject for selected student ──────────────────
  const { strongest, weakest } = useMemo(() => {
    if (!selectedStudentId || radarData.length === 0) {
      return { strongest: null, weakest: null };
    }

    let maxPct = -1;
    let minPct = 101;
    let maxSubj = "";
    let minSubj = "";

    for (const d of radarData) {
      if (d.student > maxPct) {
        maxPct = d.student;
        maxSubj = d.fullName;
      }
      if (d.student < minPct) {
        minPct = d.student;
        minSubj = d.fullName;
      }
    }

    return {
      strongest: maxPct >= 0 ? { subject: maxSubj, percentage: maxPct } : null,
      weakest: minPct <= 100 ? { subject: minSubj, percentage: minPct } : null,
    };
  }, [selectedStudentId, radarData]);

  // ── 4. Trend Analysis (multiple exam types) ─────────────────────────────
  const examTypes = useMemo(() => {
    const set = new Set(results.map((r) => r.exam_type));
    return Array.from(set).sort();
  }, [results]);

  const trendData = useMemo(() => {
    if (examTypes.length < 2) return [];

    // For each exam type, compute average percentage per subject
    const dataByExam = examTypes.map((examType) => {
      const examResults = results.filter((r) => r.exam_type === examType);
      const entry: Record<string, string | number> = { examType };
      for (const subject of subjects) {
        let totalPct = 0;
        let count = 0;
        for (const r of examResults) {
          const sm = r.subject_marks?.[subject];
          if (sm && sm.total > 0) {
            totalPct += (sm.obtained / sm.total) * 100;
            count++;
          }
        }
        entry[subject] =
          count > 0 ? Math.round((totalPct / count) * 10) / 10 : 0;
      }
      return entry;
    });

    return dataByExam;
  }, [results, examTypes, subjects]);

  // ── Loading / error states ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-destructive">
          Failed to load analytics data. Please try again later.
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No results data available</p>
          <p className="text-sm mt-1">
            Results for Class {cls}, {year} have not been entered yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Selected student name for display ────────────────────────────────────
  const selectedStudent = students.find(
    (s) => s.id === selectedStudentId
  );

  const handleExportAnalyticsPdf = () => {
    if (results.length === 0) return;
    setIsExportingPdf(true);
    try {
      const pdfData = computeAnalyticsPdfData({ cls, year, subjects, results });
      generateClassAnalyticsPdf(pdfData);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Export Analytics PDF button ───────────────────────────────────── */}
      <div className="flex justify-end">
        <Button
          onClick={handleExportAnalyticsPdf}
          disabled={isExportingPdf || results.length === 0}
          className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm"
          size="sm"
        >
          {isExportingPdf ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4" />
          )}
          Download Analytics Report (PDF)
        </Button>
      </div>

      {/* ── Top: Bar Chart + Radar Chart (2-col on desktop) ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Subject Average Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-5 h-5 text-primary" />
              Subject-wise Class Average
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Average marks percentage per subject across all students — Class{" "}
              {cls}, {year}
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={subjectAverageData}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="subject"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: number, _name: string, props: any) => [
                    `${value}%`,
                    props.payload.fullName,
                  ]}
                  labelFormatter={() => ""}
                  contentStyle={{
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="average"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                >
                  {subjectAverageData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 2. Student Radar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-5 h-5 text-primary" />
              Student vs Class Average
            </CardTitle>
            <div className="mt-2">
              <Select
                value={selectedStudentId}
                onValueChange={setSelectedStudentId}
              >
                <SelectTrigger className="w-full sm:w-[280px]">
                  <SelectValue placeholder="Select a student to compare" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.roll} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {selectedStudentId ? (
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="70%"
                  data={radarData}
                >
                  <PolarGrid strokeOpacity={0.3} />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fontSize: 10 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fontSize: 9 }}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Radar
                    name={`${
                      selectedStudent?.name ?? "Student"
                    }`}
                    dataKey="student"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                  <Radar
                    name="Class Average"
                    dataKey="classAverage"
                    stroke="#94a3b8"
                    fill="#94a3b8"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px" }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${value}%`,
                      name,
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                Select a student above to see the radar comparison
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Strongest / Weakest Subject Cards ─────────────────────────────── */}
      {selectedStudentId && (strongest || weakest) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {strongest && (
            <Card className="border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-950/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wide">
                    Strongest Subject
                  </p>
                  <p className="text-lg font-bold text-green-800 dark:text-green-300">
                    {strongest.subject}{" "}
                    <span className="text-green-600 dark:text-green-400">
                      ({strongest.percentage}%)
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {weakest && (
            <Card className="border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40">
                  <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-red-700 dark:text-red-400 uppercase tracking-wide">
                    Weakest Subject
                  </p>
                  <p className="text-lg font-bold text-red-800 dark:text-red-300">
                    {weakest.subject}{" "}
                    <span className="text-red-600 dark:text-red-400">
                      ({weakest.percentage}%)
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Trend Analysis (only when 2+ exam types exist) ────────────────── */}
      {examTypes.length >= 2 && trendData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-5 h-5 text-primary" />
              Subject Trend Across Exams
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Track how each subject's class average changes across exam types —
              Class {cls}, {year}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {subjects.map((subject, idx) => (
                <Badge
                  key={subject}
                  variant="outline"
                  className="text-[10px] gap-1"
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        SUBJECT_COLORS[idx % SUBJECT_COLORS.length],
                    }}
                  />
                  {subject}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={trendData}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="examType"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value}%`,
                    name,
                  ]}
                  contentStyle={{
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px" }}
                />
                {subjects.map((subject, idx) => (
                  <Line
                    key={subject}
                    type="monotone"
                    dataKey={subject}
                    stroke={SUBJECT_COLORS[idx % SUBJECT_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Info when only 1 exam type exists ──────────────────────────────── */}
      {examTypes.length < 2 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-muted-foreground">
            <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">Trend Analysis Unavailable</p>
            <p className="text-xs mt-1">
              Only one exam type (
              {examTypes[0] ?? "none"}) found for Class {cls}, {year}.
              <br />
              Trend lines appear when at least two exam types exist.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
