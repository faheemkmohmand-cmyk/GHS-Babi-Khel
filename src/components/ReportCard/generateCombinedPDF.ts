// src/components/ReportCard/generateCombinedPDF.ts
// Combined 9th + 10th BISE Peshawar result report — Letter size, 2 pages.
//
// Page 1 — Combined Overview & Position Holders
//   • Title block (school + exam + year + BISE Peshawar)
//   • 5-tile combined KPI strip (Total / Passed / Failed / Pass% / Avg)
//   • Two side-by-side class cards (9th sky-tinted, 10th violet-tinted),
//     each with: class KPI row + Top 3 position holders with medal badges
//   • Top 6 combined scorers horizontal bar chart (color-coded by class)
//   • Insight footer line
//
// Page 2 — Side-by-Side Comparison
//   • Title block (smaller)
//   • Pass / Fail distribution stacked bars (one per class)
//   • Subject-wise pass-% comparison table with mini bars + delta column
//   • Head-to-head metric bars (Total / Passed / Failed / Avg / Highest)
//   • Comparison Verdict box (auto-generated narrative)
//
// Design principles:
//   • Letter page (612 × 792 pt), 36pt margins.
//   • Lightweight print-friendly palette — soft tints with darker outlines
//     instead of solid heavy fills. Class 9th = sky, Class 10th = violet.
//   • All charts drawn as vectors (roundedRect, line, circle) — no raster.
//   • Built-in Helvetica font (no font registration needed).

import jsPDF from "jspdf";
import type { ExamSelection, NormalizedResult, ResultStats } from "./types";

type RGB = [number, number, number];

// ── Lightweight print-friendly palette ──
const C = {
  ink:         [15, 23, 42] as RGB,     // slate-900 — primary text
  text:        [30, 41, 59] as RGB,     // slate-800 — body text
  muted:       [100, 116, 139] as RGB,  // slate-500 — muted
  light:       [148, 163, 184] as RGB,  // slate-400
  panel:       [241, 245, 249] as RGB,  // slate-100 — section bg
  stripe:      [248, 250, 252] as RGB,  // slate-50  — alt row
  border:      [226, 232, 240] as RGB,  // slate-200
  borderDark:  [203, 213, 225] as RGB,  // slate-300
  white:       [255, 255, 255] as RGB,
  // Class 9th — sky
  classA:      [2, 132, 199] as RGB,    // sky-600
  classALight: [186, 230, 253] as RGB,  // sky-200
  classASoft:  [240, 249, 255] as RGB,  // sky-50
  // Class 10th — violet
  classB:      [124, 58, 237] as RGB,   // violet-600
  classBLight: [221, 214, 254] as RGB,  // violet-200
  classBSoft:  [245, 243, 255] as RGB,  // violet-50
  // Status colors
  pass:        [22, 163, 74] as RGB,    // green-600
  passLight:   [220, 252, 231] as RGB,  // green-100
  fail:        [220, 38, 38] as RGB,    // red-600
  failLight:   [254, 226, 226] as RGB,  // red-100
  // Medals
  gold:        [180, 83, 9] as RGB,     // amber-700 (deeper for readability)
  goldLight:   [254, 243, 199] as RGB,  // amber-100
  silver:      [71, 85, 105] as RGB,    // slate-600
  silverLight: [241, 245, 249] as RGB,  // slate-100
  bronze:      [120, 53, 15] as RGB,    // amber-900
  bronzeLight: [254, 215, 170] as RGB,  // orange-200
};

const PAGE_W = 612; // 8.5" × 72
const PAGE_H = 792; // 11" × 72
const MARGIN = 36;

type ClassKey = "9th" | "10th";

interface ClassData {
  className: ClassKey;
  results: NormalizedResult[];
  stats: ResultStats;
}

export interface CombinedPDFOpts {
  schoolName: string;
  examType: ExamSelection["examType"];
  year: string;
  classes: Record<ClassKey, ClassData>;
}

// ─────────────────────────────────────────────────────────────────────────
// Drawing primitives
// ─────────────────────────────────────────────────────────────────────────

function setFill(doc: jsPDF, c: RGB): void {
  doc.setFillColor(c[0], c[1], c[2]);
}
function setStroke(doc: jsPDF, c: RGB, w = 0.6): void {
  doc.setDrawColor(c[0], c[1], c[2]);
  doc.setLineWidth(w);
}
function setText(doc: jsPDF, c: RGB): void {
  doc.setTextColor(c[0], c[1], c[2]);
}

interface PanelOpts {
  fill?: RGB;
  stroke?: RGB;
  radius?: number;
  lineWidth?: number;
}

function panel(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  opts: PanelOpts = {}
): void {
  const r = opts.radius ?? 4;
  const hasFill = !!opts.fill;
  const hasStroke = !!opts.stroke;
  if (hasFill) setFill(doc, opts.fill as RGB);
  if (hasStroke) setStroke(doc, opts.stroke as RGB, opts.lineWidth ?? 0.6);
  if (hasFill && hasStroke) doc.roundedRect(x, y, w, h, r, r, "FD");
  else if (hasFill) doc.roundedRect(x, y, w, h, r, r, "F");
  else if (hasStroke) doc.roundedRect(x, y, w, h, r, r, "D");
}

