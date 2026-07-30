// src/components/ReportCard/generateExcel.ts
// Generates a styled, colored Excel workbook (.xlsx) with the bulk results,
// using ExcelJS (already a project dependency) so we get real cell fills,
// fonts, borders and column widths — not just plain SheetJS text.
//
// Per the user's spec:
//   • No "Generated" timestamp, no Found / Not Found / Errors rows
//   • PDF-like clean header, but Excel shows EVERY paper's marks per student
//   • Each student's row includes Total, Percentage, Grade, Status
//   • Colors used sparingly: header bands, PASS/FAIL cell fills, alt-row stripes
//
// Structure:
//   Sheet 1 "Summary" — school header + key stats + subject-wise pass rate
//   Sheet 2 "Results" — one row per student, one column per subject
//                       (theory + practical), plus Total / % / Grade / Status

import ExcelJS from "exceljs";
import type { ExamSelection, NormalizedResult, ResultStats } from "./types";

const COLOR_HEADER_BG = "FF1E293B"; // slate-800 (ARGB)
const COLOR_HEADER_TEXT = "FFFFFFFF";
const COLOR_SUBHEADER_BG = "FFE2E8F0"; // slate-200
const COLOR_STRIPE = "FFF8FAFC"; // slate-50
const COLOR_PASS_BG = "FFDCFCE7"; // green-100
const COLOR_PASS_TEXT = "FF15803D"; // green-700
const COLOR_FAIL_BG = "FFFEE2E2"; // red-100
const COLOR_FAIL_TEXT = "FFB91C1C"; // red-700
const COLOR_BORDER = "FFCBD5E1"; // slate-300
const COLOR_TITLE_TEXT = "FF0F172A"; // slate-900

export function excelFileName(sel: ExamSelection): string {
  const safe = (s: string) => s.replace(/[^a-z0-9-]/gi, "_");
  return `GHS_BabiKhel_${safe(sel.className)}_${safe(sel.examType)}_${safe(sel.year)}.xlsx`;
}

/** Build the subject column headers from the union of all subjects across
 *  students. Different students may have different subject sets (rare but
 *  possible — e.g. science vs humanities group), so we union them. */
function buildSubjectColumns(results: NormalizedResult[]): string[] {
  const set = new Set<string>();
  for (const r of results) {
    for (const s of r.subjects) {
      if (s.name) set.add(s.name);
    }
  }
  return Array.from(set).sort();
}

/** A subject has a practical component only if at least one student actually
 *  has a non-null practical mark for it. Most subjects (English, Urdu, Math,
 *  Islamiyat, Pak Study, Quran, etc.) have NO practical — only lab subjects
 *  like Biology, Chemistry, Physics, Computer Science do. BISE returns an
 *  empty practical string for subjects without one, which normalize.ts
 *  parses to null — so we key off that instead of guessing by name. */
function subjectsWithPractical(results: NormalizedResult[]): Set<string> {
  const set = new Set<string>();
  for (const r of results) {
    for (const s of r.subjects) {
      if (s.name && s.practical !== null && s.practical !== undefined) {
        set.add(s.name);
      }
    }
  }
  return set;
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: COLOR_BORDER } },
  left: { style: "thin", color: { argb: COLOR_BORDER } },
  bottom: { style: "thin", color: { argb: COLOR_BORDER } },
  right: { style: "thin", color: { argb: COLOR_BORDER } },
};

