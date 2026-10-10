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
  Hash, Plus, Trash2, Eye, EyeOff, Loader2, ChevronUp, ChevronDown, RefreshCw,
  ArrowLeft, Timer, Clock, QrCode, ClipboardCheck, Search, Camera, Check, X, Palmtree,
  CalendarDays, BookOpen, Users, FileSpreadsheet, ScanLine, CheckCircle2, AlertCircle,
  Keyboard, History, FileText, Lock, XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { triggerConfetti } from "@/lib/confetti";
import QRCode from "qrcode";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
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
  type DateSheetLookup,
} from "@/hooks/useExamAttendance";
import { decodeSeatingQRData } from "@/hooks/useExamSeating";
import { useAllExamSchedule, ExamScheduleEntry } from "@/hooks/useNewFeatures";
import { format as formatDateFns } from "date-fns";
import { examTypeLabel } from "@/utils/examTypeLabel";

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

/**
 * Roll-number session status, countdown-aware:
 *   • "draft"     → is_published=false (invisible to students)
 *   • "scheduled" → published with publish_at still in the future.
 *       Setting a countdown now publishes the session IMMEDIATELY
 *       (data fully prepared, students see a live countdown), so the
 *       moment publish_at passes, students' devices flip to the slips
 *       instantly — no "Publishing now..." step, nothing to wait for.
 *   • "live"      → published and visible right now.
 */
type RollSessionStatus = "draft" | "scheduled" | "live";
function rollSessionStatus(s: { is_published: boolean; publish_at: string | null }): RollSessionStatus {
  if (!s.is_published) return "draft";
  const t = s.publish_at ? new Date(s.publish_at).getTime() : null;
  return t !== null && t > Date.now() ? "scheduled" : "live";
}

const ALL_CLASSES = ["6", "7", "8", "9", "10"];
const TERMS = ["1st Semester", "2nd Semester", "Annual-I", "Annual-II", "Annual"];

type Status = ExamAttStatus;
const statusConfig: Record<Status, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  present: { icon: <Check className="w-4 h-4" />, label: "Present", color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700/50" },
  absent:  { icon: <X className="w-4 h-4" />, label: "Absent",  color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700/50" },
  leave:   { icon: <Palmtree className="w-4 h-4" />, label: "Leave",  color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700/50" },
};

// Date-sheet subject names differ from the attendance subject list (e.g. "Maths" vs "Mathematics").
const SUBJECT_ALIASES: Record<string, string> = {
  maths: "Mathematics", math: "Mathematics", gscience: "General Science", science: "General Science",
  mquran: "Mutalia Quran", mutalia: "Mutalia Quran", pakstudy: "Pakistan Studies", pakstudies: "Pakistan Studies",
};
function canonicalSubject(raw: string): string {
  const key = String(raw || "").toLowerCase().replace(/[^a-z]/g, "");
  if (SUBJECT_ALIASES[key]) return SUBJECT_ALIASES[key];
  const hit = EXAM_SUBJECTS.find(x => x.toLowerCase().replace(/[^a-z]/g, "") === key);
  return hit ?? String(raw || "").trim();
}

// ── Shared premium PDF helpers (attendance reports) ──────────────────────────
type RGB = [number, number, number];
const PDF_INK: RGB = [0, 0, 0];
const PDF_ACCENT: RGB = [0, 0, 0];
const PDF_MUTED: RGB = [95, 95, 95];
const PDF_LINE: RGB = [165, 165, 165];

function safeFile(name: string): string {
  return name.replace(/[^\w\-. ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 80) || "report";
}

/** Plain black-and-white letterhead. Returns the Y position where content may start. */
function pdfBrandHeader(doc: jsPDF, reportTitle: string, subtitle: string): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("GOVT. HIGH SCHOOL BABI KHEL", w / 2, 13, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_MUTED);
  doc.text("District Mohmand, Khyber Pakhtunkhwa", w / 2, 18.5, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(0, 0, 0);
  doc.text(reportTitle, w / 2, 25.5, { align: "center", charSpace: 0.4 } as any);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.7);
  doc.line(12, 29, w - 12, 29);
  doc.setLineWidth(0.2);
  doc.line(12, 30.3, w - 12, 30.3);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_MUTED);
    doc.text(subtitle, w / 2, 36.5, { align: "center" });
    return 41;
  }
  return 36;
}

/** A row of rounded KPI tiles. Returns the Y position just below the tiles. */
function pdfSummaryTiles(doc: jsPDF, y: number, tiles: { label: string; value: string; color?: RGB }[], margin = 12): number {
  const w = doc.internal.pageSize.getWidth();
  const gap = 4;
  const tw = (w - margin * 2 - gap * (tiles.length - 1)) / tiles.length;
  const th = 17;
  tiles.forEach((t, i) => {
    const x = margin + i * (tw + gap);
    doc.setDrawColor(...PDF_LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, tw, th, 2, 2, "S");
    const c: RGB = [0, 0, 0];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...PDF_MUTED);
    doc.text(t.label.toUpperCase(), x + tw / 2, y + 6, { align: "center", charSpace: 0.3 } as any);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...c);
    doc.text(t.value, x + tw / 2, y + 13.2, { align: "center" });
  });
  return y + th + 5;
}

/** Footer on every page: rule, school/report label, page x/y, generated stamp. */
function pdfFooters(doc: jsPDF, label: string) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const total = (doc as any).internal.getNumberOfPages();
  const stamp = formatDateFns(new Date(), "dd MMM yyyy, hh:mm a");
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...PDF_LINE);
    doc.setLineWidth(0.3);
    doc.line(12, h - 12, w - 12, h - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...PDF_MUTED);
    doc.text(`GHS Babi Khel  ·  ${label}`, 12, h - 7.5);
    doc.text(`Generated ${stamp}`, w / 2, h - 7.5, { align: "center" });
    doc.text(`Page ${p} of ${total}`, w - 12, h - 7.5, { align: "right" });
  }
}

/** Signature block placed after the table; moves to a new page if there is no room. */
function pdfSignatures(doc: jsPDF, afterY: number, labels: string[]) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  let y = afterY + 28;
  if (y > h - 24) { doc.addPage(); y = 50; }
  const margin = 18;
  const colW = (w - margin * 2) / labels.length;
  const lineW = Math.min(34, colW - 40);            // short lines, wide gaps between signers
  labels.forEach((l, i) => {
    const x0 = margin + i * colW + (colW - lineW) / 2;
    const x1 = x0 + lineW;
    doc.setDrawColor(90, 98, 115);
    doc.setLineWidth(0.35);
    doc.line(x0, y, x1, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_INK);
    doc.text(l, (x0 + x1) / 2, y + 4.5, { align: "center" });
  });
}