function hr(
  doc: jsPDF,
  x1: number, y: number, x2: number,
  c: RGB = C.border, w = 0.6
): void {
  setStroke(doc, c, w);
  doc.line(x1, y, x2, y);
}

// ─────────────────────────────────────────────────────────────────────────
// Twin-ring donut chart
// ─────────────────────────────────────────────────────────────────────────
//
// Two concentric donut rings: outer ring = Class 9th pass% (sky), inner
// ring = Class 10th pass% (violet). Centered label shows the combined
// pass %. Each ring is drawn as a series of triangular quad segments
// approximating the arc — no raster images, fully vector.
//
// Layer order:
//   1. Outer-ring background (gray disk) + inner white circle → gray ring
//   2. Outer-ring colored segments on top of the gray (clockwise from top)
//   3. Inner-ring background (gray disk) + inner white circle → gray ring
//   4. Inner-ring colored segments on top
//   5. Outer thin border for crispness

/** Draws a single donut ring at (cx, cy) with the given outer/inner radii.
 *  `pct` percent of the ring (clockwise from 12 o'clock) is filled with
 *  `color` (the pass portion); the remainder is filled with `bgColor`,
 *  representing the failed portion — so it must default to a visible red
 *  tint rather than neutral gray, otherwise the "Failed" legend entry has
 *  nothing red to point to in the chart itself. */
function drawDonutRing(
  doc: jsPDF,
  cx: number, cy: number,
  rOuter: number, rInner: number,
  pct: number,
  color: RGB,
  bgColor: RGB = C.failLight
): void {
  // Clamp pct to [0, 100]
  const p = Math.max(0, Math.min(100, pct));

  // Background ring: outer disk (bg) + inner disk (white) → ring
  setFill(doc, bgColor);
  doc.circle(cx, cy, rOuter, "F");
  setFill(doc, C.white);
  doc.circle(cx, cy, rInner, "F");

  // Filled portion: clockwise arc from 12 o'clock, broken into triangular
  // quad segments. Each segment is a curved rectangle approximated as a
  // quad split into 2 triangles.
  if (p > 0) {
    const startAngle = -Math.PI / 2; // 12 o'clock
    const sweepAngle = (p / 100) * 2 * Math.PI;
    const steps = Math.max(8, Math.ceil((p / 100) * 72));
    setFill(doc, color);
    for (let i = 0; i < steps; i++) {
      const a1 = startAngle + (i / steps) * sweepAngle;
      const a2 = startAngle + ((i + 1) / steps) * sweepAngle;
      const x1o = cx + rOuter * Math.cos(a1);
      const y1o = cy + rOuter * Math.sin(a1);
      const x2o = cx + rOuter * Math.cos(a2);
      const y2o = cy + rOuter * Math.sin(a2);
      const x1i = cx + rInner * Math.cos(a1);
      const y1i = cy + rInner * Math.sin(a1);
      const x2i = cx + rInner * Math.cos(a2);
      const y2i = cy + rInner * Math.sin(a2);
      // Quad: outer1 → outer2 → inner2 → inner1, split into 2 triangles
      doc.triangle(x1o, y1o, x2o, y2o, x2i, y2i, "F");
      doc.triangle(x1o, y1o, x2i, y2i, x1i, y1i, "F");
    }
  }

  // Thin outer border for crispness
  setStroke(doc, C.border, 0.4);
  doc.circle(cx, cy, rOuter, "D");
}

// ─────────────────────────────────────────────────────────────────────────
// Statistical insights — auto-narrative bullets for page 2
// ─────────────────────────────────────────────────────────────────────────

interface Insight {
  text: string;
  color: RGB; // accent for the bullet marker
}

