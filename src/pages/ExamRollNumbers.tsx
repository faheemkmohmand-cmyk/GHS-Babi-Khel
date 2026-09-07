/**
 * ExamRollNumbers.tsx — PUBLIC "Roll No. Slip" page (/roll-no-slip)
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE MODES, driven purely by the session row (no admin "Publish Now"
 * step needed at countdown end — publish happens INSTANTLY client-side):
 *
 *   1. SCHEDULED  (is_published=true + publish_at in the future)
 *        Students see a premium gold countdown panel — the exact style of
 *        the Merit List countdown (alarm-clock icon, "TIME REMAINING",
 *        big red digits) — and the SAME countdown appears in the Navbar
 *        (chip / strip) via useRollSlipCountdown().
 *        Roll numbers are PRE-FETCHED while counting down, so the moment
 *        the timer hits zero the page flips to mode 2 with ZERO loading —
 *        no network call, no "Publishing now...", nothing to wait for.
 *
 *   2. LIVE  (is_published=true and publish_at is null or in the past)
 *        Students do NOT see everyone at once. They get a premium finder:
 *        pick class (6th → 10th) → type full name → Search → only THEIR
 *        slip appears as a premium card with Download PDF + a small Share
 *        button (native share sheet, clipboard fallback).
 *
 *   3. EMPTY  (nothing published / scheduled)
 *        Friendly empty state.
 *
 * LEGACY SELF-HEAL: sessions stuck by the old bug (is_published=false with
 * an already-expired publish_at) are treated as LIVE here and healed in the
 * DB on a best-effort basis, so previously-stuck countdowns recover.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  Hash, Search, Download, Share2, User, GraduationCap, Clock3,
  CheckCircle2, AlertCircle, ArrowLeft, Loader2, Sparkles,
} from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { encodeExamQRData } from "@/hooks/useExamAttendance";
import { useNowTick } from "@/hooks/useRollSlipCountdown";
import { triggerConfetti } from "@/lib/confetti";
import { examTypeLabel } from "@/utils/examTypeLabel";

interface ExamSession {
  id: string; title: string; exam_year: number; exam_term: string;
  classes: string[]; class_order: string[]; starting_number: number;
  is_published: boolean; publish_at: string | null;
  countdown_label: string | null; created_at: string;
}
interface RollEntry {
  id: string; student_id: string; student_name: string; father_name: string | null;
  class: string; class_roll_no: string; exam_roll_no: string; serial_number: number;
}

/* ── Shared motion variant (one-shot, GPU-safe) ─────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

/* ── Case/space-insensitive name normalisation for the finder ────────────── */
const normName = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();

/* ── Realistic countdown clock icon (same artwork as the Merit List panel) ── */
function RealisticClockIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="rslipClockFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFDF5" />
          <stop offset="100%" stopColor="#F3E9C7" />
        </linearGradient>
        <linearGradient id="rslipClockRim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4C550" />
          <stop offset="100%" stopColor="#C6912A" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="10" r="5.5" fill="url(#rslipClockRim)" />
      <circle cx="48" cy="10" r="5.5" fill="url(#rslipClockRim)" />
      <rect x="22" y="52" width="4.5" height="8" rx="2" fill="#8A6416" />
      <rect x="37.5" y="52" width="4.5" height="8" rx="2" fill="#8A6416" />
      <circle cx="32" cy="34" r="24" fill="url(#rslipClockRim)" />
      <circle cx="32" cy="34" r="19.5" fill="url(#rslipClockFace)" stroke="#C6912A" strokeWidth="1.5" />
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * 30 * Math.PI) / 180;
        const x1 = 32 + Math.sin(angle) * 16.5;
        const y1 = 34 - Math.cos(angle) * 16.5;
        const x2 = 32 + Math.sin(angle) * 14;
        const y2 = 34 - Math.cos(angle) * 14;
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#B08628" strokeWidth={i % 3 === 0 ? 1.4 : 0.8} strokeLinecap="round" />
        );
      })}
      <line x1="32" y1="34" x2="32" y2="22" stroke="#3F2E10" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="32" y1="34" x2="41" y2="34" stroke="#3F2E10" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="32" y1="34" x2="38" y2="26" stroke="#D64545" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="32" cy="34" r="2.2" fill="#3F2E10" />
    </svg>
  );
}

