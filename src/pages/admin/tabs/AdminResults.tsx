import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Pencil, Trash2, Loader2, Upload, Search, Download, Hash, Eye, EyeOff, Timer, BarChart3, GitCompare, FileDown } from "lucide-react";
import { useEffect } from "react";
import toast from "react-hot-toast";
import { triggerConfetti } from "@/lib/confetti";
import { getGradeFromPercentage, getGradeColor, getPassThreshold, useGradingSchemes } from "@/hooks/useResultsEnhanced";
import * as XLSX from "xlsx";
import SubjectAnalyticsTab from "./SubjectAnalyticsTab";
import ExamComparisonTab from "./ExamComparisonTab";
import AdminDMCs from "./AdminDMCs";

// ── CSV row parser (RFC 4180-ish) ────────────────────────────────────────────
// Handles: quoted fields, commas inside quotes, escaped "" quotes, and both
// \n and \r\n line endings. Used by the Import CSV feature so that a field
// like `"Good, keep it up"` in the remarks column doesn't shift every column
// after it and corrupt the import (the bug the old naive split(",") had).
function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\n") {
        row.push(field); field = "";
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
  }
  // Push the final field/row if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-blank trailing rows.
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

const classes = ["6", "7", "8", "9", "10"];
const getExamTypes = (cls: string) =>
  ["9", "10"].includes(cls)
    ? ["Annual-I", "Annual-II"]
    : ["1st Semester", "2nd Semester"];

interface Student { id: string; full_name: string; roll_number: string; photo_url: string | null; }
interface ExamRollEntry {
  id: string; student_id: string; exam_roll_no: string; student_name: string; class: string;
  session_id: string;
  exam_roll_sessions?: { exam_year: number; exam_term: string; created_at: string; is_published: boolean } | null;
}

interface Result {
  id: string; student_id: string; class: string; exam_type: string; year: number;
  total_marks: number; obtained_marks: number; percentage: number; grade: string | null;
  position: number | null; is_pass: boolean; remarks: string | null;
  exam_roll_no: string | null; manual_pass_fail: boolean | null; created_at: string;
  is_published: boolean; publish_at: string | null;
  students?: { full_name: string; roll_number: string; photo_url: string | null } | null;
}

// ─── Subject lists per class group ───────────────────────────────────────────
const SUBJECTS_6_TO_8 = [
  "English", "Urdu", "Islamiyat", "M.Quran", "Geography",
  "Pashto", "Maths", "History", "G.Science", "Computer Science",
];
const SUBJECTS_9_TO_10 = [
  "English", "Urdu", "Pak-study", "Chemistry", "Physics",
  "Computer Science", "Biology", "Islamiyat", "M.Quran", "Mathematics",
];
const getSubjects = (cls: string) =>
  ["9", "10"].includes(cls) ? SUBJECTS_9_TO_10 : SUBJECTS_6_TO_8;
const DEFAULT_SUBJECT_MAX = 75;

const currentYear = new Date().getFullYear();