function buildInsights(a: ResultStats, b: ResultStats): Insight[] {
  const out: Insight[] = [];

  // 1. Overall pass-rate leadership
  const aPct = a.passPercentage;
  const bPct = b.passPercentage;
  if (aPct > bPct) {
    out.push({
      text: `Class 9th leads on overall pass rate (${aPct}% vs ${bPct}%, +${aPct - bPct} pts).`,
      color: C.classA,
    });
  } else if (bPct > aPct) {
    out.push({
      text: `Class 10th leads on overall pass rate (${bPct}% vs ${aPct}%, +${bPct - aPct} pts).`,
      color: C.classB,
    });
  } else {
    out.push({
      text: `Both classes share an identical pass rate of ${aPct}%.`,
      color: C.muted,
    });
  }

  // 2. Subject leadership count
  const aSubj = Object.entries(a.subjectPassRates);
  const bSubj = Object.entries(b.subjectPassRates);
  const common: Array<{ name: string; a: number; b: number }> = [];
  for (const [name, c] of aSubj) {
    const match = bSubj.find(([n]) => n === name);
    if (match) common.push({ name, a: c.rate, b: match[1].rate });
  }
  if (common.length > 0) {
    const aWins = common.filter((s) => s.a > s.b).length;
    const bWins = common.filter((s) => s.b > s.a).length;
    const ties = common.length - aWins - bWins;
    out.push({
      text: `Across ${common.length} common subjects — Class 9th leads in ${aWins}, Class 10th in ${bWins}, tied in ${ties}.`,
      color: C.ink,
    });
  }

  // 3. Largest subject gap
  if (common.length > 0) {
    const withGaps = common.map((s) => ({ ...s, gap: Math.abs(s.a - s.b) }));
    const maxGap = withGaps.reduce((max, s) => (s.gap > max.gap ? s : max));
    if (maxGap.gap > 0) {
      const leader = maxGap.a > maxGap.b ? "9th" : "10th";
      const leaderColor = maxGap.a > maxGap.b ? C.classA : C.classB;
      out.push({
        text: `Largest subject gap: ${maxGap.name} — Class ${leader} ahead by ${maxGap.gap} pts.`,
        color: leaderColor,
      });
    }
  }

  // 4. Closest contest (smallest non-zero gap)
  if (common.length > 1) {
    const withGaps = common
      .map((s) => ({ ...s, gap: Math.abs(s.a - s.b) }))
      .filter((s) => s.gap > 0);
    if (withGaps.length > 0) {
      const minGap = withGaps.reduce((min, s) => (s.gap < min.gap ? s : min));
      out.push({
        text: `Closest contest: ${minGap.name} — only ${minGap.gap} pts separate the two classes.`,
        color: C.muted,
      });
    }
  }

  // 5. Average marks comparison
  if (a.averageMarks > b.averageMarks) {
    out.push({
      text: `Class 9th averages ${a.averageMarks - b.averageMarks} more marks per student (${a.averageMarks} vs ${b.averageMarks}).`,
      color: C.classA,
    });
  } else if (b.averageMarks > a.averageMarks) {
    out.push({
      text: `Class 10th averages ${b.averageMarks - a.averageMarks} more marks per student (${b.averageMarks} vs ${a.averageMarks}).`,
      color: C.classB,
    });
  } else {
    out.push({
      text: `Both classes share the same average marks (${a.averageMarks}).`,
      color: C.muted,
    });
  }

  // 6. Top scorer callout
  const aTop = a.highestMarks;
  const bTop = b.highestMarks;
  if (aTop >= bTop && a.topScorerName) {
    out.push({
      text: `Top combined scorer: ${a.topScorerName} (Roll ${a.topScorerRoll}, Class 9th) — ${aTop} marks.`,
      color: C.gold,
    });
  } else if (b.topScorerName) {
    out.push({
      text: `Top combined scorer: ${b.topScorerName} (Roll ${b.topScorerRoll}, Class 10th) — ${bTop} marks.`,
      color: C.gold,
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Top 3 position holders from a class — must be found + have marks. */
function top3(results: NormalizedResult[]): NormalizedResult[] {
  return [...results]
    .filter((r) => r.found && r.totalMarks > 0)
    .sort((a, b) => b.totalMarks - a.totalMarks)
    .slice(0, 3);
}

/** Combined stats across both classes. */
function computeCombinedStats(a: ResultStats, b: ResultStats) {
  const found = a.foundCount + b.foundCount;
  const passed = a.passCount + b.passCount;
  const failed = a.failCount + b.failCount;
  // Weighted average across both classes (weighted by foundCount)
  const avg = found > 0
    ? Math.round((a.foundCount * a.averageMarks + b.foundCount * b.averageMarks) / found)
    : 0;
  return {
    total: a.totalStudents + b.totalStudents,
    found,
    passed,
    failed,
    passPct: found > 0 ? Math.round((passed / found) * 100) : 0,
    avg,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Page 1 — Combined Overview & Position Holders
// ─────────────────────────────────────────────────────────────────────────

function drawPage1(
  doc: jsPDF,
  opts: CombinedPDFOpts,
  classA: ClassData,
  classB: ClassData
): void {
  const cx = PAGE_W / 2;
  const combined = computeCombinedStats(classA.stats, classB.stats);

  // ── Header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  setText(doc, C.ink);
  doc.text(opts.schoolName || "GHS Babi Khel, District Mohmand", cx, 40, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  setText(doc, C.muted);
  doc.text(
    `Combined Result Report  ·  ${opts.examType}  ·  ${opts.year}`,
    cx, 58, { align: "center" }
  );
  doc.text("Class 9th & 10th  ·  BISE Peshawar", cx, 72, { align: "center" });
  hr(doc, MARGIN, 86, PAGE_W - MARGIN, C.border, 0.8);

  // ── Combined KPI strip — 5 tiles ──
  let y = 102;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setText(doc, C.ink);
  doc.text("Combined Overview", MARGIN, y);
  y += 12;

  const tileCount = 5;
  const tileGap = 6;
  const tileW = (PAGE_W - MARGIN * 2 - tileGap * (tileCount - 1)) / tileCount;
  const tileH = 50;
  const tiles: Array<{ label: string; value: string; color: RGB }> = [
    { label: "Total Students", value: String(combined.total), color: C.ink },
    { label: "Passed", value: String(combined.passed), color: C.pass },
    { label: "Failed", value: String(combined.failed), color: C.fail },
    { label: "Pass %", value: `${combined.passPct}%`, color: C.ink },
    { label: "Average Marks", value: String(combined.avg), color: C.ink },
  ];
  for (let i = 0; i < tiles.length; i++) {
    const x = MARGIN + i * (tileW + tileGap);
    const tcx = x + tileW / 2;
    panel(doc, x, y, tileW, tileH, { fill: C.stripe, stroke: C.border, radius: 4 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setText(doc, C.muted);
    doc.text(tiles[i].label, tcx, y + 15, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    setText(doc, tiles[i].color);
    doc.text(tiles[i].value, tcx, y + 36, { align: "center" });
  }
  y += tileH + 20;

  // ── Side-by-side class cards with Top 3 ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setText(doc, C.ink);
  doc.text("Class Performance & Top 3 Position Holders", MARGIN, y);
  y += 10;

  const cardGap = 10;
  const cardW = (PAGE_W - MARGIN * 2 - cardGap) / 2;
  const cardH = 200;

  drawClassCard(doc, MARGIN, y, cardW, cardH, classA, "9th", C.classA, C.classALight, C.classASoft);
  drawClassCard(doc, MARGIN + cardW + cardGap, y, cardW, cardH, classB, "10th", C.classB, C.classBLight, C.classBSoft);

  y += cardH + 18;

  // ── Twin-ring Combined Pass Rate donut + stats panel ──
  //   Outer ring (sky)    = Class 9th pass%
  //   Inner ring (violet) = Class 10th pass%
  //   Center label        = Combined pass %
  //
  // This replaces the previous "Top 6 Scorers Combined" bar chart which
  // was visually repetitive with the Top 3 Position Holders cards above.
  // The twin-ring is unique: at a glance you see both classes' pass rates
  // AND how they combine — no other section in the report shows this.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setText(doc, C.ink);
  doc.text("Combined Pass Rate", MARGIN, y);
  y += 10;

  const donutPanelH = 130;
  // Panel background
  panel(doc, MARGIN, y, PAGE_W - MARGIN * 2, donutPanelH, {
    fill: C.stripe, stroke: C.border, radius: 6,
  });

  // Donut geometry — outer ring (9th) r=55→42, inner ring (10th) r=38→25
  const donutCx = MARGIN + 80;
  const donutCy = y + donutPanelH / 2;
  drawDonutRing(doc, donutCx, donutCy, 55, 42, classA.stats.passPercentage, C.classA);
  drawDonutRing(doc, donutCx, donutCy, 38, 25, classB.stats.passPercentage, C.classB);

  // Center label — combined pass % (large) + "PASS" subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  setText(doc, C.ink);
  doc.text(`${combined.passPct}%`, donutCx, donutCy + 2, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  setText(doc, C.muted);
  doc.text("COMBINED", donutCx, donutCy + 14, { align: "center" });

  // Stats column (right of donut)
  const statsX = MARGIN + 180;
  const statsY = y + 24;
  const statRowH = 22;

  // Legend rows: colored dot + label + value
  const legendRows: Array<{ label: string; value: string; sub: string; color: RGB }> = [
    {
      label: "Class 9th",
      value: `${classA.stats.passPercentage}%`,
      sub: `${classA.stats.passCount}/${classA.stats.foundCount} passed`,
      color: C.classA,
    },
    {
      label: "Class 10th",
      value: `${classB.stats.passPercentage}%`,
      sub: `${classB.stats.passCount}/${classB.stats.foundCount} passed`,
      color: C.classB,
    },
    {
      label: "Combined",
      value: `${combined.passPct}%`,
      sub: `${combined.passed}/${combined.found} passed`,
      color: C.ink,
    },
    {
      label: "Failed",
      value: String(combined.failed),
      sub: `${100 - combined.passPct}% of total`,
      color: C.fail,
    },
  ];

  // Two right-aligned columns: value column ends before sub-text column
  // starts, with a fixed gap between them so they never collide (the old
  // layout hard-coded both at nearly the same x position, causing the
  // value and sub-text to overlap, e.g. "80%64 passed").
  const panelRight = MARGIN + (PAGE_W - MARGIN * 2) - 14;
  const valueColRight = panelRight - 70;
  const subColLeft = panelRight - 64;

  for (let i = 0; i < legendRows.length; i++) {
    const r = legendRows[i];
    const ry = statsY + i * statRowH;
    // Colored dot
    setFill(doc, r.color);
    doc.circle(statsX, ry, 4, "F");
    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    setText(doc, C.text);
    doc.text(r.label, statsX + 10, ry + 3);
    // Value (right-aligned, own column)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setText(doc, r.color);
    doc.text(r.value, valueColRight, ry + 3, { align: "right" });
    // Sub-text (left-aligned, starts after the value column)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setText(doc, C.muted);
    doc.text(r.sub, subColLeft, ry + 3);
  }

  y += donutPanelH + 16;

  // ── Insight footer line ──
  // splitTextToSize() measures using the *currently active* font/size, so
  // it must be set to match what's actually used to render the text below
  // (italic 9.5pt) — otherwise the wrap width is computed for whatever
  // font was last set (here, the 7.5pt legend sub-text), which is
  // narrower than the real text, causing lines to overflow the panel
  // instead of wrapping (e.g. "Top scorer: MUHAMMA..." running off the
  // right edge).
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  const verdict = buildVerdict(classA.stats, classB.stats);
  const insightLines = doc.splitTextToSize(verdict, PAGE_W - MARGIN * 2 - 24);
  const insightH = insightLines.length * 11 + 18;
  panel(doc, MARGIN, y, PAGE_W - MARGIN * 2, insightH, {
    fill: C.panel, stroke: C.border, radius: 5,
  });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  setText(doc, C.text);
  doc.text(insightLines, MARGIN + 12, y + 16);
}

function drawClassCard(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  classData: ClassData,
  className: ClassKey,
  accent: RGB,
  light: RGB,
  soft: RGB
): void {
  const stats = classData.stats;

  // Card background
  panel(doc, x, y, w, h, { fill: soft, stroke: light, radius: 6, lineWidth: 1 });

  // Header bar (accent-tinted band at the top of the card)
  setFill(doc, light);
  doc.roundedRect(x, y, w, 28, 6, 6, "F");
  // Square off the bottom corners of the header by drawing a thin rect over
  // the bottom half (jsPDF's roundedRect always rounds all 4 corners).
  setFill(doc, light);
  doc.rect(x, y + 14, w, 14, "F");

  // Header text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  setText(doc, accent);
  doc.text(`Class ${className}`, x + 12, y + 18);

  // Right-side "found count" pill
  const badgeW = 68;
  const badgeX = x + w - 12 - badgeW;
  panel(doc, badgeX, y + 7, badgeW, 14, { fill: C.white, stroke: light, radius: 7 });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setText(doc, accent);
  doc.text(`${stats.foundCount} students`, badgeX + badgeW / 2, y + 16, { align: "center" });

  // KPI row (4 small tiles): Pass | Fail | Pass% | Avg
  const kpiY = y + 36;
  const kpiH = 36;
  const kpiGap = 4;
  const kpiW = (w - 24 - kpiGap * 3) / 4;
  const kpis: Array<{ label: string; value: string; color: RGB }> = [
    { label: "Pass", value: String(stats.passCount), color: C.pass },
    { label: "Fail", value: String(stats.failCount), color: C.fail },
    { label: "Pass %", value: `${stats.passPercentage}%`, color: accent },
    { label: "Avg", value: String(stats.averageMarks), color: accent },
  ];
  for (let i = 0; i < kpis.length; i++) {
    const kx = x + 12 + i * (kpiW + kpiGap);
    panel(doc, kx, kpiY, kpiW, kpiH, { fill: C.white, stroke: light, radius: 3 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setText(doc, C.muted);
    doc.text(kpis[i].label, kx + kpiW / 2, kpiY + 12, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setText(doc, kpis[i].color);
    doc.text(kpis[i].value, kx + kpiW / 2, kpiY + 28, { align: "center" });
  }

  // Top 3 section heading
  const topHeadingY = kpiY + kpiH + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(doc, C.ink);
  doc.text("Top 3 Position Holders", x + 12, topHeadingY);

  // Medal rows
  const top3List = top3(classData.results);
  const medals: Array<{ fill: RGB; text: RGB; label: string }> = [
    { fill: C.goldLight, text: C.gold, label: "1" },
    { fill: C.silverLight, text: C.silver, label: "2" },
    { fill: C.bronzeLight, text: C.bronze, label: "3" },
  ];
  const rowH = 26;
  const rowStart = topHeadingY + 6;
  for (let i = 0; i < 3; i++) {
    const ry = rowStart + i * (rowH + 3);
    const r = top3List[i];

    // Row bg
    panel(doc, x + 12, ry, w - 24, rowH, { fill: C.white, stroke: light, radius: 3 });

    // Medal circle
    const medalCx = x + 12 + 12;
    const medalCy = ry + rowH / 2;
    setFill(doc, medals[i].fill);
    doc.circle(medalCx, medalCy, 7, "F");
    setStroke(doc, medals[i].text, 0.6);
    doc.circle(medalCx, medalCy, 7, "D");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setText(doc, medals[i].text);
    doc.text(medals[i].label, medalCx, medalCy + 3, { align: "center" });

    // Name + roll — two lines, given enough vertical room in the taller
    // row so they don't crowd each other (name baseline near the top,
    // roll baseline near the bottom, ~10pt apart).
    if (r) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      setText(doc, C.ink);
      const name = (r.name || "—");
      const truncated = name.length > 26 ? name.slice(0, 25) + "…" : name;
      doc.text(truncated, x + 12 + 26, ry + 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      setText(doc, C.muted);
      doc.text(`Roll ${r.roll}`, x + 12 + 26, ry + 20);

      // Marks (right-aligned, vertically centered on the row)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      setText(doc, accent);
      doc.text(String(r.totalMarks), x + w - 16, ry + rowH / 2 + 4, { align: "right" });
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      setText(doc, C.muted);
      doc.text("—", x + 12 + 26, ry + 12);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Page 2 — Side-by-Side Comparison
// ─────────────────────────────────────────────────────────────────────────

function drawPage2(
  doc: jsPDF,
  opts: CombinedPDFOpts,
  classA: ClassData,
  classB: ClassData
): void {
  const cx = PAGE_W / 2;

  // ── Smaller header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  setText(doc, C.ink);
  doc.text(opts.schoolName || "GHS Babi Khel, District Mohmand", cx, 40, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  setText(doc, C.muted);
  doc.text(
    `Comparison Report — Class 9th vs Class 10th  ·  ${opts.examType} ${opts.year}`,
    cx, 56, { align: "center" }
  );
  doc.text("BISE Peshawar", cx, 70, { align: "center" });
  hr(doc, MARGIN, 84, PAGE_W - MARGIN, C.border, 0.8);

  let y = 100;

  // ── Pass / Fail distribution bars ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setText(doc, C.ink);
  doc.text("Pass / Fail Distribution", MARGIN, y);
  y += 8;

  const labelColW = 78;
  const barX = MARGIN + labelColW;
  const barW = PAGE_W - MARGIN - barX - 70;
  const barH = 26;
  const barGap = 12;
  const classes: Array<{ cd: ClassData; name: ClassKey; accent: RGB; soft: RGB; light: RGB }> = [
    { cd: classA, name: "9th", accent: C.classA, soft: C.classASoft, light: C.classALight },
    { cd: classB, name: "10th", accent: C.classB, soft: C.classBSoft, light: C.classBLight },
  ];

  for (let i = 0; i < classes.length; i++) {
    const { cd, name, accent, soft, light } = classes[i];
    const stats = cd.stats;
    const by = y + i * (barH + barGap);
    const total = stats.foundCount;
    const pass = stats.passCount;
    const fail = stats.failCount;

    // Class label pill (left)
    panel(doc, MARGIN, by + 2, labelColW - 8, barH - 4, { fill: soft, stroke: light, radius: 3, lineWidth: 0.8 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setText(doc, accent);
    doc.text(`Class ${name}`, MARGIN + (labelColW - 8) / 2, by + 15, { align: "center" });

    // Background bar
    panel(doc, barX, by, barW, barH, { fill: C.stripe, stroke: C.border, radius: 3 });

    if (total > 0) {
      const passW = (pass / total) * barW;
      const failW = (fail / total) * barW;
      // Pass portion (green) — use rect for crisp edges inside the rounded bg
      if (passW > 0) {
        setFill(doc, C.passLight);
        doc.rect(barX, by, passW, barH, "F");
        // Soft top/bottom border tint
        setFill(doc, C.pass);
        doc.rect(barX, by, passW, 2, "F");
        doc.rect(barX, by + barH - 2, passW, 2, "F");
      }
      // Fail portion (red) — only if there's a fail to show
      if (failW > 0) {
        setFill(doc, C.failLight);
        doc.rect(barX + passW, by, failW, barH, "F");
        setFill(doc, C.fail);
        doc.rect(barX + passW, by, failW, 2, "F");
        doc.rect(barX + passW, by + barH - 2, failW, 2, "F");
      }
    }

    // Inline labels
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setText(doc, C.pass);
    doc.text(`${pass} PASS`, barX + 8, by + 16);
    setText(doc, C.fail);
    doc.text(`${fail} FAIL`, barX + barW - 8, by + 16, { align: "right" });

    // Pass% to the right of the bar
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    setText(doc, accent);
    doc.text(`${stats.passPercentage}%`, barX + barW + 14, by + 18);
  }
  y += 2 * (barH + barGap) + 14;

  // ── Subject-wise pass-% comparison table ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setText(doc, C.ink);
  doc.text("Subject-wise Pass % Comparison", MARGIN, y);
  y += 8;

  // Build subject union
  const subjectMap = new Map<string, { a?: number; b?: number }>();
  for (const [name, c] of Object.entries(classA.stats.subjectPassRates)) {
    subjectMap.set(name, { a: c.rate });
  }
  for (const [name, c] of Object.entries(classB.stats.subjectPassRates)) {
    const existing = subjectMap.get(name);
    subjectMap.set(name, { a: existing?.a, b: c.rate });
  }
  const subjectRows = Array.from(subjectMap.entries())
    .map(([name, v]) => ({
      name,
      a: v.a ?? null,
      b: v.b ?? null,
      delta: (v.a != null && v.b != null) ? v.a - v.b : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const tableX = MARGIN;
  const tableW = PAGE_W - MARGIN * 2;
  const colW = [tableW * 0.34, tableW * 0.22, tableW * 0.22, tableW * 0.22];
  const colX = [
    tableX,
    tableX + colW[0],
    tableX + colW[0] + colW[1],
    tableX + colW[0] + colW[1] + colW[2],
  ];

  // Header row
  panel(doc, tableX, y, tableW, 22, { fill: C.panel, stroke: C.border, radius: 3 });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  setText(doc, C.muted);
  doc.text("SUBJECT", colX[0] + 8, y + 14);
  doc.text("CLASS 9th", colX[1] + colW[1] / 2, y + 14, { align: "center" });
  doc.text("CLASS 10th", colX[2] + colW[2] / 2, y + 14, { align: "center" });
  doc.text("DELTA (9th - 10th)", colX[3] + colW[3] / 2, y + 14, { align: "center" });
  y += 22;

  // Data rows
  const rowH = 20;
  for (let i = 0; i < subjectRows.length; i++) {
    const r = subjectRows[i];
    const ry = y + i * rowH;
    // Alt-row stripe
    if (i % 2 === 0) {
      setFill(doc, C.stripe);
      doc.rect(tableX, ry, tableW, rowH, "F");
    }
    // Bottom border
    setStroke(doc, C.border, 0.3);
    doc.line(tableX, ry + rowH, tableX + tableW, ry + rowH);

    // Subject name
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setText(doc, C.text);
    const subjName = r.name.length > 32 ? r.name.slice(0, 31) + "…" : r.name;
    doc.text(subjName, colX[0] + 8, ry + 13);

    // Class 9th % with mini bar
    drawMiniBar(doc, colX[1], ry, colW[1], rowH, r.a, C.classA, C.classASoft);
    // Class 10th %
    drawMiniBar(doc, colX[2], ry, colW[2], rowH, r.b, C.classB, C.classBSoft);

    // Delta — subtle pill badge (light bg + colored text, normal weight).
    // Previously this was bold colored text which felt loud in the cell.
    // The pill keeps the same information but visually quieter — the
    // background tint is soft (pass-100 / fail-100 / slate-100) so it
    // doesn't compete with the Class 9th / Class 10th mini bars on
    // either side.
    const deltaCx = colX[3] + colW[3] / 2;
    if (r.delta == null) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setText(doc, C.light);
      doc.text("—", deltaCx, ry + 13, { align: "center" });
    } else {
      const pillW = 38;
      const pillH = 13;
      const pillX = deltaCx - pillW / 2;
      const pillY = ry + (rowH - pillH) / 2;
      let bg: RGB, fg: RGB;
      if (r.delta > 0) {
        bg = C.passLight;
        fg = C.pass;
      } else if (r.delta < 0) {
        bg = C.failLight;
        fg = C.fail;
      } else {
        bg = C.stripe;
        fg = C.muted;
      }
      setFill(doc, bg);
      setStroke(doc, fg, 0.3);
      doc.roundedRect(pillX, pillY, pillW, pillH, 6, 6, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setText(doc, fg);
      const sign = r.delta > 0 ? "+" : "";
      doc.text(`${sign}${r.delta}`, deltaCx, pillY + pillH / 2 + 2.5, { align: "center" });
    }
  }
  y += subjectRows.length * rowH + 14;

  // ── Statistical Insights panel (auto-narrative) ──
  //   Replaces the previous "Head-to-Head Metrics" bar chart which was
  //   visually repetitive with the Pass/Fail Distribution bars above.
  //   Instead of re-stating the same numbers as bars, this panel
  //   generates 4-6 plain-text insight bullets that *interpret* the
  //   data — "Class 9th leads in 5 of 8 subjects", "Largest gap:
  //   Physics — Class 10th ahead by 18 pts", etc. Each bullet is
  //   prefixed with a small colored dot matching the class it
  //   highlights (sky for 9th, violet for 10th, gold for top-scorer
  //   callouts, gray for neutral observations).
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setText(doc, C.ink);
  doc.text("Statistical Insights", MARGIN, y);
  y += 8;

  const insights = buildInsights(classA.stats, classB.stats);
  // Wrap each insight to fit panel width, then size the panel to fit.
  // Must match the font actually used to render bullets (normal 9pt) —
  // measuring with whatever font was last set (bold 12pt heading) gives
  // an inaccurate wrap width, same class of bug as the page-1 verdict box.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const insightPanelW = PAGE_W - MARGIN * 2;
  const insightTextW = insightPanelW - 28; // padding + dot column
  const wrapped: Array<{ lines: string[]; color: RGB }> = insights.map((ins) => ({
    lines: doc.splitTextToSize(ins.text, insightTextW),
    color: ins.color,
  }));
  const insightLineH = 11;
  const insightGap = 6;
  const insightPadding = 14;
  const totalInsightLines = wrapped.reduce((sum, w) => sum + w.lines.length, 0);
  const insightPanelH =
    insightPadding * 2 +
    totalInsightLines * insightLineH +
    (wrapped.length - 1) * insightGap;

  panel(doc, MARGIN, y, insightPanelW, insightPanelH, {
    fill: C.stripe, stroke: C.border, radius: 6,
  });

  // Render bullets
  let iy = y + insightPadding + 8;
  for (let i = 0; i < wrapped.length; i++) {
    const w = wrapped[i];
    // Colored dot marker
    setFill(doc, w.color);
    doc.circle(MARGIN + 14, iy - 3, 3, "F");
    // Text (one or more lines)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setText(doc, C.text);
    for (let j = 0; j < w.lines.length; j++) {
      doc.text(w.lines[j], MARGIN + 24, iy + j * insightLineH);
    }
    iy += w.lines.length * insightLineH + insightGap;
  }

  y += insightPanelH + 14;

  // ── Comparison Verdict box ──
  // Set font/size to match the actual render (normal 9.5pt) before
  // measuring, for the same reason as above.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const verdict = buildVerdict(classA.stats, classB.stats);
  const verdictLines = doc.splitTextToSize(verdict, PAGE_W - MARGIN * 2 - 24);
  const verdictH = verdictLines.length * 11 + 26;
  panel(doc, MARGIN, y, PAGE_W - MARGIN * 2, verdictH, {
    fill: C.goldLight, stroke: C.gold, radius: 5, lineWidth: 0.8,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  setText(doc, C.gold);
  doc.text("Comparison Verdict", MARGIN + 12, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setText(doc, C.text);
  doc.text(verdictLines, MARGIN + 12, y + 30);
}

/** Draws a small horizontal bar inside a table cell with a % label. */
function drawMiniBar(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  value: number | null,
  accent: RGB,
  soft: RGB
): void {
  if (value == null) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setText(doc, C.muted);
    doc.text("—", x + w / 2, y + 13, { align: "center" });
    return;
  }
  const padX = 6;
  const labelW = 28;
  const barX = x + padX;
  const barW = w - padX * 2 - labelW;
  const barH = 6;
  const barY = y + h / 2 - barH / 2;
  // bg
  panel(doc, barX, barY, barW, barH, { fill: soft, radius: 2 });
  // fill
  const fillW = (value / 100) * barW;
  if (fillW > 0) {
    setFill(doc, accent);
    doc.roundedRect(barX, barY, Math.max(fillW, 1), barH, 2, 2, "F");
  }
  // label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(doc, C.ink);
  doc.text(`${value}%`, x + w - padX, y + h / 2 + 3, { align: "right" });
}

/** Builds a 1-2 sentence comparison verdict from stats. */
function buildVerdict(a: ResultStats, b: ResultStats): string {
  const lines: string[] = [];

  if (a.passPercentage > b.passPercentage) {
    lines.push(
      `Class 9th leads on pass rate (${a.passPercentage}% vs ${b.passPercentage}%, +${a.passPercentage - b.passPercentage} pts).`
    );
  } else if (b.passPercentage > a.passPercentage) {
    lines.push(
      `Class 10th leads on pass rate (${b.passPercentage}% vs ${a.passPercentage}%, +${b.passPercentage - a.passPercentage} pts).`
    );
  } else {
    lines.push(`Both classes share an identical pass rate of ${a.passPercentage}%.`);
  }

  if (a.averageMarks > b.averageMarks) {
    lines.push(`Class 9th has the higher average marks (${a.averageMarks} vs ${b.averageMarks}).`);
  } else if (b.averageMarks > a.averageMarks) {
    lines.push(`Class 10th has the higher average marks (${b.averageMarks} vs ${a.averageMarks}).`);
  } else {
    lines.push(`Both classes share the same average marks (${a.averageMarks}).`);
  }

  if (a.highestMarks >= b.highestMarks && a.topScorerName) {
    lines.push(
      `Top scorer: ${a.topScorerName} (Roll ${a.topScorerRoll}, Class 9th) with ${a.highestMarks} marks.`
    );
  } else if (b.topScorerName) {
    lines.push(
      `Top scorer: ${b.topScorerName} (Roll ${b.topScorerRoll}, Class 10th) with ${b.highestMarks} marks.`
    );
  }

  return lines.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────

export function generateCombinedReportPDF(opts: CombinedPDFOpts): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const classA = opts.classes["9th"];
  const classB = opts.classes["10th"];

  if (!classA || !classB) {
    throw new Error("Both class 9th and 10th data are required for combined report.");
  }

  // Page 1 — Combined Overview & Position Holders
  drawPage1(doc, opts, classA, classB);

  // Page 2 — Comparison
  doc.addPage();
  drawPage2(doc, opts, classA, classB);

  // ── Footer (all pages) ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(doc, C.muted);
    doc.text(
      `${opts.schoolName || "GHS Babi Khel"} · Combined BISE Peshawar Results`,
      MARGIN, PAGE_H - 18
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      PAGE_W - MARGIN, PAGE_H - 18,
      { align: "right" }
    );
  }

  const safe = (s: string) => s.replace(/[^a-z0-9-]/gi, "_");
  const schoolSlug = safe(opts.schoolName || "GHS_BabiKhel").replace(/_+/g, "_");
  doc.save(
    `${schoolSlug}_Combined_9th_10th_${safe(opts.examType)}_${safe(opts.year)}.pdf`
  );
}
