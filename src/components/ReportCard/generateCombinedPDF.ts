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

  // ── Top 6 combined scorers horizontal bar chart ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setText(doc, C.ink);
  doc.text("Top 6 Scorers — Combined (9th vs 10th)", MARGIN, y);
  y += 10;

  type TaggedResult = NormalizedResult & { _cls: ClassKey };
  const top6: TaggedResult[] = [
    ...classA.results.map<TaggedResult>((r) => ({ ...r, _cls: "9th" })),
    ...classB.results.map<TaggedResult>((r) => ({ ...r, _cls: "10th" })),
  ]
    .filter((r) => r.found && r.totalMarks > 0)
    .sort((a, b) => b.totalMarks - a.totalMarks)
    .slice(0, 6);

  if (top6.length > 0) {
    // BISE 9th/10th max = 600 (sum of all subjects). Use 600 as chart max
    // for consistent visual comparison, falling back to highest score if
    // that exceeds 600 (shouldn't happen but defensive).
    const maxMarks = Math.max(600, ...top6.map((r) => r.totalMarks));
    const labelW = 170;
    const chartX = MARGIN + labelW;
    const chartW = PAGE_W - MARGIN - chartX - 50;
    const barH = 18;
    const barGap = 6;

    for (let i = 0; i < top6.length; i++) {
      const r = top6[i];
      const by = y + i * (barH + barGap);
      const accent = r._cls === "9th" ? C.classA : C.classB;
      const soft = r._cls === "9th" ? C.classASoft : C.classBSoft;

      // Rank + name + roll (left label area)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      setText(doc, C.ink);
      doc.text(`#${i + 1}`, MARGIN, by + 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      setText(doc, C.text);
      const name = (r.name || "—");
      const truncatedName = name.length > 24 ? name.slice(0, 23) + "…" : name;
      doc.text(truncatedName, MARGIN + 22, by + 9);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      setText(doc, C.muted);
      doc.text(`Roll ${r.roll} · ${r._cls}`, MARGIN + 22, by + 17);

      // Bar background (soft tint)
      panel(doc, chartX, by, chartW, barH, { fill: soft, stroke: C.border, radius: 3 });
      // Bar fill (solid accent)
      const barW = (r.totalMarks / maxMarks) * chartW;
      if (barW > 0) {
        setFill(doc, accent);
        doc.roundedRect(chartX, by, Math.max(barW, 2), barH, 3, 3, "F");
      }
      // Marks (right of bar)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      setText(doc, C.ink);
      doc.text(String(r.totalMarks), chartX + chartW + 6, by + 12);
    }
    y += top6.length * (barH + barGap) + 8;
  }

  // ── Insight footer line ──
  const verdict = buildVerdict(classA.stats, classB.stats, top6[0]);
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
  const rowH = 20;
  const rowStart = topHeadingY + 6;
  for (let i = 0; i < 3; i++) {
    const ry = rowStart + i * (rowH + 2);
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

    // Name + roll
    if (r) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      setText(doc, C.ink);
      const name = (r.name || "—");
      const truncated = name.length > 26 ? name.slice(0, 25) + "…" : name;
      doc.text(truncated, x + 12 + 26, ry + 10);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      setText(doc, C.muted);
      doc.text(`Roll ${r.roll}`, x + 12 + 26, ry + 16);

      // Marks (right-aligned)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      setText(doc, accent);
      doc.text(String(r.totalMarks), x + w - 16, ry + 13, { align: "right" });
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
  doc.text("DELTA (9th − 10th)", colX[3] + colW[3] / 2, y + 14, { align: "center" });
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

    // Delta
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const deltaCx = colX[3] + colW[3] / 2;
    if (r.delta == null) {
      setText(doc, C.muted);
      doc.text("—", deltaCx, ry + 13, { align: "center" });
    } else if (r.delta > 0) {
      setText(doc, C.pass);
      doc.text(`+${r.delta}%`, deltaCx, ry + 13, { align: "center" });
    } else if (r.delta < 0) {
      setText(doc, C.fail);
      doc.text(`${r.delta}%`, deltaCx, ry + 13, { align: "center" });
    } else {
      setText(doc, C.muted);
      doc.text("0%", deltaCx, ry + 13, { align: "center" });
    }
  }
  y += subjectRows.length * rowH + 14;

  // ── Head-to-head metric bars ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setText(doc, C.ink);
  doc.text("Head-to-Head Metrics", MARGIN, y);
  y += 8;

  const metrics: Array<{ label: string; a: number; b: number }> = [
    { label: "Total Students", a: classA.stats.totalStudents, b: classB.stats.totalStudents },
    { label: "Passed", a: classA.stats.passCount, b: classB.stats.passCount },
    { label: "Failed", a: classA.stats.failCount, b: classB.stats.failCount },
    { label: "Average Marks", a: classA.stats.averageMarks, b: classB.stats.averageMarks },
    { label: "Highest Marks", a: classA.stats.highestMarks, b: classB.stats.highestMarks },
  ];

  const metricLabelW = 110;
  const metricBarX = MARGIN + metricLabelW;
  const metricBarW = (PAGE_W - MARGIN - metricBarX - 70) / 2 - 8;
  const metricRowH = 18;
  const metricGap = 4;

  // Column header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  setText(doc, C.classA);
  doc.text("CLASS 9th", metricBarX + metricBarW / 2, y, { align: "center" });
  setText(doc, C.classB);
  doc.text("CLASS 10th", metricBarX + metricBarW * 1.5 + 30, y, { align: "center" });
  y += 6;

  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    const ry = y + i * (metricRowH + metricGap);

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(doc, C.muted);
    doc.text(m.label.toUpperCase(), MARGIN, ry + 12);

    // Find max for scaling
    const maxVal = Math.max(m.a, m.b, 1);

    // 9th bar
    const aBarW = (m.a / maxVal) * metricBarW;
    panel(doc, metricBarX, ry, metricBarW, metricRowH, { fill: C.classASoft, stroke: C.classALight, radius: 3 });
    if (aBarW > 0) {
      setFill(doc, C.classA);
      doc.roundedRect(metricBarX, ry, Math.max(aBarW, 2), metricRowH, 3, 3, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    setText(doc, C.ink);
    doc.text(String(m.a), metricBarX + metricBarW + 4, ry + 12);

    // 10th bar
    const bBarX = metricBarX + metricBarW + 30;
    const bBarW = (m.b / maxVal) * metricBarW;
    panel(doc, bBarX, ry, metricBarW, metricRowH, { fill: C.classBSoft, stroke: C.classBLight, radius: 3 });
    if (bBarW > 0) {
      setFill(doc, C.classB);
      doc.roundedRect(bBarX, ry, Math.max(bBarW, 2), metricRowH, 3, 3, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    setText(doc, C.ink);
    doc.text(String(m.b), bBarX + metricBarW + 4, ry + 12);
  }
  y += metrics.length * (metricRowH + metricGap) + 12;

  // ── Comparison Verdict box ──
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
function buildVerdict(
  a: ResultStats,
  b: ResultStats,
  topScorer?: NormalizedResult & { _cls?: ClassKey }
): string {
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

  if (topScorer) {
    lines.push(
      `Top combined scorer: ${topScorer.name || "—"} (Roll ${topScorer.roll}, Class ${topScorer._cls}) with ${topScorer.totalMarks} marks.`
    );
  } else if (a.highestMarks >= b.highestMarks && a.topScorerName) {
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
