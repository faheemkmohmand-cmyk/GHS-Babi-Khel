/**
 * AdminExamRollNumbers.tsx
 * Combined Admin tab — Exam Roll Numbers + Exam Attendance (merged).
 * Generates roll numbers with real QR codes, manages exam attendance with scan support.
 * Mobile-friendly: cards on mobile, table on desktop.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  Hash, Plus, Trash2, Eye, EyeOff, Loader2, ChevronUp, ChevronDown, Download, RefreshCw,
  ArrowLeft, Timer, Clock, QrCode, ClipboardCheck, Search, Camera, Check, X, Palmtree,
  CalendarDays, BookOpen, Users, FileSpreadsheet, ScanLine, CheckCircle2, AlertCircle,
  Keyboard, History, FileText, Lock,
} from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { triggerConfetti } from "@/lib/confetti";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import {
  encodeExamQRData, decodeExamQRData,
  useExamSessions as useAttExamSessions,
  useExamRollNumbers as useAttExamRollNumbers,
  useExamAttendance, useExamAttendanceOverview,
  useInitExamAttendance, useScanExamAttendance, useScanSeatingAttendance,
  useUpdateExamAttendance,
  useDeleteExamAttendance, useDeleteClassExamAttendance, EXAM_SUBJECTS,
  ExamAttStatus, ExamAttendanceRecord,
  getPaperWindowStatus, canMarkExamAttendance, paperWindowMessage,
  usePaperTimesFromSeatingPlan, formatLocalDate,
} from "@/hooks/useExamAttendance";
import { decodeSeatingQRData } from "@/hooks/useExamSeating";

// ── Real QR Code generation using `qrcode` npm package ─────────────────────────
const qrCache = new Map<string, string>();
async function getQRDataURL(sessionId: string, studentId: string, examRollNo: string): Promise<string> {
  const key = `${sessionId}-${studentId}-${examRollNo}`;
  if (qrCache.has(key)) return qrCache.get(key)!;
  const data = encodeExamQRData(sessionId, studentId, examRollNo);
  const url = await QRCode.toDataURL(data, {
    width: 200, margin: 1, errorCorrectionLevel: "M",
    color: { dark: "#333333", light: "#FFFFFF" },
  });
  qrCache.set(key, url);
  return url;
}

// Single QR for attendance scan
async function generateSingleQR(data: string): Promise<string> {
  return QRCode.toDataURL(data, { width: 200, margin: 1, errorCorrectionLevel: "M" });
}

interface ExamSession {
  id: string; title: string; exam_year: number; exam_term: string;
  classes: string[]; class_order: string[]; starting_number: number;
  is_published: boolean; publish_at: string | null;
  countdown_label: string | null; created_at: string;
}
interface ExamRollEntry {
  id: string; session_id: string; student_id: string; student_name: string;
  father_name: string | null; class: string; class_roll_no: string;
  exam_roll_no: string; serial_number: number;
}
interface Student {
  id: string; full_name: string; roll_number: string; class: string; father_name: string | null;
}

/**
 * Sorts students by roll_number the way a human expects: numerically
 * ("2" before "10"), not lexicographically like a plain string sort or a
 * DB ORDER BY on a text column (which would put "10" before "2"). This
 * keeps a class's student order stable across Generate/Update regardless
 * of whether roll numbers are zero-padded ("01") or not ("1").
 */
function sortByRollNumber(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    const na = parseInt(a.roll_number, 10);
    const nb = parseInt(b.roll_number, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true });
  });
}

/**
 * Interleaves students round-robin across classes, following classOrder.
 * E.g. classOrder ["10","9","8","7","6"] with 2 students each produces:
 * 10th-1, 9th-1, 8th-1, 7th-1, 6th-1, 10th-2, 9th-2, 8th-2, 7th-2, 6th-2.
 * A class with fewer students is simply skipped once it's exhausted —
 * the remaining classes keep cycling.
 */
function interleaveByClassOrder(classOrder: string[], studentsPerClass: Record<string, Student[]>): Student[] {
  const result: Student[] = [];
  const maxLen = Math.max(0, ...classOrder.map(cls => studentsPerClass[cls]?.length ?? 0));
  for (let round = 0; round < maxLen; round++) {
    for (const cls of classOrder) {
      const student = studentsPerClass[cls]?.[round];
      if (student) result.push(student);
    }
  }
  return result;
}

/** Fisher-Yates shuffle — returns a new array, doesn't mutate the input. */
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const ALL_CLASSES = ["6", "7", "8", "9", "10"];
const TERMS = ["1st Semester", "2nd Semester", "Annual-I", "Annual-II", "Annual"];

