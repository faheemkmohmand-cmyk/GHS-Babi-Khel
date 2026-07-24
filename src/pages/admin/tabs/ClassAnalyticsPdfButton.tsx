import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
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
  const chartH = 30;
  const chartBaseY = y + chartH;
  const chartX0 = margin + 6;
  const chartW = w - margin * 2 - 8;
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

  // Short, unambiguous abbreviations so labels never collide or clip.
  const abbreviateSubject = (name: string): string => {
    const map: Record<string, string> = {
      "Computer Science": "Comp.Sci",
      "G.Science": "G.Sci",
      "M.Quran": "M.Quran",
      "Islamiyat": "Islam.",
      "Geography": "Geo.",
      "Mathematics": "Maths",
      "Pak-study": "Pak.St",
    };
    if (map[name]) return map[name];
    return name.length > 8 ? name.slice(0, 7) + "…" : name;
  };

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
    doc.setFontSize(4.4);
    doc.setTextColor(PDF.sub[0], PDF.sub[1], PDF.sub[2]);
    const label = abbreviateSubject(s.subject);
    // Anchor rotated text at its top-left start point (no "align" with angle,
    // which jsPDF does not combine reliably) so labels never overlap/clip.
    doc.text(label, bx + barW / 2 - 1, chartBaseY + 3.5, { angle: -40 });
  });

  y = chartBaseY + 16;
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
interface ClassAnalyticsPdfButtonProps {
  cls: string;
  year: number;
}

/**
 * Small, mobile-friendly button (used inside the DMCs sub-tab) that fetches
 * this class's results and generates the single-page vector Class Analytics
 * PDF — extracted out of the old standalone Analytics tab so it fits neatly
 * alongside the DMC tools instead of needing its own full tab/page.
 */
export default function ClassAnalyticsPdfButton({ cls, year }: ClassAnalyticsPdfButtonProps) {
  const subjects = getSubjects(cls);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const { data: results = [], isLoading } = useQuery<ResultWithStudent[]>({
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
    <Button
      onClick={handleExportAnalyticsPdf}
      disabled={isExportingPdf || isLoading || results.length === 0}
      className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm"
      size="sm"
    >
      {isExportingPdf || isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FileDown className="w-4 h-4" />
      )}
      Download Analytics Report (PDF)
    </Button>
  );
}