/* ── Countdown unit tile — bold colour-coded digits (reference style) ────── */
function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-0.5">
      <span className="text-4xl md:text-5xl font-black tabular-nums text-red-600 dark:text-red-400 leading-none">
        {String(Math.max(0, value)).padStart(2, "0")}
      </span>
      <span className="text-base md:text-lg font-bold text-red-600/70 dark:text-red-400/70 lowercase">
        {label}
      </span>
    </div>
  );
}

/* ── A5 admit-card PDF (kept pixel-identical to the previous release) ────── */
async function downloadSlipPdf(session: ExamSession, r: RollEntry) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Outer border — light professional border
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.rect(4, 4, pageW - 8, pageH - 8, "S");

  // Header area — clean white with double-line accent
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.8);
  doc.line(4, 30, pageW - 4, 30);
  doc.setLineWidth(0.3);
  doc.line(4, 31.5, pageW - 4, 31.5);

  // School name centered — dark text on white
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Government High School Babi Khel", pageW / 2, 16, { align: "center" });
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("EXAMINATION ADMIT CARD", pageW / 2, 25, { align: "center" });

  // Roll number box + QR side by side
  const heroY = 37;
  const qrSize = 26;
  const qrX = pageW - qrSize - 10;

  const rollBoxW = qrX - 14;
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(10, heroY, rollBoxW, 22, 2, 2, "F");
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.roundedRect(10, heroY, rollBoxW, 22, 2, 2, "S");
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.text("EXAM ROLL NUMBER", 10 + rollBoxW / 2, heroY + 7, { align: "center" });
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(r.exam_roll_no, 10 + rollBoxW / 2, heroY + 17, { align: "center" });

  // QR code (right side)
  const qrData = encodeExamQRData(session.id, r.student_id, r.exam_roll_no);
  const qrDataURL = await QRCode.toDataURL(qrData, { width: 400, margin: 1, errorCorrectionLevel: "M", color: { dark: "#333333", light: "#FFFFFF" } });
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.roundedRect(qrX - 1, heroY - 1, qrSize + 2, qrSize + 2, 1.5, 1.5, "S");
  doc.addImage(qrDataURL, "PNG", qrX, heroY, qrSize, qrSize);
  doc.setFontSize(4.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(140, 140, 140);
  doc.text("Scan for Attendance", qrX + qrSize / 2, heroY + qrSize + 3.5, { align: "center" });

  // Student detail rows
  let detailY = heroY + 32;
  const leftX = 12;
  const drawDetail = (label: string, value: string, yy: number) => {
    const safeVal = value.length > 30 ? value.slice(0, 28) + "…" : value;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(label, leftX, yy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text(safeVal, leftX + 32, yy);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(leftX, yy + 2, pageW - 12, yy + 2);
    return yy + 9;
  };
  detailY = drawDetail("Student Name:", r.student_name, detailY);
  detailY = drawDetail("Father Name:", r.father_name || "—", detailY);
  detailY = drawDetail("Class:", `Class ${r.class}`, detailY);
  detailY = drawDetail("Class Roll No:", r.class_roll_no, detailY);
  drawDetail("Examination:", `${session.exam_term} ${session.exam_year}`, detailY);

  // Footer — clean white with double-line accent
  const footerY = pageH - 14;
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);
  doc.line(4, footerY - 1.5, pageW - 4, footerY - 1.5);
  doc.setLineWidth(0.8);
  doc.line(4, footerY, pageW - 4, footerY);
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "bold");
  doc.text("GHS BABI KHEL  |  DISTRICT MOHMAND  |  KPK", pageW / 2, footerY + 4.5, { align: "center" });
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(4.5);
  doc.setFont("helvetica", "normal");
  doc.text("Bring this admit card to the examination hall. Keep it safe.", pageW / 2, footerY + 8.5, { align: "center" });

  doc.save(`AdmitCard-${r.exam_roll_no}-${r.student_name.replace(/\s+/g, "_")}.pdf`);
}

