// src/components/ReportCard/generatePDF.ts
// Generates a stylish, minimal-color PDF report of bulk BISE Peshawar results.
//
// Design:
//   • A4 portrait, single column, generous margins
//   • Title block: GHS Babi Khel District Mohmand + class/year/exam type
//   • Summary box: total / found / passed / failed / pass % / average / top scorer
//   • Subject-wise pass-rate table (compact)
//   • Main results table: Roll | Name | Father | Total | Grade | Status
//   • Failed-student notes: list failed subjects inline (e.g. "STAT-T-I (T)")
//   • Footer: generated timestamp + page numbers
//
// Color palette (deliberately restrained — the user asked for "not too much
// color"): dark slate text (#0f172a), light gray section bg (#f1f5f9),
// single accent for headers (#1e293b), red ONLY for FAIL marks (#b91c1c).
// No blues, greens, gradients.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ExamSelection, NormalizedResult, ResultStats } from "./types";

const COLOR_TEXT = "#0f172a";
const COLOR_MUTED = "#64748b";
const COLOR_HEADER_BG = "#f1f5f9";
const COLOR_HEADER_TEXT = "#0f172a";
const COLOR_STRIPE = "#f8fafc";
const COLOR_BORDER = "#e2e8f0";
const COLOR_FAIL = "#b91c1c";
const COLOR_PASS = "#15803d";

/** Pretty-print a subject's failed-paper marker.
 *  E.g. { name: "STAT-T-I", theoryFail: true, practicalFail: false } → "STAT-T-I (Theory)" */
function failedSubjectLabel(s: NormalizedResult["subjects"][number]): string {
  const parts: string[] = [];
  if (s.theoryFail) parts.push("Theory");
  if (s.practicalFail) parts.push("Practical");
  return parts.length ? `${s.name} (${parts.join(" + ")})` : s.name;
}

/** Build the file name. */
export function pdfFileName(sel: ExamSelection): string {
  const safe = (s: string) => s.replace(/[^a-z0-9-]/gi, "_");
  const schoolSlug = safe(sel.schoolName || "GHS_BabiKhel").replace(/_+/g, "_");
  return `${schoolSlug}_${safe(sel.className)}_${safe(sel.examType)}_${safe(sel.year)}.pdf`;
}

