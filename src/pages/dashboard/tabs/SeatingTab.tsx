/**
 * SeatingTab.tsx
 * Student dashboard tab — "Exam Seating".
 *
 * Rich, professional layout:
 *  • Plan header — title, exam session, paper, date, classes, status, stats
 *    (rooms / students seated / total capacity).
 *  • Plan tabs at top — switch between multiple published/scheduled plans.
 *  • Countdown timer for scheduled plans — auto-publishes at zero.
 *  • "Your Seat" hero card (if you have one) — primary gradient, seat label,
 *    room, invigilator, row/col, paper/date, download-slip button.
 *  • Per-room expandable sections — desk-layout grid (color-coded by class),
 *    invigilator, room notes, seat count. Click any desk to open a detail
 *    drawer with full student info + QR + download slip.
 *  • Search across every student in the plan (name, exam roll, class roll,
 *    room, seat label, class) — clicking a result opens the same drawer.
 */
import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  usePublishedSeatingPlans,
  useAutoPublishSeatingPlan,
  encodeSeatingQRData,
  type SeatingPlanFull,
  type RoomWithAssignments,
  type SeatingAssignment,
} from "@/hooks/useExamSeating";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  LayoutGrid, MapPin, Loader2, Download, Search, Lock, Timer, Building2,
  User, Grid3x3, Users, ChevronDown, ChevronUp, CalendarDays, BookOpen,
  ScanLine, X, Hash,
} from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import QRCode from "qrcode";