/* ═══ MAIN COMPONENT ═══════════════════════════════════════════════════════ */
const ExamRollNumbers = () => {
  const qc = useQueryClient();
  const now = useNowTick(1000);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  /* ── Sessions: published ones + scheduled ones (countdown running) ────── */
  const { data: sessions = [], isLoading: loadingSessions } = useQuery<ExamSession[]>({
    queryKey: ["public-roll-slip-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_roll_sessions")
        .select("*")
        .or("is_published.eq.true,publish_at.not.is.null")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15 * 1000,
    refetchInterval: 60 * 1000,
  });

  /* ── Status helpers (tick-driven → countdown end flips UI instantly) ──── */
  const publishTs = (s: ExamSession) => (s.publish_at ? new Date(s.publish_at).getTime() : null);
  const isScheduled = (s: ExamSession) => { const t = publishTs(s); return t !== null && t > now; };
  const isLive = (s: ExamSession) => {
    const t = publishTs(s);
    // Published → live unless still scheduled. Unpublished with an EXPIRED
    // countdown = legacy stuck session → auto-recovered as live.
    return s.is_published ? (t === null || t <= now) : (t !== null && t <= now);
  };

  const visible = useMemo(() => sessions.filter(s => isScheduled(s) || isLive(s)), [sessions, now]);
  const liveSessions = useMemo(() => visible.filter(isLive), [visible, now]);
  const scheduledSessions = useMemo(() => visible.filter(isScheduled), [visible, now]);

  // Manual pick wins while valid; otherwise first live session, else first
  // scheduled one (so a running countdown is what students land on).
  const selectedSession = useMemo(
    () => visible.find(s => s.id === selectedSessionId) || liveSessions[0] || scheduledSessions[0] || null,
    [visible, liveSessions, scheduledSessions, selectedSessionId]
  );

  /* ── Roll numbers: PRE-FETCHED even during the countdown so the flip to
        the finder at 0:00 is instant (data already on the device) ────────── */
  const { data: rollNumbers = [], isLoading: loadingRolls } = useQuery<RollEntry[]>({
    queryKey: ["public-exam-rolls", selectedSession?.id],
    queryFn: async () => {
      if (!selectedSession) return [];
      const { data, error } = await supabase
        .from("exam_roll_numbers")
        .select("id, student_id, student_name, father_name, class, class_roll_no, exam_roll_no, serial_number")
        .eq("session_id", selectedSession.id)
        .order("serial_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedSession,
    staleTime: 5 * 60 * 1000,
  });

  /* ── Legacy self-heal: old stuck sessions (countdown expired but never
        flipped) get published in the DB on a best-effort basis ───────────── */
  const healedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const s of sessions) {
      if (s.is_published || !s.publish_at) continue;
      const t = new Date(s.publish_at).getTime();
      if (t <= now && !healedRef.current.has(s.id)) {
        healedRef.current.add(s.id);
        supabase
          .from("exam_roll_sessions")
          .update({ is_published: true })
          .eq("id", s.id)
          .eq("is_published", false)
          .then(({ error }) => {
            if (!error) qc.invalidateQueries({ queryKey: ["public-roll-slip-sessions"] });
          });
      }
    }
  }, [sessions, now, qc]);

  const showCountdown = !!selectedSession && isScheduled(selectedSession);

  return (
    <PageLayout>
      <PageBanner
        title="Roll No. Slip"
        subtitle="Find your exam roll number and download your admit card"
      />

      <section className="py-12">
        <div className="container mx-auto px-4">

          {loadingSessions ? (
            <div className="flex gap-3 mb-8">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-36 rounded-xl" />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-20">
              <Hash className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="font-heading font-semibold text-foreground text-lg">No Roll No. Slips Yet</h3>
              <p className="text-muted-foreground text-sm mt-1">Exam roll number slips will appear here once published by admin</p>
            </div>
          ) : (
            <>
              {/* Session switcher (only when more than one) */}
              {visible.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-8">
                  {visible.map(s => {
                    const sched = isScheduled(s);
                    const active = selectedSession?.id === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSessionId(s.id)}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all border-2 ${
                          active
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-card text-muted-foreground border-border hover:border-primary/50"
                        }`}
                      >
                        {sched && <Clock3 className="w-3.5 h-3.5 text-amber-500" />}
                        {s.title} — {s.exam_year}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedSession && (showCountdown ? (
                /* ═══ SCHEDULED — premium countdown (Merit-List style) ═══ */
                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  className="relative overflow-hidden rounded-3xl border-2 border-gold/40 bg-gradient-to-br from-gold/10 via-card to-gold/5 p-8 text-center shadow-elevated max-w-2xl mx-auto"
                >
                  <div className="orb orb-gold w-56 h-56 -top-20 left-1/2 -translate-x-1/2 opacity-60" />
                  <div className="relative">
                    <span className="w-16 h-16 mx-auto mb-5 flex items-center justify-center"><RealisticClockIcon className="w-14 h-14" /></span>
                    <p className="text-xs md:text-sm font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 mb-2">
                      Time Remaining
                    </p>
                    <div className="flex justify-center items-baseline gap-3 flex-wrap mb-3">
                      {(() => {
                        const target = new Date(selectedSession.publish_at!).getTime();
                        const diff = target - now;
                        const days = Math.floor(diff / 86400000);
                        const hours = Math.floor((diff % 86400000) / 3600000);
                        const mins = Math.floor((diff % 3600000) / 60000);
                        const secs = Math.floor((diff % 60000) / 1000);
                        return (
                          <>
                            {days > 0 && <CountdownUnit value={days} label="d" />}
                            <CountdownUnit value={hours} label="h" />
                            <CountdownUnit value={mins} label="m" />
                            <CountdownUnit value={secs} label="s" />
                          </>
                        );
                      })()}
                    </div>
                    <h2 className="text-lg md:text-xl font-heading font-bold text-foreground mt-4">{selectedSession.title}</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {examTypeLabel(selectedSession.exam_term)} · Classes {selectedSession.class_order.join(", ")} · Year {selectedSession.exam_year}
                    </p>
                    <p className="text-xs text-muted-foreground mt-4 mb-1 font-medium">
                      Goes live {format(new Date(selectedSession.publish_at!), "EEEE, dd MMMM yyyy 'at' h:mm a")}
                    </p>
                    {selectedSession.countdown_label && (
                      <p className="text-xs text-muted-foreground mt-6 italic max-w-md mx-auto">"{selectedSession.countdown_label}"</p>
                    )}
                    <p className="inline-flex items-center gap-2 mt-6 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Slips open here automatically — no refresh needed
                    </p>
                  </div>
                </motion.div>
              ) : (
                /* ═══ LIVE — premium slip finder ═══ */
                <SlipFinder
                  key={selectedSession.id}
                  session={selectedSession}
                  rolls={rollNumbers}
                  loading={loadingRolls}
                />
              ))}
            </>
          )}
        </div>
      </section>
    </PageLayout>
  );
};

/* ═══ SLIP FINDER — class + full-name search, one student at a time ════════ */
interface SlipResult {
  entry: RollEntry;
  qrDataURL: string;
}

function SlipFinder({ session, rolls, loading }: {
  session: ExamSession;
  rolls: RollEntry[];
  loading: boolean;
}) {
  const classes = session.class_order?.length ? session.class_order : ["6", "7", "8", "9", "10"];
  const [selectedClass, setSelectedClass] = useState<string>(classes[0] || "6");
  const [fullName, setFullName] = useState("");
  const [matches, setMatches] = useState<RollEntry[] | null>(null);
  const [activeSlip, setActiveSlip] = useState<SlipResult | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const canSearch = fullName.trim().length >= 2;

  const openSlip = async (r: RollEntry) => {
    setQrBusy(true);
    try {
      const qrData = encodeExamQRData(session.id, r.student_id, r.exam_roll_no);
      const qrDataURL = await QRCode.toDataURL(qrData, { width: 400, margin: 1, errorCorrectionLevel: "M", color: { dark: "#333333", light: "#FFFFFF" } });
      setActiveSlip({ entry: r, qrDataURL });
      triggerConfetti("burst");
    } catch {
      toast.error("Could not prepare the slip — please try again");
    }
    setQrBusy(false);
  };

  const handleSearch = () => {
    const q = normName(fullName);
    if (!q) return;
    const found = rolls.filter(r => r.class === selectedClass && normName(r.student_name).includes(q));
    setMatches(found);
    setActiveSlip(null);
    if (found.length === 1) openSlip(found[0]); // exact one → straight to the slip
    if (found.length === 0) toast.error("No student found — check the class & spelling");
  };

  const resetFinder = () => {
    setMatches(null);
    setActiveSlip(null);
    setFullName("");
  };

  const handleDownload = async (r: RollEntry) => {
    setDownloading(true);
    try {
      await downloadSlipPdf(session, r);
      toast.success("Roll No. Slip downloaded!");
    } catch {
      toast.error("Failed to generate slip PDF");
    }
    setDownloading(false);
  };

  const shareSlip = async (r: RollEntry) => {
    const text =
      `${r.student_name} — Class ${r.class}\n` +
      `Exam Roll No: ${r.exam_roll_no}\n` +
      `${session.exam_term} ${session.exam_year}\n` +
      `Government High School Babi Khel`;
    const url = `${window.location.origin}/roll-no-slip`;
    const nav: Navigator | undefined = typeof navigator !== "undefined" ? navigator : undefined;
    const shareText = `${text}\n${url}`;
    try {
      if (nav && "share" in nav) {
        await nav.share({ title: "Exam Roll No. Slip — GHS Babi Khel", text, url });
      } else if (nav?.clipboard) {
        await nav.clipboard.writeText(shareText);
        toast.success("Slip details copied — paste anywhere to share");
      } else {
        toast.error("Sharing is not available on this device");
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") toast.error("Sharing is not available on this device");
    }
  };

  /* ── Result: the student's own premium slip card ───────────────────────── */
  if (activeSlip) {
    const r = activeSlip.entry;
    return (
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="max-w-lg mx-auto">
        <div className="relative overflow-hidden rounded-3xl border-2 border-gold/40 bg-gradient-to-br from-gold/10 via-card to-gold/5 shadow-elevated">
          {/* Gold header band */}
          <div className="relative bg-gradient-to-r from-primary to-primary-glow text-primary-foreground px-6 py-5 text-center">
            <div className="absolute top-0 inset-x-0 h-1 bg-gold/80" />
            <p className="text-[10px] uppercase tracking-[0.25em] opacity-80 font-semibold">Government High School Babi Khel</p>
            <h3 className="font-heading font-bold text-lg mt-1">Exam Roll No. Slip</h3>
            <p className="text-[11px] opacity-85 mt-0.5">{examTypeLabel(session.exam_term)} {session.exam_year}</p>
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-white/15 rounded-full px-2 py-0.5">
              <Sparkles className="w-2.5 h-2.5" /> Verified
            </span>
          </div>

          <div className="p-6">
            {/* Roll number hero + QR */}
            <div className="flex items-stretch gap-4 mb-5">
              <div className="flex-1 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex flex-col items-center justify-center py-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Exam Roll Number</p>
                <p className="text-4xl font-black font-mono text-primary tracking-wider mt-1">{r.exam_roll_no}</p>
              </div>
              <div className="shrink-0 rounded-2xl border border-border bg-card p-2 flex flex-col items-center justify-center">
                <img src={activeSlip.qrDataURL} alt="Attendance QR code" className="w-[74px] h-[74px]" />
                <p className="text-[8px] text-muted-foreground mt-1">Scan for Attendance</p>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2 mb-6">
              {[
                { label: "Student Name", value: r.student_name },
                { label: "Father Name", value: r.father_name || "—" },
                { label: "Class", value: `Class ${r.class}` },
                { label: "Class Roll No", value: r.class_roll_no },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between border-b border-border/60 pb-2">
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <span className="text-sm font-semibold text-foreground text-right">{row.value}</span>
                </div>
              ))}
            </div>

            {/* Actions — Download + small share button */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => handleDownload(r)}
                disabled={downloading}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold text-sm px-5 py-3.5 rounded-2xl shadow-card hover:shadow-elevated active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download Slip PDF
              </button>
              <button
                onClick={() => shareSlip(r)}
                aria-label="Share roll number slip"
                title="Share"
                className="shrink-0 w-12 h-12 rounded-2xl border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 active:scale-95 transition-all inline-flex items-center justify-center"
              >
                <Share2 className="w-[18px] h-[18px]" />
              </button>
            </div>

            <p className="text-[10px] text-center text-muted-foreground mt-4">
              Bring this slip to the examination hall — keep it safe.
            </p>
          </div>
        </div>

        <button
          onClick={resetFinder}
          className="mt-5 mx-auto flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Search another student
        </button>
      </motion.div>
    );
  }

  /* ── Single match whose QR isn't ready yet (rare retry state) ──────────── */
  if (matches && matches.length === 1 && !activeSlip) {
    const r = matches[0];
    return (
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="max-w-lg mx-auto">
        <button
          onClick={() => openSlip(r)}
          className="w-full text-left bg-card rounded-2xl p-4 shadow-card border border-border hover:border-primary/40 transition-colors flex items-center gap-3"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex flex-col items-center justify-center shrink-0">
            <span className="text-[8px] text-primary font-semibold leading-none">ROLL</span>
            <span className="text-primary font-bold text-[13px] leading-tight font-mono">{r.exam_roll_no}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-heading font-semibold text-foreground truncate text-sm">{r.student_name}</p>
            <p className="text-xs text-muted-foreground truncate">Class {r.class} · Class Roll No: {r.class_roll_no}</p>
          </div>
          <span className="text-xs font-bold text-primary bg-primary/10 rounded-full px-3 py-1.5 shrink-0">View Slip</span>
        </button>
        <button onClick={resetFinder} className="mt-4 mx-auto flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Search another student
        </button>
      </motion.div>
    );
  }

  /* ── Multiple matches with the same name — let the student pick ────────── */
  if (matches && matches.length > 1) {
    return (
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="max-w-lg mx-auto space-y-3">
        <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div>
            <p className="font-heading font-semibold text-foreground text-sm">{matches.length} students named "{fullName.trim()}" in Class {selectedClass}</p>
            <p className="text-xs text-muted-foreground">Tap your exact name to open your slip</p>
          </div>
        </div>
        {matches.slice(0, 10).map(r => (
          <button
            key={r.id}
            onClick={() => openSlip(r)}
            className="w-full text-left bg-card rounded-2xl p-4 shadow-card border border-border hover:border-primary/40 transition-colors flex items-center gap-3"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex flex-col items-center justify-center shrink-0">
              <span className="text-[8px] text-primary font-semibold leading-none">ROLL</span>
              <span className="text-primary font-bold text-[13px] leading-tight font-mono">{r.exam_roll_no}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading font-semibold text-foreground truncate text-sm">{r.student_name}</p>
              <p className="text-xs text-muted-foreground truncate">S/o {r.father_name || "—"} · Class Roll No: {r.class_roll_no}</p>
            </div>
            <span className="text-xs font-bold text-primary bg-primary/10 rounded-full px-3 py-1.5 shrink-0">View Slip</span>
          </button>
        ))}
        {matches.length > 10 && (
          <p className="text-center text-xs text-muted-foreground">Showing 10 of {matches.length} — type the full name to narrow it down</p>
        )}
        <button onClick={resetFinder} className="mx-auto flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Search again
        </button>
      </motion.div>
    );
  }

  /* ── Not found ──────────────────────────────────────────────────────────── */
  if (matches && matches.length === 0) {
    return (
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="max-w-lg mx-auto">
        <div className="rounded-3xl border-2 border-amber-500/30 bg-amber-500/5 p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h3 className="font-heading font-bold text-foreground">No slip found for "{fullName.trim()}"</h3>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            No student matches in <span className="font-semibold text-foreground">Class {selectedClass}</span>.
            Double-check the selected class and the spelling of your full name — it must match the school record.
          </p>
          <div className="flex items-center justify-center gap-2 mt-6">
            <button onClick={resetFinder} className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Try Again
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  /* ── Default: the premium finder form ───────────────────────────────────── */
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="max-w-lg mx-auto">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground p-6 text-center shadow-elevated mb-6">
        <div className="orb orb-light w-40 h-40 -top-16 -right-10 opacity-70" />
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mx-auto mb-3">
            <GraduationCap className="w-7 h-7" />
          </div>
          <h2 className="font-heading font-bold text-xl">Find Your Roll No. Slip</h2>
          <p className="text-xs opacity-85 mt-1">{session.title} · {examTypeLabel(session.exam_term)} {session.exam_year}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}
        </div>
      ) : rolls.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-8 text-center">
          <Hash className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-heading font-semibold text-foreground">Slips are being prepared</p>
          <p className="text-sm text-muted-foreground mt-1">Please check back a little later</p>
        </div>
      ) : (
        <div className="rounded-3xl border border-border bg-card shadow-card p-6 space-y-6">
          {/* Step 1 — class */}
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-muted-foreground mb-3">
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">1</span>
              Select Your Class
            </p>
            <div className="grid grid-cols-5 gap-2">
              {classes.map(cls => {
                const active = selectedClass === cls;
                return (
                  <button
                    key={cls}
                    onClick={() => { setSelectedClass(cls); resetFinder(); }}
                    className={`rounded-2xl py-3 flex flex-col items-center gap-0.5 border-2 transition-all active:scale-95 ${
                      active
                        ? "bg-gradient-to-b from-primary to-primary-glow text-primary-foreground border-primary shadow-card"
                        : "bg-secondary/40 text-muted-foreground border-transparent hover:border-primary/30"
                    }`}
                  >
                    <span className="text-lg font-black leading-none">{cls}</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wide ${active ? "opacity-85" : "opacity-70"}`}>
                      {cls === "6" ? "6th" : cls === "7" ? "7th" : cls === "8" ? "8th" : cls === "9" ? "9th" : "10th"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2 — full name */}
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-muted-foreground mb-3">
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">2</span>
              Enter Your Full Name
            </p>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && canSearch) handleSearch(); }}
                placeholder="e.g. Muhammad Ahmad Khan"
                enterKeyHint="search"
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-border bg-background text-sm font-medium text-foreground placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none transition-all"
              />
            </div>
          </div>

          {/* Search */}
          <button
            onClick={handleSearch}
            disabled={!canSearch || qrBusy}
            className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold text-sm px-5 py-4 rounded-2xl shadow-card hover:shadow-elevated active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {qrBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {qrBusy ? "Preparing your slip…" : "Search My Slip"}
          </button>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground -mt-3">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            Your slip appears instantly — download it as PDF or share it
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default ExamRollNumbers;