export async function generateResultExcel(
  results: NormalizedResult[],
  stats: ResultStats,
  sel: ExamSelection
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "GHS Babi Khel";
  wb.created = new Date();

  // ══════════════════════════ Sheet 1: Summary ══════════════════════════
  const ws1 = wb.addWorksheet("Summary", {
    views: [{ showGridLines: false }],
  });
  ws1.columns = [
    { width: 30 }, { width: 16 }, { width: 12 }, { width: 12 },
  ];

  // Title block (centered, merged across 4 cols)
  ws1.mergeCells("A1:D1");
  const titleCell = ws1.getCell("A1");
  titleCell.value = "GHS Babi Khel, District Mohmand";
  titleCell.font = { size: 16, bold: true, color: { argb: COLOR_TITLE_TEXT } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(1).height = 26;

  ws1.mergeCells("A2:D2");
  const subCell = ws1.getCell("A2");
  subCell.value = `Class ${sel.className}  ·  ${sel.examType}  ·  ${sel.year}`;
  subCell.font = { size: 11, color: { argb: "FF64748B" } };
  subCell.alignment = { horizontal: "center", vertical: "middle" };

  ws1.mergeCells("A3:D3");
  const boardCell = ws1.getCell("A3");
  boardCell.value = "BISE Peshawar";
  boardCell.font = { size: 11, color: { argb: "FF64748B" } };
  boardCell.alignment = { horizontal: "center", vertical: "middle" };

  ws1.addRow([]);

  // Stat tiles as a small table
  const statHeaderRow = ws1.addRow(["Metric", "Value", "", ""]);
  ws1.mergeCells(`B${statHeaderRow.number}:D${statHeaderRow.number}`);
  statHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR_HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });

  const statRows: [string, string | number, string?][] = [
    ["Total Students", stats.totalStudents],
    ["Passed", stats.passCount],
    ["Failed", stats.failCount],
    ["Pass Percentage", `${stats.passPercentage}%`],
    ["Average Marks", stats.averageMarks],
    ["Highest Marks", stats.highestMarks],
    ["Lowest Marks", stats.lowestMarks],
    ["Top Scorer", stats.topScorerName ? `${stats.topScorerName} (Roll ${stats.topScorerRoll})` : "—"],
  ];
  for (const [label, value] of statRows) {
    const row = ws1.addRow([label, value, "", ""]);
    ws1.mergeCells(`B${row.number}:D${row.number}`);
    const labelCell = row.getCell(1);
    const valueCell = row.getCell(2);
    labelCell.font = { color: { argb: COLOR_TITLE_TEXT } };
    labelCell.alignment = { horizontal: "left", vertical: "middle" };
    labelCell.border = thinBorder;
    valueCell.font = { bold: true, color: { argb: COLOR_TITLE_TEXT } };
    valueCell.alignment = { horizontal: "center", vertical: "middle" };
    valueCell.border = thinBorder;
    if (label === "Passed") {
      valueCell.font = { bold: true, color: { argb: COLOR_PASS_TEXT } };
    } else if (label === "Failed") {
      valueCell.font = { bold: true, color: { argb: COLOR_FAIL_TEXT } };
    }
    if (row.number % 2 === 0) {
      labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_STRIPE } };
      valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_STRIPE } };
    }
  }

  ws1.addRow([]);

  // Subject-wise pass rate mini-table
  const subjTitleRow = ws1.addRow(["Subject-wise Pass Rate", "", "", ""]);
  ws1.mergeCells(`A${subjTitleRow.number}:D${subjTitleRow.number}`);
  subjTitleRow.getCell(1).font = { bold: true, size: 12, color: { argb: COLOR_TITLE_TEXT } };

  const subjHeaderRow = ws1.addRow(["Subject", "Pass", "Fail", "Pass %"]);
  subjHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR_HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });

  let subjRowIdx = 0;
  for (const [name, c] of Object.entries(stats.subjectPassRates)) {
    const row = ws1.addRow([name, c.pass, c.fail, `${c.rate}%`]);
    row.eachCell((cell, colNum) => {
      cell.alignment = { horizontal: colNum === 1 ? "left" : "center", vertical: "middle" };
      cell.border = thinBorder;
      cell.font = { color: { argb: COLOR_TITLE_TEXT } };
      if (subjRowIdx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_STRIPE } };
      }
    });
    subjRowIdx++;
  }

  // ══════════════════════════ Sheet 2: Results ══════════════════════════
  const subjectCols = buildSubjectColumns(results);
  const practicalSubjects = subjectsWithPractical(results);
  const ws2 = wb.addWorksheet("Results", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });

  // Per user's request: just Name, Roll Number, each subject's marks
  // (Practical shown ONLY for subjects that actually have one — Biology,
  // Chemistry, Physics, Computer Science — not every subject), and Total
  // Marks. No Max Marks / Percentage / Grade / Status / Failed Papers.
  const header: string[] = ["Roll No", "Name"];
  for (const subj of subjectCols) {
    header.push(subj);
    if (practicalSubjects.has(subj)) {
      header.push(`${subj} (Practical)`);
    }
  }
  header.push("Total Marks");

  const headerRow = ws2.addRow(header);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR_HEADER_TEXT }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
  });

  // Column widths
  const colWidths: number[] = [10, 20];
  for (const subj of subjectCols) {
    colWidths.push(11);
    if (practicalSubjects.has(subj)) colWidths.push(11);
  }
  colWidths.push(12);
  ws2.columns = colWidths.map((w) => ({ width: w }));

  let dataRowIdx = 0;
  for (const r of results) {
    let rowValues: (string | number)[];

    if (!r.found) {
      rowValues = [r.roll, "—"];
      for (const subj of subjectCols) {
        rowValues.push("—");
        if (practicalSubjects.has(subj)) rowValues.push("—");
      }
      rowValues.push("—");
    } else {
      rowValues = [r.roll, r.name || "—"];
      for (const subj of subjectCols) {
        const s = r.subjects.find((x) => x.name === subj);
        const t = s?.theory ?? "—";
        rowValues.push(s?.theoryFail ? `${t} (F)` : t);
        if (practicalSubjects.has(subj)) {
          const p = s?.practical ?? "—";
          rowValues.push(s?.practicalFail ? `${p} (F)` : p);
        }
      }
      rowValues.push(r.totalMarks > 0 ? r.totalMarks : "—");
    }

    const row = ws2.addRow(rowValues);
    row.eachCell((cell, colNum) => {
      cell.border = thinBorder;
      cell.font = { size: 9.5, color: { argb: COLOR_TITLE_TEXT } };
      cell.alignment = { horizontal: colNum <= 2 ? "left" : "center", vertical: "middle" };
      if (dataRowIdx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_STRIPE } };
      }
    });

    dataRowIdx++;
  }

  ws2.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: header.length },
  };

  // ══════════════════════════ Save ══════════════════════════
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = excelFileName(sel);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