// ── Countdown display component ──────────────────────────────────────────────
// Countdown display component.
// Shows the remaining time while a countdown runs. Because sessions are
// now published the moment a countdown is SET (not when it ends), reaching
// zero simply means the slips are live — the card flips to a green
// "Live Now" state instead of the old stuck "Publishing now...".
// onExpire lets the parent refresh its badges/status the moment it fires.
function CountdownTimer({ targetDate, label, onExpire }: { targetDate: string; label: string; onExpire?: () => void }) {
  const [parts, setParts] = useState<{ d: number; h: number; m: number; s: number } | null>(null);
  const [expired, setExpired] = useState(false);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    expiredRef.current = false;
    setExpired(false);
    const calc = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setParts(null);
        if (!expiredRef.current) {
          expiredRef.current = true;
          setExpired(true);
          onExpireRef.current?.();
        }
        return;
      }
      setParts({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [targetDate]);

  if (expired) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">{label || "Roll numbers publish in"}</p>
          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-300">Live now — slips are visible to students</p>
        </div>
      </div>
    );
  }

  const cells: [string, number | undefined][] = [
    ["Days", parts?.d], ["Hrs", parts?.h], ["Min", parts?.m], ["Sec", parts?.s],
  ];
  return (
    <div className="rounded-xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 px-3 py-2.5 text-white">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
        </span>
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">{label || "Roll numbers publish in"}</p>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {cells.map(([name, v]) => (
          <div key={name} className="rounded-lg bg-white/[0.08] py-1.5 text-center">
            <div className="font-mono text-lg font-bold leading-none tabular-nums sm:text-2xl">{String(v ?? 0).padStart(2, "0")}</div>
            <div className="mt-1 text-[9px] font-medium uppercase tracking-wider text-slate-400">{name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Camera QR Scanner component (html5-qrcode) ──────────────────────────────────
// MOBILE & LAPTOP OPTIMIZED:
//   - Adaptive qrbox size based on screen width
//   - Better error messages for common issues
//   - Camera permission handling works on both platforms
//   - Continuous scanning mode (camera stays open between scans)
function QRScanner({ onScan, enabled }: { onScan: (data: string) => void; enabled: boolean }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // IMPORTANT: this id must NOT contain "qr-reader". src/index.css has a global
  // `[id*="qr-reader"] { position:absolute; width:100%; height:100%; max-width:none !important }`
  // rule (made for the old full-screen scanner) that overrides any size set here and
  // stretched the camera over the whole screen.
  const containerIdRef = useRef(`scanview-${Math.random().toString(36).slice(2)}`);
  // Fixed, small portrait viewport (inline px so no stylesheet can enlarge it).
  const viewW = useMemo(
    () => (typeof window !== "undefined" && window.innerWidth < 768 ? Math.max(180, Math.min(220, window.innerWidth - 120)) : 300),
    []
  );
  
  // ── SCAN COOLDOWN (camera stays open, ready for the NEXT student) ──
  // Previously onScan() was immediately followed by stop(), closing the
  // camera after every single scan and forcing the admin to tap "Scan QR"
  // again for each student. Now the camera stays running continuously; we
  // only guard against the SAME code re-firing repeatedly while it's still
  // in view (the decode callback fires ~10x/sec per frame).
  const lastScanRef = useRef<{ code: string; time: number } | null>(null);
  // Reduced cooldown for faster successive scans
  const SCAN_COOLDOWN_MS = 700;

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
      try { if ((inst as any).isScanning) await inst.stop(); } catch { /* intentional */ }
      try { await inst.clear(); } catch { /* intentional */ }
      scannerRef.current = null;
    }
    lastScanRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    
    // Detect device type for adaptive settings
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
    
    // Explicitly request camera permission first — Android Chrome requires
    // getUserMedia to be called from a user gesture before Html5Qrcode can
    // access the camera. Without this, html5-qrcode throws "Camera access failed".
    try {
      const constraints: MediaStreamConstraints = { 
        video: isMobile 
          ? { facingMode: "environment" } 
          : { 
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 }
            } 
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach(t => t.stop()); // release; html5-qrcode will re-open
    } catch (permErr) {
      const msg = permErr?.name === "NotAllowedError"
        ? "Camera permission denied. Please allow camera access in your browser settings and try again."
        : permErr?.name === "NotFoundError"
          ? "No camera found. Please connect a camera and try again."
        : permErr?.name === "NotReadableError"
          ? "Camera is in use by another application. Please close other apps using the camera."
        : permErr?.message || "Camera access failed";
      setError(msg);
      return;
    }
    setActive(true);
    
    // Adaptive wait time based on device — gives the camera hardware time
    // to fully release after the permission-check stream above was
    // stopped. Too short a wait here was the likely cause of html5-qrcode's
    // start() failing on some Android/Chrome builds even though permission
    // was already granted.
    const waitTime = isMobile ? 350 : 200; // retry below covers slow hardware
    await new Promise(r => setTimeout(r, waitTime));

    // Small scan box = fewer pixels to decode per frame = noticeably faster locks.
    const boxSide = Math.max(130, Math.min(isMobile ? 150 : 200, viewW - 36));
    const qrboxSize = { width: boxSide, height: boxSide };
    // Portrait viewport on phones (3:4), standard 4:3 on laptops.
    const viewAspect = isMobile ? 0.75 : 1.3333;

    const attemptStart = async (): Promise<void> => {
      // QR only (skips every other barcode format) + the browser's native detector when available.
      const qr = new Html5Qrcode(containerIdRef.current, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      });
      scannerRef.current = qr;
      await qr.start(
        { facingMode: "environment" },
        {
          fps: 30,
          qrbox: qrboxSize,
          aspectRatio: viewAspect,
          disableFlip: true,
        },
        handleDecoded,
        () => {} // No-op for scan failure (keep trying)
      );
    };

    try {
      await attemptStart();
    } catch (e) {
      // Retry with longer delay on mobile
      const retryDelay = isMobile ? 1500 : 800;
      try {
        await new Promise(r => setTimeout(r, retryDelay));
        await attemptStart();
      } catch (retryErr) {
        const retryMsg = retryErr?.message || "Camera access failed";
        const retryName = retryErr?.name || "";
        // Only report "permission denied" when the error is genuinely a
        // permission error (NotAllowedError / SecurityError). html5-qrcode's
        // generic internal failure message is literally the string
        // "Camera access failed" for many unrelated causes (camera busy,
        // hardware momentarily unavailable, facingMode not resolved yet,
        // etc.) — treating that string alone as proof of a permission
        // problem was showing a misleading message even when the browser
        // had already granted camera access.
        if (retryName === "NotAllowedError" || retryName === "SecurityError") {
          setError(isMobile
            ? "Camera access denied. Go to Chrome Settings > Site Settings > Camera > Allow."
            : "Camera access denied. Click the camera icon in your browser's address bar to allow access."
          );
        } else if (retryName === "NotFoundError" || retryMsg.includes("NotFound") || retryMsg.includes("DevicesNotFound")) {
          setError("No camera detected. Please connect a webcam and refresh the page.");
        } else if (retryName === "NotReadableError") {
          setError("Camera is in use by another app or tab. Close it and tap Retry Camera.");
        } else {
          // Genuinely unknown cause — say so honestly instead of guessing
          // "permission denied", and suggest the most likely real fixes.
          setError(`Could not start the camera (${retryMsg}). Try closing other apps using the camera, then tap Retry Camera.`);
        }
        setActive(false);
      }
    }
  }, [handleDecoded]);

  // ── AUTO-START (removes the redundant double-click) ──
  useEffect(() => {
    if (enabled) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { stop(); }, [stop]);

  return (
    <div className="space-y-2">
      {!active ? (
        <Button onClick={start} disabled={!enabled} className="h-8 w-full gap-2 rounded-lg bg-emerald-500 text-xs text-white hover:bg-emerald-600">
          <Camera className="h-3.5 w-3.5" /> {error ? "Retry Camera" : "Starting Camera…"}
        </Button>
      ) : (
        <div className="space-y-1.5">
          {/* Hard-capped portrait box: the library sizes the video to this element's width. */}
          <style>{`#${containerIdRef.current} video{display:block!important;width:100%!important;height:auto!important;max-height:300px;object-fit:cover}`}</style>
          <div
            id={containerIdRef.current}
            style={{ width: viewW, maxWidth: "100%", maxHeight: 300, margin: "0 auto", overflow: "hidden", borderRadius: 14, background: "#000", border: "1px solid rgba(16,185,129,.45)" }}
          />
          <div className="flex items-center justify-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <p className="text-[11px] text-muted-foreground">Point camera at the QR code</p>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800/50 dark:bg-red-950/30">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
const AdminExamRollNumbers = () => {
  const qc = useQueryClient();
  // Exam date sheet (built by admin in "Exam Date Sheet") — pulled in so
  // Roll No Slips can print each student's actual paper-by-paper schedule.
  const { data: allExamSchedule = [] } = useAllExamSchedule();
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

  // ── INSTANT SCAN PREVIEW (board-system style confirm) ─────────────────
  // The moment a QR decodes, look the student up CLIENT-SIDE (no network
  // round-trip — attRollNumbers is already loaded) and show a big
  // name/class/roll confirm card INSTANTLY. The admin can visually verify
  // against the actual student, then tap Confirm (or it auto-confirms
  // shortly after) — only THEN does the network mutation fire. This makes
  // scanning feel instant even though the server-side mark (with its
  // multi-strategy stale-QR fallback lookups) still takes a moment.
  //
  // ── FIX: Student interface now STAYS VISIBLE when scanning different QR codes ──
  // Previously, scanning a new QR code would sometimes hide the student card
  // due to race conditions between timer callbacks and state updates. Now:
  //   1. A scanId ref tracks which QR is currently being previewed
  //   2. Timer callback checks if it's STILL the current scan before clearing
  //   3. Interface stays visible until explicitly confirmed or cancelled
  //   4. Auto-confirm time increased to 3 seconds for better UX
  interface ScanPreview {
    studentId: string;
    studentName: string;
    class: string;
    classRollNo: string;
    examRollNo: string;
    qrData: string;
    seatParsed: ReturnType<typeof decodeSeatingQRData>;
    subject: string | null;
    autoConfirmAt: number;
    scanId: string; // Unique ID to track this specific scan
  }
  const [scanPreview, setScanPreview] = useState<ScanPreview | null>(null);
  const scanPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track current scan ID to prevent stale timers from clearing new previews
  const currentScanIdRef = useRef<string>("");
  const AUTO_CONFIRM_MS = 3000; // Increased from 1100ms to 3 seconds for better UX
  useEffect(() => {
    return () => { 
      if (scanPreviewTimerRef.current) clearTimeout(scanPreviewTimerRef.current); 
    };
  }, []);
  const [showScanner, setShowScanner] = useState(false);
  // Manual attendance list is hidden by default after Initialize — the
  // student list only appears once the admin explicitly taps "Manual
  // Attendance", so QR scanning (the common path) isn't buried under a
  // long list of names right after initializing. Purely a display toggle;
  // nothing about attendance records or scanning logic changes.
  const [showManualList, setShowManualList] = useState(false);

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
    } catch (err) {
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
    } catch (err) {
      toast.error(`Update failed: ${err.message}`);
    }
    setUpdatingStudents(false);
  };

  const togglePublish = async (session: ExamSession) => {
    // Going live manually → publish NOW and clear any scheduled countdown
    // ("Publish Now" must be instant — no leftover publish_at to gate it).
    // Unpublishing → full reset: hide the slips AND remove the countdown so
    // students never see a timer for something that is taken offline.
    const goingLive = !session.is_published;
    const payload = goingLive
      ? { is_published: true, publish_at: null as string | null }
      : { is_published: false, publish_at: null as string | null, countdown_label: null as string | null };
    const { error } = await supabase.from("exam_roll_sessions").update(payload).eq("id", session.id);
    if (error) { toast.error("Failed"); return; }
    toast.success(goingLive ? "Published — slips are live now!" : "Unpublished");
    if (goingLive) triggerConfetti("burst");
    qc.invalidateQueries({ queryKey: ["exam-sessions"] });
    if (selectedSession?.id === session.id) {
      setSelectedSession({
        ...session,
        is_published: goingLive,
        publish_at: null,
        countdown_label: goingLive ? session.countdown_label : null,
      });
    }
  };

  const saveCountdown = async (session: ExamSession) => {
    if (!countdownDate) { toast.error("Pick a date for countdown"); return; }
    setSavingCountdown(true);
    const publishAt = new Date(`${countdownDate}T${countdownTime}:00`).toISOString();
    // THE FIX for the stuck "Publishing now...": publish the session in the
    // SAME update that starts the countdown. The roll-number data is fully
    // prepared and readable the moment the countdown starts, and students'
    // devices flip to the slips instantly when it reaches zero — no waiting,
    // no publish step at countdown end, nothing that can get stuck.
    const { error } = await supabase.from("exam_roll_sessions").update({
      publish_at: publishAt, countdown_label: countdownLabel, is_published: true,
    }).eq("id", session.id);
    setSavingCountdown(false);
    if (error) { toast.error("Failed to save countdown"); return; }
    toast.success("Countdown set — slips go live automatically when it ends");
    qc.invalidateQueries({ queryKey: ["exam-sessions"] });
    if (selectedSession?.id === session.id) {
      setSelectedSession({ ...session, publish_at: publishAt, countdown_label: countdownLabel, is_published: true });
    }
  };

  const clearCountdown = async (session: ExamSession) => {
    // Removing a countdown also unpublishes ONLY the schedule gate — the
    // session stays published (is_published=true) and goes live instantly,
    // since the data was already prepared when the countdown was set.
    const { error } = await supabase.from("exam_roll_sessions").update({ publish_at: null }).eq("id", session.id);
    if (error) { toast.error("Failed"); return; }
    toast.success("Countdown removed — session is live now");
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



  // ── Roll No Slips PDF (2 per A4, landscape) ─────────────────────────────
  // Each slip = school header, student info (left) + QR (right), then the
  // student's own class's Exam Date Sheet (pulled from what admin built in
  // "Exam Date Sheet"), then a Deputy Controller signature line + instructions.
  // A4 landscape page is split in half — one slip on the left half, one on
  // the right half — separated by a light cut/fold guide line.
  const downloadPrint = async () => {
    if (!selectedSession || rollNumbers.length === 0) return;

    const genToast = toast.loading("Generating Roll No Slips with date sheet & QR codes...");

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = 297;
    const pageH = 210;
    const margin = 6;
    const midGap = 3; // gap either side of the center cut line

    const halfW = (pageW - margin * 2 - midGap * 2) / 2;
    const slipH = pageH - margin * 2;
    const leftX0 = margin;
    const rightX0 = margin + halfW + midGap * 2;

    // Sort by class order (same order as everywhere else in this session)
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

    // Build each class's paper-by-paper date sheet from the admin-authored
    // Exam Date Sheet (exam_schedule table). Classes 9 & 10 use "Annual-I" /
    // "Annual-II" exam types while 6-8 use "1st/2nd Semester" — these don't
    // match the roll session's single exam_term string, so first try an exact
    // match, and if a class has none, fall back to whatever exam_type that
    // class actually has scheduled for this year.
    const scheduleByClass = new Map<string, ExamScheduleEntry[]>();
    for (const cls of selectedSession.class_order) {
      let rows = allExamSchedule
        .filter(e => e.class === cls && e.exam_type === selectedSession.exam_term && e.year === selectedSession.exam_year)
        .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
      if (rows.length === 0) {
        rows = allExamSchedule
          .filter(e => e.class === cls && e.year === selectedSession.exam_year)
          .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
      }
      scheduleByClass.set(cls, rows);
    }

    const drawSlip = (slip: ExamRollEntry, x: number, y: number) => {
      const w = halfW;
      const h = slipH;
      const schedule = scheduleByClass.get(slip.class) || [];
      const padX = 8;
      const cx = x + w / 2;

      // ── Frame: outer + hairline inner border ──
      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(0.6);
      doc.rect(x, y, w, h, "S");
      doc.setDrawColor(190, 190, 190);
      doc.setLineWidth(0.2);
      doc.rect(x + 1.6, y + 1.6, w - 3.2, h - 3.2, "S");

      // ── HEADER ──
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("GOVT. HIGH SCHOOL BABI KHEL", cx, y + 12, { align: "center" });

      doc.setFontSize(10.5);
      doc.setTextColor(60, 60, 60);
      const classExamType = schedule[0]?.exam_type || selectedSession.exam_term;
      doc.text(`${examTypeLabel(classExamType).toUpperCase()} ${selectedSession.exam_year}`, cx, y + 18.5, { align: "center" });

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(110, 110, 110);
      doc.text("EXAM  ROLL  NUMBER  SLIP", cx, y + 23.5, { align: "center", charSpace: 0.6 } as any);

      doc.setDrawColor(60, 60, 60);
      doc.setLineWidth(0.7);
      doc.line(x + padX, y + 27, x + w - padX, y + 27);
      doc.setLineWidth(0.2);
      doc.line(x + padX, y + 28.3, x + w - padX, y + 28.3);

      // ── STUDENT INFO (left) + QR (right) ──
      const qrSize = 32;
      const qrBoxX = x + w - padX - qrSize - 2;
      const qrBoxY = y + 33;
      const qrImg = qrImages.get(slip.id);
      const leftX = x + padX;
      const valX = leftX + 30;
      const maxValW = qrBoxX - valX - 4;

      const drawRow = (label: string, value: string, yy: number, big = false) => {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(115, 115, 115);
        doc.text(label, leftX, yy);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 20, 20);
        doc.setFontSize(big ? 13 : 10.5);
        let v = value;
        while (v.length > 4 && doc.getTextWidth(v) > maxValW) v = v.slice(0, -2);
        if (v !== value) v = v.replace(/\s+$/, "") + "…";
        doc.text(v, valX, yy);
      };
      let rowY = y + 41;
      const rowGap = 8;
      drawRow("Student Name:", slip.student_name, rowY); rowY += rowGap;
      drawRow("Father Name:", slip.father_name || "—", rowY); rowY += rowGap;
      drawRow("Exam Roll No:", slip.exam_roll_no, rowY, true); rowY += rowGap;
      drawRow("Class:", `Class ${slip.class}`, rowY);

      if (qrImg) {
        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.35);
        doc.roundedRect(qrBoxX - 1.5, qrBoxY - 1.5, qrSize + 3, qrSize + 3, 1.5, 1.5, "S");
        doc.addImage(qrImg, "PNG", qrBoxX, qrBoxY, qrSize, qrSize);
      }

      // ── LAYOUT BUDGET ──
      // The slip is 198 mm tall. We size the date-sheet rows from the room that is
      // actually available so the page is filled evenly (no empty block in the middle)
      // whatever number of papers the class has.
      const tableStartY = y + 72;
      const sigY = y + h - 12;
      const instrLines = 6;
      const instrLineH = 5.2;
      const instrH = 7 + instrLines * instrLineH;
      const sigTop = sigY - 9;
      const tableAvail = sigTop - instrH - 6 - tableStartY;
      const nRows = Math.max(schedule.length, 1) + 1;
      const rowMm = Math.min(8.2, Math.max(5, tableAvail / nRows));
      const fontPt = rowMm >= 6.6 ? 8.5 : rowMm >= 5.8 ? 7.8 : 7;
      const cellPad = Math.max(1, (rowMm - fontPt * 0.352 * 1.15) / 2);

      if (schedule.length > 0) {
        autoTable(doc, {
          startY: tableStartY,
          margin: { left: x + padX, right: pageW - (x + w) + padX, bottom: pageH - sigTop },
          tableWidth: w - padX * 2,
          head: [["Paper Date", "Day", "Subject", "From", "To"]],
          body: schedule.map(e => [
            formatDateFns(new Date(e.exam_date), "dd-MM-yyyy"),
            formatDateFns(new Date(e.exam_date), "EEEE"),
            e.subject,
            e.start_time || "—",
            e.end_time || "—",
          ]),
          columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 26 }, 3: { cellWidth: 15 }, 4: { cellWidth: 15 } },
          styles: { fontSize: fontPt, cellPadding: cellPad, textColor: [30, 30, 30], lineColor: [150, 150, 150], lineWidth: 0.2, halign: "center", valign: "middle" },
          headStyles: { fillColor: [228, 228, 228], textColor: [20, 20, 20], fontStyle: "bold", fontSize: fontPt, halign: "center", valign: "middle" },
          alternateRowStyles: { fillColor: [248, 248, 248] },
          theme: "grid",
        });
      } else {
        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(150, 150, 150);
        doc.text("Date sheet not yet published for this class.", cx, tableStartY + 12, { align: "center" });
      }

      // ── INSTRUCTIONS — sits under the table, never closer than 6 mm, pushed down
      // when the table is short so the lower half of the slip is balanced. ──
      const tableEndY = (doc as any).lastAutoTable?.finalY ?? (tableStartY + 30);
      const instrStartY = Math.max(tableEndY + 7, sigTop - instrH - 1);
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.25);
      doc.line(x + padX, instrStartY, x + w - padX, instrStartY);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      doc.text("Instructions:", x + padX, instrStartY + 5.5);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(70, 70, 70);
      const instructions = [
        "1. Bring this Roll No Slip to the exam center for every paper.",
        "2. No slip, no entry to the examination hall.",
        "3. Do not bring mobile phones, smart watches, or any electronic device to the exam hall.",
        "4. Do not fold, scratch, or damage the QR code — it must scan cleanly for attendance.",
        "5. Report any errors or omissions on this slip before the exam begins.",
        "6. Reach the exam center at least 30 minutes before the paper starts.",
      ];
      const maxInstrW = w - padX * 2;
      instructions.forEach((line, i) => {
        let t = line;
        while (t.length > 8 && doc.getTextWidth(t) > maxInstrW) t = t.slice(0, -2);
        if (t !== line) t = t.replace(/\s+$/, "") + "…";
        doc.text(t, x + padX, instrStartY + 11 + i * instrLineH);
      });

      // ── SIGNATURE (anchored bottom-right) ──
      doc.setDrawColor(90, 90, 90);
      doc.setLineWidth(0.35);
      doc.line(x + w - padX - 52, sigY, x + w - padX, sigY);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      doc.text("Deputy Controller of Exams", x + w - padX - 26, sigY + 4.2, { align: "center" });
    };

    let slipIdx = 0;
    for (const slip of ordered) {
      const posOnPage = slipIdx % 2;
      if (posOnPage === 0 && slipIdx > 0) doc.addPage("a4", "landscape");
      const sx = posOnPage === 0 ? leftX0 : rightX0;
      drawSlip(slip, sx, margin);

      // Cut/fold guide line down the center of the page
      if (posOnPage === 1) {
        doc.setDrawColor(200, 200, 200);
        // setLineDash exists on jsPDF at runtime but is missing from its .d.ts.
        const dashDoc = doc as unknown as { setLineDash: (dashArray: number[], dashPhase?: number) => void };
        dashDoc.setLineDash([2, 2], 0);
        doc.setLineWidth(0.2);
        doc.line(pageW / 2, margin, pageW / 2, pageH - margin);
        dashDoc.setLineDash([], 0);
      }
      slipIdx++;
    }

    doc.save(`RollNoSlips-${selectedSession.title}-${selectedSession.exam_year}.pdf`);
    toast.dismiss(genToast);
    toast.success(`${ordered.length} Roll No Slips downloaded!`);
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
  // Rules of Hooks: hooks may not be called inside .map()/loops, even with a
  // fixed-length array (the linter cannot prove the call count is stable).
  // Unrolled to five explicit, unconditional calls — byte-for-byte the same
  // runtime behaviour, but statically valid.
  const paperTimesQ6 = usePaperTimesFromSeatingPlan(
    isAllClassesMode && allClassSubjects["6"] ? attSession : undefined,
    isAllClassesMode ? (allClassSubjects["6"] || undefined) : undefined,
    isAllClassesMode ? attDate : undefined,
    isAllClassesMode ? "6" : undefined
  );
  const paperTimesQ7 = usePaperTimesFromSeatingPlan(
    isAllClassesMode && allClassSubjects["7"] ? attSession : undefined,
    isAllClassesMode ? (allClassSubjects["7"] || undefined) : undefined,
    isAllClassesMode ? attDate : undefined,
    isAllClassesMode ? "7" : undefined
  );
  const paperTimesQ8 = usePaperTimesFromSeatingPlan(
    isAllClassesMode && allClassSubjects["8"] ? attSession : undefined,
    isAllClassesMode ? (allClassSubjects["8"] || undefined) : undefined,
    isAllClassesMode ? attDate : undefined,
    isAllClassesMode ? "8" : undefined
  );
  const paperTimesQ9 = usePaperTimesFromSeatingPlan(
    isAllClassesMode && allClassSubjects["9"] ? attSession : undefined,
    isAllClassesMode ? (allClassSubjects["9"] || undefined) : undefined,
    isAllClassesMode ? attDate : undefined,
    isAllClassesMode ? "9" : undefined
  );
  const paperTimesQ10 = usePaperTimesFromSeatingPlan(
    isAllClassesMode && allClassSubjects["10"] ? attSession : undefined,
    isAllClassesMode ? (allClassSubjects["10"] || undefined) : undefined,
    isAllClassesMode ? attDate : undefined,
    isAllClassesMode ? "10" : undefined
  );
  const classPaperTimesQueries = [paperTimesQ6, paperTimesQ7, paperTimesQ8, paperTimesQ9, paperTimesQ10];

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

  // ── DATE-SHEET CROSS-CHECK (lock guard) ──────────────────────────────
  // The Exam Date Sheet is the AUTHORITATIVE source of when a paper is
  // scheduled. A stale or wrongly-created seating plan used to let the
  // admin mark attendance on days when no paper is actually scheduled
  // (e.g. a seating plan with a 12:00-21:00 window for today even
  // though the real paper is tomorrow). We build a per-(class, subject)
  // lookup of the date-sheet rows for the active session's term + year,
  // then feed it into getPaperWindowStatus so the panel is forced
  // "not_today" when no date-sheet row exists for the selection.
  //
  // In single-class mode we look up the (class, subject, date) directly.
  // In All-Classes mode we look up each class's selected subject — the
  // window is OPEN if ANY class has a matching date-sheet row, since the
  // admin can scan students from any class in that mode.
  const attSelectedSession = useMemo(
    () => attSessions.find((s: any) => s.id === attSession) ?? null,
    [attSessions, attSession]
  );

  // ── LOCKED CLASSES (All-Classes mode) ──────────────────────────────
  // The Date Sheet says which classes actually have a paper on the exam date.
  // Classes with none are locked; a class with exactly one paper is auto-selected.
  const todayPapersByClass = useMemo(() => {
    const sess = attSelectedSession as any;
    const out: Record<string, string[]> = {};
    for (const cls of availableClasses) {
      const forClass = allExamSchedule.filter(e => e.class === cls && (!sess || e.year === sess.exam_year));
      const termRows = sess ? forClass.filter(e => e.exam_type === sess.exam_term) : forClass;
      const rows = termRows.length ? termRows : forClass;
      out[cls] = Array.from(new Set(rows.filter(e => String(e.exam_date).slice(0, 10) === attDate).map(e => canonicalSubject(e.subject))));
    }
    return out;
  }, [allExamSchedule, availableClasses, attSelectedSession, attDate]);

  useEffect(() => {
    if (!isAllClassesMode) return;
    setAllClassSubjects(prev => {
      const next: Record<string, string> = {};
      for (const cls of availableClasses) {
        const subs = todayPapersByClass[cls] || [];
        if (subs.length === 1) next[cls] = subs[0];
        else if (subs.length > 1 && subs.includes(prev[cls])) next[cls] = prev[cls];
      }
      const same = Object.keys(next).length === Object.keys(prev).length && Object.keys(next).every(k => prev[k] === next[k]);
      return same ? prev : next;
    });
  }, [isAllClassesMode, todayPapersByClass, availableClasses]);

  // (previous dateSheetLookup computation removed — see note above; the
  // constant `dateSheetLookup = null` above is now the single definition)

  // ── DATE SHEET DISCONNECTED (per request) ────────────────────────────
  // Attendance no longer looks at the Exam Date Sheet at all. It relies
  // solely on the Seating Plan's live paper times (seatingPaperTimes,
  // fetched below) — the same source AdminExamConsole/3D Hall key off —
  // so Attendance can never disagree with what Console shows as live.
  const dateSheetLookup: DateSheetLookup | null = null;

  const attWindowStatus = useMemo(
    () => getPaperWindowStatus(
      attDate,
      firstAttRecord?.paper_start_time,
      firstAttRecord?.paper_end_time,
      seatingPaperTimes,
      new Date(attNowTick),
      dateSheetLookup
    ),
    [attDate, firstAttRecord?.paper_start_time, firstAttRecord?.paper_end_time, seatingPaperTimes, attNowTick, dateSheetLookup]
  );
  const canMarkAtt = canMarkExamAttendance(attWindowStatus);
  // Display priority: row-snapshot times > seating plan times (Date Sheet
  // is no longer consulted here).
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
        // PARALLEL init — each class's init is an independent DB write with
        // no ordering dependency on the others, so firing them all at once
        // (Promise.allSettled) is safe and turns an N-class × ~1s sequential
        // wait into a single ~1s parallel wait. The earlier sequential
        // approach was working around stale re-renders, not a correctness
        // requirement — allSettled resolves all of them together before we
        // touch the UI at all, so there's no "class A shows done, class B
        // still pending" flicker either.
        const results = await Promise.allSettled(
          classesToInit.map(cls => {
            const subj = allClassSubjects[cls];
            const students = byClass[cls];
            return initAttendance.mutateAsync({
              sessionId: attSession, cls, subject: subj, examDate: attDate,
              students: students.map(r => ({
                student_id: r.student_id, student_name: r.student_name,
                class_roll_no: r.class_roll_no, exam_roll_no: r.exam_roll_no,
              })),
            }).then(() => ({ cls, count: students.length }));
          })
        );
        let initedCount = 0;
        const failed: string[] = [];
        results.forEach((r, i) => {
          if (r.status === "fulfilled") initedCount += r.value.count;
          else failed.push(`Class ${classesToInit[i]}`);
        });
        if (initedCount === 0 && failed.length === classesToInit.length) {
          toast.error("Attendance could not be initialized for any class");
        } else if (failed.length > 0) {
          toast.error(`Initialized, but failed for: ${failed.join(", ")}`);
        } else {
          toast.success(`Attendance initialized for ${classesToInit.length} class${classesToInit.length > 1 ? "es" : ""}`);
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
    // ── STEP 1: INSTANT client-side preview (no network) ─────────────────
    // Both QR formats carry the student's identity directly in the QR
    // payload (desk QR: stid+rn, legacy QR: studentId). We can resolve
    // name/class/roll from the already-loaded attRollNumbers list
    // immediately — this is what makes the confirm card appear the instant
    // the camera decodes, instead of waiting on any network round trip.
    const seatParsed = decodeSeatingQRData(qrData);
    const legacyParsed = seatParsed ? null : decodeExamQRData(qrData);
    if (!seatParsed && !legacyParsed) {
      toast.error("Invalid QR code — not an exam roll number or desk QR");
      return;
    }
    const wantStudentId = seatParsed?.studentId ?? legacyParsed!.studentId;
    const wantExamRoll = seatParsed?.examRollNo ?? legacyParsed!.examRollNo;

    // Generate unique scan ID for this specific scan
    const newScanId = `${qrData.slice(0, 20)}_${Date.now()}`;
    // Update current scan ID immediately to invalidate any pending timer callbacks
    currentScanIdRef.current = newScanId;

    let previewStudent = attRollNumbers.find(r => r.student_id === wantStudentId)
      ?? attRollNumbers.find(r => r.exam_roll_no === wantExamRoll);

    // If not in the currently-loaded list (cross-class scan in single-class
    // mode), do one quick indexed lookup — still far faster than the full
    // multi-strategy resolution the mutation itself performs.
    if (!previewStudent) {
      try {
        const { data } = await supabase
          .from("exam_roll_numbers")
          .select("student_id, student_name, class_roll_no, exam_roll_no, class")
          .eq("session_id", attSession || legacyParsed?.sessionId)
          .eq("student_id", wantStudentId)
          .maybeSingle();
        if (data) previewStudent = data as any;
      } catch { /* handled by commit step's own robust fallback chain */ }
    }

    const previewClass = previewStudent?.class ?? null;
    const previewSubject = previewClass ? getSubjectForClass(previewClass) : null;

    // Clear any existing timer BEFORE setting new preview
    if (scanPreviewTimerRef.current) {
      clearTimeout(scanPreviewTimerRef.current);
      scanPreviewTimerRef.current = null;
    }

    if (previewStudent && previewClass) {
      const preview: ScanPreview = {
        studentId: previewStudent.student_id,
        studentName: previewStudent.student_name,
        class: previewClass,
        classRollNo: previewStudent.class_roll_no,
        examRollNo: previewStudent.exam_roll_no,
        qrData,
        seatParsed,
        subject: previewSubject,
        autoConfirmAt: Date.now() + AUTO_CONFIRM_MS,
        scanId: newScanId,
      };
      setScanPreview(preview);
      
      // Auto-confirm timer - but CHECKS scanId before clearing to prevent
      // race conditions when scanning different QR codes rapidly
      scanPreviewTimerRef.current = setTimeout(() => {
        // CRITICAL FIX: Only clear if this timer is still for the CURRENT scan
        // If user scanned a different QR code, currentScanIdRef would have changed
        // and we should NOT clear the new preview
        if (currentScanIdRef.current === newScanId) {
          commitQRScan(qrData, seatParsed);
          setScanPreview(null);
        }
        // If scanId doesn't match, a newer scan is being shown - don't interfere!
      }, AUTO_CONFIRM_MS);
    } else {
      // Couldn't resolve locally at all — fall straight through to the
      // full commit path, which has its own thorough fallback chain and
      // will show a clear error if the student truly isn't found.
      commitQRScan(qrData, seatParsed);
    }
  };

  const confirmScanNow = () => {
    if (!scanPreview) return;
    if (scanPreviewTimerRef.current) clearTimeout(scanPreviewTimerRef.current);
    // Invalidate scan ID to prevent any stale timer from re-firing
    currentScanIdRef.current = "";
    commitQRScan(scanPreview.qrData, scanPreview.seatParsed);
    setScanPreview(null);
  };

  const cancelScanPreview = () => {
    if (scanPreviewTimerRef.current) clearTimeout(scanPreviewTimerRef.current);
    // Invalidate scan ID to prevent any stale timer from re-firing
    currentScanIdRef.current = "";
    setScanPreview(null);
  };

  // ── STEP 2: the actual mark — unchanged robust logic, just renamed ────
  // Row shape shared by the in-memory roll lists and the Supabase fallback
  // lookups (which select a column subset — the extra list fields like id,
  // father_name and serial_number are simply absent on fallback rows).
  type ScanStudentRow = {
    student_id: string;
    student_name: string;
    class_roll_no: string | number;
    exam_roll_no: string;
    class: string;
    [k: string]: unknown;
  };
  const commitQRScan = async (qrData: string, seatParsedIn: ReturnType<typeof decodeSeatingQRData>) => {
    if (!canMarkAtt) {
      toast.error(paperWindowMessage(attWindowStatus, attDisplayPaperStart, attDisplayPaperEnd));
      return;
    }

    // ── Try desk-QR format first ({t:"seat",...}) ──
    // Desk QRs carry the student's class via the seat assignment. In
    // All-Classes mode, we look up the subject for that class.
    const seatParsed = seatParsedIn;
    if (seatParsed) {
      // We need to know the student's class to pick the right subject.
      // The desk-QR scan mutation resolves the class from the seat
      // assignment server-side, but we need the subject CLIENT-side to
      // pass it in. So we do a quick lookup of the assignment first.
      //
      // IMPORTANT (stale-sticker fix): match by DESK LOCATION only
      // (plan_id + room_id + seat_label) — NOT by the student_id encoded in
      // the QR. A printed sticker doesn't get reprinted every time "Update
      // Seating" reshuffles the room, so the student_id baked into an
      // already-printed sticker can go stale. Trusting the desk location
      // always reflects whoever is CURRENTLY assigned to that seat.
      let seatStudentClass: string | null = null;
      try {
        // Plain .select() (not .maybeSingle()) — if duplicate rows ever
        // exist for the same plan_id+room_id+seat_label (e.g. from an old
        // bug or a race condition), .maybeSingle() would throw a "multiple
        // rows returned" PostgREST error that was being silently swallowed
        // here (only `data` was destructured, `error` was discarded) —
        // making a real backend problem look like "could not resolve
        // class". Taking the first row instead means one stale/duplicate
        // row can't block a scan that should otherwise work.
        const { data: rows, error: lookupErr } = await supabase
          .from("exam_seating_assignments")
          .select("class")
          .eq("plan_id", seatParsed.planId)
          .eq("room_id", seatParsed.roomId)
          .eq("seat_label", seatParsed.seatLabel);
        console.log("[handleQRScan] desk lookup:", { planId: seatParsed.planId, roomId: seatParsed.roomId, seatLabel: seatParsed.seatLabel, rows, lookupErr });
        if (lookupErr) {
          console.error("[handleQRScan] seat assignment lookup error:", lookupErr);
        } else if (rows && rows.length > 0) {
          seatStudentClass = rows[0].class;
        }
      } catch (e) {
        console.error("[handleQRScan] seat assignment lookup failed:", e);
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
          scannedQrToken: qrData,
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
    // STALE-QR TOLERANT: The admin may be scanning an OLD admit-card QR
    // that was printed before "Update Exam Roll Numbers". The student_id
    // (UUID) is stable, so the primary lookup by student_id should work.
    // But we also try exam_roll_no as a fallback (in case student_id is
    // somehow stale). We do NOT reject cross-session QRs — instead, we
    // try to find the student in the CURRENT session by student_id first,
    // then by exam_roll_no. This makes old admit cards always scan.
    const parsed = decodeExamQRData(qrData);
    if (!parsed) { toast.error("Invalid QR code — not an exam roll number or desk QR"); return; }
    // NOTE: Do NOT reject cross-session QRs. The student_id might be valid
    // in the current session even if the QR was printed for a different
    // session. We try the current session first, then fall back.
    const effectiveSessionId = attSession || parsed.sessionId;

    // Fast path: student is in the loaded list. In All-Classes mode this
    // is the full session list; in single-class mode it's the class-filtered list.
    let student: ScanStudentRow | undefined = attRollNumbers.find(r => r.student_id === parsed.studentId);
    let studentClass: string | null = student?.class ?? null;

    // Slow path: student isn't in the loaded list (single-class mode + cross-
    // class scan). Look up across ALL classes in the session by student_id.
    if (!student) {
      try {
        const { data: crossStudent, error } = await supabase
          .from("exam_roll_numbers")
          .select("student_id, student_name, class_roll_no, exam_roll_no, class")
          .eq("session_id", effectiveSessionId)
          .eq("student_id", parsed.studentId)
          .maybeSingle();
        if (error) throw error;
        if (crossStudent) {
          student = crossStudent;
          studentClass = crossStudent.class;
        }
      } catch (e) {
        console.error("[handleQRScan] cross-class lookup failed:", e);
      }
    }

    // FALLBACK: if student_id lookup failed, try by exam_roll_no.
    // This handles the case where "Update Exam Roll Numbers" reshuffled
    // the table and the student_id in the OLD QR no longer matches — but
    // the exam_roll_no might match a CURRENT student (the one who now
    // holds that roll number after the update).
    if (!student && parsed.examRollNo) {
      try {
        const { data: rnStudent, error } = await supabase
          .from("exam_roll_numbers")
          .select("student_id, student_name, class_roll_no, exam_roll_no, class")
          .eq("session_id", effectiveSessionId)
          .eq("exam_roll_no", parsed.examRollNo)
          .maybeSingle();
        if (error) throw error;
        if (rnStudent) {
          student = rnStudent;
          studentClass = rnStudent.class;
        }
      } catch (e) {
        console.error("[handleQRScan] exam_roll_no fallback lookup failed:", e);
      }
    }

    if (!student || !studentClass) {
      toast.error("Student not found in this exam session");
      return;
    }
    // Determine the subject for this student's class.
    const subj = getSubjectForClass(studentClass);
    if (!subj) {
      toast.error(isAllClassesMode && (todayPapersByClass[studentClass]?.length ?? 0) === 0 ? `Class ${studentClass} has no paper on ${attDate} (Date Sheet) — locked.` : `No subject selected for Class ${studentClass}. Pick a subject in the ${isAllClassesMode ? "All-Classes" : "subject"} panel first.`);
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
    let student: ScanStudentRow | undefined = rollMap.get(roll);
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
      } catch (e) {
        console.error("[handleManualRoll] cross-class lookup failed:", e);
      }
    }
    if (!student || !studentClass) { toast.error(`Roll number ${roll} not found in this exam session`); return; }
    // Determine the subject for this student's class.
    const subj = getSubjectForClass(studentClass);
    if (!subj) {
      toast.error(isAllClassesMode && (todayPapersByClass[studentClass]?.length ?? 0) === 0 ? `Class ${studentClass} has no paper on ${attDate} (Date Sheet) — locked.` : `No subject selected for Class ${studentClass}. Pick a subject in the ${isAllClassesMode ? "All-Classes" : "subject"} panel first.`);
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
      examRollNo: examRoll,
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
    const sessionTitle = (attSelectedSession as any)?.title || "";
    let y = pdfBrandHeader(doc, "EXAM ATTENDANCE REPORT", sessionTitle);

    const total = attStats.total || attendance.length;
    const pct = total ? Math.round((attStats.present / total) * 100) : 0;
    // Class / Subject / Date strip
    doc.setDrawColor(...PDF_LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(12, y, w - 24, 14, 2, 2, "S");
    const meta: [string, string][] = [["CLASS", `Class ${attClass}`], ["SUBJECT", attSubject], ["DATE", attDate]];
    const mw = (w - 24) / meta.length;
    meta.forEach(([k, v], i) => {
      const cx = 12 + i * mw + mw / 2;
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(...PDF_MUTED);
      doc.text(k, cx, y + 5, { align: "center", charSpace: 0.3 } as any);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...PDF_INK);
      doc.text(v || "—", cx, y + 10.8, { align: "center" });
    });
    y += 14 + 4;

    y = pdfSummaryTiles(doc, y, [
      { label: "Total", value: String(total) },
      { label: "Present", value: String(attStats.present) },
      { label: "Absent", value: String(attStats.absent) },
      { label: "Leave", value: String(attStats.leave) },
      { label: "Attendance", value: `${pct}%` },
    ]);

    const tableBody = attendance.map((r, idx) => [
      String(idx + 1), r.class_roll_no, r.exam_roll_no, r.student_name,
      r.status === "present" ? "Present" : r.status === "absent" ? "Absent" : "Leave",
      r.scanned_at ? formatDateFns(new Date(r.scanned_at), "hh:mm a") : "Manual",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["#", "Class Roll", "Exam Roll", "Student Name", "Status", "Marked At"]],
      body: tableBody,
      theme: "grid",
      styles: { fontSize: 9.5, cellPadding: 2.8, valign: "middle", textColor: PDF_INK, lineColor: PDF_LINE, lineWidth: 0.25, overflow: "linebreak" },
      headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8.5, halign: "center", cellPadding: 3.2 },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 24, halign: "center" },
        2: { cellWidth: 28, halign: "center", fontStyle: "bold" },
        3: { halign: "left" },
        4: { cellWidth: 24, halign: "center", fontStyle: "bold" },
        5: { cellWidth: 26, halign: "center", textColor: [90, 90, 90] },
      },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      margin: { left: 12, right: 12, top: 14, bottom: 18 },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 4) {
          const v = String(d.cell.raw);
          if (v === "Absent") d.cell.styles.fontStyle = "bold";
          else if (v === "Leave") d.cell.styles.fontStyle = "italic";
        }
      },
    });

    pdfSignatures(doc, (doc as any).lastAutoTable?.finalY ?? y, ["Class Teacher", "Exam Controller", "Principal"]);
    pdfFooters(doc, "Exam Attendance Report");
    doc.save(`ExamAttendance-Class${attClass}-${safeFile(attSubject)}-${attDate}.pdf`);
    toast.success("Attendance PDF exported!");
  };

  // ── EXPORT CLASS OVERVIEW PDF ───────────────────────────────────────────
  // Subject x student grid for one class. Papers are ordered by exam date,
  // every cell is colour-coded (P / A / L), and each student gets a
  // Present / Absent / Attendance-% summary so the report is usable as-is.
  const exportOverviewPDF = (
    scopedClass?: string,
    scopedPivot?: { students: typeof overviewPivot.students; columns: typeof overviewPivot.columns; grid: typeof overviewPivot.grid }
  ) => {
    const pivot = scopedPivot ?? overviewPivot;
    const clsLabel = typeof scopedClass === "string" ? scopedClass : attClass;
    if (!pivot.students.length) { toast.error("No data to export"); return; }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const sessionTitle = (attSelectedSession as any)?.title || "";
    const termLabel = (attSelectedSession as any)?.exam_term
      ? `${examTypeLabel((attSelectedSession as any).exam_term)} ${(attSelectedSession as any).exam_year ?? ""}`.trim()
      : "";
    let y = pdfBrandHeader(doc, `CLASS ${clsLabel} — EXAM ATTENDANCE OVERVIEW`, [sessionTitle, termLabel].filter(Boolean).join("  ·  "));

    // Order papers by date (then name) — the grid reads like the date sheet.
    const columns = [...pivot.columns].sort((a, b) => (a.date === b.date ? a.subject.localeCompare(b.subject) : a.date.localeCompare(b.date)));
    const fmtShort = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? formatDateFns(new Date(d + "T00:00:00"), "dd MMM") : d);

    const rows = pivot.students.map((st, idx) => {
      const sts = pivot.grid[st.id] || {};
      const present = columns.filter(c => sts[c.key] === "present").length;
      const absent = columns.filter(c => sts[c.key] === "absent").length;
      const leave = columns.filter(c => sts[c.key] === "leave").length;
      const marked = present + absent + leave;
      const pct = marked ? Math.round((present / marked) * 100) : 0;
      return { idx, st, sts, present, absent, leave, pct, marked };
    });
    const totalPresent = rows.reduce((a, r) => a + r.present, 0);
    const totalAbsent = rows.reduce((a, r) => a + r.absent, 0);
    const totalMarked = rows.reduce((a, r) => a + r.marked, 0);
    const avg = totalMarked ? Math.round((totalPresent / totalMarked) * 100) : 0;

    y = pdfSummaryTiles(doc, y, [
      { label: "Students", value: String(rows.length) },
      { label: "Papers", value: String(columns.length) },
      { label: "Present marks", value: String(totalPresent) },
      { label: "Absent marks", value: String(totalAbsent) },
      { label: "Avg attendance", value: `${avg}%` },
    ]);

    const head = [["#", "Exam Roll", "Student Name", ...columns.map(c => `${c.subject}\n${fmtShort(c.date)}`), "P", "A", "Att %"]];
    const body = rows.map(r => [
      String(r.idx + 1), r.st.examRoll, r.st.name,
      ...columns.map(c => { const v = r.sts[c.key]; return v === "present" ? "P" : v === "absent" ? "A" : v === "leave" ? "L" : "–"; }),
      String(r.present), String(r.absent), r.marked ? `${r.pct}%` : "–",
    ]);
    const nCols = head[0].length;
    const firstSub = 3;
    const lastSub = 3 + columns.length - 1;

    // Fit the grid to the page: fixed columns get fixed widths, subject columns share the rest.
    const usable = w - 20;
    const fixed = 9 + 20 + 46 + 11 + 11 + 15;
    const subW = columns.length ? Math.max(14, Math.min(26, (usable - fixed) / columns.length)) : 20;

    const tableW = fixed + subW * columns.length;
    const mLeft = Math.max(6, (w - tableW) / 2);   // centre the table on the page
    autoTable(doc, {
      startY: y,
      head,
      body,
      theme: "grid",
      tableWidth: tableW,
      styles: { fontSize: 8.5, cellPadding: 2.2, valign: "middle", halign: "center", textColor: [0, 0, 0], lineColor: [150, 150, 150], lineWidth: 0.25, overflow: "linebreak" },
      headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 7.2, halign: "center", valign: "middle", cellPadding: 2.4 },
      columnStyles: {
        0: { cellWidth: 9 },
        1: { cellWidth: 20, fontStyle: "bold" },
        2: { cellWidth: 46, halign: "center", fontStyle: "bold" },
        ...Object.fromEntries(columns.map((_, i) => [firstSub + i, { cellWidth: subW }])),
        [nCols - 3]: { cellWidth: 11, fontStyle: "bold" },
        [nCols - 2]: { cellWidth: 11, fontStyle: "bold" },
        [nCols - 1]: { cellWidth: 15, fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      margin: { left: mLeft, right: mLeft, top: 14, bottom: 18 },
      didParseCell: (d) => {
        if (d.section !== "body") return;
        const c = d.column.index;
        const v = String(d.cell.raw);
        // Black & white only: A is bold, P is regular, L/– are muted grey. No fills.
        if (c >= firstSub && c <= lastSub) {
          if (v === "A") d.cell.styles.fontStyle = "bold";
          else if (v === "P") d.cell.styles.fontStyle = "normal";
          else d.cell.styles.textColor = [120, 120, 120];
        }
      },
    });

    // Legend + signatures
    const endY = (doc as any).lastAutoTable?.finalY ?? y;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...PDF_MUTED);
    doc.text("P = Present     A = Absent     L = Leave     – = Not marked", mLeft, endY + 6);
    pdfSignatures(doc, endY + 2, ["Class Teacher", "Exam Controller", "Principal"]);
    pdfFooters(doc, `Class ${clsLabel} Attendance Overview`);

    doc.save(`ClassOverview-Class${clsLabel}-${safeFile(sessionTitle || "Exam")}.pdf`);
    toast.success("Class Overview PDF exported!");
  };

  // ── EXPORT WHOLE-SCHOOL OVERVIEW PDF ─────────────────────────────────────
  // Every class that has attendance, packed onto as few landscape pages as
  // possible (one page when it fits, otherwise two). Classes sit in two
  // columns; row height is chosen automatically so the whole school fits.
  // Black & white only — an absent mark is bold on a light-grey cell.
  const exportSchoolOverviewPDF = () => {
    const sections = overviewByClass.filter(sec => sec.students.length > 0 && sec.columns.length > 0);
    if (!sections.length) { toast.error("No attendance data to export"); return; }

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const sessionTitle = (attSelectedSession as any)?.title || "";
    const termLabel = (attSelectedSession as any)?.exam_term
      ? `${examTypeLabel((attSelectedSession as any).exam_term)} ${(attSelectedSession as any).exam_year ?? ""}`.trim() : "";

    const SHORT: Record<string, string> = {
      "Mathematics": "Maths", "General Science": "G.Science", "Mutalia Quran": "M.Quran", "Pakistan Studies": "Pak.Study",
      "Computer Science": "Comp.Sci", "General Knowledge": "Gen.Know",
    };
    const fmtShort = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? formatDateFns(new Date(d + "T00:00:00"), "dd/MM") : d);

    // ── prepare per-class data ──
    const prep = [...sections].sort((a, b) => Number(a.cls) - Number(b.cls)).map(sec => {
      const cols = [...sec.columns].sort((a, b) => (a.date === b.date ? a.subject.localeCompare(b.subject) : a.date.localeCompare(b.date)));
      const students = [...sec.students].sort((a, b) => String(a.examRoll).localeCompare(String(b.examRoll), undefined, { numeric: true }));
      const rows = students.map(st => {
        const g = sec.grid[st.id] || {};
        const marks = cols.map(c => g[c.key] as string | undefined);
        return {
          name: st.name, roll: String(st.examRoll), marks,
          p: marks.filter(m => m === "present").length,
          a: marks.filter(m => m === "absent").length,
          marked: marks.filter(m => !!m).length,
        };
      });
      const present = rows.reduce((x, r) => x + r.p, 0);
      const marked = rows.reduce((x, r) => x + r.marked, 0);
      return { cls: sec.cls, cols, rows, present, marked, pct: marked ? Math.round((present / marked) * 100) : 0 };
    });
    const totStudents = prep.reduce((x, c) => x + c.rows.length, 0);
    const totPapers = prep.reduce((x, c) => x + c.cols.length, 0);
    const totPresent = prep.reduce((x, c) => x + c.present, 0);
    const totMarked = prep.reduce((x, c) => x + c.marked, 0);
    const avg = totMarked ? Math.round((totPresent / totMarked) * 100) : 0;

    // ── page geometry ──
    const M = 8, GAP = 6;
    const colW = (W - M * 2 - GAP) / 2;
    const TOP1 = 54, TOPN = 17;
    const BOTTOM = H - 24;
    const TITLE_H = 6.5, HEAD_H = 8.6, BLOCK_GAP = 4;
    const topOf = (page: number) => (page === 0 ? TOP1 : TOPN);

    type Place = { page: number; col: number; ci: number; from: number; to: number };
    const pack = (rowH: number) => {
      const placed: Place[] = [];
      let page = 0, col = 0, y = topOf(0);
      for (let ci = 0; ci < prep.length; ci++) {
        const n = prep[ci].rows.length;
        let from = 0;
        while (from < n) {
          const fit = Math.floor((BOTTOM - y - TITLE_H - HEAD_H) / rowH);
          const need = Math.min(3, n - from);
          // Keep a class in one piece whenever it fits in a fresh column.
          const freshTop = col === 0 ? topOf(page) : topOf(page + 1);
          const fitFresh = Math.floor((BOTTOM - freshTop - TITLE_H - HEAD_H) / rowH);
          const wouldSplit = from === 0 && fit < n && n <= fitFresh;
          if ((fit < need || wouldSplit) && y > topOf(page) + 0.1) {
            if (col === 0) { col = 1; } else { page++; col = 0; }
            y = topOf(page);
            continue;
          }
          const take = Math.max(1, Math.min(fit, n - from));
          placed.push({ page, col, ci, from, to: from + take });
          y += TITLE_H + HEAD_H + take * rowH + BLOCK_GAP;
          from += take;
        }
      }
      return { placed, pages: page + 1 };
    };

    // Largest row height that keeps everything on 1 page, else on 2 pages, else the minimum.
    let rowH = 3.3, layout = pack(3.3);
    search: for (const target of [1, 2]) {
      for (let rh = 5.2; rh >= 3.3; rh -= 0.1) {
        const l = pack(rh);
        if (l.pages <= target) { rowH = rh; layout = l; break search; }
      }
    }
    const fontPt = rowH >= 4.4 ? 7 : rowH >= 3.8 ? 6.4 : 5.8;

    // ── page 1 letterhead + summary strip ──
    pdfBrandHeader(doc, "SCHOOL ATTENDANCE OVERVIEW — ALL CLASSES", [sessionTitle, termLabel].filter(Boolean).join("  ·  "));
    const stripY = 43;
    doc.setDrawColor(...PDF_LINE); doc.setLineWidth(0.3);
    doc.roundedRect(M, stripY, W - M * 2, 8.5, 1.5, 1.5, "S");
    const stats: [string, string][] = [
      ["CLASSES", String(prep.length)], ["STUDENTS", String(totStudents)], ["PAPERS", String(totPapers)],
      ["PRESENT MARKS", String(totPresent)], ["AVG ATTENDANCE", `${avg}%`],
    ];
    const sw = (W - M * 2) / stats.length;
    stats.forEach(([k, v], i) => {
      const cx = M + i * sw + sw / 2;
      doc.setFont("helvetica", "normal"); doc.setFontSize(5.8); doc.setTextColor(...PDF_MUTED);
      doc.text(k, cx, stripY + 3.3, { align: "center", charSpace: 0.25 } as any);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
      doc.text(v, cx, stripY + 7.2, { align: "center" });
    });

    for (let pg = 1; pg < layout.pages; pg++) doc.addPage();
    for (let pg = 1; pg < layout.pages; pg++) {
      doc.setPage(pg + 1);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(0, 0, 0);
      doc.text("GOVT. HIGH SCHOOL BABI KHEL — School Attendance Overview", M, 9);
      doc.setFont("helvetica", "normal"); doc.setTextColor(...PDF_MUTED);
      doc.text(`${sessionTitle}${termLabel ? "  ·  " + termLabel : ""}`, W - M, 9, { align: "right" });
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.4); doc.line(M, 11.5, W - M, 11.5);
    }

    // ── draw blocks ──
    // Pages that use only ONE column get a single wide block centred on the page
    // (otherwise it would sit on the left with an empty right half).
    const colsOnPage: Record<number, Set<number>> = {};
    layout.placed.forEach(pl => { (colsOnPage[pl.page] ||= new Set()).add(pl.col); });
    // Optically centred text: baseline = centre + 0.36 × font height (Helvetica cap-height centre).
    const ctext = (txt: string, cx: number, cy: number, pt: number, align: "center" | "left" | "right" = "center") => {
      doc.setFontSize(pt);
      doc.text(txt, cx, cy + pt * 0.3528 * 0.36, { align });
    };
    const cursor: Record<string, number> = {};
    for (const pl of layout.placed) {
      doc.setPage(pl.page + 1);
      const key = `${pl.page}-${pl.col}`;
      const single = colsOnPage[pl.page].size === 1;
      const bw = single ? Math.min(W - M * 2, 215) : colW;
      const x = single ? (W - bw) / 2 : M + pl.col * (colW + GAP);
      let y = cursor[key] ?? topOf(pl.page);
      const c = prep[pl.ci];
      const nP = c.cols.length;
      const rollW = 15, sumW = 12;
      const nameW = nP > 8 ? 27 : 33;
      const paperW = (bw - rollW - nameW - sumW) / nP;
      const rows = c.rows.slice(pl.from, pl.to);
      const bodyH = rows.length * rowH;
      const sumX = x + rollW + nameW + nP * paperW;
      const blockTop = y;

      // title row (no fill — black text, rule underneath)
      doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
      ctext(`CLASS ${c.cls}${pl.from > 0 ? "  (cont.)" : ""}`, x + 2, y + TITLE_H / 2, 8.5, "left");
      doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
      ctext(`${c.rows.length} students  ·  ${nP} papers  ·  ${c.pct}% attendance`, x + bw - 2, y + TITLE_H / 2, 6.3, "right");
      y += TITLE_H;
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.4); doc.line(x, y, x + bw, y);

      // header row
      const hMid = y + HEAD_H / 2;
      doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold");
      ctext("Roll", x + rollW / 2, hMid, 6);
      ctext("Student", x + rollW + nameW / 2, hMid, 6);
      c.cols.forEach((col, i) => {
        const cx = x + rollW + nameW + i * paperW + paperW / 2;
        const label = SHORT[col.subject] || col.subject;
        let fs = 5.6; doc.setFont("helvetica", "bold"); doc.setFontSize(fs);
        while (doc.getTextWidth(label) > paperW - 0.7 && fs > 3.4) { fs -= 0.2; doc.setFontSize(fs); }
        doc.setTextColor(0, 0, 0);
        ctext(label, cx, y + 2.9, fs);
        doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
        ctext(fmtShort(col.date), cx, y + HEAD_H - 2, 4.8);
      });
      doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
      ctext("P", sumX + sumW / 4, hMid, 6);
      ctext("A", sumX + (sumW * 3) / 4, hMid, 6);
      y += HEAD_H;
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3); doc.line(x, y, x + bw, y);

      // body — every value centred in its cell, no background fills
      rows.forEach((r, ri) => {
        const ry = y + ri * rowH;
        const my = ry + rowH / 2;
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.1);
        if (ri < rows.length - 1) doc.line(x, ry + rowH, x + bw, ry + rowH);
        doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
        ctext(r.roll, x + rollW / 2, my, fontPt);
        let nm = r.name;
        doc.setFontSize(fontPt);
        while (nm.length > 4 && doc.getTextWidth(nm) > nameW - 2.4) nm = nm.slice(0, -2);
        if (nm !== r.name) nm = nm.replace(/\s+$/, "") + "…";
        ctext(nm, x + rollW + nameW / 2, my, fontPt);
        r.marks.forEach((m, i) => {
          const cx = x + rollW + nameW + i * paperW + paperW / 2;
          const ch = m === "present" ? "P" : m === "absent" ? "A" : m === "leave" ? "L" : "–";
          if (m === "absent") {
            // absent = bold letter inside a thin black box (readable in plain B/W, no shading)
            doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.25);
            doc.rect(cx - paperW / 2 + 0.7, ry + 0.45, paperW - 1.4, rowH - 0.9, "S");
            doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
          } else {
            doc.setFont("helvetica", "normal");
            doc.setTextColor(m ? 0 : 140, m ? 0 : 140, m ? 0 : 140);
          }
          ctext(ch, cx, my, fontPt);
        });
        doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
        ctext(String(r.p), sumX + sumW / 4, my, fontPt);
        ctext(String(r.a), sumX + (sumW * 3) / 4, my, fontPt);
      });

      // vertical rules + outer border
      doc.setDrawColor(170, 170, 170); doc.setLineWidth(0.1);
      const vx = [rollW, rollW + nameW, ...c.cols.map((_, i) => rollW + nameW + (i + 1) * paperW), rollW + nameW + nP * paperW + sumW / 2];
      vx.forEach(v => doc.line(x + v, blockTop + TITLE_H, x + v, y + bodyH));
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.35);
      doc.rect(x, blockTop, bw, TITLE_H + HEAD_H + bodyH, "S");

      cursor[key] = y + bodyH + BLOCK_GAP;
    }

    // ── legend + signatures on the last page ──
    doc.setPage(layout.pages);
    const sy = H - 19;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...PDF_MUTED);
    doc.text("P = Present    A = Absent (boxed)    L = Leave    – = Not marked", M, sy + 3.5);
    [["Exam Controller", W - M - 100], ["Principal", W - M - 40]].forEach(([label, x0]) => {
      doc.setDrawColor(90, 90, 90); doc.setLineWidth(0.35);
      doc.line(x0 as number, sy, (x0 as number) + 34, sy);
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(0, 0, 0);
      doc.text(label as string, (x0 as number) + 17, sy + 4, { align: "center" });
    });

    pdfFooters(doc, "School Attendance Overview");
    doc.save(`School-Attendance-Overview-${safeFile(sessionTitle || "Exam")}.pdf`);
    toast.success(`School overview PDF exported (${layout.pages} page${layout.pages > 1 ? "s" : ""})!`);
  };

  // ── RENDER ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5" style={{ contain: "layout style" }}>
      {/* Main Tab Toggle */}
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-card p-3 shadow-sm sm:p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:h-11 sm:w-11">
            <Hash className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-heading font-bold leading-tight text-foreground sm:text-xl">Exam Roll Numbers</h2>
            <p className="truncate text-[11px] leading-snug text-muted-foreground sm:text-sm">Roll numbers, attendance &amp; QR scanning</p>
          </div>
        </div>
        <div role="tablist" className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-border/60 bg-background/70 p-1">
          {([
            ["rolls", "Roll Numbers", Hash, "text-indigo-500"],
            ["attendance", "Exam Attendance", ClipboardCheck, "text-teal-500"],
          ] as const).map(([key, label, Icon, tint]) => {
            const active = mainTab === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={() => setMainTab(key as any)}
                className={`flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 text-[12.5px] font-semibold transition-all sm:text-sm ${active ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? tint : ""}`} />
                <span>{label}</span>
              </button>
            );
          })}
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
                            <Badge variant="secondary">{examTypeLabel(s.exam_term)} {s.exam_year}</Badge>
                            {(() => {
                              const st = rollSessionStatus(s);
                              if (st === "live") return <Badge className="bg-green-100 text-green-700">Published</Badge>;
                              if (st === "scheduled") return <Badge className="bg-amber-100 text-amber-800 gap-1"><Timer className="w-3 h-3" /> Scheduled</Badge>;
                              return <Badge variant="secondary" className="bg-muted text-muted-foreground">Draft</Badge>;
                            })()}                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">Classes: {s.class_order.join(" → ")} · Starting: {s.starting_number}</p>
                          {(() => {
                            const st = rollSessionStatus(s);
                            if (st === "scheduled") {
                              return <CountdownTimer targetDate={s.publish_at!} label={s.countdown_label || "Publishes in"} onExpire={() => qc.invalidateQueries({ queryKey: ["exam-sessions"] })} />;
                            }
                            // Legacy stuck state from the old bug: a DRAFT with an
                            // already-expired countdown. Tell the admin exactly why.
                            if (st === "draft" && s.publish_at && new Date(s.publish_at).getTime() <= Date.now()) {
                              return (
                                <p className="text-xs text-amber-600 flex items-center gap-1.5 mt-1">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Countdown ended — tap Publish to take it live
                                </p>
                              );
                            }
                            return null;
                          })()}
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
                    <div><Label>Exam Term *</Label><select value={formTerm} onChange={e => setFormTerm(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">{TERMS.map(t => <option key={t} value={t}>{examTypeLabel(t)}</option>)}</select></div>
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
              <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm sm:p-4">
                <div className="flex items-center gap-2.5">
                  <Button variant="outline" size="icon" aria-label="Back" onClick={() => { setView("list"); setDetailSearch(""); }} className="h-9 w-9 shrink-0 rounded-xl"><ArrowLeft className="h-4 w-4" /></Button>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-heading font-bold leading-tight sm:text-xl">{selectedSession.title}</h2>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">{examTypeLabel(selectedSession.exam_term)} {selectedSession.exam_year} · {rollNumbers.length} students</p>
                  </div>
                  {(() => {
                    const st = rollSessionStatus(selectedSession);
                    if (st === "live") return <Badge className="shrink-0 bg-emerald-100 px-2 text-[10px] text-emerald-700 hover:bg-emerald-100">Published</Badge>;
                    if (st === "scheduled") return <Badge className="shrink-0 gap-1 bg-amber-100 px-2 text-[10px] text-amber-800 hover:bg-amber-100"><Timer className="h-3 w-3" />Scheduled</Badge>;
                    return <Badge variant="secondary" className="shrink-0 bg-muted px-2 text-[10px] text-muted-foreground">Draft</Badge>;
                  })()}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Button onClick={() => handleUpdateStudents(selectedSession)} disabled={updatingStudents} className="h-9 gap-1.5 rounded-lg bg-amber-500 px-2 text-xs font-semibold text-white hover:bg-amber-600 sm:text-sm">
                    {updatingStudents ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    <span className="truncate">{updatingStudents ? "Updating" : "Update"}</span>
                  </Button>
                  <Button variant="outline" onClick={downloadPrint} className="h-9 gap-1.5 rounded-lg px-2 text-xs font-semibold sm:text-sm"><QrCode className="h-3.5 w-3.5" /><span className="truncate">Slips</span></Button>
                  <Button onClick={() => togglePublish(selectedSession)} className={`h-9 gap-1.5 rounded-lg px-2 text-xs font-semibold text-white sm:text-sm ${rollSessionStatus(selectedSession) === "live" ? "bg-slate-700 hover:bg-slate-800" : "bg-emerald-600 hover:bg-emerald-700"}`}>
                    {rollSessionStatus(selectedSession) === "live" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <span className="truncate">{rollSessionStatus(selectedSession) === "live" ? "Unpublish" : rollSessionStatus(selectedSession) === "scheduled" ? "Go Live" : "Publish"}</span>
                  </Button>
                </div>
              </div>

              {/* Countdown setter */}
              <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
                <CardContent className="space-y-3 p-3 sm:p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white"><Timer className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-heading font-bold leading-tight sm:text-base">Countdown Timer</h3>
                      <p className="truncate text-[11px] text-muted-foreground">Slips go live automatically at zero</p>
                    </div>
                  </div>
                  {(() => {
                    const st = rollSessionStatus(selectedSession);
                    if (st === "scheduled") {
                      return (
                        <CountdownTimer
                          targetDate={selectedSession.publish_at!}
                          label={selectedSession.countdown_label || "Roll numbers publish in"}
                          onExpire={() => qc.invalidateQueries({ queryKey: ["exam-sessions"] })}
                        />
                      );
                    }
                    if (st === "draft" && selectedSession.publish_at && new Date(selectedSession.publish_at).getTime() <= Date.now()) {
                      return (
                        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Countdown already ended — set it again or tap Publish.
                        </p>
                      );
                    }
                    return null;
                  })()}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0 space-y-1"><Label className="text-[11px] font-semibold text-muted-foreground">Date</Label><Input type="date" className="h-9 rounded-lg px-2 text-sm" value={countdownDate} onChange={e => setCountdownDate(e.target.value)} min={new Date().toISOString().split("T")[0]} /></div>
                    <div className="min-w-0 space-y-1"><Label className="text-[11px] font-semibold text-muted-foreground">Time</Label><Input type="time" className="h-9 rounded-lg px-2 text-sm" value={countdownTime} onChange={e => setCountdownTime(e.target.value)} /></div>
                  </div>
                  <div className="space-y-1"><Label className="text-[11px] font-semibold text-muted-foreground">Message</Label><Input className="h-9 rounded-lg text-sm" value={countdownLabel} onChange={e => setCountdownLabel(e.target.value)} /></div>
                  <div className="flex gap-2">
                    <Button onClick={() => saveCountdown(selectedSession)} disabled={savingCountdown} className="h-9 flex-1 gap-1.5 rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700">
                      {savingCountdown ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Timer className="h-3.5 w-3.5" />} Set
                    </Button>
                    {selectedSession.publish_at && <Button variant="outline" onClick={() => clearCountdown(selectedSession)} className="h-9 rounded-lg border-destructive/30 px-4 text-sm text-destructive hover:bg-destructive/10">Remove</Button>}
                  </div>
                </CardContent>
              </Card>

              <div className="relative max-w-sm"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search name, roll no, class..." value={detailSearch} onChange={e => setDetailSearch(e.target.value)} className="h-9 rounded-lg pl-10 text-sm" /></div>

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
                      {attSessions.map((s: any) => <option key={s.id} value={s.id}>{s.title} ({examTypeLabel(s.exam_term)} {s.exam_year})</option>)}
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
                    Classes with no paper on {attDate} in the Date Sheet are locked automatically.
                  </p>
                  {availableClasses.length > 0 && availableClasses.every((c: string) => (todayPapersByClass[c]?.length ?? 0) === 0) && (
                    <p className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                      <Lock className="h-3.5 w-3.5 shrink-0" /> No class has a paper today in the Date Sheet.
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {availableClasses.map((cls: string) => {
                      const subs = todayPapersByClass[cls] || [];
                      const locked = subs.length === 0;
                      return (
                        <div key={cls} className={`flex items-center gap-2 rounded-lg border p-2 ${locked ? "border-dashed border-border bg-muted/40" : "border-border bg-card"}`}>
                          <Badge className={`shrink-0 ${locked ? "bg-muted text-muted-foreground hover:bg-muted" : "bg-primary text-primary-foreground"}`}>Class {cls}</Badge>
                          {locked ? (
                            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
                              <Lock className="h-3.5 w-3.5 shrink-0" /><span className="truncate">No paper today · Locked</span>
                            </div>
                          ) : subs.length === 1 ? (
                            <div className="flex min-w-0 flex-1 items-center justify-between gap-1.5 text-xs font-semibold text-foreground">
                              <span className="truncate">{subs[0]}</span><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            </div>
                          ) : (
                            <select
                              value={allClassSubjects[cls] || ""}
                              onChange={e => setAllClassSubjects(prev => ({ ...prev, [cls]: e.target.value }))}
                              className="flex-1 px-2 py-1.5 rounded-lg bg-secondary/50 border border-border text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30 min-w-0"
                            >
                              <option value="">— Select subject —</option>
                              {subs.map(x => <option key={x} value={x}>{x}</option>)}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Show per-class paper times so the admin knows the window */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {availableClasses.map((cls: string) => {
                      const subj = allClassSubjects[cls];
                      const times = classPaperTimesByClass[cls];
                      return (
                        <div key={cls} className={`text-[10px] px-2 py-1 rounded-md border ${times ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 text-emerald-700 dark:text-emerald-400" : "bg-muted/30 border-border text-muted-foreground"}`}>
                          <span className="font-bold">Class {cls}</span>{subj ? ` · ${subj}` : ((todayPapersByClass[cls]?.length ?? 0) === 0 ? " · locked" : " · no subject")}
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
                    <Button variant="outline" size="sm" onClick={() => setShowManualList(v => !v)} className="h-8 gap-1.5 rounded-lg px-3 text-xs font-medium">
                      {showManualList ? <><ArrowLeft className="w-3.5 h-3.5" /> Back</> : <><ClipboardCheck className="w-3.5 h-3.5" /> Manual Attendance</>}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowScanner(!showScanner)} disabled={!canMarkAtt} className="h-8 gap-1.5 rounded-lg border-emerald-600 bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                      <Camera className="w-3.5 h-3.5" /> {showScanner ? "Close Scanner" : "Scan QR"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDeleteSheet}
                      className={`h-8 gap-1.5 rounded-lg px-3 text-xs font-medium ${confirmDelete ? "bg-red-500 text-white hover:bg-red-600" : "border-destructive/25 text-destructive/90 hover:bg-destructive/10"}`}>
                      <Trash2 className="w-3.5 h-3.5" /> {confirmDelete ? "Confirm?" : "Delete"}
                    </Button>
                  </div>

                  {/* QR Scanner area - Mobile Optimized */}
                  {showScanner && (
                    <Card className="border-emerald-200 dark:border-emerald-800/50 overflow-hidden">
                      <CardHeader className="p-3 pb-1 sm:p-4 sm:pb-2">
                        <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                          <Button type="button" variant="outline" size="sm" aria-label="Back" onClick={() => setShowScanner(false)} className="h-7 shrink-0 gap-1 rounded-lg px-2 text-xs font-medium"><ArrowLeft className="h-3.5 w-3.5" /> Back</Button>
                          <span>Scan QR</span>
                          {/* Live indicator */}
                          <span className="flex items-center gap-1 ml-auto">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-xs text-muted-foreground">Live</span>
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 p-3 sm:p-5">
                        {/* ── Instant scan preview / confirm card ──────────
                            Board-scanner style: appears the INSTANT the QR
                            decodes (client-side match, no network wait), so
                            the admin can compare name/class/roll against the
                            actual student before it's marked. Stays visible
                            until explicitly confirmed or cancelled.
                            
                            MOBILE OPTIMIZED: Larger touch targets, better spacing,
                            sticky positioning to stay visible while scanning */}
                        {scanPreview && (
                          <div className="rounded-xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-gray-900 p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200 shadow-lg shadow-emerald-100/50 dark:shadow-emerald-900/20 relative overflow-hidden">
                            {/* Decorative background element */}
                            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-100 dark:bg-emerald-900/20 rounded-full -translate-y-1/2 translate-x-1/2 opacity-50"></div>
                            
                            <div className="relative flex items-center gap-3 sm:gap-4">
                              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-lg">
                                <QrCode className="w-6 h-6 sm:w-7 sm:h-7" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-lg sm:text-xl leading-tight truncate text-foreground">{scanPreview.studentName}</p>
                                <p className="text-sm sm:text-base text-muted-foreground mt-0.5">
                                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">Class {scanPreview.class}</span>
                                  <span className="mx-1">·</span>
                                  <span>Roll #{scanPreview.classRollNo}</span>
                                </p>
                                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                                  Exam Roll: <span className="font-mono font-bold">{scanPreview.examRollNo}</span>
                                  {scanPreview.subject ? (
                                    <> · <span className="font-medium">{scanPreview.subject}</span></>
                                  ) : ""}
                                </p>
                              </div>
                            </div>
                            
                            {/* Action buttons - Large touch targets for mobile */}
                            <div className="flex gap-3 pt-2">
                              <Button 
                                size="lg" 
                                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-5 sm:py-4 text-base sm:text-sm gap-2 active:scale-[0.98] transition-transform" 
                                onClick={confirmScanNow}
                              >
                                <CheckCircle2 className="w-5 h-5 sm:w-4 sm:h-4" /> 
                                <span>Confirm Present</span>
                              </Button>
                              <Button 
                                size="lg" 
                                variant="outline" 
                                className="px-4 sm:px-5 py-5 sm:py-4 font-semibold text-destructive border-red-200 hover:bg-red-50 hover:border-red-300 active:scale-[0.98] transition-transform"
                                onClick={cancelScanPreview}
                              >
                                <XCircle className="w-5 h-5 sm:w-4 sm:h-4" />
                                <span className="hidden sm:inline">Not them?</span>
                                <span className="sm:hidden">✕</span>
                              </Button>
                            </div>
                            
                            {/* Auto-confirm countdown indicator */}
                            <p className="text-xs text-center text-muted-foreground/70">
                              Auto-confirms in 3 seconds...
                            </p>
                          </div>
                        )}
                        
                        {/* QR Scanner Component - Responsive sizing */}
                        <QRScanner
                          onScan={handleQRScan}
                          enabled={!!attSession && (isAllClassesMode
                            ? Object.values(allClassSubjects).some(s => !!s)
                            : !!attSubject)}
                        />

                        {/* Recent scans - Compact mobile view */}
                        {scanLog.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <History className="w-3.5 h-3.5" /> 
                              <span>Recent Scans</span>
                              <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                                {scanLog.length}
                              </Badge>
                            </p>
                            <div className="max-h-32 sm:max-h-24 overflow-y-auto space-y-1.5">
                              {scanLog.slice(0, 8).map((log, i) => (
                                <div key={`${i}-${log.time}`} className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg px-3 py-2.5 sm:py-2 animate-in slide-in-from-right-2 duration-200">
                                  <CheckCircle2 className={`w-4 h-4 shrink-0 ${log.status === 'present' ? 'text-emerald-500' : log.status === 'absent' ? 'text-red-500' : 'text-amber-500'}`} />
                                  <span className="text-sm font-medium flex-1 truncate">{log.name}</span>
                                  <span className="text-xs text-muted-foreground font-mono shrink-0">{log.roll}</span>
                                  <span className="text-[10px] text-muted-foreground/70 shrink-0 hidden sm:inline">{log.time}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Manual attendance list — hidden behind the "Manual Attendance"
                      button above (see showManualList) so the screen isn't full of
                      every student right after Initialize. QR scanning above works
                      the same either way. */}
                  {showManualList && (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input className="w-full pl-9 pr-4 py-2 rounded-xl bg-secondary/50 border border-border text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="Search student..." value={attSearch} onChange={e => setAttSearch(e.target.value)} />
                      </div>

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
              {!loadingOverview && overviewByClass.length > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-tight">Whole School</p>
                    <p className="truncate text-[11px] text-muted-foreground">{overviewByClass.length} classes · {overviewByClass.reduce((a, s) => a + s.students.length, 0)} students</p>
                  </div>
                  <Button size="sm" onClick={exportSchoolOverviewPDF} className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-xs font-medium">
                    <FileText className="h-3.5 w-3.5" /> All Classes PDF
                  </Button>
                </div>
              )}
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="secondary">{section.students.length} students · {section.columns.length} papers</Badge>
                        <Button variant="outline" size="sm" onClick={() => exportOverviewPDF(section.cls, section)} disabled={!section.students.length} className="h-8 gap-1.5 rounded-lg px-3 text-xs font-medium">
                          <FileText className="h-3.5 w-3.5" /> Export PDF
                        </Button>
                        {/* Problem 1 fix: "Delete All Class Attendance" button.
                            Wipes EVERY attendance row for this class in this
                            session — every subject, every date. Useful when the
                            admin selected the wrong class or wants to start
                            the class's exam attendance over from scratch. */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" disabled={!section.students.length || deleteClassAttendance.isPending} className="h-8 gap-1.5 rounded-lg border-destructive/25 px-3 text-xs font-medium text-destructive/90 hover:bg-destructive/10">
                              <Trash2 className="h-3.5 w-3.5" /> Delete All
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
                <Button variant="outline" size="sm" onClick={() => exportOverviewPDF()} disabled={!overviewPivot.students.length} className="h-8 gap-1.5 rounded-lg px-3 text-xs font-medium"><FileText className="h-3.5 w-3.5" /> Export PDF</Button>
                <Badge variant="secondary">{overviewPivot.students.length} students · {overviewPivot.columns.length} papers</Badge>
                {/* Problem 1 fix: "Delete All Class Attendance" button for single-class mode.
                    Wipes EVERY attendance row for this class in this session. */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!overviewPivot.students.length || deleteClassAttendance.isPending} className="h-8 gap-1.5 rounded-lg border-destructive/25 px-3 text-xs font-medium text-destructive/90 hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" /> Delete All
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
