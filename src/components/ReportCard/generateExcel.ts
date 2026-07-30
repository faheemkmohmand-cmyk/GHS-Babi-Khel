// src/components/ReportCard/generateExcel.ts
// Generates an Excel workbook (.xlsx) with the bulk results.
//
// Per the user's spec:
//   • PDF shows only totals
//   • Excel shows EVERY paper's marks for each student
//
// Structure:
//   Sheet 1 "Summary" — overall stats + pass-rate per subject
//   Sheet 2 "Results" — one row per student, one column per subject
//                       (theory + practical sub-columns), plus Total / Status
//
// Uses the existing `xlsx` package (SheetJS) already in package.json.

import * as XLSX from "xlsx";
import type { ExamSelection, NormalizedResult, ResultStats } from "./types";

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

export function generateResultExcel(
  results: NormalizedResult[],
  stats: ResultStats,
  sel: ExamSelection
): void {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ──
  const summaryRows: (string | number)[][] = [
    ["GHS Babi Khel, District Mohmand"],
    [`Class ${sel.className}  ·  ${sel.examType}  ·  ${sel.year}`],
    ["BISE Peshawar — Bulk Result Report"],
    [`Generated: ${new Date().toLocaleString("en-PK")}`],
    [],
    ["Metric", "Value"],
    ["Total Students", stats.totalStudents],
    ["Found", stats.foundCount],
    ["Not Found", stats.notFoundCount],
    ["Errors", stats.errorCount],
    ["Passed", stats.passCount],
    ["Failed", stats.failCount],
    ["Pass Percentage", `${stats.passPercentage}%`],
    ["Average Marks", stats.averageMarks],
    ["Highest Marks", stats.highestMarks],
    ["Lowest Marks (passes only)", stats.lowestMarks],
    ["Top Scorer", stats.topScorerName ? `${stats.topScorerName} (Roll ${stats.topScorerRoll})` : ""],
    [],
    ["Subject-wise Pass Rate"],
    ["Subject", "Pass", "Fail", "Pass %"],
  ];
  for (const [name, c] of Object.entries(stats.subjectPassRates)) {
    summaryRows.push([name, c.pass, c.fail, `${c.rate}%`]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws1["!cols"] = [{ wch: 32 }, { wch: 12 }, { wch: 8 }, { wch: 8 }];
  // Merge the title rows for a cleaner look
  ws1["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Summary");

  // ── Sheet 2: Results (every paper's marks) ──
  const subjectCols = buildSubjectColumns(results);
  // Header: Roll | Name | Father | [subject1 Theory | subject1 Practical | ...] | Total | Grade | Status | Failed Papers
  const header: string[] = ["Roll No", "Name", "Father Name"];
  for (const subj of subjectCols) {
    header.push(`${subj} (Theory)`);
    header.push(`${subj} (Practical)`);
  }
  header.push("Total Marks");
  header.push("Grade");
  header.push("Status");
  header.push("Failed Papers");

  const dataRows: (string | number)[][] = results.map((r) => {
    if (!r.found) {
      const row: (string | number)[] = [r.roll, "—", "—"];
      for (let i = 0; i < subjectCols.length * 2; i++) row.push("—");
      row.push("—", "—", "Not Found", r.error || "");
      return row;
    }
    const row: (string | number)[] = [r.roll, r.name || "—", r.fatherName || "—"];
    for (const subj of subjectCols) {
      const s = r.subjects.find((x) => x.name === subj);
      // Mark failed papers with a "F" suffix for visibility
      const t = s?.theory ?? "—";
      const p = s?.practical ?? "—";
      row.push(s?.theoryFail ? `${t} (F)` : t);
      row.push(s?.practicalFail ? `${p} (F)` : p);
    }
    row.push(r.totalMarks > 0 ? r.totalMarks : "—");
    row.push(r.grade || (r.isFail ? "F" : "—"));
    row.push(r.isFail ? `FAIL (${r.failedSubjectCount} sub)` : "PASS");
    const failedPapers = r.subjects
      .filter((s) => s.isFail)
      .map((s) => {
        const parts: string[] = [];
        if (s.theoryFail) parts.push("Theory");
        if (s.practicalFail) parts.push("Practical");
        return `${s.name} (${parts.join(" + ")})`;
      })
      .join(", ");
    row.push(failedPapers || "");
    return row;
  });

  const ws2 = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  // Column widths: Roll 10, Name 22, Father 22, each subject pair 10/10, Total 8, Grade 6, Status 14, Failed 40
  const cols: { wch: number }[] = [
    { wch: 10 }, { wch: 22 }, { wch: 22 },
    ...subjectCols.flatMap(() => [{ wch: 11 }, { wch: 11 }]),
    { wch: 8 }, { wch: 6 }, { wch: 14 }, { wch: 40 },
  ];
  ws2["!cols"] = cols;
  XLSX.utils.book_append_sheet(wb, ws2, "Results");

  XLSX.writeFile(wb, excelFileName(sel));
}
