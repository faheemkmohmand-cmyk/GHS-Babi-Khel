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
  Keyboard, History, FileText,
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
  useInitExamAttendance, useScanExamAttendance, useUpdateExamAttendance,
  useDeleteExamAttendance, EXAM_SUBJECTS,
  ExamAttStatus, ExamAttendanceRecord,
} from "@/hooks/useExamAttendance";

// ── Real QR Code generation using `qrcode` npm package ─────────────────────────
const qrCache = new Map<string, string>();
async function getQRDataURL(sessionId: string, studentId: string, examRollNo: string): Promise<string> {
  const key = `${sessionId}-${studentId}-${examRollNo}`;
  if (qrCache.has(key)) return qrCache.get(key)!;
  const data = encodeExamQRData(sessionId, studentId, examRollNo);
  const url = await QRCode.toDataURL(data, {
    width: 200, margin: 1, errorCorrectionLevel: "M",
    color: { dark: "#042C53", light: "#FFFFFF" },
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

// ── Camera QR Scanner using html5-qrcode ───────────────────────────────────
function QRScanner({ onScan, enabled }: { onScan: (data: string) => void; enabled: boolean }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerIdRef = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);

  const stop = useCallback(async () => {
    const inst = scannerRef.current;
    if (inst) {
      try { if ((inst as any).isScanning) await inst.stop(); } catch {}
      try { await inst.clear(); } catch {}
      scannerRef.current = null;
    }
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setActive(true);
    await new Promise(r => setTimeout(r, 80));
    try {
      const qr = new Html5Qrcode(containerIdRef.current);
      scannerRef.current = qr;
      await qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 200, height: 200 } },
        (decodedText: string) => { onScan(decodedText); stop(); },
        () => {}
      );
    } catch (e: any) {
      setError(e?.message || "Camera access failed");
      setActive(false);
    }
  }, [onScan, stop]);

  useEffect(() => () => { stop(); }, [stop]);

  return (
    <div className="space-y-3">
      {!active ? (
        <Button onClick={start} disabled={!enabled} className="gap-2 w-full bg-emerald-500 hover:bg-emerald-600 text-white" size="lg">
          <Camera className="w-5 h-5" /> Scan QR Code
        </Button>
      ) : (
        <div className="space-y-3">
          <div id={containerIdRef.current} className="w-full rounded-xl overflow-hidden bg-black border-2 border-emerald-400/50" style={{ minHeight: 250 }} />
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

  // Countdown form
  const [countdownDate, setCountdownDate] = useState("");
  const [countdownTime, setCountdownTime] = useState("08:00");
  const [countdownLabel, setCountdownLabel] = useState("Exam Roll Numbers will be published in");
  const [savingCountdown, setSavingCountdown] = useState(false);

  const [detailSearch, setDetailSearch] = useState("");

  // ── ATTENDANCE STATE ────────────────────────────────────────────────────
  const [attSession, setAttSession] = useState<string>("");
  const [attClass, setAttClass] = useState<string>("");
  const [attSubject, setAttSubject] = useState<string>("");
  const [attDate, setAttDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [attTab, setAttTab] = useState<"scan" | "overview">("scan");
  const [attSearch, setAttSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Scan state
  const [manualRoll, setManualRoll] = useState<string>("");
  
  const [scanLog, setScanLog] = useState<{ name: string; roll: string; time: string; status: string }[]>([]);
  const [showScanner, setShowScanner] = useState(false);

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

  const { data: attRollNumbers = [] } = useAttExamRollNumbers(attSession, attClass);
  const { data: attendance = [], isLoading: loadingAtt } = useExamAttendance(attSession, attClass, attSubject, attDate);
  const { data: overviewData = [], isLoading: loadingOverview } = useExamAttendanceOverview(attTab === "overview" ? attSession : undefined, attTab === "overview" ? attClass : undefined);

  const initAttendance = useInitExamAttendance();
  const scanAttendance = useScanExamAttendance();
  const updateAttendance = useUpdateExamAttendance();
  const deleteAttendance = useDeleteExamAttendance();

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
        const { data, error } = await supabase.from("students").select("id, full_name, roll_number, class, father_name").eq("class", cls).eq("is_active", true).order("roll_number", { ascending: true });
        if (error) throw error;
        studentsPerClass[cls] = data ?? [];
      }
      const orderedStudents: Student[] = [];
      for (const cls of classOrder) { if (studentsPerClass[cls]) orderedStudents.push(...studentsPerClass[cls]); }
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

  // ── Clean Admit Card PDF — 4 per A4 page, no logo ──────────────────────
  const downloadPrint = async () => {
    if (!selectedSession || rollNumbers.length === 0) return;
    const genToast = toast.loading("Generating admit cards...");

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210, pageH = 297;
    const cardW = pageW / 2;   // 105
    const cardH = pageH / 2;   // 148.5

    const ordered: ExamRollEntry[] = [];
    for (const cls of selectedSession.class_order) {
      ordered.push(...rollNumbers.filter(r => r.class === cls).sort((a, b) => a.serial_number - b.serial_number));
    }

    const qrImages = new Map<string, string>();
    for (const slip of ordered) {
      const data = encodeExamQRData(selectedSession.id, slip.student_id, slip.exam_roll_no);
      qrImages.set(slip.id, await QRCode.toDataURL(data, { width: 300, margin: 1, errorCorrectionLevel: "M", color: { dark: "#042C53", light: "#FFFFFF" } }));
    }

    const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s;

    const drawCard = (slip: ExamRollEntry, x: number, y: number) => {
      const pad = 3;
      // Outer thin navy border
      doc.setDrawColor(4, 44, 83);
      doc.setLineWidth(0.3);
      doc.rect(x + pad, y + pad, cardW - pad * 2, cardH - pad * 2, "S");

      // Header bar (8mm)
      const headerX = x + pad, headerY = y + pad, headerW = cardW - pad * 2, headerH = 8;
      doc.setFillColor(4, 44, 83);
      doc.rect(headerX, headerY, headerW, headerH, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text("GOVT. HIGH SCHOOL BABI KHEL", headerX + headerW / 2, headerY + 3.4, { align: "center" });
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(5);
      doc.text("EXAMINATION ADMIT CARD", headerX + headerW / 2, headerY + 6.6, { align: "center" });

      // Gold separator
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.4);
      doc.line(headerX, headerY + headerH + 0.5, headerX + headerW, headerY + headerH + 0.5);

      // Roll number box
      const contentTop = headerY + headerH + 3;
      const boxW = headerW - 26, boxH = 13;
      doc.setFillColor(235, 245, 251);
      doc.setDrawColor(176, 212, 241);
      doc.setLineWidth(0.3);
      doc.roundedRect(headerX, contentTop, boxW, boxH, 1.5, 1.5, "FD");
      doc.setTextColor(14, 116, 165);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      doc.text("EXAM ROLL NUMBER", headerX + boxW / 2, contentTop + 4, { align: "center" });
      doc.setTextColor(4, 44, 83);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(slip.exam_roll_no, headerX + boxW / 2, contentTop + 11, { align: "center" });

      // QR (20x20)
      const qrSize = 20;
      const qrX = headerX + headerW - qrSize;
      const qrY = contentTop;
      const qr = qrImages.get(slip.id);
      if (qr) doc.addImage(qr, "PNG", qrX, qrY, qrSize, qrSize);
      doc.setFontSize(4);
      doc.setTextColor(120, 120, 120);
      doc.setFont("helvetica", "normal");
      doc.text("Scan for Attendance", qrX + qrSize / 2, qrY + qrSize + 2.5, { align: "center" });

      // Two-column details
      const detailsTop = contentTop + Math.max(boxH, qrSize + 4) + 4;
      const colGap = 3;
      const colW = (headerW - colGap) / 2;
      const rowH = 6;
      const rows: [string, string][] = [
        ["Student Name", truncate(slip.student_name, 22)],
        ["Father Name", truncate(slip.father_name || "—", 22)],
        ["Class", `Class ${slip.class}`],
        ["Class Roll No", slip.class_roll_no],
        ["Session", truncate(`${selectedSession!.exam_term} ${selectedSession!.exam_year}`, 22)],
      ];
      rows.forEach((r, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const cx = headerX + col * (colW + colGap);
        const cy = detailsTop + row * rowH;
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(110, 120, 135);
        doc.text(r[0], cx, cy);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(4, 44, 83);
        doc.text(r[1], cx, cy + 3);
      });

      // Footer (5mm)
      const footH = 5;
      const footY = y + cardH - pad - footH;
      doc.setFillColor(4, 44, 83);
      doc.rect(headerX, footY, headerW, footH, "F");
      doc.setTextColor(212, 175, 55);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(4.5);
      doc.text("GHS BABI KHEL | DISTRICT MOHMAND | KPK", headerX + headerW / 2, footY + 2, { align: "center" });
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(3.5);
      doc.text("Bring this admit card to the examination hall.", headerX + headerW / 2, footY + 4.2, { align: "center" });
    };

    let i = 0;
    for (const slip of ordered) {
      const pos = i % 4;
      if (pos === 0 && i > 0) doc.addPage();
      const col = pos % 2, row = Math.floor(pos / 2);
      drawCard(slip, col * cardW, row * cardH);
      i++;
    }

    doc.save(`AdmitCards-${selectedSession.title}-${selectedSession.exam_year}.pdf`);
    toast.dismiss(genToast);
    toast.success(`${ordered.length} admit cards downloaded!`);
  };

  const filteredRolls = detailSearch
    ? rollNumbers.filter(r => r.student_name.toLowerCase().includes(detailSearch.toLowerCase()) || r.exam_roll_no.includes(detailSearch) || r.class_roll_no.includes(detailSearch) || r.class.includes(detailSearch))
    : rollNumbers;

  // ── ATTENDANCE COMPUTED ────────────────────────────────────────────────
  const isInitialized = attendance.length > 0;

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
    if (!overviewData.length) return { students: [], subjects: [], grid: {} };
    const subjectSet = new Set(overviewData.map(r => r.subject));
    const subjects = Array.from(subjectSet).sort();
    const studentMap = new Map<string, { name: string; rollNo: string; examRoll: string }>();
    overviewData.forEach(r => {
      if (!studentMap.has(r.student_id)) {
        studentMap.set(r.student_id, { name: r.student_name, rollNo: r.class_roll_no, examRoll: r.exam_roll_no });
      }
    });
    const students = Array.from(studentMap.entries()).map(([id, info]) => ({ id, ...info }));
    const grid: Record<string, Record<string, Status>> = {};
    overviewData.forEach(r => {
      if (!grid[r.student_id]) grid[r.student_id] = {};
      grid[r.student_id][r.subject] = r.status;
    });
    return { students, subjects, grid };
  }, [overviewData]);

  // ── ATTENDANCE HANDLERS ────────────────────────────────────────────────
  const handleInitSheet = () => {
    if (!attSession || !attClass || !attSubject || !attDate) {
      toast.error("Select session, class, subject, and date first"); return;
    }
    if (attRollNumbers.length === 0) { toast.error("No students found"); return; }
    initAttendance.mutate({
      sessionId: attSession, cls: attClass, subject: attSubject, examDate: attDate,
      students: attRollNumbers.map(r => ({
        student_id: r.student_id, student_name: r.student_name,
        class_roll_no: r.class_roll_no, exam_roll_no: r.exam_roll_no,
      })),
    });
  };

  const handleStatusChange = (record: ExamAttendanceRecord, newStatus: Status) => {
    updateAttendance.mutate({
      id: record.id!, status: newStatus,
      sessionId: attSession, cls: attClass, subject: attSubject, examDate: attDate,
    });
  };

  const handleDeleteSheet = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
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

  const handleQRScan = (qrData: string) => {
    const parsed = decodeExamQRData(qrData);
    if (!parsed) { toast.error("Invalid QR code — not an exam roll number"); return; }
    if (parsed.sessionId !== attSession) { toast.error("This QR code belongs to a different exam session"); return; }
    const student = attRollNumbers.find(r => r.student_id === parsed.studentId);
    if (!student) { toast.error("Student not found in this class"); return; }
    doScan(parsed.studentId, student.student_name, parsed.examRollNo);
    setShowScanner(false);
  };

  const handleManualRoll = () => {
    const roll = manualRoll.trim();
    if (!roll) return;
    const student = rollMap.get(roll);
    if (!student) { toast.error(`Roll number ${roll} not found`); return; }
    doScan(student.student_id, student.student_name, roll);
    setManualRoll("");
  };

  const doScan = (studentId: string, studentName: string, examRoll: string) => {
    const existing = attMap.get(studentId);
    if (existing?.status === "present") {
      toast(`${studentName} already marked Present`, { icon: "✅" });
      return;
    }
    scanAttendance.mutate({
      sessionId: attSession, studentId, subject: attSubject,
      examDate: attDate, cls: attClass, scannedBy: null,
    }, {
      onSuccess: (result) => {
        if (result.status === "already") {
          toast(`${studentName} already marked Present`, { icon: "✅" });
        } else {
          toast.success(`${studentName} marked Present!`);
          setScanLog(prev => [{ name: studentName, roll: examRoll, time: new Date().toLocaleTimeString(), status: "present" }, ...prev]);
        }
      },
    });
  };

  // ── EXPORT ATTENDANCE PDF ───────────────────────────────────────────────
  const exportAttendancePDF = () => {
    if (!attendance.length) { toast.error("No data to export"); return; }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();

    // ── Header (no logo) ──
    doc.setFillColor(4, 44, 83);
    doc.rect(0, 0, w, 36, "F");
    doc.setFillColor(212, 175, 55);
    doc.rect(0, 36, w, 1.2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Government High School Babi Khel", w / 2, 14, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 215, 230);
    doc.text("District Mohmand, KPK", w / 2, 21, { align: "center" });
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("EXAM ATTENDANCE REPORT", w / 2, 30, { align: "center" });

    // ── Info box ──
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(200, 210, 220);
    doc.setLineWidth(0.3);
    doc.roundedRect(12, 44, w - 24, 14, 2, 2, "FD");

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
      doc.setTextColor(100, 120, 140);
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text(item.label, cx, 49, { align: "center" });
      doc.setTextColor(4, 44, 83);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(item.value, cx, 55, { align: "center" });
    });

    // ── Table with autoTable ──
    const statusLabel = (s: string) => s === "present" ? "Present" : s === "absent" ? "Absent" : "Leave";
    const tableBody = attendance.map((r, idx) => [
      String(idx + 1), r.class_roll_no, r.exam_roll_no, r.student_name,
      statusLabel(r.status),
      r.scanned_at ? new Date(r.scanned_at).toLocaleTimeString() : "Manual",
    ]);

    autoTable(doc, {
      startY: 64,
      head: [["#", "Class Roll", "Exam Roll", "Student Name", "Status", "Time"]],
      body: tableBody,
      headStyles: { fillColor: [4, 44, 83], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9, halign: "center", cellPadding: 3 },
      bodyStyles: { fontSize: 9, cellPadding: 3, valign: "middle", textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 20, halign: "center" },
        2: { cellWidth: 25, halign: "center", fontStyle: "bold" },
        3: { cellWidth: 55 },
        4: { cellWidth: 22, halign: "center", fontStyle: "bold" },
        5: { cellWidth: 28, halign: "center" },
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 4) {
          const val = String(data.cell.raw);
          if (val === "Present") { data.cell.styles.textColor = [16, 122, 80]; data.cell.styles.fillColor = [209, 250, 229]; }
          else if (val === "Absent") { data.cell.styles.textColor = [185, 28, 28]; data.cell.styles.fillColor = [254, 226, 226]; }
          else if (val === "Leave") { data.cell.styles.textColor = [29, 78, 216]; data.cell.styles.fillColor = [219, 234, 254]; }
        }
        if (data.section === "body" && data.column.index === 3) {
          const text = String(data.cell.raw || "");
          data.cell.text = doc.splitTextToSize(text, 53);
        }
      },
      margin: { left: 12, right: 12, bottom: 30 },
    });

    // ── Signature area on each page ──
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      // Footer
      doc.setFillColor(212, 175, 55);
      doc.rect(0, h - 20, w, 1.5, "F");
      doc.setFillColor(4, 44, 83);
      doc.rect(0, h - 18.5, w, 18.5, "F");
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.text("GHS BABI KHEL — OFFICIAL EXAM ATTENDANCE REPORT", w / 2, h - 11, { align: "center" });
      doc.setTextColor(160, 180, 200);
      doc.setFontSize(5.5);
      doc.text(`Page ${p}/${totalPages}`, w - 18, h - 11, { align: "right" });

      // Signatures
      const sigY = h - 38;
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.3);
      // Left signature
      doc.line(20, sigY, 65, sigY);
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text("Class Teacher Signature", 42.5, sigY + 4, { align: "center" });
      // Right signature
      doc.line(w - 65, sigY, w - 20, sigY);
      doc.text("Principal Signature", w - 42.5, sigY + 4, { align: "center" });
    }

    doc.save(`ExamAttendance-Class${attClass}-${attSubject}-${attDate}.pdf`);
    toast.success("Professional attendance PDF exported!");
  };

  // ── RENDER ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
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
            <button onClick={() => setMainTab("rolls")} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${mainTab === "rolls" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              <Hash className="w-3.5 h-3.5 inline mr-1" />Roll Numbers
            </button>
            <button onClick={() => setMainTab("attendance")} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${mainTab === "attendance" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              <ClipboardCheck className="w-3.5 h-3.5 inline mr-1" />Exam Attendance
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
                    <select value={attSession} onChange={e => { setAttSession(e.target.value); setAttClass(""); setAttSubject(""); }}
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
                    {availableClasses.map((c: string) => <option key={c} value={c}>Class {c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Subject / Paper</label>
                  <select value={attSubject} onChange={e => setAttSubject(e.target.value)} disabled={!attClass}
                    className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50">
                    <option value="">Select Subject</option>
                    {EXAM_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Exam Date</label>
                  <input type="date" value={attDate} onChange={e => setAttDate(e.target.value)} disabled={!attSubject}
                    className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50" />
                </div>
              </div>
              {/* Sub-tab toggle */}
              <div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
                <button onClick={() => setAttTab("scan")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${attTab === "scan" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  <ScanLine className="w-3.5 h-3.5 inline mr-1" />Paper Attendance
                </button>
                <button onClick={() => setAttTab("overview")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${attTab === "overview" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1" />Class Overview
                </button>
              </div>
            </CardContent>
          </Card>

          {/* ── SCAN / PAPER ATTENDANCE TAB ── */}
          {attTab === "scan" && attSession && attClass && attSubject && attDate && (
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
                    <p className="text-xs text-muted-foreground">Initialize for {attRollNumbers.length} students of Class {attClass}</p>
                    <Button onClick={handleInitSheet} disabled={initAttendance.isPending || attRollNumbers.length === 0} className="gap-2">
                      {initAttendance.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} Initialize
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Action bar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input className="w-full pl-9 pr-4 py-2 rounded-xl bg-secondary/50 border border-border text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="Search student..." value={attSearch} onChange={e => setAttSearch(e.target.value)} />
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowScanner(!showScanner)} className="gap-1.5 bg-emerald-500 text-white hover:bg-emerald-600 border-emerald-500">
                      <Camera className="w-3.5 h-3.5" /> {showScanner ? "Close Scanner" : "Scan QR"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportAttendancePDF} className="gap-1.5"><FileText className="w-3.5 h-3.5" /> PDF</Button>
                    <Button variant="outline" size="sm" onClick={handleDeleteSheet}
                      className={`gap-1.5 ${confirmDelete ? "bg-red-500 text-white hover:bg-red-600" : "text-destructive hover:bg-destructive/10"}`}>
                      <Trash2 className="w-3.5 h-3.5" /> {confirmDelete ? "Confirm?" : "Delete"}
                    </Button>
                  </div>

                  {/* QR Scanner area */}
                  {showScanner && (
                    <Card className="border-emerald-200 dark:border-emerald-800/50">
                      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ScanLine className="w-4 h-4 text-emerald-500" /> Scan QR Code for Attendance</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        <QRScanner onScan={handleQRScan} enabled={!!attSession && !!attSubject} />
                        {/* Manual roll entry */}
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Keyboard className="w-3 h-3" />Manual Roll Number</label>
                          <div className="flex gap-2">
                            <input className="flex-1 px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono"
                              placeholder="e.g. 100001" value={manualRoll} onChange={e => setManualRoll(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") handleManualRoll(); }} />
                            <Button onClick={handleManualRoll} disabled={!manualRoll.trim()} className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 shrink-0"><Check className="w-4 h-4" /> Present</Button>
                          </div>
                        </div>
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
                                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all border ${status === st ? `${c.bg} ${c.color} border-current` : "bg-secondary/50 text-muted-foreground border-transparent hover:border-border"}`}>{c.label}</button>;
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
                                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${status === st ? `${c.bg} ${c.color} ring-1 ring-current` : "text-muted-foreground hover:text-foreground"}`}>{c.label}</button>;
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
          {attTab === "scan" && (!attSession || !attClass || !attSubject || !attDate) && (
            <Card className="border-dashed border-2"><CardContent className="py-14 text-center">
              <ClipboardCheck className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-heading font-semibold">Select Exam Details Above</p>
              <p className="text-xs text-muted-foreground mt-1">Choose a session, class, subject, and date</p>
            </CardContent></Card>
          )}

          {/* ── OVERVIEW TAB ── */}
          {attTab === "overview" && attSession && attClass && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={exportAttendancePDF} disabled={!overviewPivot.students.length} className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Export PDF</Button>
                <Badge variant="secondary">{overviewPivot.students.length} students · {overviewPivot.subjects.length} papers</Badge>
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
                <Card><CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead><tr className="border-b border-border bg-secondary/30">
                      <th className="text-left p-2 text-xs font-semibold text-muted-foreground sticky left-0 bg-secondary/30 z-10">Student</th>
                      <th className="text-left p-2 text-xs font-semibold text-muted-foreground">Exam Roll</th>
                      {overviewPivot.subjects.map(sub => <th key={sub} className="text-center p-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">{sub}</th>)}
                      <th className="text-center p-2 text-xs font-semibold text-muted-foreground">Present</th>
                      <th className="text-center p-2 text-xs font-semibold text-muted-foreground">Absent</th>
                    </tr></thead>
                    <tbody>
                      {overviewPivot.students.map(s => {
                        const statuses = overviewPivot.grid[s.id] || {};
                        const presentCount = overviewPivot.subjects.filter(sub => statuses[sub] === "present").length;
                        const absentCount = overviewPivot.subjects.filter(sub => statuses[sub] === "absent").length;
                        return (
                          <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/20">
                            <td className="p-2 font-medium sticky left-0 bg-card z-10">{s.name}</td>
                            <td className="p-2 font-mono text-primary font-bold">{s.examRoll}</td>
                            {overviewPivot.subjects.map(sub => {
                              const st = statuses[sub] || "—";
                              const cfg = st !== "—" ? statusConfig[st as Status] : null;
                              return <td key={sub} className="p-2 text-center">
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
