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
const COLOR_HEADER_BG = "#1e293b";
const COLOR_HEADER_TEXT = "#ffffff";
const COLOR_STRIPE = "#f1f5f9";
const COLOR_BORDER = "#cbd5e1";
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
  return `GHS_BabiKhel_${safe(sel.className)}_${safe(sel.examType)}_${safe(sel.year)}.pdf`;
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

  // ── Header band (slate bar with school name) ──
  doc.setFillColor(COLOR_HEADER_BG);
  doc.rect(0, 0, pageW, 80, "F");
  doc.setTextColor(COLOR_HEADER_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("GHS Babi Khel, District Mohmand", margin, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#cbd5e1");
  doc.text(
    `Class ${sel.className}  ·  ${sel.examType}  ·  ${sel.year}`,
    margin,
    54
  );
  doc.text(
    "BISE Peshawar — Bulk Result Report",
    margin,
    68
  );
  // Right-aligned date
  const genDate = new Date().toLocaleString("en-PK", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  doc.text(`Generated: ${genDate}`, pageW - margin, 54, { align: "right" });

  // ── Summary box ──
  let y = 100;
  doc.setTextColor(COLOR_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Summary", margin, y);
  y += 8;

  // 2×4 grid of stat tiles
  const tileW = (pageW - margin * 2 - 12) / 4;
  const tileH = 48;
  const tiles: Array<{ label: string; value: string; color?: string }> = [
    { label: "Total Students", value: String(stats.totalStudents) },
    { label: "Found", value: String(stats.foundCount) },
    { label: "Not Found", value: String(stats.notFoundCount) },
    { label: "Errors", value: String(stats.errorCount) },
    { label: "Passed", value: String(stats.passCount), color: COLOR_PASS },
    { label: "Failed", value: String(stats.failCount), color: COLOR_FAIL },
    { label: "Pass %", value: `${stats.passPercentage}%` },
    { label: "Average Marks", value: String(stats.averageMarks) },
  ];
  for (let i = 0; i < tiles.length; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = margin + col * (tileW + 4);
    const ty = y + row * (tileH + 4);
    doc.setFillColor(COLOR_STRIPE);
    doc.setDrawColor(COLOR_BORDER);
    doc.roundedRect(x, ty, tileW, tileH, 3, 3, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(COLOR_MUTED);
    doc.text(tiles[i].label, x + 8, ty + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(tiles[i].color || COLOR_TEXT);
    doc.text(tiles[i].value, x + 8, ty + 34);
  }
  y += tileH * 2 + 14;

  // Top scorer line
  if (stats.topScorerName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(COLOR_TEXT);
    doc.text(
      `Top Scorer: ${stats.topScorerName} (Roll ${stats.topScorerRoll}) — ${stats.highestMarks} marks`,
      margin, y
    );
    y += 14;
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
        fontStyle: "bold",
      },
      bodyStyles: { fontSize: 9, textColor: COLOR_TEXT },
      alternateRowStyles: { fillColor: COLOR_STRIPE },
      styles: { cellPadding: 4, lineColor: COLOR_BORDER, lineWidth: 0.3 },
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

  const rows = results.map((r) => {
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
    return [
      r.roll,
      r.name || "—",
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
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 9, textColor: COLOR_TEXT },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: "bold" },
      3: { halign: "center" },
      4: { halign: "center" },
      5: { halign: "center", fontStyle: "bold" },
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
    styles: { cellPadding: 4, lineColor: COLOR_BORDER, lineWidth: 0.3 },
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
        fillColor: COLOR_FAIL,
        textColor: COLOR_HEADER_TEXT,
        fontSize: 9,
        fontStyle: "bold",
      },
      bodyStyles: { fontSize: 8.5, textColor: COLOR_TEXT },
      columnStyles: {
        0: { cellWidth: 55, fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: "#fef2f2" },
      styles: { cellPadding: 4, lineColor: "#fecaca", lineWidth: 0.3 },
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
      "GHS Babi Khel · District Mohmand · BISE Peshawar Results",
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
