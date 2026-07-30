// src/components/ReportCard/subjectMaxMarks.ts
// BISE Peshawar per-subject maximum marks for Class 9th / 10th (all groups —
// Science, Arts, Medical, Computer Science).
//
// Every subject is out of 75 marks EXCEPT these three, which are out of 50:
//   • Mutalia-e-Quran (or Nazira-e-Quran, for non-Muslim students it's
//     replaced by an equivalent — still treated as 50)
//   • Islamiyat
//   • Pak Study
//
// For a standard 9-subject exam (6 × 75 + 3 × 50) the correct total is
// 600 marks. The previous code assumed every subject was worth 100 marks
// (subjectCols.length * 100), which inflated the total to 900 (or showed
// 700 when only 7 subject columns were present in a given fetch) — wrong
// either way. This file fixes that by matching each subject's name against
// the 50-mark list (fuzzy, case-insensitive, tolerant of BISE's varying
// spellings) and defaulting everything else to 75.

/** Name fragments (lowercase) that identify a 50-mark subject.
 *  Matched with "includes" so we catch BISE's various spellings, e.g.:
 *    "Mutlaeh-e-Quran", "Mutalia-e-Quran", "Nazra-e-Quran", "Islamiyat (E)",
 *    "Islamiyat (C)", "Pak Study", "Pakistan Studies" */
const FIFTY_MARK_SUBJECT_PATTERNS: string[] = [
  "quran",       // Mutalia/Mutlaeh/Nazira/Nazra-e-Quran
  "islamiyat",   // Islamiyat (Elective) / (Compulsory)
  "islamic",     // fallback spelling: "Islamic Studies"
  "pak study",
  "pakistan stud", // "Pakistan Studies"
];

/** Returns the max marks for a single subject name, per BISE Peshawar rules. */
export function getSubjectMaxMarks(subjectName: string): number {
  const n = (subjectName || "").toLowerCase();
  const isFifty = FIFTY_MARK_SUBJECT_PATTERNS.some((pat) => n.includes(pat));
  return isFifty ? 50 : 75;
}

/** Sums max marks across a list of subject names (e.g. all subject columns
 *  for a given exam) to get the correct exam total — 600 for the standard
 *  9-subject Class 9th/10th exam (6 × 75 + 3 × 50). */
export function getMaxMarksForSubjects(subjectNames: string[]): number {
  return subjectNames.reduce((sum, name) => sum + getSubjectMaxMarks(name), 0);
}