type Status = ExamAttStatus;
const statusConfig: Record<Status, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  present: { icon: <Check className="w-4 h-4" />, label: "Present", color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700/50" },
  absent:  { icon: <X className="w-4 h-4" />, label: "Absent",  color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700/50" },
  leave:   { icon: <Palmtree className="w-4 h-4" />, label: "Leave",  color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700/50" },
};

// ── Countdown display component ──────────────────────────────────────────────
function CountdownTimer({ targetDate, label }: { targetDate: string; label: string }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const calc = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("Publishing now..."); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${d}d ${h}h ${m}m ${s}s`);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [targetDate]);

  return (
    <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl px-4 py-2.5">
      <Timer className="w-4 h-4 text-blue-500 shrink-0" />
      <div>
        <p className="text-xs text-blue-800 dark:text-blue-400 font-medium">{label || "Roll numbers publish in"}</p>
        <p className="text-sm font-bold text-blue-900 dark:text-blue-300 font-mono">{timeLeft}</p>
      </div>
    </div>
  );
}

// ── Camera QR Scanner component (html5-qrcode) ──────────────────────────────────
function QRScanner({ onScan, enabled }: { onScan: (data: string) => void; enabled: boolean }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerIdRef = useRef(`admin-qr-reader-${Math.random().toString(36).slice(2)}`);
  // ── SCAN COOLDOWN (camera stays open, ready for the NEXT student) ──
  // Previously onScan() was immediately followed by stop(), closing the
  // camera after every single scan and forcing the admin to tap "Scan QR"
  // again for each student. Now the camera stays running continuously; we
  // only guard against the SAME code re-firing repeatedly while it's still
  // in view (the decode callback fires ~10x/sec per frame).
  const lastScanRef = useRef<{ code: string; time: number } | null>(null);
  const SCAN_COOLDOWN_MS = 2000;

  const handleDecoded = useCallback((decodedText: string) => {
    const now = Date.now();
    const last = lastScanRef.current;
    if (last && last.code === decodedText && now - last.time < SCAN_COOLDOWN_MS) {
      return; // same code re-detected while still in view — ignore
    }
    lastScanRef.current = { code: decodedText, time: now };
    onScan(decodedText);
  }, [onScan]);

  const stop = useCallback(async () => {
    const inst = scannerRef.current;
    if (inst) {
      try { if ((inst as any).isScanning) await inst.stop(); } catch {}
      try { await inst.clear(); } catch {}
      scannerRef.current = null;
    }
    lastScanRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    // Explicitly request camera permission first — Android Chrome requires
    // getUserMedia to be called from a user gesture before Html5Qrcode can
    // access the camera. Without this, html5-qrcode throws "Camera access failed".
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      stream.getTracks().forEach(t => t.stop()); // release; html5-qrcode will re-open
    } catch (permErr: any) {
      const msg = permErr?.name === "NotAllowedError"
        ? "Camera permission denied. Please allow camera access in your browser settings and try again."
        : permErr?.message || "Camera access failed";
      setError(msg);
      return;
    }
    setActive(true);
    // Wait 500ms for DOM to render AND for camera hardware to fully release
    // on mobile Chrome. 80ms was too short — the camera was still occupied
    // when html5-qrcode tried to re-acquire it, causing "Camera access failed".
    await new Promise(r => setTimeout(r, 500));

    const attemptStart = async (): Promise<void> => {
      const qr = new Html5Qrcode(containerIdRef.current);
      scannerRef.current = qr;
      await qr.start(
        { facingMode: "environment" },
        { fps: 15, qrbox: { width: 220, height: 220 } },
        handleDecoded,
        () => {}
      );
    };

    try {
      await attemptStart();
    } catch (e: any) {
      // Retry once after a short delay — camera may still be releasing on some devices
      try {
        await new Promise(r => setTimeout(r, 800));
        await attemptStart();
      } catch (retryErr: any) {
        const retryMsg = retryErr?.message || "Camera access failed";
        // Provide user-friendly guidance
        if (retryMsg.includes("Camera access failed") || retryMsg.includes("NotAllowedError")) {
          setError("Camera access failed. Please: 1) Allow camera permission in Chrome settings, 2) Make sure no other app is using the camera, 3) Try again.");
        } else {
          setError(retryMsg);
        }
        setActive(false);
      }
    }
  }, [handleDecoded]);

  // ── AUTO-START (removes the redundant double-click) ──
  // Previously the admin had to click "Scan QR" to reveal this component,
  // then click ANOTHER "Scan QR Code" button inside it to actually start
  // the camera. Since clicking "Scan QR" outside is already a user gesture
  // (satisfies mobile Chrome's getUserMedia-requires-gesture rule), we can
  // start the camera immediately when this component mounts.
  useEffect(() => {
    if (enabled) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { stop(); }, [stop]);

  return (
    <div className="space-y-3">
      {!active ? (
        <Button onClick={start} disabled={!enabled} className="gap-2 w-full bg-emerald-500 hover:bg-emerald-600 text-white" size="lg">
          <Camera className="w-5 h-5" /> {error ? "Retry Camera" : "Starting Camera…"}
        </Button>
      ) : (
        <div className="space-y-3">
          <div id={containerIdRef.current} className="w-full rounded-xl bg-black border-2 border-emerald-400/50" style={{ minHeight: 250 }} />
          <p className="text-[11px] text-center text-muted-foreground">Camera stays open — just point it at the next student's QR/desk sticker.</p>
          <Button onClick={stop} variant="outline" className="w-full gap-1.5">
            <X className="w-4 h-4" /> Close Scanner
          </Button>
        </div>
      )}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl p-3 text-sm text-red-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
const AdminExamRollNumbers = () => {
  const qc = useQueryClient();
  // Main tab: "rolls" or "attendance"
  const [mainTab, setMainTab] = useState<"rolls" | "attendance">("rolls");
  // Roll numbers sub-views
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedSession, setSelectedSession] = useState<ExamSession | null>(null);

  // Create form
  const [formTitle, setFormTitle] = useState("");
  const [formYear, setFormYear] = useState(new Date().getFullYear());
  const [formTerm, setFormTerm] = useState("1st Semester");
  const [selectedClasses, setSelectedClasses] = useState<string[]>(["6", "7", "8"]);
  const [classOrder, setClassOrder] = useState<string[]>(["6", "7", "8"]);
  const [startingNumber, setStartingNumber] = useState(100000);
  const [generating, setGenerating] = useState(false);
  const [updatingStudents, setUpdatingStudents] = useState(false);

  // Countdown form
  const [countdownDate, setCountdownDate] = useState("");
  const [countdownTime, setCountdownTime] = useState("08:00");
  const [countdownLabel, setCountdownLabel] = useState("Exam Roll Numbers will be published in");
  const [savingCountdown, setSavingCountdown] = useState(false);

  const [detailSearch, setDetailSearch] = useState("");

  // ── ATTENDANCE STATE ────────────────────────────────────────────────────
  const [attSession, setAttSession] = useState<string>("");
  const [attClass, setAttClass] = useState<string>("");  // "" | "6".."10" | "all"
  const [attSubject, setAttSubject] = useState<string>("");
  // All-Classes mode: per-class subject map. Key = class, value = subject.
  // Each class has its OWN paper (e.g. Class 8 takes Mathematics while
  // Class 7 takes English at the same time), so the admin picks a subject
  // for each class in one screen, then scans/enters attendance for any
  // student from any class — the saved row uses the student's actual
  // class + that class's selected subject.
  const [allClassSubjects, setAllClassSubjects] = useState<Record<string, string>>({});
  const [attDate, setAttDate] = useState<string>(formatLocalDate(new Date()));
  const [attTab, setAttTab] = useState<"scan" | "overview">("scan");
  const [attSearch, setAttSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── SAME-PAPER-DIFFERENT-DATE SAFEGUARD ─────────────────────────────────
  // Fetches every DISTINCT (class, subject, exam_date) already recorded for
  // this session, regardless of attDate. Used to warn the admin BEFORE they
  // init/mark attendance if the class+subject they're about to use already
  // has attendance on a DIFFERENT date — which almost always means the date
  // picker is on the wrong day (e.g. still on "today" when the intended
  // paper was actually initialized a few days ago), and proceeding would
  // silently create a brand-new column instead of updating the existing
  // paper's attendance, exactly the "Mathematics appears 3 times" bug.
  const { data: existingPaperDates = [] } = useQuery<Array<{ class: string; subject: string; exam_date: string }>>({
    queryKey: ["exam-attendance-paper-dates", attSession],
    queryFn: async () => {
      if (!attSession) return [];
      const { data, error } = await supabase
        .from("exam_attendance")
        .select("class, subject, exam_date")
        .eq("session_id", attSession);
      if (error) throw error;
      const seen = new Set<string>();
      const out: Array<{ class: string; subject: string; exam_date: string }> = [];
      for (const r of data ?? []) {
        const normDate = String(r.exam_date).slice(0, 10);
        const key = `${r.class}__${r.subject}__${normDate}`;
        if (!seen.has(key)) { seen.add(key); out.push({ class: r.class, subject: r.subject, exam_date: normDate }); }
      }
      return out;
    },
    enabled: !!attSession,
    staleTime: 60 * 1000,
  });

  /**
   * Returns the OTHER date(s) this class+subject already has attendance on
   * (excluding attDate itself), or an empty array if none / all dates match.
   */
  const findConflictingDates = (cls: string, subject: string): string[] => {
    return existingPaperDates
      .filter(r => r.class === cls && r.subject === subject && r.exam_date !== attDate)
      .map(r => r.exam_date);
  };

  // Scan state
  const [manualRoll, setManualRoll] = useState<string>("");
  const [qrInput, setQrInput] = useState<string>("");
  const [scanLog, setScanLog] = useState<{ name: string; roll: string; time: string; status: string }[]>([]);
  const [showScanner, setShowScanner] = useState(false);

  const isAllClassesMode = attClass === "all";

  // ── DATA QUERIES ────────────────────────────────────────────────────────
  const { data: sessions = [], isLoading: loadingSessions } = useQuery<ExamSession[]>({
    queryKey: ["exam-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exam_roll_sessions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rollNumbers = [], isLoading: loadingRolls } = useQuery<ExamRollEntry[]>({
    queryKey: ["exam-rolls", selectedSession?.id],
    queryFn: async () => {
      if (!selectedSession) return [];
      const { data, error } = await supabase.from("exam_roll_numbers").select("*").eq("session_id", selectedSession.id).order("serial_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedSession,
  });

  // Attendance data
  const { data: attSessions = [] } = useAttExamSessions();
  const availableClasses = useMemo(() => {
    const s = attSessions.find((s: any) => s.id === attSession);
    return s?.classes ?? [];
  }, [attSessions, attSession]);

  // ── ALL-CLASSES MODE: fetch ALL roll numbers for the session (no class filter).
  // Used when attClass === "all" so the admin sees students from every class
  // in one list. Each student's `class` field is preserved so attendance is
  // saved to the right sheet.
  const { data: allRollNumbers = [], isLoading: loadingAllRolls } = useQuery<ExamRollEntry[]>({
    queryKey: ["exam-rolls-all-classes", attSession],
    queryFn: async () => {
      if (!attSession) return [];
      const { data, error } = await supabase
        .from("exam_roll_numbers")
        .select("*")
        .eq("session_id", attSession)
        .order("class", { ascending: true })
        .order("serial_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAllClassesMode && !!attSession,
    staleTime: 2 * 60 * 1000,
  });

  // Single-class roll numbers (used when attClass is a real class).
  // Always called (Rules of Hooks), but only enabled when not in All-Classes mode.
  const singleClassRollsQuery = useAttExamRollNumbers(
    !isAllClassesMode ? attSession : undefined,
    !isAllClassesMode ? attClass : undefined
  );

  // In All-Classes mode, use the full session list. Otherwise use the
  // class-filtered list.
  const attRollNumbers = isAllClassesMode ? allRollNumbers : (singleClassRollsQuery.data ?? []);
  const loadingRollsForAtt = isAllClassesMode ? loadingAllRolls : singleClassRollsQuery.isLoading;

  // ── ALL-CLASSES MODE: fetch attendance for ALL classes + ALL selected subjects.
  // In All-Classes mode, we don't have a single subject — each class has its
  // own. We fetch ALL attendance rows for the session+date and filter
  // client-side by the per-class subjects. This is one query (not N) so it's
  // fast even for big sessions.
  const { data: allClassesAttendance = [], isLoading: loadingAllClassesAtt } = useQuery<ExamAttendanceRecord[]>({
    queryKey: ["exam-attendance-all-classes", attSession, attDate],
    queryFn: async () => {
      if (!attSession || !attDate) return [];
      const { data, error } = await supabase
        .from("exam_attendance")
        .select("*")
        .eq("session_id", attSession)
        .eq("exam_date", attDate)
        .order("class_roll_no", { ascending: true });
      if (error) throw error;
      // DEDUPE: collapse any duplicate rows so stats aren't inflated.
      return data ?? [];
    },
    enabled: isAllClassesMode && !!attSession && !!attDate,
    staleTime: 30 * 1000,
  });

  // In All-Classes mode, the "attendance" we display is filtered to only
  // the rows whose subject matches the per-class selected subject. In
  // single-class mode, we use the regular useExamAttendance hook.
  const { data: singleClassAttendance = [], isLoading: loadingSingleClassAtt } = useExamAttendance(
    !isAllClassesMode ? attSession : undefined,
    !isAllClassesMode ? attClass : undefined,
    !isAllClassesMode ? attSubject : undefined,
    !isAllClassesMode ? attDate : undefined
  );

  const attendance: ExamAttendanceRecord[] = useMemo(() => {
    if (isAllClassesMode) {
      // Filter to only rows whose (class, subject) matches a selected
      // per-class subject. This shows the admin exactly the attendance
      // they're managing right now.
      return allClassesAttendance.filter(r => {
        const subj = allClassSubjects[r.class];
        return subj && r.subject === subj;
      });
    }
    return singleClassAttendance;
  }, [isAllClassesMode, allClassesAttendance, allClassSubjects, singleClassAttendance]);

  const loadingAtt = isAllClassesMode ? loadingAllClassesAtt : loadingSingleClassAtt;

  const { data: overviewData = [], isLoading: loadingOverview } = useExamAttendanceOverview(attTab === "overview" ? attSession : undefined, attTab === "overview" ? (isAllClassesMode ? "all" : attClass) : undefined);

  const initAttendance = useInitExamAttendance();
  const scanAttendance = useScanExamAttendance();
  const scanSeatingAttendance = useScanSeatingAttendance();
  const updateAttendance = useUpdateExamAttendance();
  const deleteAttendance = useDeleteExamAttendance();
  // New (Problem 1 fix): wipes ALL attendance for a class — every subject,
  // every date. Used by the "Delete All Class Attendance" button in the
  // All-Classes Class Overview.
  const deleteClassAttendance = useDeleteClassExamAttendance();

  // ── ROLL NUMBER HANDLERS ────────────────────────────────────────────────
  const toggleClass = useCallback((cls: string) => {
    setSelectedClasses(prev => {
      const next = prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls];
      setClassOrder(ord => {
        const filtered = ord.filter(c => next.includes(c));
        const added = next.filter(c => !filtered.includes(c));
        return [...filtered, ...added];
      });
      return next;
    });
  }, []);

  const moveClass = useCallback((cls: string, dir: "up" | "down") => {
    setClassOrder(prev => {
      const idx = prev.indexOf(cls);
      if (idx === -1) return prev;
      const next = [...prev];
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }, []);

  const handleGenerate = async () => {
    if (!formTitle.trim()) { toast.error("Enter a session title"); return; }
    if (selectedClasses.length === 0) { toast.error("Select at least one class"); return; }
    if (startingNumber < 100000 || startingNumber > 999999) { toast.error("Starting number must be 6 digits"); return; }
    setGenerating(true);
    try {
      const studentsPerClass: Record<string, Student[]> = {};
      for (const cls of classOrder) {
        if (!selectedClasses.includes(cls)) continue;
        const { data, error } = await supabase.from("students").select("id, full_name, roll_number, class, father_name").eq("class", cls).eq("is_active", true);
        if (error) throw error;
        studentsPerClass[cls] = sortByRollNumber(data ?? []);
      }
      const orderedStudents: Student[] = interleaveByClassOrder(classOrder.filter(c => selectedClasses.includes(c)), studentsPerClass);
      if (orderedStudents.length === 0) { toast.error("No active students found"); setGenerating(false); return; }

      const { data: sessionData, error: sessionError } = await supabase.from("exam_roll_sessions").insert({
        title: formTitle.trim(), exam_year: formYear, exam_term: formTerm,
        classes: selectedClasses, class_order: classOrder.filter(c => selectedClasses.includes(c)),
        starting_number: startingNumber, is_published: false,
      }).select().single();
      if (sessionError) throw sessionError;

      const rows = orderedStudents.map((s, idx) => ({
        session_id: sessionData.id, student_id: s.id, student_name: s.full_name,
        father_name: s.father_name, class: s.class, class_roll_no: s.roll_number,
        exam_roll_no: String(startingNumber + idx), serial_number: idx + 1,
      }));
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from("exam_roll_numbers").insert(rows.slice(i, i + 100));
        if (error) throw error;
      }
      toast.success(`Generated ${rows.length} exam roll numbers!`);
      triggerConfetti("burst");
      qc.invalidateQueries({ queryKey: ["exam-sessions"] });
      setSelectedSession(sessionData);
      setView("detail");
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    }
    setGenerating(false);
  };

  const handleUpdateStudents = async (session: ExamSession) => {
    setUpdatingStudents(true);
    try {
      // Re-pull each class's CURRENT active students. The session's saved
      // class_order and starting_number are reused as-is, so the exam-roll
      // SEQUENCE (which class's turn comes 1st/2nd/3rd... in the round-robin)
      // never changes. But within each class, students are randomly
      // reshuffled every time Update is clicked — so the exact student who
      // lands in a given class's slot changes, even if the class roster
      // itself didn't change.
      const studentsPerClass: Record<string, Student[]> = {};
      for (const cls of session.class_order) {
        const { data, error } = await supabase.from("students").select("id, full_name, roll_number, class, father_name").eq("class", cls).eq("is_active", true);
        if (error) throw error;
        studentsPerClass[cls] = shuffleArray(data ?? []);
      }
      const orderedStudents: Student[] = interleaveByClassOrder(session.class_order, studentsPerClass);
      if (orderedStudents.length === 0) { toast.error("No active students found"); setUpdatingStudents(false); return; }

      const rows = orderedStudents.map((s, idx) => ({
        session_id: session.id, student_id: s.id, student_name: s.full_name,
        father_name: s.father_name, class: s.class, class_roll_no: s.roll_number,
        exam_roll_no: String(session.starting_number + idx), serial_number: idx + 1,
      }));

      // Replace old rows for this session with the freshly-pulled ones,
      // keeping the same starting number and class order (i.e. the same
      // exam-roll sequence) — only the student in each slot can change.
      const { error: delError } = await supabase.from("exam_roll_numbers").delete().eq("session_id", session.id);
      if (delError) throw delError;
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from("exam_roll_numbers").insert(rows.slice(i, i + 100));
        if (error) throw error;
      }
      toast.success(`Updated — ${rows.length} students refreshed`);
      qc.invalidateQueries({ queryKey: ["exam-rolls", session.id] });
      qc.invalidateQueries({ queryKey: ["exam-rolls-all-classes"] });
      qc.invalidateQueries({ queryKey: ["exam-sessions"] });
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    }
    setUpdatingStudents(false);
  };

  const togglePublish = async (session: ExamSession) => {
    const { error } = await supabase.from("exam_roll_sessions").update({ is_published: !session.is_published }).eq("id", session.id);
    if (error) { toast.error("Failed"); return; }
    toast.success(session.is_published ? "Unpublished" : "Published!");
    if (!session.is_published) triggerConfetti("burst");
    qc.invalidateQueries({ queryKey: ["exam-sessions"] });
    if (selectedSession?.id === session.id) setSelectedSession({ ...session, is_published: !session.is_published });
  };

  const saveCountdown = async (session: ExamSession) => {
    if (!countdownDate) { toast.error("Pick a date for countdown"); return; }
    setSavingCountdown(true);
    const publishAt = new Date(`${countdownDate}T${countdownTime}:00`).toISOString();
    const { error } = await supabase.from("exam_roll_sessions").update({
      publish_at: publishAt, countdown_label: countdownLabel,
    }).eq("id", session.id);
    setSavingCountdown(false);
    if (error) { toast.error("Failed to save countdown"); return; }
    toast.success("Countdown set!");
    qc.invalidateQueries({ queryKey: ["exam-sessions"] });
    if (selectedSession?.id === session.id) setSelectedSession({ ...session, publish_at: publishAt, countdown_label: countdownLabel });
  };

  const clearCountdown = async (session: ExamSession) => {
    const { error } = await supabase.from("exam_roll_sessions").update({ publish_at: null }).eq("id", session.id);
    if (error) { toast.error("Failed"); return; }
    toast.success("Countdown removed");
    qc.invalidateQueries({ queryKey: ["exam-sessions"] });
    if (selectedSession?.id === session.id) setSelectedSession({ ...session, publish_at: null });
  };

  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exam_roll_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["exam-sessions"] }); if (view === "detail") setView("list"); },
    onError: () => toast.error("Delete failed"),
  });

  const downloadCSV = () => {
    if (!selectedSession || rollNumbers.length === 0) return;
    const header = "Serial No,Exam Roll No,Student Name,Father Name,Class,Class Roll No\n";
    const rows = rollNumbers.map(r => `${r.serial_number},${r.exam_roll_no},"${r.student_name}","${r.father_name || ""}",${r.class},${r.class_roll_no}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `exam-rollnumbers-${selectedSession.title}-${selectedSession.exam_year}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("CSV Downloaded!");
  };

  // ── Professional Admit Card PDF (4 per A4) ─────────────────────────────
  const downloadPrint = async () => {
    if (!selectedSession || rollNumbers.length === 0) return;

    const genToast = toast.loading("Generating professional admit cards with QR codes...");

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const margin = 8;

    // 2 columns × 2 rows = 4 slips per A4
    const cols = 2;
    const rows = 2;
    const gapX = 4;
    const gapY = 4;
    const slipW = (pageW - margin * 2 - gapX) / cols;
    const slipH = (pageH - margin * 2 - gapY) / rows;

    // Sort by class order
    const ordered: ExamRollEntry[] = [];
    for (const cls of selectedSession.class_order) {
      const group = rollNumbers.filter(r => r.class === cls).sort((a, b) => a.serial_number - b.serial_number);
      ordered.push(...group);
    }

    // Pre-generate all QR code images
    const qrImages = new Map<string, string>();
    for (const slip of ordered) {
      const qrData = encodeExamQRData(selectedSession.id, slip.student_id, slip.exam_roll_no);
      const qrDataURL = await QRCode.toDataURL(qrData, { width: 300, margin: 1, errorCorrectionLevel: "M", color: { dark: "#333333", light: "#FFFFFF" } });
      qrImages.set(slip.id, qrDataURL);
    }

    const drawSlip = (slip: ExamRollEntry, x: number, y: number) => {
      const w = slipW;
      const h = slipH;

      // ── OUTER BORDER — light professional ──
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.5);
      doc.rect(x, y, w, h, "S");

      // ── TOP HEADER — clean white with double-line accent ──
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.6);
      doc.line(x, y + 16, x + w, y + 16);
      doc.setLineWidth(0.25);
      doc.line(x, y + 17, x + w, y + 17);

      // School name — centered, dark text on white
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("GOVT. HIGH SCHOOL BABI KHEL", x + w / 2, y + 7, { align: "center" });

      // Subtitle
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      doc.text("EXAMINATION ADMIT CARD", x + w / 2, y + 12.5, { align: "center" });

      // ── CONTENT AREA ──
      const contentY = y + 19;

      // QR Code — positioned on right side
      const qrImg = qrImages.get(slip.id);
      const qrSize = 26;
      const qrX = x + w - qrSize - 4;
      const qrY = contentY + 3;
      if (qrImg) {
        // QR border — light gray
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, 1, 1, "S");
        doc.addImage(qrImg, "PNG", qrX, qrY, qrSize, qrSize);
        // "Scan for attendance" label
        doc.setFontSize(4.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(140, 140, 140);
        doc.text("Scan for Attendance", qrX + qrSize / 2, qrY + qrSize + 3, { align: "center" });
      }

      // Left side info
      const leftX = x + 5;
      const infoW = qrX - leftX - 4;

      // Exam Roll Number — big and prominent
      doc.setFillColor(250, 250, 250);
      doc.roundedRect(leftX, contentY, infoW, 14, 2, 2, "F");
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.roundedRect(leftX, contentY, infoW, 14, 2, 2, "S");

      doc.setTextColor(120, 120, 120);
      doc.setFontSize(4.5);
      doc.setFont("helvetica", "normal");
      doc.text("EXAM ROLL NUMBER", leftX + infoW / 2, contentY + 4.5, { align: "center" });
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(slip.exam_roll_no, leftX + infoW / 2, contentY + 11, { align: "center" });

      // Student details
      let detailY = contentY + 18;
      const drawDetailRow = (label: string, value: string, yy: number) => {
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120, 120, 120);
        doc.text(label, leftX, yy);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40, 40, 40);
        const valStr = value.length > 24 ? value.slice(0, 22) + "..." : value;
        doc.text(valStr, leftX + 22, yy);
        // Thin line
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.15);
        doc.line(leftX, yy + 1.5, leftX + infoW, yy + 1.5);
        return yy + 5.5;
      };

      detailY = drawDetailRow("Student Name:", slip.student_name, detailY);
      detailY = drawDetailRow("Father Name:", (slip.father_name || "—"), detailY);
      detailY = drawDetailRow("Class:", `Class ${slip.class}`, detailY);
      detailY = drawDetailRow("Class Roll No:", slip.class_roll_no, detailY);
      detailY = drawDetailRow("Session:", `${selectedSession!.exam_term} ${selectedSession!.exam_year}`, detailY);

      // ── FOOTER — clean white with double-line accent ──
      const footerY = y + h - 9;
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.25);
      doc.line(x, footerY - 1.5, x + w, footerY - 1.5);
      doc.setLineWidth(0.6);
      doc.line(x, footerY, x + w, footerY);
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(4.5);
      doc.setFont("helvetica", "bold");
      doc.text("GHS BABI KHEL  |  DISTRICT MOHMAND  |  KPK", x + w / 2, footerY + 4, { align: "center" });
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(3.8);
      doc.setFont("helvetica", "normal");
      doc.text("Bring this admit card to the examination hall. Keep it safe.", x + w / 2, footerY + 7, { align: "center" });
    };

    let slipIdx = 0;
    for (const slip of ordered) {
      const posOnPage = slipIdx % (cols * rows);
      if (posOnPage === 0 && slipIdx > 0) {
        doc.addPage();
      }
      const col = posOnPage % cols;
      const row = Math.floor(posOnPage / cols);
      const sx = margin + col * (slipW + gapX);
      const sy = margin + row * (slipH + gapY);
      drawSlip(slip, sx, sy);
      slipIdx++;
    }

    doc.save(`AdmitCards-${selectedSession.title}-${selectedSession.exam_year}.pdf`);
    toast.dismiss(genToast);
    toast.success(`${ordered.length} professional admit cards with QR codes downloaded!`);
  };

  const filteredRolls = detailSearch
    ? rollNumbers.filter(r => r.student_name.toLowerCase().includes(detailSearch.toLowerCase()) || r.exam_roll_no.includes(detailSearch) || r.class_roll_no.includes(detailSearch) || r.class.includes(detailSearch))
    : rollNumbers;

  // ── ATTENDANCE COMPUTED ────────────────────────────────────────────────
  const isInitialized = attendance.length > 0;
  const firstAttRecord = attendance[0];

  // Paper times: in single-class mode, fetch for the one selected subject —
  // and CRITICALLY filter by attClass, so this only ever matches a seating
  // plan that actually covers this class. Without this, two plans running
  // the same day with different end times (e.g. 6th/7th ending 1:35 PM,
  // 8th/9th/10th ending 2 PM) can be mismatched — a class-6 lookup could
  // accidentally pick up the 8/9/10 plan's times (or find no match at all
  // if the subject differs), locking a class whose paper is actually running.
  // In All-Classes mode, fetch for EACH class's selected subject and merge —
  // the window is OPEN if ANY class's paper is in progress.
  const singleClassPaperTimesQuery = usePaperTimesFromSeatingPlan(
    !isAllClassesMode ? attSession : undefined,
    !isAllClassesMode ? attSubject : undefined,
    !isAllClassesMode ? attDate : undefined,
    !isAllClassesMode ? attClass : undefined
  );

  // All-Classes mode: one query per possible class (Rules of Hooks forbid
  // calling hooks in a loop with a dynamic count, so we always call 5 — one
  // per class 6..10). Each query is enabled only if (a) we're in
  // All-Classes mode AND (b) a subject is selected for that class. Unused
  // queries are no-ops. Each is also class-filtered to its own class, same
  // reasoning as above.
  const ALL_POSSIBLE_CLASSES = ["6", "7", "8", "9", "10"];
  const classPaperTimesQueries = ALL_POSSIBLE_CLASSES.map(cls =>
    usePaperTimesFromSeatingPlan(
      isAllClassesMode && allClassSubjects[cls] ? attSession : undefined,
      isAllClassesMode ? (allClassSubjects[cls] || undefined) : undefined,
      isAllClassesMode ? attDate : undefined,
      isAllClassesMode ? cls : undefined
    )
  );

  // Index the queries by class for easy lookup.
  const classPaperTimesByClass = useMemo(() => {
    const map: Record<string, { start: string; end: string; planId: string } | null> = {};
    ALL_POSSIBLE_CLASSES.forEach((cls, i) => {
      map[cls] = classPaperTimesQueries[i].data ?? null;
    });
    return map;
  }, [classPaperTimesQueries]);

  // Merge: in All-Classes mode, the window is OPEN if ANY class's paper is
  // in progress. We also need paper times for display.
  const seatingPaperTimes = useMemo(() => {
    if (isAllClassesMode) {
      // Find ANY class with paper times set. For display, show the earliest
      // start and latest end across all classes (so the admin sees the full
      // window span).
      const allTimes = Object.values(classPaperTimesByClass)
        .filter((t): t is { start: string; end: string; planId: string } => !!t);
      if (allTimes.length === 0) return null;
      const start = allTimes.reduce((min, t) => t.start < min ? t.start : min, allTimes[0].start);
      const end   = allTimes.reduce((max, t) => t.end   > max ? t.end   : max, allTimes[0].end);
      return { start, end, planId: allTimes[0].planId };
    }
    return singleClassPaperTimesQuery.data ?? null;
  }, [isAllClassesMode, classPaperTimesByClass, singleClassPaperTimesQuery.data]);

  const [attNowTick, setAttNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAttNowTick(Date.now()), 15 * 1000);
    return () => clearInterval(id);
  }, []);

  const attWindowStatus = useMemo(
    () => getPaperWindowStatus(
      attDate,
      firstAttRecord?.paper_start_time,
      firstAttRecord?.paper_end_time,
      seatingPaperTimes,
      new Date(attNowTick)
    ),
    [attDate, firstAttRecord?.paper_start_time, firstAttRecord?.paper_end_time, seatingPaperTimes, attNowTick]
  );
  const canMarkAtt = canMarkExamAttendance(attWindowStatus);
  const attDisplayPaperStart = firstAttRecord?.paper_start_time || seatingPaperTimes?.start || null;
  const attDisplayPaperEnd = firstAttRecord?.paper_end_time || seatingPaperTimes?.end || null;

  const attMap = useMemo(() => {
    const map = new Map<string, ExamAttendanceRecord>();
    attendance.forEach(r => map.set(r.student_id, r));
    return map;
  }, [attendance]);

  const mergedList = useMemo(() => {
    return attRollNumbers.map(r => ({
      ...r,
      attRecord: attMap.get(r.student_id) || null,
      status: attMap.get(r.student_id)?.status || ("absent" as Status),
    }));
  }, [attRollNumbers, attMap]);

  const attFiltered = attSearch
    ? mergedList.filter(s => s.student_name.toLowerCase().includes(attSearch.toLowerCase()) || s.exam_roll_no.includes(attSearch) || s.class_roll_no.includes(attSearch))
    : mergedList;

  const attStats = useMemo(() => {
    const present = attendance.filter(r => r.status === "present").length;
    const absent = attendance.filter(r => r.status === "absent").length;
    const leave = attendance.filter(r => r.status === "leave").length;
    return { present, absent, leave, total: attendance.length };
  }, [attendance]);

  const overviewPivot = useMemo(() => {
    if (!overviewData.length) return { students: [], columns: [] as { key: string; subject: string; date: string }[], grid: {} as Record<string, Record<string, Status>> };
    // ── SUBJECT-ONLY GROUPING (rev. 12 — Problem 2 fix) ─────────────────────
    // Previously columns were keyed by `${subject}__${normalizedDate}`, which
    // meant re-initializing the same subject on a different date created a
    // SECOND column ("Mathematics 2026-07-05" + "Mathematics 2026-07-06").
    // The screenshot showed "Mathematics" appearing twice in Class 6's
    // overview — exactly this bug.
    //
    // Fix: key columns by SUBJECT ONLY. For each (student, subject), keep
    // the row with the LATEST timestamp (scanned_at || created_at) so the
    // displayed status reflects the most recent attendance taken. The
    // column header shows the subject name + the LATEST date any student
    // has for that subject, so the admin can still see "this paper was
    // last taken on date X".
    //
    // Combined with useInitExamAttendance now REPLACING (not appending)
    // rows for the same subject, this guarantees one column per subject
    // forever — no more "Mathematics twice".
    const normalizeDate = (raw: string | null | undefined): string => {
      if (!raw) return "—";
      const s = String(raw).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return s.slice(0, 10);
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
      return s;
    };

    // Column key = SUBJECT ONLY (no date). One column per subject.
    // Track the latest date per subject for display in the header.
    const subjectLatestDate = new Map<string, string>(); // subject -> latest normalized date
    overviewData.forEach(r => {
      const normDate = normalizeDate(r.exam_date);
      const prev = subjectLatestDate.get(r.subject);
      if (!prev || normDate > prev) subjectLatestDate.set(r.subject, normDate);
    });
    const columnMap = new Map<string, { key: string; subject: string; date: string }>();
    overviewData.forEach(r => {
      if (!columnMap.has(r.subject)) {
        columnMap.set(r.subject, {
          key: r.subject,
          subject: r.subject,
          date: subjectLatestDate.get(r.subject) ?? "—",
        });
      }
    });
    const columns = Array.from(columnMap.values()).sort((a, b) => a.subject.localeCompare(b.subject));

    const studentMap = new Map<string, { name: string; rollNo: string; examRoll: string; cls: string }>();
    overviewData.forEach(r => {
      if (!studentMap.has(r.student_id)) {
        studentMap.set(r.student_id, { name: r.student_name, rollNo: r.class_roll_no, examRoll: r.exam_roll_no, cls: r.class });
      }
    });
    const students = Array.from(studentMap.entries()).map(([id, info]) => ({ id, ...info }));

    // GRID: for each (student, subject) keep the row with the LATEST
    // timestamp (scanned_at || created_at). This collapses any duplicate
    // rows for the same student+subject (whether from pre-migration
    // duplicates, different exam_date string formats, or different real
    // dates) into ONE cell showing the most recent status.
    const cellKeep = new Map<string, { status: Status; scanned_at: string | null; created_at?: string; examDate: string }>();
    overviewData.forEach(r => {
      const key = `${r.student_id}__${r.subject}`;
      const prev = cellKeep.get(key);
      const cur = { status: r.status, scanned_at: r.scanned_at, created_at: r.created_at, examDate: r.exam_date };
      if (!prev) { cellKeep.set(key, cur); return; }
      const aTs = cur.scanned_at || cur.created_at || "";
      const bTs = prev.scanned_at || prev.created_at || "";
      const keep = aTs >= bTs ? cur : prev;
      cellKeep.set(key, keep);
    });
    const grid: Record<string, Record<string, Status>> = {};
    cellKeep.forEach((val, key) => {
      const parts = key.split("__");
      const studentId = parts[0];
      const subject = parts.slice(1).join("__"); // safe even if subject has __
      if (!grid[studentId]) grid[studentId] = {};
      grid[studentId][subject] = val.status;
    });
    return { students, columns, grid };
  }, [overviewData]);

  // In All-Classes mode, break the flat pivot into one section per class so
  // each class gets its own table + its own downloadable PDF (papers differ
  // per class, so a single shared table across classes wouldn't make sense).
  const overviewByClass = useMemo(() => {
    if (!isAllClassesMode) return [];
    const classes = Array.from(new Set(overviewPivot.students.map(s => s.cls))).sort();
    return classes.map(cls => {
      const students = overviewPivot.students.filter(s => s.cls === cls);
      const studentIds = new Set(students.map(s => s.id));
      const columns = overviewPivot.columns.filter(col =>
        students.some(s => overviewPivot.grid[s.id]?.[col.key] !== undefined)
      );
      const grid: Record<string, Record<string, Status>> = {};
      studentIds.forEach(id => { grid[id] = overviewPivot.grid[id] || {}; });
      return { cls, students, columns, grid };
    });
  }, [isAllClassesMode, overviewPivot]);

  // ── ATTENDANCE HANDLERS ────────────────────────────────────────────────
  // Helper: get the subject for a given student's class. In single-class
  // mode, it's just attSubject. In All-Classes mode, it's looked up from
  // the allClassSubjects map. Returns null if no subject is selected for
  // the student's class (the caller should error out in that case).
  const getSubjectForClass = (cls: string): string | null => {
    if (isAllClassesMode) {
      return allClassSubjects[cls] || null;
    }
    return attSubject || null;
  };

  const handleInitSheet = () => {
    if (!attSession || !attDate) {
      toast.error("Select session and date first"); return;
    }
    if (attRollNumbers.length === 0) { toast.error("No students found"); return; }
    if (!canMarkAtt) {
      toast.error(paperWindowMessage(attWindowStatus, attDisplayPaperStart, attDisplayPaperEnd));
      return;
    }
    if (isAllClassesMode) {
      // In All-Classes mode, init attendance for EACH class that has a
      // subject selected. We group students by class and call init once
      // per class with that class's selected subject.
      //
      // IMPORTANT: these run sequentially (awaited) rather than fired in
      // parallel via .mutate(). Firing them all at once meant only the
      // last mutation's completion was reliably reflected before the
      // screen re-rendered, so classes initialized earlier in the loop
      // could still show "No Attendance Sheet Yet" / 0-0-0 even though
      // their rows were actually inserted.
      const byClass: Record<string, typeof attRollNumbers> = {};
      attRollNumbers.forEach(r => {
        if (!byClass[r.class]) byClass[r.class] = [];
        byClass[r.class].push(r);
      });
      const classesToInit = Object.keys(byClass).filter(cls => allClassSubjects[cls]);
      if (classesToInit.length === 0) {
        toast.error("Select a subject for at least one class first");
        return;
      }
      // Safeguard: warn if any class+subject about to be initialized
      // already has attendance recorded on a DIFFERENT date. With the new
      // useInitExamAttendance behavior (rev. 12), re-initializing REPLACES
      // the old attendance (deletes old-date rows, inserts today's rows)
      // so the Class Overview never shows duplicate subject columns. This
      // warning is now informational — it tells the admin "your old
      // attendance on date X will be replaced with today's fresh sheet".
      const conflicts = classesToInit
        .map(cls => ({ cls, subject: allClassSubjects[cls], dates: findConflictingDates(cls, allClassSubjects[cls]) }))
        .filter(c => c.dates.length > 0);
      if (conflicts.length > 0) {
        const lines = conflicts.map(c => `Class ${c.cls} · ${c.subject}: existing attendance on ${c.dates.join(", ")} will be REPLACED with today's fresh sheet`).join("\n");
        const ok = window.confirm(
          `Re-initializing will REPLACE the existing attendance for these papers with a fresh "all absent" sheet dated ${attDate}:\n\n${lines}\n\n` +
          `Old attendance statuses (present/absent/leave) will be LOST. Continue?`
        );
        if (!ok) return;
      }
      (async () => {
        let initedCount = 0;
        const failed: string[] = [];
        for (const cls of classesToInit) {
          const subj = allClassSubjects[cls];
          const students = byClass[cls];
          try {
            await initAttendance.mutateAsync({
              sessionId: attSession, cls, subject: subj, examDate: attDate,
              students: students.map(r => ({
                student_id: r.student_id, student_name: r.student_name,
                class_roll_no: r.class_roll_no, exam_roll_no: r.exam_roll_no,
              })),
            });
            initedCount += students.length;
          } catch {
            // Error toast already shown by the mutation's onError.
            failed.push(`Class ${cls}`);
          }
        }
        if (initedCount === 0 && failed.length === classesToInit.length) {
          toast.error("Attendance could not be initialized for any class");
        } else if (failed.length > 0) {
          toast.error(`Initialized, but failed for: ${failed.join(", ")}`);
        }
      })();
      return;
    }
    // Single-class mode
    if (!attClass || !attSubject) {
      toast.error("Select session, class, subject, and date first"); return;
    }
    {
      const conflictDates = findConflictingDates(attClass, attSubject);
      if (conflictDates.length > 0) {
        const ok = window.confirm(
          `Class ${attClass} · ${attSubject} already has attendance on ${conflictDates.join(", ")}. ` +
          `Re-initializing will REPLACE that attendance with a fresh "all absent" sheet dated ${attDate}. ` +
          `Old attendance statuses will be LOST. Continue?`
        );
        if (!ok) return;
      }
    }
    initAttendance.mutate({
      sessionId: attSession, cls: attClass, subject: attSubject, examDate: attDate,
      students: attRollNumbers.map(r => ({
        student_id: r.student_id, student_name: r.student_name,
        class_roll_no: r.class_roll_no, exam_roll_no: r.exam_roll_no,
      })),
    });
  };

  const handleStatusChange = (record: ExamAttendanceRecord, newStatus: Status) => {
    if (!canMarkAtt) {
      toast.error(paperWindowMessage(attWindowStatus, attDisplayPaperStart, attDisplayPaperEnd));
      return;
    }
    // Use the record's OWN subject (not the dropdown subject) — this is
    // critical in All-Classes mode where each class has a different subject,
    // and also correct in single-class mode (record.subject === attSubject).
    updateAttendance.mutate({
      id: record.id!, status: newStatus,
      sessionId: attSession, cls: record.class, subject: record.subject, examDate: attDate,
    });
  };

  const handleDeleteSheet = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (isAllClassesMode) {
      // Delete attendance for ALL classes + their selected subjects
      for (const cls of availableClasses) {
        const subj = allClassSubjects[cls];
        if (!subj) continue;
        deleteAttendance.mutate({
          sessionId: attSession, cls, subject: subj, examDate: attDate,
        });
      }
      setConfirmDelete(false);
      return;
    }
    if (!attClass || !attSubject) return;
    deleteAttendance.mutate({
      sessionId: attSession, cls: attClass, subject: attSubject, examDate: attDate,
    }, { onSettled: () => setConfirmDelete(false) });
  };

  // Scan handlers
  const rollMap = useMemo(() => {
    const map = new Map<string, typeof attRollNumbers[0]>();
    attRollNumbers.forEach(r => map.set(r.exam_roll_no, r));
    return map;
  }, [attRollNumbers]);

  // ── CROSS-CLASS SCAN HANDLERS (rev. 11) ───────────────────────────────
  // Works in BOTH single-class mode and All-Classes mode. The key insight:
  //   - In single-class mode: the subject comes from the attSubject dropdown.
  //   - In All-Classes mode: the subject comes from the student's class —
  //     looked up in allClassSubjects. So a class-7 student scanned in
  //     All-Classes mode gets attendance saved with class-7's selected
  //     subject (e.g. "English"), while a class-8 student scanned in the
  //     same session gets attendance saved with class-8's selected subject
  //     (e.g. "Mathematics").
  //
  // Two QR formats are supported:
  //   {t:"exam", sid, stid, rn}          — legacy admit-card QR (no seat)
  //   {t:"seat", pid, rid, sl, stid, rn} — desk QR (carries seat/room)

  const handleQRScan = async (qrData: string) => {
    if (!canMarkAtt) {
      toast.error(paperWindowMessage(attWindowStatus, attDisplayPaperStart, attDisplayPaperEnd));
      return;
    }

    // ── Try desk-QR format first ({t:"seat",...}) ──
    // Desk QRs carry the student's class via the seat assignment. In
    // All-Classes mode, we look up the subject for that class.
    const seatParsed = decodeSeatingQRData(qrData);
    if (seatParsed) {
      // We need to know the student's class to pick the right subject.
      // The desk-QR scan mutation resolves the class from the seat
      // assignment server-side, but we need the subject CLIENT-side to
      // pass it in. So we do a quick lookup of the assignment first.
      // NOTE (fix): previously this matched on all four of
      // plan_id + room_id + seat_label + student_id. That's redundant with
      // what useScanSeatingAttendance's mutation already resolves server-side,
      // and any mismatch across those four columns (e.g. a reprint, a seat
      // reassignment, or a transient query hiccup) silently returned no row —
      // seatStudentClass stayed null and the whole scan was blocked with
      // "Could not resolve student's class from desk QR", even for a
      // perfectly valid desk QR. Matching on plan_id + student_id alone is
      // still unique (a student has one seat per plan) and is what the QR
      // actually needs to resolve — the room/seat_label are re-validated by
      // the mutation itself when it does the real lookup.
      let seatStudentClass: string | null = null;
      try {
        const { data: assignment, error: assignmentErr } = await supabase
          .from("exam_seating_assignments")
          .select("class")
          .eq("plan_id", seatParsed.planId)
          .eq("student_id", seatParsed.studentId)
          .maybeSingle();
        if (assignmentErr) throw assignmentErr;
        seatStudentClass = assignment?.class ?? null;
      } catch (e: any) {
        console.error("[handleQRScan] seat assignment lookup failed:", e);
        toast.error("Couldn't look up this seat right now — check your connection and try scanning again.");
        return;
      }
      // Determine the subject: in All-Classes mode, use the student's class
      // subject. In single-class mode, use attSubject.
      const seatSubject = isAllClassesMode
        ? (seatStudentClass ? (allClassSubjects[seatStudentClass] || null) : null)
        : attSubject;
      if (!seatSubject) {
        toast.error(seatStudentClass
          ? `No subject selected for Class ${seatStudentClass}. Pick a subject in the All-Classes panel first.`
          : "Could not resolve student's class from desk QR. Select a subject first.");
        return;
      }
      scanSeatingAttendance.mutate(
        {
          decoded: seatParsed,
          subject: seatSubject,
          examDate: attDate,
          scannedBy: null,
        },
        {
          onSuccess: (result) => {
            if (result.status === "already") {
              toast(`${result.studentName} (Class ${result.class}) already marked Present`, { icon: "✅" });
            } else {
              toast.success(`${result.studentName} · Class ${result.class} · ${seatSubject} marked Present · ${result.seatLabel} · ${result.roomName}`);
              setScanLog(prev => [
                { name: result.studentName, roll: result.examRollNo, time: new Date().toLocaleTimeString(), status: "present" },
                ...prev,
              ]);
            }
            if (result.sessionId && result.class) {
              qc.invalidateQueries({ queryKey: ["exam-attendance", result.sessionId, result.class] });
              qc.invalidateQueries({ queryKey: ["exam-attendance-overview", result.sessionId, result.class] });
              qc.invalidateQueries({ queryKey: ["exam-attendance-overview", result.sessionId, "all"] });
              qc.invalidateQueries({ queryKey: ["exam-attendance-all-classes", result.sessionId, attDate] });
            }
            qc.invalidateQueries({ queryKey: ["live-attendance"] });
          },
          onError: (err: any) => {
            toast.error(err?.message || "Failed to mark attendance from desk QR");
          },
        }
      );
      return;
    }

    // ── Legacy admit-card QR ({t:"exam",...}) ──
    const parsed = decodeExamQRData(qrData);
    if (!parsed) { toast.error("Invalid QR code — not an exam roll number or desk QR"); return; }
    if (parsed.sessionId !== attSession) { toast.error("This QR code belongs to a different exam session"); return; }

    // Fast path: student is in the loaded list. In All-Classes mode this
    // is the full session list; in single-class mode it's the class-filtered list.
    let student = attRollNumbers.find(r => r.student_id === parsed.studentId);
    let studentClass: string | null = student?.class ?? null;

    // Slow path: student isn't in the loaded list (single-class mode + cross-
    // class scan). Look up across ALL classes in the session.
    if (!student) {
      try {
        const { data: crossStudent, error } = await supabase
          .from("exam_roll_numbers")
          .select("student_id, student_name, class_roll_no, exam_roll_no, class")
          .eq("session_id", attSession)
          .eq("student_id", parsed.studentId)
          .maybeSingle();
        if (error) throw error;
        if (crossStudent) {
          student = crossStudent;
          studentClass = crossStudent.class;
        }
      } catch (e: any) {
        console.error("[handleQRScan] cross-class lookup failed:", e);
      }
    }

    if (!student || !studentClass) {
      toast.error("Student not found in this exam session");
      return;
    }
    // Determine the subject for this student's class.
    const subj = getSubjectForClass(studentClass);
    if (!subj) {
      toast.error(`No subject selected for Class ${studentClass}. Pick a subject in the ${isAllClassesMode ? "All-Classes" : "subject"} panel first.`);
      return;
    }
    if (!isAllClassesMode && studentClass !== attClass) {
      toast(`Cross-class scan: student is in Class ${studentClass}, not Class ${attClass}. Saving to Class ${studentClass}.`, { icon: "ℹ️" });
    }
    doScan(parsed.studentId, student.student_name, parsed.examRollNo, studentClass, subj);
  };

  const handleManualRoll = async () => {
    const roll = manualRoll.trim();
    if (!roll) return;
    if (!canMarkAtt) {
      toast.error(paperWindowMessage(attWindowStatus, attDisplayPaperStart, attDisplayPaperEnd));
      return;
    }
    // Fast path: roll number is in the loaded list.
    let student = rollMap.get(roll);
    let studentClass: string | null = student?.class ?? null;
    // Slow path: session-wide lookup.
    if (!student) {
      try {
        const { data: crossStudent, error } = await supabase
          .from("exam_roll_numbers")
          .select("student_id, student_name, class_roll_no, exam_roll_no, class")
          .eq("session_id", attSession)
          .eq("exam_roll_no", roll)
          .maybeSingle();
        if (error) throw error;
        if (crossStudent) {
          student = crossStudent;
          studentClass = crossStudent.class;
        }
      } catch (e: any) {
        console.error("[handleManualRoll] cross-class lookup failed:", e);
      }
    }
    if (!student || !studentClass) { toast.error(`Roll number ${roll} not found in this exam session`); return; }
    // Determine the subject for this student's class.
    const subj = getSubjectForClass(studentClass);
    if (!subj) {
      toast.error(`No subject selected for Class ${studentClass}. Pick a subject in the ${isAllClassesMode ? "All-Classes" : "subject"} panel first.`);
      return;
    }
    if (!isAllClassesMode && studentClass !== attClass) {
      toast(`Cross-class entry: student is in Class ${studentClass}, not Class ${attClass}. Saving to Class ${studentClass}.`, { icon: "ℹ️" });
    }
    doScan(student.student_id, student.student_name, roll, studentClass, subj);
    setManualRoll("");
  };

  const doScan = (studentId: string, studentName: string, examRoll: string, studentClass: string, subject: string) => {
    if (!canMarkAtt) {
      toast.error(paperWindowMessage(attWindowStatus, attDisplayPaperStart, attDisplayPaperEnd));
      return;
    }
    const existing = attMap.get(studentId);
    if (existing?.status === "present") {
      toast(`${studentName} already marked Present`, { icon: "✅" });
      return;
    }
    scanAttendance.mutate({
      sessionId: attSession, studentId, subject,
      examDate: attDate, cls: studentClass, scannedBy: null,
    }, {
      onSuccess: (result) => {
        if (result.status === "already") {
          toast(`${studentName} already marked Present`, { icon: "✅" });
        } else {
          const clsLabel = result.class ? ` · Class ${result.class}` : "";
          toast.success(`${studentName}${clsLabel} · ${subject} marked Present!`);
          setScanLog(prev => [{ name: studentName, roll: examRoll, time: new Date().toLocaleTimeString(), status: "present" }, ...prev]);
        }
        // Invalidate both the single-class and All-Classes queries so the
        // UI refreshes regardless of which mode the admin is in.
        qc.invalidateQueries({ queryKey: ["exam-attendance", attSession, studentClass, subject, attDate] });
        qc.invalidateQueries({ queryKey: ["exam-attendance-overview", attSession, studentClass] });
        qc.invalidateQueries({ queryKey: ["exam-attendance-overview", attSession, "all"] });
        qc.invalidateQueries({ queryKey: ["exam-attendance-all-classes", attSession, attDate] });
        qc.invalidateQueries({ queryKey: ["live-attendance"] });
      },
      onError: (err: any) => {
        toast.error(err?.message || "Failed to mark attendance");
      },
    });
  };

  // ── EXPORT ATTENDANCE PDF ───────────────────────────────────────────────
  const exportAttendancePDF = () => {
    if (!attendance.length) { toast.error("No data to export"); return; }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();

    // ── Header — clean white with double-line accent ──
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.8);
    doc.line(0, 36, w, 36);
    doc.setLineWidth(0.3);
    doc.line(0, 37.5, w, 37.5);

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Government High School Babi Khel", w / 2, 14, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("District Mohmand, KPK", w / 2, 21, { align: "center" });

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("EXAM ATTENDANCE REPORT", w / 2, 30, { align: "center" });

    // ── Info box ──
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(12, 42, w - 24, 18, 2, 2, "F");
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.roundedRect(12, 42, w - 24, 18, 2, 2, "S");

    const infoItems = [
      { label: "CLASS", value: `Class ${attClass}` },
      { label: "SUBJECT", value: attSubject },
      { label: "DATE", value: attDate },
      { label: "PRESENT", value: String(attStats.present) },
      { label: "ABSENT", value: String(attStats.absent) },
    ];
    const infoW = (w - 24) / infoItems.length;
    infoItems.forEach((item, i) => {
      const cx = 12 + i * infoW + infoW / 2;
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text(item.label, cx, 48, { align: "center" });
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(item.value, cx, 55, { align: "center" });
    });

    // ── Table with autoTable ──
    const tableBody = attendance.map((r, idx) => {
      const statusStr = r.status === "present" ? "Present" : r.status === "absent" ? "Absent" : "Leave";
      return [String(idx + 1), r.class_roll_no, r.exam_roll_no, r.student_name, statusStr, r.scanned_at ? new Date(r.scanned_at).toLocaleTimeString() : "Manual"];
    });

    autoTable(doc, {
      startY: 66,
      head: [["#", "Class Roll", "Exam Roll", "Student Name", "Status", "Time"]],
      body: tableBody,
      styles: {
        fontSize: 9,
        cellPadding: 3,
        valign: "middle",
        textColor: [40, 40, 40],
        overflow: "linebreak",
        lineColor: [200, 200, 200],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: [60, 60, 60],
        fontStyle: "bold",
        fontSize: 8,
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 22, halign: "center" },
        2: { cellWidth: 28, halign: "center" },
        3: { halign: "left" },
        4: { cellWidth: 22, halign: "center" },
        5: { cellWidth: 24, halign: "center" },
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: 12, right: 12, bottom: 28 },
    });

    // ── Signature area on each page ──
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      // Footer — clean white with double-line accent
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.3);
      doc.line(0, h - 19.5, w, h - 19.5);
      doc.setLineWidth(0.8);
      doc.line(0, h - 18, w, h - 18);
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.text("GHS BABI KHEL — EXAM ATTENDANCE REPORT", w / 2, h - 11, { align: "center" });
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(5.5);
      doc.text(`Page ${p}/${totalPages}`, w - 18, h - 11, { align: "right" });

      // Signatures
      const sigY = h - 38;
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      // Left signature
      doc.line(20, sigY, 65, sigY);
      doc.setTextColor(140, 140, 140);
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text("Class Teacher Signature", 42.5, sigY + 4, { align: "center" });
      // Right signature
      doc.line(w - 65, sigY, w - 20, sigY);
      doc.text("Principal Signature", w - 42.5, sigY + 4, { align: "center" });
    }

    doc.save(`ExamAttendance-Class${attClass}-${attSubject}-${attDate}.pdf`);
    toast.success("Attendance PDF exported!");
  };

  // ── EXPORT CLASS OVERVIEW PDF ───────────────────────────────────────────
  // Dedicated exporter for the Class Overview grid (multi-subject/date pivot).
  // Previously this reused exportAttendancePDF (built for a single paper's
  // present/absent list), which produced a wrong/misaligned table. This
  // builds the actual subject x student grid, with the Student Name column
  // explicitly centered.
  const exportOverviewPDF = (
    scopedClass?: string,
    scopedPivot?: { students: typeof overviewPivot.students; columns: typeof overviewPivot.columns; grid: typeof overviewPivot.grid }
  ) => {
    const pivot = scopedPivot ?? overviewPivot;
    const clsLabel = scopedClass ?? attClass;
    if (!pivot.students.length) { toast.error("No data to export"); return; }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();

    // ── Header ──
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.8);
    doc.line(0, 30, w, 30);
    doc.setLineWidth(0.3);
    doc.line(0, 31.5, w, 31.5);

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Government High School Babi Khel", w / 2, 12, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("District Mohmand, KPK", w / 2, 18, { align: "center" });
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`CLASS ${clsLabel} — EXAM ATTENDANCE OVERVIEW`, w / 2, 25.5, { align: "center" });

    // ── Table ──
    const head = [["#", "Exam Roll", "Student Name", ...pivot.columns.map(c => `${c.subject}\n${c.date}`), "Present", "Absent"]];
    const body = pivot.students.map((s, idx) => {
      const statuses = pivot.grid[s.id] || {};
      const presentCount = pivot.columns.filter(col => statuses[col.key] === "present").length;
      const absentCount = pivot.columns.filter(col => statuses[col.key] === "absent").length;
      const cells = pivot.columns.map(col => {
        const st = statuses[col.key];
        return st === "present" ? "P" : st === "absent" ? "A" : st === "leave" ? "L" : "—";
      });
      return [String(idx + 1), s.examRoll, s.name, ...cells, String(presentCount), String(absentCount)];
    });

    const nameColIndex = 2;
    const firstSubjectCol = 3;
    const lastCols = 2; // Present + Absent

    autoTable(doc, {
      startY: 36,
      head,
      body,
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
        valign: "middle",
        halign: "center",
        textColor: [40, 40, 40],
        overflow: "linebreak",
        lineColor: [200, 200, 200],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: [60, 60, 60],
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "center",
        valign: "middle",
      },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 18, halign: "center" },
        // Student Name — explicitly centered (this was the misaligned column).
        [nameColIndex]: { cellWidth: 34, halign: "center", fontStyle: "bold" },
        [head[0].length - lastCols]: { cellWidth: 16, halign: "center", textColor: [16, 130, 90] },
        [head[0].length - 1]: { cellWidth: 16, halign: "center", textColor: [190, 40, 40] },
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: 10, right: 10, bottom: 24 },
      didParseCell: (data) => {
        // Center every subject-status column too.
        if (data.column.index >= firstSubjectCol && data.column.index < head[0].length - lastCols) {
          data.cell.styles.halign = "center";
        }
      },
    });

    // ── Footer ──
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.3);
      doc.line(0, h - 15.5, w, h - 15.5);
      doc.setLineWidth(0.8);
      doc.line(0, h - 14, w, h - 14);
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.text("GHS BABI KHEL — CLASS OVERVIEW REPORT", w / 2, h - 8, { align: "center" });
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(5.5);
      doc.text(`Page ${p}/${totalPages}`, w - 14, h - 8, { align: "right" });
    }

    doc.save(`ClassOverview-Class${clsLabel}-${attSession}.pdf`);
    toast.success("Class Overview PDF exported!");
  };

  // ── RENDER ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5" style={{ contain: "layout style" }}>
      {/* Main Tab Toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Hash className="w-6 h-6 text-primary" /> Exam Roll Numbers
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Generate roll numbers, manage exam attendance & QR scanning</p>
        </div>
        <div className="ml-auto">
          <div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
            <button onClick={() => setMainTab("rolls")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${mainTab === "rolls" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-100 dark:bg-indigo-900/40 shrink-0">
                <Hash className="w-3.5 h-3.5 text-indigo-500" />
              </span>
              Roll Numbers
            </button>
            <button onClick={() => setMainTab("attendance")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${mainTab === "attendance" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-teal-100 dark:bg-teal-900/40 shrink-0">
                <ClipboardCheck className="w-3.5 h-3.5 text-teal-500" />
              </span>
              Exam Attendance
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ROLL NUMBERS TAB */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {mainTab === "rolls" && (
        <>
          {/* ── LIST VIEW ── */}
          {view === "list" && (
            <>
              <div className="flex items-center justify-between">
                <div />
                <Button onClick={() => setView("create")} className="gap-2"><Plus className="w-4 h-4" /> Generate New</Button>
              </div>
              {loadingSessions ? (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
              ) : sessions.length === 0 ? (
                <Card><CardContent className="py-16 text-center"><Hash className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" /><p className="font-heading font-semibold">No sessions yet</p></CardContent></Card>
              ) : (
                <div className="space-y-3">
                  {sessions.map(s => (
                    <Card key={s.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <Hash className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-heading font-semibold text-foreground">{s.title}</h3>
                            <Badge variant="secondary">{s.exam_term} {s.exam_year}</Badge>
                            <Badge className={s.is_published ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}>
                              {s.is_published ? "Published" : "Draft"}
                            </Badge>
                            {s.publish_at && !s.is_published && (
                              <Badge className="bg-blue-100 text-blue-800 gap-1"><Timer className="w-3 h-3" /> Countdown</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">Classes: {s.class_order.join(" → ")} · Starting: {s.starting_number}</p>
                          {s.publish_at && !s.is_published && <CountdownTimer targetDate={s.publish_at} label={s.countdown_label || "Publishes in"} />}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button variant="outline" size="sm" onClick={() => { setSelectedSession(s); setView("detail"); }} className="gap-1.5"><Eye className="w-3.5 h-3.5" /> View</Button>
                          <Button variant="outline" size="sm" onClick={() => togglePublish(s)} className="gap-1.5">
                            {s.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            {s.is_published ? "Unpublish" : "Publish"}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Delete "{s.title}"?</AlertDialogTitle><AlertDialogDescription>This will permanently delete all roll numbers.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteSession.mutate(s.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── CREATE VIEW ── */}
          {view === "create" && (
            <div className="space-y-5 max-w-2xl">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => setView("list")} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
                <h2 className="text-2xl font-heading font-bold">Generate Exam Roll Numbers</h2>
              </div>
              <Card><CardHeader><CardTitle className="text-base">Session Details</CardTitle></CardHeader>
                <CardContent className="grid gap-4">
                  <div><Label>Session Title *</Label><Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. First Semester Examination 2025" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Exam Year *</Label><Input type="number" value={formYear} onChange={e => setFormYear(Number(e.target.value))} /></div>
                    <div><Label>Exam Term *</Label><select value={formTerm} onChange={e => setFormTerm(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">{TERMS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                  </div>
                  <div><Label>Starting Roll Number (6 digits) *</Label><Input type="number" value={startingNumber} onChange={e => setStartingNumber(Number(e.target.value))} min={100000} max={999999} /></div>
                </CardContent>
              </Card>
              <Card><CardHeader><CardTitle className="text-base">Select Classes & Order</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    {ALL_CLASSES.map(cls => (
                      <button key={cls} onClick={() => toggleClass(cls)} className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border-2 ${selectedClasses.includes(cls) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-primary/50"}`}>Class {cls}</button>
                    ))}
                  </div>
                  {classOrder.filter(c => selectedClasses.includes(c)).length > 1 && (
                    <div className="space-y-2">
                      {classOrder.filter(c => selectedClasses.includes(c)).map((cls, idx, arr) => (
                        <div key={cls} className="flex items-center gap-3 bg-secondary/50 rounded-lg px-4 py-2.5">
                          <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                          <span className="flex-1 font-medium">Class {cls}</span>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === 0} onClick={() => moveClass(cls, "up")}><ChevronUp className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === arr.length - 1} onClick={() => moveClass(cls, "down")}><ChevronDown className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Button onClick={handleGenerate} disabled={generating || selectedClasses.length === 0 || !formTitle.trim()} className="gap-2 w-full" size="lg">
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><RefreshCw className="w-4 h-4" /> Generate Roll Numbers</>}
              </Button>
            </div>
          )}

          {/* ── DETAIL VIEW ── */}
          {view === "detail" && selectedSession && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 flex-wrap">
                <Button variant="ghost" size="sm" onClick={() => { setView("list"); setDetailSearch(""); }} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-heading font-bold truncate">{selectedSession.title}</h2>
                  <p className="text-sm text-muted-foreground">{selectedSession.exam_term} {selectedSession.exam_year} · {rollNumbers.length} students</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={() => handleUpdateStudents(selectedSession)} disabled={updatingStudents} className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white">
                    {updatingStudents ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {updatingStudents ? "Updating..." : "Update Students"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadCSV} className="gap-1.5"><Download className="w-3.5 h-3.5" /> CSV</Button>
                  <Button variant="outline" size="sm" onClick={downloadPrint} className="gap-1.5"><QrCode className="w-3.5 h-3.5" /> Admit Cards + QR</Button>
                  <Button size="sm" onClick={() => togglePublish(selectedSession)} className={`gap-1.5 ${selectedSession.is_published ? "bg-blue-500 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"} text-white`}>
                    {selectedSession.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {selectedSession.is_published ? "Unpublish" : "Publish Now"}
                  </Button>
                </div>
              </div>

              {/* Countdown setter */}
              <Card className="border-blue-200 dark:border-blue-500/30">
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Timer className="w-4 h-4 text-blue-500" />Countdown Timer</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {selectedSession.publish_at && !selectedSession.is_published && <CountdownTimer targetDate={selectedSession.publish_at} label={selectedSession.countdown_label || "Roll numbers publish in"} />}
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Date</Label><Input type="date" value={countdownDate} onChange={e => setCountdownDate(e.target.value)} min={new Date().toISOString().split("T")[0]} /></div>
                    <div><Label className="text-xs">Time</Label><Input type="time" value={countdownTime} onChange={e => setCountdownTime(e.target.value)} /></div>
                  </div>
                  <div><Label className="text-xs">Message</Label><Input value={countdownLabel} onChange={e => setCountdownLabel(e.target.value)} /></div>
                  <div className="flex gap-2">
                    <Button onClick={() => saveCountdown(selectedSession)} disabled={savingCountdown} className="gap-2 bg-blue-500 hover:bg-blue-700 text-white">
                      {savingCountdown ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Timer className="w-3.5 h-3.5" />} Set
                    </Button>
                    {selectedSession.publish_at && <Button variant="outline" size="sm" onClick={() => clearCountdown(selectedSession)} className="text-destructive">Remove</Button>}
                  </div>
                </CardContent>
              </Card>

              <Input placeholder="Search..." value={detailSearch} onChange={e => setDetailSearch(e.target.value)} className="max-w-sm" />

              {loadingRolls ? (
                <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
              ) : (
                <div className="space-y-6">
                  {selectedSession.class_order.map(cls => {
                    const students = (filteredRolls as any).filter ? filteredRolls.filter(r => r.class === cls) : [];
                    if (!students?.length) return null;
                    return (
                      <Card key={cls}>
                        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">{cls}</span>
                          Class {cls} <Badge variant="secondary">{students.length} students</Badge>
                        </CardTitle></CardHeader>
                        <CardContent className="p-0">
                          <div className="overflow-x-auto">
                            <Table><TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>Exam Roll No</TableHead><TableHead>Student Name</TableHead><TableHead>Father Name</TableHead><TableHead>Class Roll No</TableHead></TableRow></TableHeader>
                              <TableBody>{students.map((r: ExamRollEntry) => (
                                <TableRow key={r.id}><TableCell className="text-muted-foreground text-sm">{r.serial_number}</TableCell>
                                  <TableCell><span className="font-mono font-bold text-primary text-base">{r.exam_roll_no}</span></TableCell>
                                  <TableCell className="font-medium">{r.student_name}</TableCell>
                                  <TableCell className="text-muted-foreground">{r.father_name || "—"}</TableCell>
                                  <TableCell className="text-muted-foreground">{r.class_roll_no}</TableCell>
                                </TableRow>
                              ))}</TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ATTENDANCE TAB */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {mainTab === "attendance" && (
        <>
          {/* Session/Class/Subject/Date selectors */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Exam Session</label>
                  {loadingSessions ? <Skeleton className="h-10 rounded-lg" /> : (
                    <select value={attSession} onChange={e => { setAttSession(e.target.value); setAttClass(""); setAttSubject(""); setAllClassSubjects({}); }}
                      className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="">Select Session</option>
                      {attSessions.map((s: any) => <option key={s.id} value={s.id}>{s.title} ({s.exam_term} {s.exam_year})</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Class</label>
                  <select value={attClass} onChange={e => { setAttClass(e.target.value); setAttSubject(""); }} disabled={!attSession}
                    className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50">
                    <option value="">Select Class</option>
                    {/* ── ALL-CLASSES OPTION (rev. 11) ──
                        When selected, the admin picks a subject for EACH class
                        (see the per-class subject panel below), and ALL students
                        from ALL classes appear in the list. Attendance is saved
                        to each student's actual class with that class's selected
                        subject. This is designed for exam-day use where classes
                        sit in arrangement order (8th, 7th, 6th) and the
                        invigilator walks the aisles scanning/entering any
                        student's QR or roll number. */}
                    <option value="all">All-Classes</option>
                    {availableClasses.map((c: string) => <option key={c} value={c}>Class {c}</option>)}
                  </select>
                </div>
                {/* Single-class subject selector (hidden in All-Classes mode) */}
                {!isAllClassesMode && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Subject / Paper</label>
                    <select value={attSubject} onChange={e => setAttSubject(e.target.value)} disabled={!attClass}
                      className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50">
                      <option value="">Select Subject</option>
                      {EXAM_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Exam Date</label>
                  <input type="date" value={attDate} readOnly disabled={!attClass}
                    className="w-full px-3 py-2.5 rounded-xl bg-secondary/30 border border-border text-sm text-foreground outline-none cursor-not-allowed disabled:opacity-50" />
                </div>
              </div>

              {/* ── ALL-CLASSES: PER-CLASS SUBJECT SELECTORS (rev. 11) ──────
                  Each class has its OWN paper (e.g. Class 8 takes Mathematics
                  while Class 7 takes English at the same time). The admin
                  picks a subject for each class here. When a student is
                  scanned/entered, the saved attendance row uses the student's
                  actual class + that class's selected subject. */}
              {isAllClassesMode && attSession && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <p className="text-xs font-bold text-primary uppercase tracking-wider">Select Subject for Each Class</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Each class has a different paper. Pick the subject for each class — attendance is saved with the student's class + that class's selected subject.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {availableClasses.map((cls: string) => (
                      <div key={cls} className="flex items-center gap-2 bg-card rounded-lg p-2 border border-border">
                        <Badge className="bg-primary text-primary-foreground shrink-0">Class {cls}</Badge>
                        <select
                          value={allClassSubjects[cls] || ""}
                          onChange={e => setAllClassSubjects(prev => ({ ...prev, [cls]: e.target.value }))}
                          className="flex-1 px-2 py-1.5 rounded-lg bg-secondary/50 border border-border text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30 min-w-0"
                        >
                          <option value="">— Select subject —</option>
                          {EXAM_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  {/* Show per-class paper times so the admin knows the window */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {availableClasses.map((cls: string) => {
                      const subj = allClassSubjects[cls];
                      const times = classPaperTimesByClass[cls];
                      return (
                        <div key={cls} className={`text-[10px] px-2 py-1 rounded-md border ${times ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 text-emerald-700 dark:text-emerald-400" : "bg-muted/30 border-border text-muted-foreground"}`}>
                          <span className="font-bold">Class {cls}</span>{subj ? ` · ${subj}` : " · no subject"}
                          {times && <span className="ml-1 font-mono">{times.start}–{times.end}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sub-tab toggle */}
              <div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
                <button onClick={() => setAttTab("scan")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${attTab === "scan" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  <ScanLine className="w-3.5 h-3.5 inline mr-1" />Paper Attendance
                </button>
                <button onClick={() => setAttTab("overview")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${attTab === "overview" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1" />Class Overview
                </button>
              </div>
            </CardContent>
          </Card>

          {/* ── SCAN / PAPER ATTENDANCE TAB ── */}
          {/* In single-class mode: requires attSession + attClass + attSubject + attDate.
              In All-Classes mode: requires attSession + attClass==="all" + attDate.
              (Subject is per-class, checked at scan time.) */}
          {attTab === "scan" && attSession && attClass && attDate && (isAllClassesMode || attSubject) && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: Check, label: "Present", value: attStats.present, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
                  { icon: X, label: "Absent", value: attStats.absent, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/20" },
                  { icon: Palmtree, label: "Leave", value: attStats.leave, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
                ].map(s => (
                  <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center border border-border/50`}>
                    <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
                    <p className="font-bold text-xl text-foreground">{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              {!isInitialized ? (
                <Card className="border-dashed border-2">
                  <CardContent className="py-10 text-center space-y-3">
                    <CalendarDays className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                    <p className="font-heading font-semibold">No Attendance Sheet Yet</p>
                    <p className="text-xs text-muted-foreground">
                      {isAllClassesMode
                        ? `Initialize for ${attRollNumbers.length} students across all classes`
                        : `Initialize for ${attRollNumbers.length} students of Class ${attClass}`}
                    </p>
                    {!canMarkAtt && (
                      <div className="mx-auto max-w-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 flex items-start gap-2 text-amber-700 dark:text-amber-400">
                        <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                        <span className="text-xs font-semibold text-left">{paperWindowMessage(attWindowStatus, attDisplayPaperStart, attDisplayPaperEnd)}</span>
                      </div>
                    )}
                    <Button onClick={handleInitSheet} disabled={initAttendance.isPending || attRollNumbers.length === 0 || !canMarkAtt} className="gap-2">
                      {initAttendance.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} Initialize
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Locked banner when sheet exists but paper window is closed */}
                  {!canMarkAtt && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 flex items-start gap-2">
                      <Lock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-xs">
                        <p className="font-semibold text-amber-700 dark:text-amber-400">Attendance Locked — paper is not in progress.</p>
                        <p className="text-amber-600 dark:text-amber-500 mt-0.5">{paperWindowMessage(attWindowStatus, attDisplayPaperStart, attDisplayPaperEnd)}</p>
                        <p className="text-amber-600/70 dark:text-amber-500/70 mt-1">Scanning and status changes are locked. Extend the paper end-time from the Live Console to re-open editing.</p>
                      </div>
                    </div>
                  )}

                  {/* Action bar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input className="w-full pl-9 pr-4 py-2 rounded-xl bg-secondary/50 border border-border text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="Search student..." value={attSearch} onChange={e => setAttSearch(e.target.value)} />
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowScanner(!showScanner)} disabled={!canMarkAtt} className="gap-1.5 bg-emerald-500 text-white hover:bg-emerald-600 border-emerald-500 disabled:opacity-50">
                      <Camera className="w-3.5 h-3.5" /> {showScanner ? "Close Scanner" : "Scan QR"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDeleteSheet}
                      className={`gap-1.5 ${confirmDelete ? "bg-red-500 text-white hover:bg-red-600" : "text-destructive hover:bg-destructive/10"}`}>
                      <Trash2 className="w-3.5 h-3.5" /> {confirmDelete ? "Confirm?" : "Delete"}
                    </Button>
                  </div>

                  {/* QR Scanner area */}
                  {showScanner && (
                    <Card className="border-emerald-200 dark:border-emerald-800/50" style={{ contain: "layout style" }}>
                      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ScanLine className="w-4 h-4 text-emerald-500" /> Scan QR Code for Attendance</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        <QRScanner
                          onScan={handleQRScan}
                          enabled={!!attSession && (isAllClassesMode
                            ? Object.values(allClassSubjects).some(s => !!s)
                            : !!attSubject)}
                        />
                        {/* Recent scans */}
                        {scanLog.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><History className="w-3 h-3" />Recent Scans</p>
                            {scanLog.slice(0, 5).map((log, i) => (
                              <div key={i} className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg px-3 py-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                <span className="text-sm font-medium flex-1">{log.name}</span>
                                <span className="text-xs text-muted-foreground font-mono">{log.roll}</span>
                                <span className="text-[10px] text-muted-foreground">{log.time}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Attendance list — mobile cards / desktop table */}
                  {loadingAtt ? (
                    <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
                  ) : attFiltered.length === 0 ? (
                    <Card><CardContent className="py-10 text-center"><p className="text-muted-foreground">No students found</p></CardContent></Card>
                  ) : (
                    <>
                      {/* Mobile cards */}
                      <div className="sm:hidden space-y-2">
                        {attFiltered.map(s => {
                          const att = s.attRecord;
                          const status = att?.status || "absent";
                          const cfg = statusConfig[status];
                          return (
                            <div key={s.student_id} className={`rounded-xl border p-3 ${cfg.bg}`}>
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{s.serial_number}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-sm text-foreground truncate">{s.student_name}</p>
                                  <p className="text-xs text-muted-foreground">Roll: {s.exam_roll_no} · Class: {s.class_roll_no}</p>
                                </div>
                                <Badge className={`${cfg.bg} ${cfg.color} gap-1 shrink-0`}>{cfg.icon}{cfg.label}</Badge>
                              </div>
                              {att && (
                                <div className="flex gap-1.5 mt-2">
                                  {(["present", "absent", "leave"] as Status[]).map(st => {
                                    const c = statusConfig[st];
                                    return <button key={st} onClick={() => handleStatusChange(att, st)}
                                      disabled={!canMarkAtt}
                                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all border disabled:opacity-40 disabled:cursor-not-allowed ${status === st ? `${c.bg} ${c.color} border-current` : "bg-secondary/50 text-muted-foreground border-transparent hover:border-border"}`}>{c.label}</button>;
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* Desktop table */}
                      <div className="hidden sm:block">
                        <Card><CardContent className="p-0 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="border-b border-border bg-secondary/30">
                              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">#</th>
                              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Exam Roll</th>
                              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Student Name</th>
                              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Class Roll</th>
                              <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Status</th>
                              <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Actions</th>
                            </tr></thead>
                            <tbody>
                              {attFiltered.map(s => {
                                const att = s.attRecord;
                                const status = att?.status || "absent";
                                const cfg = statusConfig[status];
                                return (
                                  <tr key={s.student_id} className="border-b border-border/50 hover:bg-secondary/20">
                                    <td className="p-3 text-muted-foreground">{s.serial_number}</td>
                                    <td className="p-3"><span className="font-mono font-bold text-primary">{s.exam_roll_no}</span></td>
                                    <td className="p-3 font-medium">{s.student_name}</td>
                                    <td className="p-3 text-muted-foreground">{s.class_roll_no}</td>
                                    <td className="p-3 text-center"><Badge className={`${cfg.bg} ${cfg.color} gap-1`}>{cfg.icon}{cfg.label}</Badge></td>
                                    <td className="p-3">{att && (
                                      <div className="flex justify-center gap-1">
                                        {(["present", "absent", "leave"] as Status[]).map(st => {
                                          const c = statusConfig[st];
                                          return <button key={st} onClick={() => handleStatusChange(att, st)}
                                            disabled={!canMarkAtt}
                                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${status === st ? `${c.bg} ${c.color} ring-1 ring-current` : "text-muted-foreground hover:text-foreground"}`}>{c.label}</button>;
                                        })}
                                      </div>
                                    )}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </CardContent></Card>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* Empty state for scan tab */}
          {attTab === "scan" && (!attSession || !attClass || !attDate || (!isAllClassesMode && !attSubject)) && (
            <Card className="border-dashed border-2"><CardContent className="py-14 text-center">
              <ClipboardCheck className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-heading font-semibold">Select Exam Details Above</p>
              <p className="text-xs text-muted-foreground mt-1">Choose a session, class{isAllClassesMode ? "" : ", subject,"} and date</p>
            </CardContent></Card>
          )}

          {/* ── OVERVIEW TAB ── */}
          {/* In All-Classes mode, the overview shows one section per class,
              each with its own table and its own "Export PDF" button —
              papers differ per class so a single shared table wouldn't
              make sense. Single-class mode keeps the original layout. */}
          {attTab === "overview" && attSession && attClass && isAllClassesMode && (
            <>
              {loadingOverview ? (
                <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
              ) : overviewByClass.length === 0 ? (
                <Card className="border-dashed border-2"><CardContent className="py-14 text-center">
                  <FileSpreadsheet className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="font-heading font-semibold">No Attendance Data Yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Initialize attendance sheets for papers to see the overview</p>
                </CardContent></Card>
              ) : (
                overviewByClass.map(section => (
                  <Card key={section.cls} className="overflow-hidden">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-base">Class {section.cls}</CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">{section.students.length} students · {section.columns.length} papers</Badge>
                        <Button variant="outline" size="sm" onClick={() => exportOverviewPDF(section.cls, section)} disabled={!section.students.length} className="gap-1.5">
                          <FileText className="w-3.5 h-3.5" /> Export PDF
                        </Button>
                        {/* Problem 1 fix: "Delete All Class Attendance" button.
                            Wipes EVERY attendance row for this class in this
                            session — every subject, every date. Useful when the
                            admin selected the wrong class or wants to start
                            the class's exam attendance over from scratch. */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" disabled={!section.students.length || deleteClassAttendance.isPending} className="gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30">
                              <Trash2 className="w-3.5 h-3.5" /> Delete All
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete ALL attendance for Class {section.cls}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This permanently deletes EVERY attendance record for Class {section.cls} in this session — all {section.columns.length} papers ({section.columns.map(c => c.subject).join(", ")}), all dates, all {section.students.length} students. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteClassAttendance.mutate({ sessionId: attSession, cls: section.cls })}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Delete Everything
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0 overflow-x-auto">
                      <table className="w-full text-sm min-w-[600px]">
                        <thead><tr className="border-b border-border bg-secondary/30">
                          <th className="text-left p-2 text-xs font-semibold text-muted-foreground bg-secondary/30 sticky left-0">Student</th>
                          <th className="text-left p-2 text-xs font-semibold text-muted-foreground">Exam Roll</th>
                          {section.columns.map(col => (
                            <th key={col.key} className="text-center p-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                              {col.subject}<br /><span className="font-normal text-[10px] text-muted-foreground/70">{col.date}</span>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button className="block mx-auto mt-1 text-destructive/60 hover:text-destructive" title={`Delete ${col.subject} attendance for Class ${section.cls}`}>
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete {col.subject} attendance for Class {section.cls}?</AlertDialogTitle>
                                    <AlertDialogDescription>This deletes the entire attendance sheet for {col.subject} (all dates) for all Class {section.cls} students. This cannot be undone.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      // No examDate passed → deletes ALL dates for this subject+class (rev. 12).
                                      onClick={() => deleteAttendance.mutate({ sessionId: attSession, cls: section.cls, subject: col.subject })}
                                      className="bg-destructive text-destructive-foreground"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </th>
                          ))}
                          <th className="text-center p-2 text-xs font-semibold text-muted-foreground">Present</th>
                          <th className="text-center p-2 text-xs font-semibold text-muted-foreground">Absent</th>
                        </tr></thead>
                        <tbody>
                          {section.students.map(s => {
                            const statuses = section.grid[s.id] || {};
                            const presentCount = section.columns.filter(col => statuses[col.key] === "present").length;
                            const absentCount = section.columns.filter(col => statuses[col.key] === "absent").length;
                            return (
                              <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/20">
                                <td className="p-2 font-medium bg-card sticky left-0">{s.name}</td>
                                <td className="p-2 font-mono text-primary font-bold">{s.examRoll}</td>
                                {section.columns.map(col => {
                                  const st = statuses[col.key] || "—";
                                  const cfg = st !== "—" ? statusConfig[st as Status] : null;
                                  return <td key={col.key} className="p-2 text-center">
                                    {cfg ? <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>{st === "present" ? "P" : st === "absent" ? "A" : "L"}</span> : <span className="text-muted-foreground">—</span>}
                                  </td>;
                                })}
                                <td className="p-2 text-center font-bold text-emerald-600">{presentCount}</td>
                                <td className="p-2 text-center font-bold text-red-600">{absentCount}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                ))
              )}
            </>
          )}

          {attTab === "overview" && attSession && attClass && !isAllClassesMode && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={exportOverviewPDF} disabled={!overviewPivot.students.length} className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Export PDF</Button>
                <Badge variant="secondary">{overviewPivot.students.length} students · {overviewPivot.columns.length} papers</Badge>
                {/* Problem 1 fix: "Delete All Class Attendance" button for single-class mode.
                    Wipes EVERY attendance row for this class in this session. */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!overviewPivot.students.length || deleteClassAttendance.isPending} className="gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30">
                      <Trash2 className="w-3.5 h-3.5" /> Delete All Class Attendance
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete ALL attendance for Class {attClass}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes EVERY attendance record for Class {attClass} in this session — all {overviewPivot.columns.length} papers ({overviewPivot.columns.map(c => c.subject).join(", ")}), all dates, all {overviewPivot.students.length} students. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteClassAttendance.mutate({ sessionId: attSession, cls: attClass })}
                        className="bg-destructive text-destructive-foreground"
                      >
                        Delete Everything
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              {loadingOverview ? (
                <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
              ) : overviewPivot.students.length === 0 ? (
                <Card className="border-dashed border-2"><CardContent className="py-14 text-center">
                  <FileSpreadsheet className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="font-heading font-semibold">No Attendance Data Yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Initialize attendance sheets for papers to see the overview</p>
                </CardContent></Card>
              ) : (
                <>
                  {/* Mobile: one card per student, stacked subject rows */}
                  <div className="space-y-2 sm:hidden">
                    {overviewPivot.students.map(s => {
                      const statuses = overviewPivot.grid[s.id] || {};
                      const presentCount = overviewPivot.columns.filter(col => statuses[col.key] === "present").length;
                      const absentCount = overviewPivot.columns.filter(col => statuses[col.key] === "absent").length;
                      return (
                        <Card key={s.id}>
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">{s.name}</p>
                                <p className="text-xs font-mono text-primary font-bold">{s.examRoll}</p>
                              </div>
                              <div className="flex gap-2 text-xs shrink-0">
                                <span className="font-bold text-emerald-600">{presentCount}P</span>
                                <span className="font-bold text-red-600">{absentCount}A</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {overviewPivot.columns.map(col => {
                                const st = statuses[col.key] || "—";
                                const cfg = st !== "—" ? statusConfig[st as Status] : null;
                                return (
                                  <div key={col.key} className="flex items-center justify-between gap-1 bg-secondary/40 rounded-lg px-2 py-1">
                                    <span className="text-[10px] text-muted-foreground truncate">{col.subject}</span>
                                    {cfg ? <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold shrink-0 ${cfg.bg} ${cfg.color}`}>{st === "present" ? "P" : st === "absent" ? "A" : "L"}</span> : <span className="text-muted-foreground text-[10px]">—</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Desktop / tablet: horizontally scrollable table */}
                  <Card className="hidden sm:block"><CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead><tr className="border-b border-border bg-secondary/30">
                        <th className="text-left p-2 text-xs font-semibold text-muted-foreground bg-secondary/30 sticky left-0">Student</th>
                        <th className="text-left p-2 text-xs font-semibold text-muted-foreground">Exam Roll</th>
                        {overviewPivot.columns.map(col => (
                          <th key={col.key} className="text-center p-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                            {col.subject}<br /><span className="font-normal text-[10px] text-muted-foreground/70">{col.date}</span>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button className="block mx-auto mt-1 text-destructive/60 hover:text-destructive" title={`Delete ${col.subject} attendance`}>
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {col.subject} attendance?</AlertDialogTitle>
                                  <AlertDialogDescription>This deletes the entire attendance sheet for {col.subject} (all dates) for Class {attClass}. This cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    // No examDate passed → deletes ALL dates for this subject+class (rev. 12).
                                    onClick={() => deleteAttendance.mutate({ sessionId: attSession, cls: attClass, subject: col.subject })}
                                    className="bg-destructive text-destructive-foreground"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </th>
                        ))}
                        <th className="text-center p-2 text-xs font-semibold text-muted-foreground">Present</th>
                        <th className="text-center p-2 text-xs font-semibold text-muted-foreground">Absent</th>
                      </tr></thead>
                      <tbody>
                        {overviewPivot.students.map(s => {
                          const statuses = overviewPivot.grid[s.id] || {};
                          const presentCount = overviewPivot.columns.filter(col => statuses[col.key] === "present").length;
                          const absentCount = overviewPivot.columns.filter(col => statuses[col.key] === "absent").length;
                          return (
                            <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/20">
                              <td className="p-2 font-medium bg-card sticky left-0">{s.name}</td>
                              <td className="p-2 font-mono text-primary font-bold">{s.examRoll}</td>
                              {overviewPivot.columns.map(col => {
                                const st = statuses[col.key] || "—";
                                const cfg = st !== "—" ? statusConfig[st as Status] : null;
                                return <td key={col.key} className="p-2 text-center">
                                  {cfg ? <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>{st === "present" ? "P" : st === "absent" ? "A" : "L"}</span> : <span className="text-muted-foreground">—</span>}
                                </td>;
                              })}
                              <td className="p-2 text-center font-bold text-emerald-600">{presentCount}</td>
                              <td className="p-2 text-center font-bold text-red-600">{absentCount}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent></Card>
                </>
              )}
            </>
          )}

          {attTab === "overview" && (!attSession || !attClass) && (
            <Card className="border-dashed border-2"><CardContent className="py-14 text-center">
              <FileSpreadsheet className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-heading font-semibold">Select Session & Class</p>
              <p className="text-xs text-muted-foreground mt-1">Choose a session and class to see attendance overview</p>
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
};

export default AdminExamRollNumbers;