export function generateResultPDF(
  results: NormalizedResult[],
  stats: ResultStats,
  sel: ExamSelection
): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  // ── Header (plain, centered, no colored band) ──
  const centerX = pageW / 2;
  doc.setTextColor(COLOR_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(sel.schoolName || "GHS Babi Khel, District Mohmand", centerX, 40, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(COLOR_MUTED);
  doc.text(
    `Class ${sel.className}  ·  ${sel.examType}  ·  ${sel.year}`,
    centerX,
    58,
    { align: "center" }
  );
  doc.text("BISE Peshawar", centerX, 74, { align: "center" });

  // Thin rule under header
  doc.setDrawColor(COLOR_BORDER);
  doc.setLineWidth(0.6);
  doc.line(margin, 88, pageW - margin, 88);

  // ── Summary box ──
  let y = 108;
  doc.setTextColor(COLOR_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Summary", margin, y);
  y += 10;

  // Single row of 5 stat tiles (Found/Not Found/Errors removed), text centered
  const tileCount = 5;
  const tileGap = 6;
  const tileW = (pageW - margin * 2 - tileGap * (tileCount - 1)) / tileCount;
  const tileH = 48;
  const tiles: Array<{ label: string; value: string; color?: string }> = [
    { label: "Total Students", value: String(stats.totalStudents) },
    { label: "Passed", value: String(stats.passCount), color: COLOR_PASS },
    { label: "Failed", value: String(stats.failCount), color: COLOR_FAIL },
    { label: "Pass %", value: `${stats.passPercentage}%` },
    { label: "Average Marks", value: String(stats.averageMarks) },
  ];
  for (let i = 0; i < tiles.length; i++) {
    const x = margin + i * (tileW + tileGap);
    const tileCenterX = x + tileW / 2;
    doc.setFillColor(COLOR_STRIPE);
    doc.setDrawColor(COLOR_BORDER);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, tileW, tileH, 3, 3, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(COLOR_MUTED);
    doc.text(tiles[i].label, tileCenterX, y + 16, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(tiles[i].color || COLOR_TEXT);
    doc.text(tiles[i].value, tileCenterX, y + 36, { align: "center" });
  }
  y += tileH + 16;

  // Top scorer line
  if (stats.topScorerName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(COLOR_TEXT);
    doc.text(
      `Top Scorer: ${stats.topScorerName} (Roll ${stats.topScorerRoll}) — ${stats.highestMarks} marks`,
      pageW / 2, y, { align: "center" }
    );
    y += 16;
  }

  // ── Subject-wise pass rate (compact) ──
  const subjectEntries = Object.entries(stats.subjectPassRates);
  if (subjectEntries.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Subject-wise Pass Rate", margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Subject", "Pass", "Fail", "Pass %"]],
      body: subjectEntries.map(([name, c]) => [
        name, String(c.pass), String(c.fail), `${c.rate}%`,
      ]),
      theme: "grid",
      headStyles: {
        fillColor: COLOR_HEADER_BG,
        textColor: COLOR_HEADER_TEXT,
        fontSize: 9,
        fontStyle: "normal",
        halign: "center",
      },
      bodyStyles: { fontSize: 9, textColor: COLOR_TEXT, halign: "center" },
      alternateRowStyles: { fillColor: COLOR_STRIPE },
      styles: { cellPadding: 4, lineColor: COLOR_BORDER, lineWidth: 0.3, halign: "center" },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  }

  // ── Main results table ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(COLOR_TEXT);
  doc.text("Student Results", margin, y);
  y += 6;

  // Sort by rank: highest total marks first. Not-found / no-marks rows are
  // pushed to the bottom (they have no rank). Ties keep original order.
  const rankedResults = [...results].sort((a, b) => {
    const aScore = a.found && a.totalMarks > 0 ? a.totalMarks : -1;
    const bScore = b.found && b.totalMarks > 0 ? b.totalMarks : -1;
    return bScore - aScore;
  });

  // Medal badges for the top 3 ranked students (only those with an actual
  // score — not-found rows never get a medal).
  const medals = ["🥇", "🥈", "🥉"];
  let medalIdx = 0;

  const rows = rankedResults.map((r) => {
    if (!r.found) {
      return [
        r.roll,
        "—",
        "—",
        "—",
        "—",
        r.error || "Not Found",
      ];
    }
    const status = r.isFail
      ? `FAIL${r.failedSubjectCount > 0 ? ` (${r.failedSubjectCount} sub)` : ""}`
      : "PASS";
    const medal = r.totalMarks > 0 && medalIdx < medals.length ? medals[medalIdx++] : "";
    return [
      r.roll,
      medal ? `${medal} ${r.name || "—"}` : (r.name || "—"),
      r.fatherName || "—",
      r.totalMarks > 0 ? String(r.totalMarks) : "—",
      r.grade || (r.isFail ? "F" : "—"),
      status,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["Roll", "Name", "Father", "Total", "Grade", "Status"]],
    body: rows,
    theme: "striped",
    headStyles: {
      fillColor: COLOR_HEADER_BG,
      textColor: COLOR_HEADER_TEXT,
      fontSize: 9,
      fontStyle: "normal",
      halign: "center",
    },
    bodyStyles: { fontSize: 9, textColor: COLOR_TEXT, halign: "center" },
    columnStyles: {
      0: { cellWidth: 55 },
    },
    didParseCell: (data) => {
      // Color the Status column red for FAIL, green for PASS
      if (data.section === "body" && data.column.index === 5) {
        const txt = String(data.cell.raw || "");
        if (txt.startsWith("FAIL")) {
          data.cell.styles.textColor = COLOR_FAIL;
        } else if (txt === "PASS") {
          data.cell.styles.textColor = COLOR_PASS;
        }
      }
    },
    alternateRowStyles: { fillColor: COLOR_STRIPE },
    styles: { cellPadding: 4, lineColor: COLOR_BORDER, lineWidth: 0.3, halign: "center" },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // ── Failed students breakdown (if any) ──
  const failedStudents = results.filter((r) => r.found && r.isFail);
  if (failedStudents.length > 0) {
    // Page break if not enough room
    if (y > pageH - 140) {
      doc.addPage();
      y = 60;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(COLOR_FAIL);
    doc.text("Failed Subjects Breakdown", margin, y);
    y += 6;
    const failRows = failedStudents.map((r) => {
      const failedSubs = r.subjects
        .filter((s) => s.isFail)
        .map(failedSubjectLabel)
        .join(", ");
      return [r.roll, r.name, failedSubs];
    });
    autoTable(doc, {
      startY: y,
      head: [["Roll", "Name", "Failed Papers"]],
      body: failRows,
      theme: "grid",
      headStyles: {
        fillColor: "#fef2f2",
        textColor: COLOR_FAIL,
        fontSize: 9,
        fontStyle: "normal",
        halign: "center",
      },
      bodyStyles: { fontSize: 8.5, textColor: COLOR_TEXT, halign: "center" },
      columnStyles: {
        0: { cellWidth: 55 },
      },
      alternateRowStyles: { fillColor: "#fef2f2" },
      styles: { cellPadding: 4, lineColor: "#fecaca", lineWidth: 0.3, halign: "center" },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // ── Footer: page numbers ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(COLOR_MUTED);
    doc.text(
      `${sel.schoolName || "GHS Babi Khel, District Mohmand"} · BISE Peshawar Results`,
      margin, pageH - 20
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageW - margin, pageH - 20,
      { align: "right" }
    );
  }

  doc.save(pdfFileName(sel));
}
