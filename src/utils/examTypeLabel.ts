// src/utils/examTypeLabel.ts
//
// Classes 9 & 10 store their exam_type in the database as "Annual-I" /
// "Annual-II" (unchanged — this keeps old and new records matching
// correctly). This helper maps those internal values to the label shown
// to users: "Mid-Term" / "Final-Term".
//
// Classes 6-8 ("1st Semester" / "2nd Semester") are NOT touched — they
// pass through unchanged.
//
// Use this ONLY for display (JSX text, PDF/Excel labels, dropdown option
// text). Never use it for .eq("exam_type", ...) queries, localStorage
// keys, or anything read back into the database — those must keep using
// the raw "Annual-I" / "Annual-II" values.

const DISPLAY_LABELS: Record<string, string> = {
  "Annual-I": "Mid-Term",
  "Annual-II": "Final-Term",
};

/** Converts an internal exam_type value to its user-facing label.
 *  Passes through unrecognized values (e.g. "1st Semester") unchanged. */
export function examTypeLabel(examType: string): string {
  return DISPLAY_LABELS[examType] ?? examType;
}

/** Same as examTypeLabel, but also swaps "Annual-I"/"Annual-II" substrings
 *  inside longer strings (e.g. "1st Term (Semester I / Annual-I)"). */
export function examTypeLabelInText(text: string): string {
  return text
    .replace(/Annual-II/g, "Final-Term")
    .replace(/Annual-I/g, "Mid-Term");
}