// ── Color helper (mirrors admin's palette) ──
const colorFor = (cls: string) => {
  const m: Record<string, { bg: string; text: string; border: string }> = {
    "6":  { bg: "bg-blue-100 dark:bg-blue-900/40",       text: "text-blue-700 dark:text-blue-300",       border: "border-blue-300 dark:border-blue-700" },
    "7":  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-300 dark:border-emerald-700" },
    "8":  { bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300",     border: "border-amber-300 dark:border-amber-700" },
    "9":  { bg: "bg-rose-100 dark:bg-rose-900/40",       text: "text-rose-700 dark:text-rose-300",       border: "border-rose-300 dark:border-rose-700" },
    "10": { bg: "bg-violet-100 dark:bg-violet-900/40",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-300 dark:border-violet-700" },
  };
  return m[cls] ?? { bg: "bg-slate-100 dark:bg-slate-900/40", text: "text-slate-700 dark:text-slate-300", border: "border-slate-300 dark:border-slate-700" };
};

// ── Countdown timer — auto-publishes when publish_at passes ──
function CountdownTimer({ targetDate, label, planId }: { targetDate: string; label: string; planId: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [expired, setExpired] = useState(false);
  const qc = useQueryClient();
  const autoPub = useAutoPublishSeatingPlan();

  useEffect(() => {
    const calc = async () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        if (!expired) {
          setExpired(true);
          setTimeLeft("");
          try {
            await autoPub.mutateAsync({ planId });
            qc.invalidateQueries({ queryKey: ["published-seating-plans"] });
          } catch { /* swallow — next refetch retries */ }
        }
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setTimeLeft(`${d}d ${h}h ${m}m ${s}s`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m ${s}s`);
      else setTimeLeft(`${m}m ${s}s`);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [targetDate, planId, expired, qc, autoPub]);

  if (expired) return null;

  return (
    <div className="bg-gradient-to-br from-blue-50 to-orange-50 dark:from-blue-950/20 dark:to-orange-900/20 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-6 text-center">
      <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
        <Timer className="w-7 h-7 text-blue-500" />
      </div>
      <p className="text-sm font-medium text-blue-800 dark:text-blue-400 mb-2">{label || "Exam seating will be revealed in"}</p>
      <p className="text-3xl font-bold font-mono text-blue-900 dark:text-blue-300 tracking-wider">{timeLeft}</p>
      <p className="text-xs text-blue-700 dark:text-blue-500 mt-3">Please check back when the countdown ends</p>
    </div>
  );
}

// ── Detail drawer for a single seat ──
function SeatDetailDialog({
  open, onOpenChange, assignment, room, plan, isMe, profileName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  assignment: SeatingAssignment | null;
  room: RoomWithAssignments | null;
  plan: SeatingPlanFull | null;
  isMe: boolean;
  profileName?: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [qrUrl, setQrUrl] = useState<string>("");

  useEffect(() => {
    if (!assignment || !open) { setQrUrl(""); return; }
    const qrData = encodeSeatingQRData({
      planId: assignment.plan_id,
      roomId: assignment.room_id,
      seatLabel: assignment.seat_label,
      studentId: assignment.student_id,
      examRollNo: assignment.exam_roll_no,
    });
    QRCode.toDataURL(qrData, { width: 240, margin: 1, errorCorrectionLevel: "M" })
      .then(setQrUrl)
      .catch(() => setQrUrl(""));
  }, [assignment, open]);

  if (!assignment || !room || !plan) return null;

  const cc = colorFor(assignment.class);

  const downloadSlip = async () => {
    setDownloading(true);
    try {
      const qrData = encodeSeatingQRData({
        planId: assignment.plan_id, roomId: assignment.room_id,
        seatLabel: assignment.seat_label, studentId: assignment.student_id,
        examRollNo: assignment.exam_roll_no,
      });
      const qrDataURL = await QRCode.toDataURL(qrData, { width: 400, margin: 1, errorCorrectionLevel: "M" });
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a6" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      doc.setDrawColor(120); doc.setLineWidth(0.5);
      doc.rect(3, 3, pageW - 6, pageH - 6, "S");
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(40);
      doc.text("GHS Babi Khel", pageW / 2, 10, { align: "center" });
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(100);
      doc.text("EXAM SEATING SLIP", pageW / 2, 15, { align: "center" });

      const qrSize = 30;
      const qrX = (pageW - qrSize) / 2;
      doc.addImage(qrDataURL, "PNG", qrX, 20, qrSize, qrSize);
      doc.setFontSize(5.5); doc.setTextColor(120); doc.setFont("helvetica", "normal");
      doc.text("Scan this QR at the exam hall", pageW / 2, 20 + qrSize + 4, { align: "center" });

      doc.setFillColor(245, 245, 245);
      doc.roundedRect(8, 20 + qrSize + 7, pageW - 16, 14, 1.5, 1.5, "F");
      doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
      doc.text("SEAT", pageW / 2, 20 + qrSize + 11, { align: "center" });
      doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(40);
      doc.text(assignment.seat_label, pageW / 2, 20 + qrSize + 18, { align: "center" });

      let y = 20 + qrSize + 26;
      const drawDetail = (label: string, value: string) => {
        doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
        doc.text(label, 8, y);
        doc.setFont("helvetica", "bold"); doc.setTextColor(40);
        doc.text(value, 8 + 22, y);
        y += 5;
      };
      drawDetail("Student:", profileName || assignment.student_name);
      drawDetail("Exam Roll:", assignment.exam_roll_no);
      drawDetail("Class:", `Class ${assignment.class}`);
      drawDetail("Class Roll:", assignment.class_roll_no);
      drawDetail("Room:", room.name);
      drawDetail("Row · Seat:", `Row ${assignment.row_idx + 1} · Col ${assignment.col_idx + 1}`);
      if (room.invigilator) drawDetail("Invigilator:", room.invigilator);
      if (plan.paper_subject) drawDetail("Paper:", plan.paper_subject);
      if (plan.exam_date) drawDetail("Date:", new Date(plan.exam_date).toLocaleDateString());

      doc.setDrawColor(120); doc.setLineWidth(0.3);
      doc.line(3, pageH - 8, pageW - 3, pageH - 8);
      doc.setFontSize(5); doc.setTextColor(140); doc.setFont("helvetica", "bold");
      doc.text("GHS BABI KHEL · EXAM SEATING", pageW / 2, pageH - 5, { align: "center" });

      doc.save(`SeatingSlip-${assignment.seat_label.replace(/[^\w-]/g, "_")}.pdf`);
      toast.success("Seating slip downloaded");
    } catch (e: any) {
      toast.error("Failed: " + (e?.message ?? ""));
    }
    setDownloading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Grid3x3 className="w-5 h-5 text-primary" />
            Seat {assignment.seat_label}
            {isMe && <Badge variant="secondary" className="bg-primary/10 text-primary">You</Badge>}
          </DialogTitle>
          <DialogDescription>
            {plan.title} · {room.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* QR + key fields */}
          <div className="flex gap-4">
            {qrUrl && (
              <div className="shrink-0">
                <div className="w-32 h-32 rounded-lg border border-border p-1.5 bg-white">
                  <img src={qrUrl} alt="Seat QR" className="w-full h-full" />
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-1 flex items-center justify-center gap-1">
                  <ScanLine className="w-3 h-3" /> Scan at hall
                </p>
              </div>
            )}
            <div className="flex-1 space-y-2 text-sm">
              <DetailRow icon={<User className="w-3.5 h-3.5" />} label="Student" value={profileName || assignment.student_name} />
              <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label="Exam Roll" value={assignment.exam_roll_no} mono />
              <DetailRow icon={<Users className="w-3.5 h-3.5" />} label="Class" value={`Class ${assignment.class}`} />
              <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label="Class Roll" value={assignment.class_roll_no} mono />
              <DetailRow icon={<Building2 className="w-3.5 h-3.5" />} label="Room" value={room.name} />
              <DetailRow icon={<Grid3x3 className="w-3.5 h-3.5" />} label="Position" value={`Row ${assignment.row_idx + 1} · Col ${assignment.col_idx + 1}`} />
              {room.invigilator && <DetailRow icon={<User className="w-3.5 h-3.5" />} label="Invigilator" value={room.invigilator} />}
            </div>
          </div>

          {/* Plan metadata */}
          <div className="rounded-lg border border-border p-3 bg-secondary/30 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium text-foreground text-right">{plan.title}</span>
            </div>
            {plan.paper_subject && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Paper</span>
                <span className="font-medium text-foreground">{plan.paper_subject}</span>
              </div>
            )}
            {plan.exam_date && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Exam Date</span>
                <span className="font-medium text-foreground">{new Date(plan.exam_date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Classes</span>
              <div className="flex gap-1 flex-wrap justify-end">
                {plan.classes.map(c => (
                  <span key={c} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${colorFor(c).bg} ${colorFor(c).text}`}>Class {c}</span>
                ))}
              </div>
            </div>
            {room.notes && (
              <div className="flex items-start justify-between gap-2 pt-1 border-t border-border">
                <span className="text-muted-foreground shrink-0">Room notes</span>
                <span className="text-foreground text-right">{room.notes}</span>
              </div>
            )}
          </div>

          {/* Download slip — only for own seat */}
          {isMe && (
            <Button onClick={downloadSlip} disabled={downloading} className="w-full">
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download Seating Slip
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const DetailRow = ({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) => (
  <div className="flex items-center gap-2">
    <span className="text-muted-foreground">{icon}</span>
    <span className="text-muted-foreground text-xs w-20 shrink-0">{label}</span>
    <span className={`font-medium text-foreground flex-1 ${mono ? "font-mono" : ""}`}>{value}</span>
  </div>
);

// ── Per-room expandable section with desk grid ──
function RoomSection({
  room, plan, myAssignmentId, onSeatClick,
}: {
  room: RoomWithAssignments;
  plan: SeatingPlanFull;
  myAssignmentId: string | null;
  onSeatClick: (a: SeatingAssignment) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  // Build assignment lookup by [row,col]
  const grid = useMemo(() => {
    const m = new Map<string, SeatingAssignment>();
    for (const a of room.assignments) m.set(`${a.row_idx}:${a.col_idx}`, a);
    return m;
  }, [room.assignments]);

  const blocked = new Set((room.block_layout ?? []).map(([r, c]: number[]) => `${r}:${c}`));

  return (
    <Card>
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpanded(s => !s)}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            {room.name}
            <Badge variant="secondary" className="ml-1">{room.assignments.length}/{room.capacity} seated</Badge>
          </CardTitle>
          <div className="flex items-center gap-3">
            {room.invigilator && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="w-3 h-3" /> {room.invigilator}
              </span>
            )}
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          {/* Desk grid */}
          <div className="overflow-x-auto pb-2">
            <div
              className="inline-grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${room.cols}, minmax(56px, 1fr))` }}
            >
              {Array.from({ length: room.rows * room.cols }).map((_, idx) => {
                const r = Math.floor(idx / room.cols);
                const c = idx % room.cols;
                const isBlocked = blocked.has(`${r}:${c}`);
                const a = grid.get(`${r}:${c}`);
                if (isBlocked) {
                  return (
                    <div
                      key={idx}
                      className="aspect-[4/3] rounded-md bg-foreground/10 dark:bg-foreground/20 flex items-center justify-center text-[10px] text-muted-foreground border border-dashed border-border"
                    >
                      ✕
                    </div>
                  );
                }
                if (a) {
                  const cc = colorFor(a.class);
                  const isMe = a.id === myAssignmentId;
                  return (
                    <button
                      key={idx}
                      onClick={() => onSeatClick(a)}
                      className={`aspect-[4/3] rounded-md border p-1 flex flex-col justify-between text-[10px] leading-tight text-left transition-all hover:scale-105 hover:shadow-md ${cc.bg} ${cc.text} ${cc.border} ${isMe ? "ring-2 ring-primary ring-offset-1" : ""}`}
                      title={`${a.student_name} · Class ${a.class} · ${a.seat_label}`}
                    >
                      <span className="font-bold">R{r + 1}·S{c + 1}</span>
                      <span className="font-semibold truncate">{a.student_name.split(" ")[0]}</span>
                      <span className="opacity-70 font-mono text-[9px]">{a.exam_roll_no}</span>
                    </button>
                  );
                }
                return (
                  <div
                    key={idx}
                    className="aspect-[4/3] rounded-md bg-secondary/40 border border-border flex items-center justify-center text-[10px] text-muted-foreground"
                  >
                    R{r + 1}·S{c + 1}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Room notes */}
          {room.notes && (
            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
              <span className="font-medium">Notes:</span> {room.notes}
            </p>
          )}

          {/* Class legend for this room */}
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
            {[...new Set(room.assignments.map(a => a.class))].sort().map(c => (
              <span key={c} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${colorFor(c).bg} ${colorFor(c).text}`}>
                Class {c} · {room.assignments.filter(a => a.class === c).length}
              </span>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Main component ──
const SeatingTab = () => {
  const { profile } = useAuth();
  const { data: plans = [], isLoading } = usePublishedSeatingPlans();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState<SeatingAssignment | null>(null);

  const selectedPlan = plans.find(p => p.id === selectedPlanId) ?? plans[0] ?? null;

  // Flatten all assignments across rooms in the selected plan, for search.
  const allSeats = selectedPlan
    ? selectedPlan.rooms.flatMap(r =>
        r.assignments.map(a => ({ ...a, room_name: r.name, invigilator: r.invigilator }))
      )
    : [];

  // Filter by search query.
  const filtered = search.trim()
    ? allSeats.filter(s => {
        const q = search.toLowerCase();
        return (
          s.student_name.toLowerCase().includes(q) ||
          s.exam_roll_no.toLowerCase().includes(q) ||
          s.class_roll_no.toLowerCase().includes(q) ||
          s.room_name.toLowerCase().includes(q) ||
          s.seat_label.toLowerCase().includes(q) ||
          s.class.toLowerCase().includes(q)
        );
      })
    : allSeats;

  // Identify the logged-in student's own seat in the selected plan.
  const mySeat = profile
    ? allSeats.find(s =>
        (profile.id && s.student_id === profile.id) ||
        (profile.roll_number && profile.class && s.class_roll_no === profile.roll_number && s.class === profile.class)
      )
    : null;

  // The room that contains the selected assignment (for the drawer).
  const selectedRoom = selectedPlan && selectedAssignment
    ? selectedPlan.rooms.find(r => r.id === selectedAssignment.room_id) ?? null
    : null;

  const handleSearchClick = (a: SeatingAssignment) => {
    // Find the assignment object from the plan's rooms (has all fields).
    const full = selectedPlan?.rooms.flatMap(r => r.assignments).find(x => x.id === a.id);
    if (full) setSelectedAssignment(full);
  };

  // Download the student's own seating slip from the hero card.
  const [heroDownloading, setHeroDownloading] = useState(false);
  const downloadHeroSlip = async () => {
    if (!mySeat || !selectedPlan) return;
    setHeroDownloading(true);
    try {
      const qrData = encodeSeatingQRData({
        planId: selectedPlan.id, roomId: mySeat.room_id, seatLabel: mySeat.seat_label,
        studentId: mySeat.student_id, examRollNo: mySeat.exam_roll_no,
      });
      const qrDataURL = await QRCode.toDataURL(qrData, { width: 400, margin: 1, errorCorrectionLevel: "M" });
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a6" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      doc.setDrawColor(120); doc.setLineWidth(0.5);
      doc.rect(3, 3, pageW - 6, pageH - 6, "S");
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(40);
      doc.text("GHS Babi Khel", pageW / 2, 10, { align: "center" });
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(100);
      doc.text("EXAM SEATING SLIP", pageW / 2, 15, { align: "center" });
      const qrSize = 30;
      const qrX = (pageW - qrSize) / 2;
      doc.addImage(qrDataURL, "PNG", qrX, 20, qrSize, qrSize);
      doc.setFontSize(5.5); doc.setTextColor(120); doc.setFont("helvetica", "normal");
      doc.text("Scan this QR at the exam hall", pageW / 2, 20 + qrSize + 4, { align: "center" });
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(8, 20 + qrSize + 7, pageW - 16, 14, 1.5, 1.5, "F");
      doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
      doc.text("YOUR SEAT", pageW / 2, 20 + qrSize + 11, { align: "center" });
      doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(40);
      doc.text(mySeat.seat_label, pageW / 2, 20 + qrSize + 18, { align: "center" });
      let y = 20 + qrSize + 26;
      const drawDetail = (label: string, value: string) => {
        doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
        doc.text(label, 8, y);
        doc.setFont("helvetica", "bold"); doc.setTextColor(40);
        doc.text(value, 8 + 22, y);
        y += 5;
      };
      drawDetail("Student:", profile?.full_name ?? "—");
      drawDetail("Exam Roll:", mySeat.exam_roll_no);
      drawDetail("Room:", mySeat.room_name);
      drawDetail("Row · Seat:", `Row ${mySeat.row_idx + 1} · Col ${mySeat.col_idx + 1}`);
      if (mySeat.invigilator) drawDetail("Invigilator:", mySeat.invigilator);
      if (selectedPlan.paper_subject) drawDetail("Paper:", selectedPlan.paper_subject);
      if (selectedPlan.exam_date) drawDetail("Date:", new Date(selectedPlan.exam_date).toLocaleDateString());
      doc.setDrawColor(120); doc.setLineWidth(0.3);
      doc.line(3, pageH - 8, pageW - 3, pageH - 8);
      doc.setFontSize(5); doc.setTextColor(140); doc.setFont("helvetica", "bold");
      doc.text("GHS BABI KHEL · EXAM SEATING", pageW / 2, pageH - 5, { align: "center" });
      doc.save(`SeatingSlip-${mySeat.seat_label.replace(/[^\w-]/g, "_")}.pdf`);
      toast.success("Seating slip downloaded");
    } catch (e: any) {
      toast.error("Failed: " + (e?.message ?? ""));
    }
    setHeroDownloading(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
          <LayoutGrid className="w-6 h-6 text-primary" /> Exam Seating
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Look up any student's seat across all seating plans — your own seat is highlighted.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : plans.length === 0 ? (
        <div className="bg-card rounded-2xl p-10 text-center border border-border">
          <MapPin className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-semibold text-foreground">No Seating Plans Yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your school hasn't published any seating plans. Check back closer to your exam date.
          </p>
        </div>
      ) : (
        <>
          {/* Plan tabs */}
          <div className="flex flex-wrap gap-2">
            {plans.map(p => {
              const isLocked = p.status !== "published" && p.publish_at;
              const isActive = selectedPlan?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPlanId(p.id); setSearch(""); }}
                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all border flex items-center gap-1.5 ${
                    isActive
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {isLocked && <Lock className="w-3 h-3" />}
                  {p.title}
                </button>
              );
            })}
          </div>

          {selectedPlan && (
            <>
              {/* Countdown (if scheduled but not yet published) */}
              {selectedPlan.status !== "published" && selectedPlan.publish_at && (
                <CountdownTimer
                  targetDate={selectedPlan.publish_at}
                  label={selectedPlan.countdown_label || "Exam seating will be revealed in"}
                  planId={selectedPlan.id}
                />
              )}

              {/* Locked state (no countdown, no auto-publish) */}
              {selectedPlan.status !== "published" && !selectedPlan.publish_at && (
                <div className="bg-card rounded-2xl p-8 text-center border border-border">
                  <Lock className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="font-semibold text-foreground">Not Yet Published</p>
                  <p className="text-sm text-muted-foreground mt-1">Seats for this plan aren't visible yet.</p>
                </div>
              )}

              {/* Published — full layout */}
              {selectedPlan.status === "published" && (
                <>
                  {/* ── Plan header card ── */}
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                          <h3 className="text-lg font-heading font-bold text-foreground">{selectedPlan.title}</h3>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                            {selectedPlan.paper_subject && (
                              <span className="flex items-center gap-1">
                                <BookOpen className="w-3 h-3" /> {selectedPlan.paper_subject}
                              </span>
                            )}
                            {selectedPlan.exam_date && (
                              <span className="flex items-center gap-1">
                                <CalendarDays className="w-3 h-3" /> {new Date(selectedPlan.exam_date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3" /> {selectedPlan.rooms.length} room{selectedPlan.rooms.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          {/* Classes */}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {selectedPlan.classes.map(c => (
                              <span key={c} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${colorFor(c).bg} ${colorFor(c).text}`}>
                                Class {c}
                              </span>
                            ))}
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 shrink-0">
                          Published
                        </Badge>
                      </div>
                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
                        <PlanStat icon={<Building2 className="w-4 h-4" />} label="Rooms" value={selectedPlan.rooms.length} />
                        <PlanStat icon={<Users className="w-4 h-4" />} label="Students Seated" value={selectedPlan.total_seated} />
                        <PlanStat icon={<Grid3x3 className="w-4 h-4" />} label="Total Capacity" value={selectedPlan.rooms.reduce((s, r) => s + r.capacity, 0)} />
                      </div>
                    </CardContent>
                  </Card>

                  {/* ── Your Seat hero (if you have one) ── */}
                  {mySeat && (
                    <Card className="overflow-hidden border-primary/30">
                      <CardContent className="p-5 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="w-16 h-16 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                            <Grid3x3 className="w-8 h-8" />
                          </div>
                          <div className="flex-1 min-w-[180px]">
                            <p className="text-xs opacity-80 mb-0.5 flex items-center gap-1">
                              <User className="w-3 h-3" /> Your Seat
                            </p>
                            <h3 className="text-2xl font-bold font-mono">{mySeat.seat_label}</h3>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs opacity-95 mt-2">
                              <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {mySeat.room_name}</span>
                              <span className="flex items-center gap-1"><Grid3x3 className="w-3 h-3" /> Row {mySeat.row_idx + 1} · Col {mySeat.col_idx + 1}</span>
                              {mySeat.invigilator && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {mySeat.invigilator}</span>}
                              {selectedPlan.paper_subject && <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {selectedPlan.paper_subject}</span>}
                              {selectedPlan.exam_date && <span className="flex items-center gap-1 col-span-2"><CalendarDays className="w-3 h-3" /> {new Date(selectedPlan.exam_date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</span>}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <Button
                              onClick={() => setSelectedAssignment(mySeat)}
                              variant="secondary"
                              size="sm"
                              className="bg-white/15 text-primary-foreground hover:bg-white/25 border-white/20"
                            >
                              <MapPin className="w-3.5 h-3.5" /> View Details
                            </Button>
                            <Button
                              onClick={downloadHeroSlip}
                              disabled={heroDownloading}
                              variant="secondary"
                              size="sm"
                              className="bg-white text-primary hover:bg-white/90"
                            >
                              {heroDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download Slip
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* ── Search bar ── */}
                  <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search name, roll no, room, seat..."
                      className="w-full pl-9 pr-9 py-2 rounded-xl border border-input bg-background text-sm focus:ring-2 focus:ring-ring outline-none"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* ── Search results (when searching) ── */}
                  {search.trim() && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Search className="w-4 h-4" /> Search Results
                          <Badge variant="secondary">{filtered.length}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {filtered.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">No seats match "{search}"</p>
                        ) : (
                          <div className="space-y-1.5 max-h-80 overflow-y-auto">
                            {filtered.slice(0, 50).map(s => {
                              const isMe = mySeat && s.student_id === mySeat.student_id && s.room_id === mySeat.room_id;
                              const cc = colorFor(s.class);
                              return (
                                <button
                                  key={s.id}
                                  onClick={() => handleSearchClick(s as any)}
                                  className={`w-full text-left bg-card rounded-lg px-3 py-2 border hover:border-primary/40 transition-colors flex items-center gap-3 ${isMe ? "ring-1 ring-primary" : ""}`}
                                >
                                  <span className="font-mono font-bold text-primary w-20 shrink-0 text-xs">{s.exam_roll_no}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-foreground truncate">
                                      {s.student_name}
                                      {isMe && <span className="ml-1 text-[10px] text-primary">(You)</span>}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground truncate">
                                      Class {s.class} · {s.room_name} · {s.seat_label}
                                      {s.invigilator ? ` · ${s.invigilator}` : ""}
                                    </p>
                                  </div>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${cc.bg} ${cc.text}`}>Class {s.class}</span>
                                </button>
                              );
                            })}
                            {filtered.length > 50 && (
                              <p className="text-center text-xs text-muted-foreground pt-2">
                                Showing 50 of {filtered.length} — refine your search to see more
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* ── Per-room desk-layout sections ── */}
                  {!search.trim() && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Building2 className="w-4 h-4" /> Room Layouts
                      </h3>
                      {selectedPlan.rooms.map(room => (
                        <RoomSection
                          key={room.id}
                          room={room}
                          plan={selectedPlan}
                          myAssignmentId={mySeat?.id ?? null}
                          onSeatClick={setSelectedAssignment}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Detail drawer */}
      <SeatDetailDialog
        open={!!selectedAssignment}
        onOpenChange={(v) => { if (!v) setSelectedAssignment(null); }}
        assignment={selectedAssignment}
        room={selectedRoom}
        plan={selectedPlan}
        isMe={!!selectedAssignment && !!mySeat && selectedAssignment.id === mySeat.id}
        profileName={profile?.full_name}
      />
    </div>
  );
};

const PlanStat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div className="flex items-center gap-2">
    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground shrink-0">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-base font-bold text-foreground">{value}</p>
    </div>
  </div>
);

export default SeatingTab;
