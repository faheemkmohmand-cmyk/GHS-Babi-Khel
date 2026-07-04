/**
 * SeatingTab.tsx
 * Student dashboard tab — "Exam Seating".
 *
 * Shows every published (or scheduled-with-countdown) seating plan in the
 * school, with all students' seats listed and searchable. The logged-in
 * student's own seat is highlighted at the top of each plan.
 *
 * For scheduled plans, a countdown timer is displayed; the plan auto-publishes
 * when the countdown reaches zero (mirrors the exam_roll_sessions pattern).
 */
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  usePublishedSeatingPlans,
  useAutoPublishSeatingPlan,
  encodeSeatingQRData,
  type SeatingPlanFull,
} from "@/hooks/useExamSeating";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutGrid, MapPin, Loader2, Download, Search, Lock, Timer, Building2, User, Grid3x3 } from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import QRCode from "qrcode";

// ── Color helper (mirrors admin's palette) ──
const colorFor = (cls: string) => {
  const m: Record<string, { bg: string; text: string }> = {
    "6":  { bg: "bg-blue-100 dark:bg-blue-900/40",       text: "text-blue-700 dark:text-blue-300" },
    "7":  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
    "8":  { bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300" },
    "9":  { bg: "bg-rose-100 dark:bg-rose-900/40",       text: "text-rose-700 dark:text-rose-300" },
    "10": { bg: "bg-violet-100 dark:bg-violet-900/40",   text: "text-violet-700 dark:text-violet-300" },
  };
  return m[cls] ?? { bg: "bg-slate-100 dark:bg-slate-900/40", text: "text-slate-700 dark:text-slate-300" };
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
          // Auto-publish the plan (safe — the mutation only flips rows not already published).
          try {
            await autoPub.mutateAsync({ planId });
            qc.invalidateQueries({ queryKey: ["published-seating-plans"] });
          } catch { /* swallow — the next refetch will retry */ }
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

// ── Main component ──
const SeatingTab = () => {
  const { profile } = useAuth();
  const { data: plans = [], isLoading } = usePublishedSeatingPlans();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  const selectedPlan = plans.find(p => p.id === selectedPlanId) ?? plans[0] ?? null;

  // Flatten all assignments across rooms in the selected plan, for search.
  const allSeats = selectedPlan
    ? selectedPlan.rooms.flatMap(r =>
        r.assignments.map(a => ({ ...a, room_name: r.name, invigilator: r.invigilator }))
      )
    : [];

  // Filter by search query (name, exam roll, class roll, room, seat label, class).
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

  // Download the student's own seating slip (only for self).
  const downloadSlip = async (plan: SeatingPlanFull) => {
    if (!mySeat) { toast.error("You don't have a seat in this plan"); return; }
    setDownloading(plan.id);
    try {
      const qrData = encodeSeatingQRData({
        planId: plan.id, roomId: mySeat.room_id, seatLabel: mySeat.seat_label,
        studentId: mySeat.student_id, examRollNo: mySeat.exam_roll_no,
      });
      const qrDataURL = await QRCode.toDataURL(qrData, { width: 400, margin: 1, errorCorrectionLevel: "M" });

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a6" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      // Border
      doc.setDrawColor(120); doc.setLineWidth(0.5);
      doc.rect(3, 3, pageW - 6, pageH - 6, "S");

      // Header
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(40);
      doc.text("GHS Babi Khel", pageW / 2, 10, { align: "center" });
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(100);
      doc.text("EXAM SEATING SLIP", pageW / 2, 15, { align: "center" });

      // QR
      const qrSize = 30;
      const qrX = (pageW - qrSize) / 2;
      doc.addImage(qrDataURL, "PNG", qrX, 20, qrSize, qrSize);
      doc.setFontSize(5.5); doc.setTextColor(120); doc.setFont("helvetica", "normal");
      doc.text("Scan this QR at the exam hall", pageW / 2, 20 + qrSize + 4, { align: "center" });

      // Hero: seat label
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(8, 20 + qrSize + 7, pageW - 16, 14, 1.5, 1.5, "F");
      doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
      doc.text("YOUR SEAT", pageW / 2, 20 + qrSize + 11, { align: "center" });
      doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(40);
      doc.text(mySeat.seat_label, pageW / 2, 20 + qrSize + 18, { align: "center" });

      // Details
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
      if (plan.paper_subject) drawDetail("Paper:", plan.paper_subject);
      if (plan.exam_date) drawDetail("Date:", new Date(plan.exam_date).toLocaleDateString());

      // Footer
      doc.setDrawColor(120); doc.setLineWidth(0.3);
      doc.line(3, pageH - 8, pageW - 3, pageH - 8);
      doc.setFontSize(5); doc.setTextColor(140); doc.setFont("helvetica", "bold");
      doc.text("GHS BABI KHEL · EXAM SEATING", pageW / 2, pageH - 5, { align: "center" });

      doc.save(`SeatingSlip-${mySeat.seat_label.replace(/[^\w-]/g, "_")}.pdf`);
      toast.success("Seating slip downloaded");
    } catch (e: any) {
      toast.error("Failed: " + (e?.message ?? ""));
    }
    setDownloading(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
          <LayoutGrid className="w-6 h-6 text-primary" /> Exam Seating
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Look up any student's seat across all seating plans — your own seat is highlighted at the top.
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

              {/* Published — show your seat + searchable list of everyone */}
              {selectedPlan.status === "published" && (
                <>
                  {/* Your seat card (if you have one) */}
                  {mySeat && (
                    <Card className="overflow-hidden border-primary/30">
                      <CardContent className="p-4 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="w-14 h-14 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                            <Grid3x3 className="w-7 h-7" />
                          </div>
                          <div className="flex-1 min-w-[160px]">
                            <p className="text-xs opacity-80 mb-0.5">Your Seat · {selectedPlan.title}</p>
                            <h3 className="text-2xl font-bold font-mono">{mySeat.seat_label}</h3>
                            <p className="text-xs opacity-90 mt-1">
                              {mySeat.room_name}
                              {mySeat.invigilator ? ` · Invigilator: ${mySeat.invigilator}` : ""}
                              {selectedPlan.paper_subject ? ` · ${selectedPlan.paper_subject}` : ""}
                              {selectedPlan.exam_date ? ` · ${new Date(selectedPlan.exam_date).toLocaleDateString()}` : ""}
                            </p>
                          </div>
                          <Button
                            onClick={() => downloadSlip(selectedPlan)}
                            disabled={downloading === selectedPlan.id}
                            variant="secondary"
                            className="bg-white text-primary hover:bg-white/90"
                          >
                            {downloading === selectedPlan.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Download Slip
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Plan summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <SummaryStat icon={<Building2 className="w-4 h-4" />} label="Rooms" value={selectedPlan.rooms.length} />
                    <SummaryStat icon={<User className="w-4 h-4" />} label="Students" value={selectedPlan.total_seated} />
                    <SummaryStat icon={<Grid3x3 className="w-4 h-4" />} label="Classes" value={selectedPlan.classes.length} />
                    <SummaryStat
                      icon={<MapPin className="w-4 h-4" />}
                      label="Capacity"
                      value={selectedPlan.rooms.reduce((s, r) => s + r.capacity, 0)}
                    />
                  </div>

                  {/* Search */}
                  <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search name, roll no, room, seat..."
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-input bg-background text-sm focus:ring-2 focus:ring-ring outline-none"
                    />
                  </div>

                  {/* All seats list */}
                  <div className="space-y-2">
                    {filtered.slice(0, 100).map(s => {
                      const isMe = mySeat && s.student_id === mySeat.student_id && s.room_id === mySeat.room_id;
                      const cc = colorFor(s.class);
                      return (
                        <div
                          key={s.id}
                          className={`bg-card rounded-xl px-4 py-3 shadow-card flex items-center gap-3 ${
                            isMe ? "ring-2 ring-primary" : ""
                          }`}
                        >
                          <span className="font-mono font-bold text-primary w-24 shrink-0 text-sm">{s.exam_roll_no}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground truncate flex items-center gap-1.5">
                              {s.student_name}
                              {isMe && <Badge variant="secondary" className="text-[10px]">You</Badge>}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Class {s.class} · Roll {s.class_roll_no} · {s.room_name} · <span className="font-mono">{s.seat_label}</span>
                            </p>
                          </div>
                          <Badge variant="secondary" className={`shrink-0 ${cc.bg} ${cc.text}`}>Class {s.class}</Badge>
                        </div>
                      );
                    })}
                    {filtered.length > 100 && (
                      <p className="text-center text-sm text-muted-foreground pt-2">
                        Showing 100 of {filtered.length} — use search to narrow down
                      </p>
                    )}
                    {filtered.length === 0 && search && (
                      <div className="text-center py-8 text-muted-foreground">No seats match "{search}"</div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

const SummaryStat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-xl font-bold mt-1">{value}</p>
    </CardContent>
  </Card>
);

export default SeatingTab;