// ── Auto-publish countdown for results ───────────────────────────────────────
function ResultCountdownTimer({ targetDate, cls, examType, year, onPublished }: {
  targetDate: string; cls: string; examType: string; year: number; onPublished: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    const calc = async () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        if (!done) {
          setDone(true); setTimeLeft("");
          await supabase.from("results")
            .update({ is_published: true })
            .eq("class", cls).eq("exam_type", examType).eq("year", year)
            .eq("is_published", false);
          onPublished();
        }
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(d > 0 ? `${d}d ${h}h ${m}m ${s}s` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [targetDate, cls, examType, year, done, onPublished]);
  if (done || !timeLeft) return null;
  return (
    <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-500/30 rounded-xl px-4 py-2.5">
      <Timer className="w-4 h-4 text-blue-500 shrink-0 animate-pulse" />
      <div>
        <p className="text-xs text-blue-800 dark:text-blue-400 font-medium">Auto-publishes in</p>
        <p className="text-sm font-bold text-blue-900 dark:text-blue-300 font-mono">{timeLeft}</p>
      </div>
    </div>
  );
}

const AdminResults = () => {
  const qc = useQueryClient();
  const [cls, setCls] = useState("6");
  const examTypes = getExamTypes(cls);
  const [examType, setExamType] = useState(examTypes[0]);
  const [year, setYear] = useState(currentYear);
  const [subTab, setSubTab] = useState("results");

  // Load active grading scheme
  const { data: gradingSchemes = [] } = useGradingSchemes();
  const activeScheme = gradingSchemes.find((s: any) => s.is_active);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Result | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvProgress, setCsvProgress] = useState(0);

  // ── Countdown/auto-publish state ────────────────────────────────────────────
  const [showCountdown, setShowCountdown] = useState(false);
  const [cdDate, setCdDate] = useState("");
  const [cdTime, setCdTime] = useState("08:00");
  const [cdSaving, setCdSaving] = useState(false);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    student_id: "",
    student_name_manual: "",   // ✅ Manual name input
    total_marks: 100,
    obtained_marks: 0,
    remarks: "",
    exam_roll_no: "",          // ✅ Exam roll number field
    manual_pass_fail: null as boolean | null,  // ✅ null = auto, true/false = manual
    use_manual_pass: false,    // toggle for manual pass/fail
  });

  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  // Holds all exam roll numbers on record for the currently-selected student
  // (across every generated session), so the admin can pick the correct one
  // when more than one exists, instead of it being silently auto-chosen.
  const [availableRollsForStudent, setAvailableRollsForStudent] = useState<ExamRollEntry[]>([]);

  const [subjectMarks, setSubjectMarks] = useState<Record<string, { obtained: number; total: number; included: boolean; touched?: boolean }>>({});

  const initSubjectMarks = (cls: string) => {
    const subjects = getSubjects(cls);
    const init: Record<string, { obtained: number; total: number; included: boolean; touched?: boolean }> = {};
    subjects.forEach(s => { init[s] = { obtained: 0, total: DEFAULT_SUBJECT_MAX, included: true, touched: false }; });
    setSubjectMarks(init);
    // Recompute totals from only-included subjects
    const totalMax = Object.values(init).filter(m => m.included).reduce((s, m) => s + m.total, 0);
    const totalObtained = Object.values(init).filter(m => m.included).reduce((s, m) => s + m.obtained, 0);
    setForm(p => ({ ...p, total_marks: totalMax, obtained_marks: totalObtained }));
  };

  const setSubjectMark = (subject: string, field: "obtained" | "total", value: number) => {
    setSubjectMarks(prev => {
      const updated = { ...prev, [subject]: { ...prev[subject], [field]: value, ...(field === "obtained" ? { touched: true } : {}) } };
      const totalMax = Object.values(updated).filter(m => m.included).reduce((s, m) => s + m.total, 0);
      const totalObtained = Object.values(updated).filter(m => m.included).reduce((s, m) => s + m.obtained, 0);
      setForm(p => ({ ...p, total_marks: totalMax, obtained_marks: totalObtained }));
      return updated;
    });
  };

  // Toggle whether a subject/paper counts toward the total — use this when a
  // paper hasn't been given/skipped yet so it doesn't inflate the grand total.
  const toggleSubjectIncluded = (subject: string, included: boolean) => {
    setSubjectMarks(prev => {
      const updated = { ...prev, [subject]: { ...prev[subject], included } };
      const totalMax = Object.values(updated).filter(m => m.included).reduce((s, m) => s + m.total, 0);
      const totalObtained = Object.values(updated).filter(m => m.included).reduce((s, m) => s + m.obtained, 0);
      setForm(p => ({ ...p, total_marks: totalMax, obtained_marks: totalObtained }));
      return updated;
    });
  };

  const handleClassChange = (c: string) => {
    setCls(c);
    setExamType(getExamTypes(c)[0]);
    initSubjectMarks(c);
  };

  // ── Fetch students of selected class ────────────────────────────────────────
  const { data: students = [] } = useQuery<Student[]>({
    queryKey: ["admin-students-list", cls],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, roll_number, photo_url")
        .eq("class", cls).eq("is_active", true).order("roll_number");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Fetch exam roll numbers for selected class (from all published sessions) ──
  const { data: examRolls = [] } = useQuery<ExamRollEntry[]>({
    queryKey: ["exam-rolls-for-class", cls],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_roll_numbers")
        .select("id, student_id, exam_roll_no, student_name, class, session_id, exam_roll_sessions(exam_year, exam_term, created_at, is_published)")
        .eq("class", cls)
        .order("exam_roll_no", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ExamRollEntry[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Sort each student's roll numbers by session recency (latest published
  // session first) so that when a student has multiple exam roll numbers
  // from different "Generate Exam Roll Numbers" runs, we auto-fill the
  // most recent published one — not just whichever sorts first alphabetically.
  const examRollsForStudent = useCallback((studentId: string) => {
    return examRolls
      .filter(r => r.student_id === studentId)
      .sort((a, b) => {
        const aPub = a.exam_roll_sessions?.is_published ? 1 : 0;
        const bPub = b.exam_roll_sessions?.is_published ? 1 : 0;
        if (aPub !== bPub) return bPub - aPub; // published sessions first
        const aTime = a.exam_roll_sessions?.created_at || "";
        const bTime = b.exam_roll_sessions?.created_at || "";
        return bTime.localeCompare(aTime); // newest first
      });
  }, [examRolls]);

  // ── Fetch results ────────────────────────────────────────────────────────────
  const queryKey = ["admin-results", cls, examType, year];
  const { data: results = [], isLoading } = useQuery<Result[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        // ⚠️ `subject_marks` MUST be in this select list. Previously it was
        // missing, so when the admin clicked "Edit" on an existing result,
        // `r.subject_marks` was undefined and openEdit() fell through to
        // initSubjectMarks(r.class) — which initializes every subject to
        // {obtained:0, total:75, included:true, touched:false}. The form's
        // obtained_marks/total_marks are loaded from the saved DB row, so
        // they still showed the real totals (e.g. 325/750), but the
        // per-subject inputs appeared empty. The moment the admin saved
        // (even just to fix remarks), all 10 default 0/75 entries were
        // written back to the DB, wiping the real per-subject data while
        // the totals stayed correct — exactly the "0/75 for every subject"
        // bug seen on the User Dashboard Result Card.
        .select("id, student_id, class, exam_type, year, total_marks, obtained_marks, percentage, grade, position, is_pass, remarks, exam_roll_no, manual_pass_fail, created_at, is_published, publish_at, subject_marks, students(full_name, roll_number, photo_url)")
        .eq("class", cls).eq("exam_type", examType).eq("year", year)
        .order("percentage", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Result[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // ── Ranked + filtered results (deduplicated) ────────────────────────────────
  const rankedResults = useMemo(() => {
    // Deduplicate: if same student appears more than once, keep the latest (highest id)
    const seen = new Map<string, typeof results[0]>();
    for (const r of results) {
      if (!seen.has(r.student_id)) {
        seen.set(r.student_id, r);
      } else {
        // Keep whichever was created later (or has higher percentage)
        const existing = seen.get(r.student_id)!;
        if (r.percentage > existing.percentage || r.created_at > existing.created_at) {
          seen.set(r.student_id, r);
        }
      }
    }
    const deduped = Array.from(seen.values())
      .sort((a, b) => b.percentage - a.percentage);

    const filtered = search
      ? deduped.filter(r =>
          r.students?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
          r.students?.roll_number?.toLowerCase().includes(search.toLowerCase()) ||
          r.exam_roll_no?.includes(search)
        )
      : deduped;
    return filtered.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [results, search]);

  // ── Auto-calc percentage + grade ────────────────────────────────────────────
  const pct = form.total_marks > 0
    ? Math.round((form.obtained_marks / form.total_marks) * 100)
    : 0;
  const autoGrade = getGradeFromPercentage(pct);
  const passThreshold = getPassThreshold();
  const autoPass = pct >= passThreshold;
  // Final pass/fail: manual override wins if toggled ON
  const finalPass = form.use_manual_pass
    ? (form.manual_pass_fail ?? autoPass)
    : autoPass;

  // ── When student selected from dropdown → auto-fill exam roll ──────────────
  const handleStudentSelect = (studentId: string) => {
    setF("student_id", studentId);
    // If this student has multiple exam roll numbers, let the admin choose
    // instead of silently picking one for them.
    const rolls = examRollsForStudent(studentId);
    setAvailableRollsForStudent(rolls);
    if (rolls.length > 0) {
      setF("exam_roll_no", rolls[0].exam_roll_no);
    } else {
      setF("exam_roll_no", "");
    }
    // Auto-fill student name
    const student = students.find(s => s.id === studentId);
    if (student) {
      setF("student_name_manual", student.full_name);
    }
  };

  // ── When exam roll typed manually → auto-fill student ──────────────────────
  const handleExamRollInput = (val: string) => {
    setF("exam_roll_no", val);
    const roll = examRolls.find(r => r.exam_roll_no === val);
    if (roll) {
      setF("student_name_manual", roll.student_name);
      const student = students.find(s => s.id === roll.student_id);
      if (student) setF("student_id", student.id);
    }
  };

  // ── Open modals ─────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    initSubjectMarks(cls);
    setAvailableRollsForStudent([]);
    setForm({
      student_id: "", student_name_manual: "",
      total_marks: 100, obtained_marks: 0, remarks: "",
      exam_roll_no: "", manual_pass_fail: null, use_manual_pass: false,
    });
    setModalOpen(true);
  };

  const openEdit = (r: Result) => {
    setEditing(r);
    setAvailableRollsForStudent(examRollsForStudent(r.student_id));
    if ((r as any).subject_marks && typeof (r as any).subject_marks === "object") {
      const loaded = (r as any).subject_marks as Record<string, { obtained: number; total: number; included?: boolean }>;
      const withIncluded: Record<string, { obtained: number; total: number; included: boolean }> = {};
      Object.entries(loaded).forEach(([k, v]) => {
        withIncluded[k] = { obtained: v.obtained, total: v.total, included: v.included !== false, touched: true };
      });
      setSubjectMarks(withIncluded);
    } else {
      initSubjectMarks(r.class);
    }
    setForm({
      student_id: r.student_id,
      student_name_manual: r.students?.full_name || "",
      total_marks: r.total_marks,
      obtained_marks: r.obtained_marks,
      remarks: r.remarks || "",
      exam_roll_no: r.exam_roll_no || "",
      manual_pass_fail: r.manual_pass_fail ?? null,
      use_manual_pass: r.manual_pass_fail !== null,
    });
    setModalOpen(true);
  };

  // ── Save result ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.student_id && !form.student_name_manual.trim()) {
      toast.error("Select a student or enter a student name");
      return;
    }
    setSaving(true);

    const percentage = form.total_marks > 0
      ? Math.round((form.obtained_marks / form.total_marks) * 100)
      : 0;
    const g = getGradeFromPercentage(percentage);
    const pt = getPassThreshold();
    const isPass = form.use_manual_pass
      ? (form.manual_pass_fail ?? percentage >= pt)
      : percentage >= pt;

    // If no student_id but name given, try to find by name
    let studentId = form.student_id;
    if (!studentId && form.student_name_manual) {
      const match = students.find(s =>
        s.full_name.toLowerCase() === form.student_name_manual.toLowerCase()
      );
      if (match) studentId = match.id;
    }

    if (!studentId) {
      toast.error("Could not find student. Please select from the dropdown.");
      setSaving(false);
      return;
    }

    const payload = {
      student_id: studentId,
      class: cls,
      exam_type: examType,
      year,
      total_marks: form.total_marks,
      obtained_marks: form.obtained_marks,
      percentage,
      grade: g,
      is_pass: isPass,
      remarks: form.remarks || null,
      exam_roll_no: form.exam_roll_no.trim() || null,
      manual_pass_fail: form.use_manual_pass ? (form.manual_pass_fail ?? null) : null,
      subject_marks: (() => {
        // Only save subjects the admin actually touched. This prevents a
        // subtle data-loss bug: when openEdit() loads a result whose
        // subject_marks is null (e.g. CSV-imported rows), initSubjectMarks()
        // seeds every subject with {obtained:0, total:75, touched:false}. If
        // the admin then saves without typing any per-subject marks, the old
        // code wrote all 10 default 0/75 entries to the DB — silently
        // overwriting the real totals with zeros on the public Result Card.
        // Filtering by `touched` means: untouched defaults are dropped, real
        // edits are kept, and existing loaded subject_marks (which openEdit
        // marks as touched:true) are preserved on save even if the admin
        // doesn't re-type them.
        const touched = Object.fromEntries(
          Object.entries(subjectMarks)
            .filter(([, m]) => m.included && m.touched)
            .map(([k, m]) => [k, { obtained: m.obtained, total: m.total }])
        );
        return Object.keys(touched).length > 0 ? touched : null;
      })(),
    };

    let error: any = null;
    if (editing) {
      const res = await supabase.from("results").update(payload).eq("id", editing.id);
      error = res.error;
    } else {
      // Check if result already exists for this student+class+examType+year
      const { data: existing } = await supabase
        .from("results")
        .select("id")
        .eq("student_id", studentId)
        .eq("class", cls)
        .eq("exam_type", examType)
        .eq("year", year)
        .maybeSingle();
      if (existing) {
        toast.error("Result already exists for this student. Use the Edit (✏️) button to update it.");
        setSaving(false);
        return;
      }
      // Use upsert to prevent duplicates — if same student+class+examType+year exists, update it
      const res = await supabase.from("results").upsert(payload, {
        onConflict: "student_id,class,exam_type,year",
        ignoreDuplicates: false,
      });
      error = res.error;
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(editing ? "Result updated!" : "Result added! 🎉");
      triggerConfetti("burst");
      qc.invalidateQueries({ queryKey });
      setModalOpen(false);
    }
    setSaving(false);
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("results").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey }); },
  });

  // ── CSV import ──────────────────────────────────────────────────────────────
  const downloadCSVTemplate = () => {
    const csv = "student_name,class_roll_number,exam_roll_number,total_marks,obtained_marks,remarks\nAli Khan,001,100001,100,85,Good\nSara Ahmed,002,100002,100,72,";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "results_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportResultsExcel = () => {
    if (results.length === 0) { toast.error("No results to export"); return; }
    const wsData = [
      [`Results — Class ${cls} — ${examType} ${year}`],
      [],
      ["Rank", "Name", "Class Roll No", "Exam Roll No", "Total Marks", "Obtained Marks", "Percentage", "Grade", "Status", "Remarks"],
      ...rankedResults.map(r => [
        r.rank,
        r.students?.full_name || "—",
        r.students?.roll_number || "—",
        r.exam_roll_no || "—",
        r.total_marks,
        r.obtained_marks,
        `${r.percentage}%`,
        r.grade || "—",
        r.is_pass ? "PASS" : "FAIL",
        r.remarks || "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
    ws["!cols"] = [{ wch: 6 }, { wch: 25 }, { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Class${cls}-${examType}`);
    XLSX.writeFile(wb, `Results-Class${cls}-${examType}-${year}.xlsx`);
    toast.success("Results Excel file downloaded!");
  };

  const handleCSV = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true); setCsvProgress(0);
    const text = await file.text();

    // ── Proper CSV row parsing (fix: "Import CSV doesn't work" bug) ─────────
    // The old code did `line.split(",")`, which breaks as soon as any field
    // (most commonly "remarks") contains a comma - e.g. "Good, keep it up".
    // That shifts every column after it by one, so total_marks/obtained_marks
    // end up NaN and the row gets silently skipped (or worse, wrong data is
    // saved). parseCSVRows() below handles quoted fields (with embedded
    // commas and escaped "" quotes) and also copes with \r\n line endings.
    const rows = parseCSVRows(text);
    if (rows.length < 2) { toast.error("CSV is empty"); setCsvImporting(false); return; }

    const headers = rows[0].map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
    const nameIdx = headers.indexOf("student_name");
    const rollIdx = headers.indexOf("class_roll_number");
    const examRollIdx = headers.indexOf("exam_roll_number");
    const totalIdx = headers.indexOf("total_marks");
    const obtainedIdx = headers.indexOf("obtained_marks");
    const remarksIdx = headers.indexOf("remarks");

    if (totalIdx === -1 || obtainedIdx === -1) {
      toast.error("CSV must have total_marks and obtained_marks columns");
      setCsvImporting(false); return;
    }

    const dataLines = rows.slice(1).filter(cols => cols.some(c => c.trim() !== ""));
    let added = 0; let skipped = 0;

    for (let i = 0; i < dataLines.length; i++) {
      const cols = dataLines[i].map(s => s.trim());
      const studentName = nameIdx !== -1 ? cols[nameIdx] : "";
      const rollNumber = rollIdx !== -1 ? cols[rollIdx] : "";
      const examRollNo = examRollIdx !== -1 ? cols[examRollIdx] : "";
      const totalMarks = Number(cols[totalIdx]);
      const obtainedMarks = Number(cols[obtainedIdx]);
      const remarks = remarksIdx !== -1 ? cols[remarksIdx] || null : null;

      if (isNaN(totalMarks) || isNaN(obtainedMarks)) { skipped++; continue; }

      // Find student
      let student = rollNumber ? students.find(s => s.roll_number === rollNumber) : null;
      if (!student && studentName) {
        student = students.find(s => s.full_name.toLowerCase() === studentName.toLowerCase());
      }
      if (!student) { skipped++; setCsvProgress(Math.round(((i + 1) / dataLines.length) * 100)); continue; }

      const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;
      const g = getGradeFromPercentage(percentage);
      const csvPassThreshold = getPassThreshold();

      const { error } = await supabase.from("results").upsert({
        student_id: student.id, class: cls, exam_type: examType, year,
        total_marks: totalMarks, obtained_marks: obtainedMarks,
        percentage, grade: g, is_pass: percentage >= csvPassThreshold, remarks,
        exam_roll_no: examRollNo || null,
        // CSV import only provides totals, not a per-subject breakdown. If we
        // don't explicitly null this, upsert would silently keep whatever
        // subject_marks a previous manual edit left behind (e.g. all-zero
        // placeholders from an unfinished Add Result form), which then shows
        // up as a misleading "0/75 for every subject" on the public Result
        // Card even though the real total (411/750 etc.) is correct.
        subject_marks: null,
      }, { onConflict: "student_id,class,exam_type,year" });

      if (!error) added++; else skipped++;
      setCsvProgress(Math.round(((i + 1) / dataLines.length) * 100));
    }

    toast.success(`✅ ${added} results imported, ${skipped} skipped`);
    qc.invalidateQueries({ queryKey });
    setCsvImporting(false); setCsvProgress(0);
    if (csvRef.current) csvRef.current.value = "";
  }, [students, cls, examType, year, qc, queryKey]);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = results.length;
    const passed = results.filter(r => r.is_pass).length;
    const failed = total - passed;
    const avg = total > 0 ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / total) : 0;
    return { total, passed, failed, avg };
  }, [results]);

  // ────────────────────────────────────────────────────────────────────────────
  // If on a sub-tab, render the corresponding component
  if (subTab === "analytics") return <div className="space-y-4"><div className="flex items-center gap-3 mb-4"><Button variant="ghost" size="sm" onClick={() => setSubTab("results")} className="gap-1">← Back</Button><h2 className="text-xl font-heading font-bold text-foreground">Subject Analytics</h2></div><SubjectAnalyticsTab cls={cls} year={year} /></div>;
  if (subTab === "comparison") return <div className="space-y-4"><div className="flex items-center gap-3 mb-4"><Button variant="ghost" size="sm" onClick={() => setSubTab("results")} className="gap-1">← Back</Button><h2 className="text-xl font-heading font-bold text-foreground">Exam Comparison</h2></div><ExamComparisonTab cls={cls} year={year} /></div>;
  if (subTab === "report-cards") return <div className="space-y-4"><div className="flex items-center gap-3 mb-4"><Button variant="ghost" size="sm" onClick={() => setSubTab("results")} className="gap-1">← Back</Button><h2 className="text-xl font-heading font-bold text-foreground">DMCs</h2></div><AdminDMCs cls={cls} examType={examType} year={year} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-heading font-bold text-foreground">Manage Results</h2>
        {activeScheme && <Badge variant="outline" className="text-xs gap-1 border-green-300 text-green-600">Grading: {activeScheme.scheme_name}</Badge>}
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: "results", label: "Results", icon: null },
          { id: "analytics", label: "Analytics", icon: BarChart3 },
          { id: "comparison", label: "Compare Exams", icon: GitCompare },
          { id: "report-cards", label: "DMCs", icon: FileDown },
        ].map(tab => (
          <Button key={tab.id} variant={subTab === tab.id ? "default" : "outline"} size="sm" onClick={() => setSubTab(tab.id)} className="gap-1.5">
            {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Class tabs */}
      {/* Fix: on narrow/mobile screens the TabsList has no width constraint
          and no scrolling, so the last tab ("Class 10") was pushed off the
          right edge of the screen with no way to reach it. Wrapping in an
          overflow-x-auto container makes the strip scrollable instead of
          clipped; shrink-0 keeps each tab from being squeezed. */}
      <Tabs value={cls} onValueChange={handleClassChange}>
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="w-max min-w-full sm:w-auto">
            {classes.map(c => <TabsTrigger key={c} value={c} className="shrink-0">Class {c}</TabsTrigger>)}
          </TabsList>
        </div>
      </Tabs>

      {/* Exam type + year + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={examType} onValueChange={setExamType}>
          <TabsList>{examTypes.map(t => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}</TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Year:</span>
          <input
            type="number" value={year}
            onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1900 && v <= 2200) setYear(v); }}
            className="w-28 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring outline-none"
            min="1900" max="2200"
          />
        </div>
        <Button onClick={openAdd} size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Add Result</Button>
        {/* ── Publish / Unpublish all results for this class+exam+year ── */}
        {results.length > 0 && (() => {
          const allPublished = results.every(r => r.is_published);
          const anyPublished = results.some(r => r.is_published);
          const toggleAllPublish = async () => {
            const newVal = !allPublished;
            const { error } = await supabase.from("results")
              .update({ is_published: newVal })
              .eq("class", cls).eq("exam_type", examType).eq("year", year);
            if (error) { toast.error("Failed to update publish status"); return; }
            toast.success(newVal ? "✅ Results published! Students can now see them." : "Results unpublished");
            if (newVal) triggerConfetti("burst");
            qc.invalidateQueries({ queryKey });
          };
          return (
            <Button
              size="sm"
              onClick={toggleAllPublish}
              className={`gap-1.5 ${allPublished ? "bg-blue-500 hover:bg-blue-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"}`}
            >
              {allPublished ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {allPublished ? "Unpublish Results" : anyPublished ? "Publish All" : "Publish Results"}
            </Button>
          );
        })()}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowCountdown(v => !v)}>
          <Timer className="w-4 h-4" /> Schedule Publish
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => csvRef.current?.click()}>
          <Upload className="w-4 h-4" /> {csvImporting ? "Importing..." : "Import CSV"}
        </Button>
        <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadCSVTemplate}>
          <Download className="w-4 h-4" /> CSV Template
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportResultsExcel}>
          <Download className="w-4 h-4" /> Export Excel
        </Button>
      </div>

      {csvImporting && (
        <div className="space-y-1">
          <Progress value={csvProgress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">Importing... {csvProgress}%</p>
        </div>
      )}

      {/* ── Schedule auto-publish panel ── */}
      {showCountdown && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-2">
            <Timer className="w-4 h-4" /> Schedule Auto-Publish — {examType} {year}
          </p>
          <p className="text-xs text-blue-800 dark:text-blue-400">Results will auto-publish to students at the selected date & time</p>
          <div className="flex gap-3 flex-wrap">
            <div>
              <label className="text-xs font-medium text-foreground">Date</label>
              <input type="date" value={cdDate} onChange={e => setCdDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="block mt-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Time</label>
              <input type="time" value={cdTime} onChange={e => setCdTime(e.target.value)}
                className="block mt-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring outline-none" />
            </div>
            <div className="flex items-end gap-2">
              <Button
                size="sm"
                disabled={!cdDate || cdSaving}
                onClick={async () => {
                  if (!cdDate) { toast.error("Pick a date"); return; }
                  setCdSaving(true);
                  const publishAt = new Date(`${cdDate}T${cdTime}:00`).toISOString();
                  const { error } = await supabase.from("results")
                    .update({ publish_at: publishAt })
                    .eq("class", cls).eq("exam_type", examType).eq("year", year);
                  setCdSaving(false);
                  if (error) { toast.error("Failed to schedule"); return; }
                  toast.success(`✅ Class ${cls} scheduled!`);
                  qc.invalidateQueries({ queryKey });
                }}
                className="bg-blue-500 hover:bg-blue-700 text-white gap-1.5"
              >
                {cdSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Timer className="w-3.5 h-3.5" />}
                This Class Only
              </Button>
              <Button
                size="sm"
                disabled={!cdDate || cdSaving}
                onClick={async () => {
                  if (!cdDate) { toast.error("Pick a date"); return; }
                  setCdSaving(true);
                  const publishAt = new Date(`${cdDate}T${cdTime}:00`).toISOString();
                  // Schedule ALL classes for this exam type and year at once
                  const { error } = await supabase.from("results")
                    .update({ publish_at: publishAt })
                    .eq("exam_type", examType)
                    .eq("year", year)
                    .eq("is_published", false);
                  setCdSaving(false);
                  if (error) { toast.error("Failed to schedule all classes"); return; }
                  toast.success(`✅ ALL classes scheduled for ${examType} ${year}!`);
                  qc.invalidateQueries({ queryKey });
                }}
                className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
              >
                {cdSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Timer className="w-3.5 h-3.5" />}
                All Classes At Once
              </Button>
              <Button size="sm" variant="outline" onClick={async () => {
                // Clear schedule for this class
                await supabase.from("results").update({ publish_at: null }).eq("class", cls).eq("exam_type", examType).eq("year", year);
                toast.success("Schedule cleared for this class");
                qc.invalidateQueries({ queryKey });
              }}>Clear This</Button>
              <Button size="sm" variant="outline" onClick={async () => {
                // Clear ALL schedules for this exam type + year
                await supabase.from("results").update({ publish_at: null }).eq("exam_type", examType).eq("year", year);
                toast.success("Schedule cleared for all classes");
                qc.invalidateQueries({ queryKey });
              }}>Clear All</Button>
            </div>
          </div>
          {/* Live countdown display */}
          {results.length > 0 && results[0]?.publish_at && !results.every(r => r.is_published) && (
            <ResultCountdownTimer
              targetDate={results[0].publish_at}
              cls={cls} examType={examType} year={year}
              onPublished={() => { toast.success("🎉 Results auto-published!"); qc.invalidateQueries({ queryKey }); }}
            />
          )}
        </div>
      )}

      {/* Stats bar */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Students", value: stats.total, color: "text-primary" },
            { label: "Passed", value: stats.passed, color: "text-green-600" },
            { label: "Failed", value: stats.failed, color: "text-destructive" },
            { label: "Class Average", value: `${stats.avg}%`, color: "text-primary" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search name or roll no..."
          className="pl-9" value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Results table */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Photo</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Class Roll</TableHead>
              <TableHead>Exam Roll</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Obtained</TableHead>
              <TableHead>%</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rankedResults.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                    No results yet. Click "Add Result" to begin.
                  </TableCell>
                </TableRow>
              )}
              {rankedResults.map(r => (
                <TableRow key={r.id} className="hover:bg-secondary/50">
                  <TableCell className="font-bold text-primary">{r.rank}</TableCell>
                  <TableCell>
                    {r.students?.photo_url
                      ? <img src={r.students.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" loading="lazy" />
                      : <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                          {(r.students?.full_name || "S").charAt(0)}
                        </div>}
                  </TableCell>
                  <TableCell className="font-medium">{r.students?.full_name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.students?.roll_number || "—"}</TableCell>
                  <TableCell>
                    {r.exam_roll_no
                      ? <span className="font-mono font-bold text-primary text-sm">{r.exam_roll_no}</span>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell>{r.total_marks}</TableCell>
                  <TableCell>{r.obtained_marks}</TableCell>
                  <TableCell className="font-semibold">{r.percentage}%</TableCell>
                  <TableCell><Badge className={getGradeColor(r.grade || "Fail")}>{r.grade}</Badge></TableCell>
                  <TableCell>
                    <Badge
                      variant={r.is_pass ? "default" : "destructive"}
                      className={r.is_pass ? "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]" : ""}
                    >
                      {r.is_pass ? "Pass" : "Fail"}
                    </Badge>
                    {r.manual_pass_fail !== null && (
                      <span className="text-[10px] text-muted-foreground ml-1">(manual)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this result?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMut.mutate(r.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Result" : "Add Result"} — Class {cls} ({examType} {year})</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">

            {/* Student selector */}
            <div>
              <Label>Select Student from List</Label>
              <Select value={form.student_id} onValueChange={handleStudentSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose student (auto-fills name & exam roll)" />
                </SelectTrigger>
                <SelectContent>
                  {students.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.roll_number} — {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Selecting auto-fills name and exam roll number if generated
              </p>
            </div>

            {/* Student name — manual */}
            <div>
              <Label>Student Name *</Label>
              <Input
                value={form.student_name_manual}
                onChange={e => setF("student_name_manual", e.target.value)}
                placeholder="Type student name manually if needed"
              />
            </div>

            {/* Exam Roll Number */}
            <div>
              <Label className="flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-primary" />
                Exam Roll Number
              </Label>
              <Input
                value={form.exam_roll_no}
                onChange={e => handleExamRollInput(e.target.value)}
                placeholder="e.g. 100001 (auto-filled from dropdown)"
                className="font-mono"
              />

              {availableRollsForStudent.length > 1 && (
                <div className="mt-2 border border-blue-200 bg-blue-50 dark:bg-blue-950/20 rounded-lg p-2.5 space-y-1.5">
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-300">
                    This student has {availableRollsForStudent.length} exam roll numbers — choose which one to use:
                  </p>
                  {availableRollsForStudent.map(roll => {
                    const term = roll.exam_roll_sessions?.exam_term;
                    const yr = roll.exam_roll_sessions?.exam_year;
                    const published = roll.exam_roll_sessions?.is_published;
                    const isSelected = form.exam_roll_no === roll.exam_roll_no;
                    return (
                      <button
                        key={roll.id}
                        type="button"
                        onClick={() => setF("exam_roll_no", roll.exam_roll_no)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                          isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-secondary"
                        }`}
                      >
                        <span className="font-mono font-bold">{roll.exam_roll_no}</span>
                        <span className={`text-xs ${isSelected ? "opacity-90" : "text-muted-foreground"}`}>
                          {term ? `${term} ${yr || ""}` : "session unknown"}{!published && " · unpublished"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {examRolls.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {examRolls.length} exam roll number{examRolls.length > 1 ? "s" : ""} on record for Class {cls} (across all generated sessions).
                </p>
              )}
              {examRolls.length === 0 && (
                <p className="text-xs text-blue-700 mt-1">
                  No exam roll numbers generated for Class {cls} yet. Generate them in Exam Roll Numbers section.
                </p>
              )}
            </div>

            {/* Subject-wise Marks */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="bg-primary/10 px-4 py-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Subject-wise Marks</span>
                <span className="text-xs text-muted-foreground">Totals auto-calculate</span>
              </div>
              <p className="text-xs text-muted-foreground px-4 py-1.5 bg-secondary/30 border-b border-border">
                Uncheck a subject if that paper hasn't been given yet — it will be excluded from the Grand Total.
              </p>
              <div className="divide-y divide-border max-h-64 overflow-y-auto">
                <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 px-4 py-1.5 bg-secondary/60 text-xs font-bold text-muted-foreground">
                  <span></span><span>Subject</span><span className="text-center">Obtained</span><span className="text-center">Max</span>
                </div>
                {getSubjects(cls).map(subject => {
                  const sm = subjectMarks[subject] || { obtained: 0, total: DEFAULT_SUBJECT_MAX, included: true, touched: false };
                  return (
                    <div key={subject} className={`grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-2 px-4 py-1.5 ${!sm.included ? "opacity-40" : ""}`}>
                      <input
                        type="checkbox"
                        checked={sm.included}
                        onChange={e => toggleSubjectIncluded(subject, e.target.checked)}
                        title="Include this subject's marks in the total"
                        className="w-4 h-4 accent-primary shrink-0"
                      />
                      <span className="text-sm font-medium text-foreground truncate">{subject}</span>
                      <Input
                        type="number" min={0} max={sm.total}
                        value={sm.touched ? sm.obtained : ""}
                        placeholder="—"
                        disabled={!sm.included}
                        onChange={e => setSubjectMark(subject, "obtained", e.target.value === "" ? 0 : Number(e.target.value))}
                        className="h-7 text-sm text-center px-1"
                      />
                      <Input
                        type="number" min={1}
                        value={sm.total}
                        disabled={!sm.included}
                        onChange={e => setSubjectMark(subject, "total", Number(e.target.value))}
                        className="h-7 text-sm text-center px-1"
                      />
                    </div>
                  );
                })}
              </div>
              <div className="bg-secondary/50 px-4 py-2 flex justify-between text-sm font-bold border-t border-border">
                <span className="text-foreground">Grand Total</span>
                <span className="text-primary">{form.obtained_marks} / {form.total_marks}</span>
              </div>
            </div>

            {/* Grand total summary — read-only */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Total Marks</Label>
                <Input type="number" value={form.total_marks} readOnly className="bg-muted font-mono" />
              </div>
              <div>
                <Label>Obtained Marks</Label>
                <Input type="number" value={form.obtained_marks} readOnly className="bg-muted font-mono" />
              </div>
            </div>

            {/* Auto-calculated result preview */}
            <div className="bg-secondary/50 rounded-xl p-3 flex flex-wrap items-center gap-3">
              <div className="text-sm">
                <span className="text-muted-foreground">Percentage: </span>
                <span className="font-bold text-foreground">{pct}%</span>
              </div>
              <Badge className={getGradeColor(autoGrade)}>{autoGrade}</Badge>
              <Badge
                variant={finalPass ? "default" : "destructive"}
                className={finalPass ? "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]" : ""}
              >
                {finalPass ? "✅ Pass" : "❌ Fail"}
              </Badge>
            </div>

            {/* Manual Pass/Fail override */}
            <div className="border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">Manual Pass/Fail Override</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Turn ON to manually set pass or fail (overrides auto calculation)
                  </p>
                </div>
                <Switch
                  checked={form.use_manual_pass}
                  onCheckedChange={v => setF("use_manual_pass", v)}
                />
              </div>

              {form.use_manual_pass && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setF("manual_pass_fail", true)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                      form.manual_pass_fail === true
                        ? "bg-green-500 text-white border-green-500"
                        : "border-border text-muted-foreground hover:border-green-400"
                    }`}
                  >
                    ✅ PASS
                  </button>
                  <button
                    onClick={() => setF("manual_pass_fail", false)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                      form.manual_pass_fail === false
                        ? "bg-red-500 text-white border-red-500"
                        : "border-border text-muted-foreground hover:border-red-400"
                    }`}
                  >
                    ❌ FAIL
                  </button>
                </div>
              )}
            </div>

            {/* Remarks */}
            <div>
              <Label>Remarks (Optional)</Label>
              <Textarea
                rows={2}
                value={form.remarks}
                onChange={e => setF("remarks", e.target.value)}
                placeholder="Any notes about this result"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Saving..." : editing ? "Update Result" : "Add Result"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminResults;
