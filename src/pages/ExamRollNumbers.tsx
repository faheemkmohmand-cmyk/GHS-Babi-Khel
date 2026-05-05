import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Hash, Search, Download, ChevronDown, ChevronUp } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { encodeExamQRData } from "@/hooks/useExamAttendance";

interface ExamSession {
  id: string; title: string; exam_year: number; exam_term: string;
  classes: string[]; class_order: string[]; starting_number: number;
  is_published: boolean; created_at: string;
}
interface RollEntry {
  id: string; student_id: string; student_name: string; father_name: string | null;
  class: string; class_roll_no: string; exam_roll_no: string; serial_number: number;
}

const ExamRollNumbers = () => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedClass, setExpandedClass] = useState<string | null>(null);

  const { data: sessions = [], isLoading: loadingSessions } = useQuery<ExamSession[]>({
    queryKey: ["public-exam-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_roll_sessions")
        .select("*")
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const selectedSession = sessions.find(s => s.id === selectedSessionId) || sessions[0] || null;

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

  const filtered = search
    ? rollNumbers.filter(r =>
        r.student_name.toLowerCase().includes(search.toLowerCase()) ||
        r.exam_roll_no.includes(search) ||
        r.class_roll_no.includes(search) ||
        r.class.includes(search)
      )
    : rollNumbers;

  // Group by class
  const byClass: Record<string, RollEntry[]> = {};
  for (const r of filtered) {
    if (!byClass[r.class]) byClass[r.class] = [];
    byClass[r.class].push(r);
  }

  const downloadMySlip = async (r: RollEntry) => {
    if (!selectedSession) return;
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s;

      // Header (navy, 18mm)
      doc.setFillColor(4, 44, 83);
      doc.rect(0, 0, W, 18, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Government High School Babi Khel", W / 2, 8, { align: "center" });
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(8);
      doc.text("EXAMINATION ADMIT CARD", W / 2, 14, { align: "center" });

      // Gold separator
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.4);
      doc.line(0, 18.5, W, 18.5);

      // Roll number box
      const boxX = 10, boxY = 26, boxW = 55, boxH = 22;
      doc.setFillColor(235, 245, 251);
      doc.setDrawColor(176, 212, 241);
      doc.setLineWidth(0.4);
      doc.roundedRect(boxX, boxY, boxW, boxH, 2.5, 2.5, "FD");
      doc.setTextColor(14, 116, 165);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text("EXAM ROLL NUMBER", boxX + boxW / 2, boxY + 7, { align: "center" });
      doc.setTextColor(4, 44, 83);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(String(r.exam_roll_no), boxX + boxW / 2, boxY + 17.5, { align: "center" });

      // QR
      const qrPayload = encodeExamQRData(selectedSession.id, r.student_id, r.exam_roll_no);
      const qrUrl = await QRCode.toDataURL(qrPayload, { width: 400, margin: 1, errorCorrectionLevel: "M", color: { dark: "#042C53", light: "#FFFFFF" } });
      const qrSize = 28;
      const qrX = W - qrSize - 10;
      const qrY = 26;
      doc.addImage(qrUrl, "PNG", qrX, qrY, qrSize, qrSize);
      doc.setFontSize(6);
      doc.setTextColor(120, 120, 120);
      doc.setFont("helvetica", "normal");
      doc.text("Scan for Attendance", qrX + qrSize / 2, qrY + qrSize + 3.5, { align: "center" });

      // Detail rows
      const rows: [string, string][] = [
        ["Student Name", truncate(r.student_name, 38)],
        ["Father Name", truncate(r.father_name || "—", 38)],
        ["Class", `Class ${r.class}`],
        ["Class Roll No", r.class_roll_no],
        ["Examination", `${selectedSession.exam_term} ${selectedSession.exam_year}`],
      ];
      let y = 72;
      const leftX = 10;
      const rightX = W - 10;
      rows.forEach(([k, v]) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(110, 120, 135);
        doc.text(k, leftX, y);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(4, 44, 83);
        doc.text(v, rightX, y, { align: "right" });
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(leftX, y + 2.5, rightX, y + 2.5);
        y += 11;
      });

      // Footer (14mm)
      const footH = 14;
      const footY = H - footH;
      doc.setFillColor(4, 44, 83);
      doc.rect(0, footY, W, footH, "F");
      doc.setTextColor(212, 175, 55);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text("GHS BABI KHEL | DISTRICT MOHMAND | KPK", W / 2, footY + 5.5, { align: "center" });
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text("Bring this admit card to the examination hall. Keep it safe.", W / 2, footY + 10, { align: "center" });

      doc.save(`AdmitCard-${r.exam_roll_no}-${r.student_name}.pdf`);
      toast.success("Admit card with QR downloaded!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate admit card");
    }
  };

  return (
    <PageLayout>
      <PageBanner
        title="Exam Roll Numbers"
        subtitle="Find your exam roll number and download your admit card"
      />

      <section className="py-12">
        <div className="container mx-auto px-4">

          {/* Session selector */}
          {loadingSessions ? (
            <div className="flex gap-3 mb-8">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-36 rounded-xl" />)}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-20">
              <Hash className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="font-heading font-semibold text-foreground text-lg">No Published Results</h3>
              <p className="text-muted-foreground text-sm mt-1">Exam roll numbers will appear here once published by admin</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-8">
                {sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSessionId(s.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border-2 ${
                      (selectedSession?.id === s.id)
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {s.title} — {s.exam_year}
                  </button>
                ))}
              </div>

              {selectedSession && (
                <>
                  {/* Info bar */}
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center">
                    <Hash className="w-5 h-5 text-primary shrink-0" />
                    <div className="flex-1">
                      <span className="font-semibold text-foreground">{selectedSession.title}</span>
                      <span className="text-muted-foreground text-sm ml-3">
                        {selectedSession.exam_term} {selectedSession.exam_year} &nbsp;·&nbsp;
                        Classes: {selectedSession.class_order.join(", ")} &nbsp;·&nbsp;
                        {rollNumbers.length} students
                      </span>
                    </div>
                  </div>

                  {/* Search */}
                  <div className="relative mb-6 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search by name, roll number, class..."
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:ring-2 focus:ring-ring outline-none"
                    />
                  </div>

                  {/* Results */}
                  {loadingRolls ? (
                    <div className="space-y-3">
                      {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>No students found matching "{search}"</p>
                    </div>
                  ) : search ? (
                    // When searching — flat list with download button
                    <div className="space-y-2">
                      {filtered.map(r => (
                        <motion.div
                          key={r.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-card rounded-xl p-4 shadow-card flex items-center gap-4"
                        >
                          <div className="w-14 h-14 rounded-xl bg-primary/10 flex flex-col items-center justify-center shrink-0">
                            <span className="text-[10px] text-primary font-medium">EXAM</span>
                            <span className="text-primary font-bold text-sm leading-tight">{r.exam_roll_no}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-heading font-semibold text-foreground truncate">{r.student_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {r.father_name || ""} &nbsp;·&nbsp; Class {r.class} &nbsp;·&nbsp; Roll No: {r.class_roll_no}
                            </p>
                          </div>
                          <button
                            onClick={() => downloadMySlip(r)}
                            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    // Normal view — grouped by class, collapsible
                    <div className="space-y-4">
                      {selectedSession.class_order.map(cls => {
                        const students = byClass[cls];
                        if (!students || students.length === 0) return null;
                        const isExpanded = expandedClass === cls;
                        return (
                          <div key={cls} className="bg-card rounded-xl shadow-card overflow-hidden">
                            <button
                              onClick={() => setExpandedClass(isExpanded ? null : cls)}
                              className="w-full flex items-center gap-3 p-4 hover:bg-secondary/30 transition-colors"
                            >
                              <span className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                                {cls}
                              </span>
                              <span className="font-heading font-semibold text-foreground flex-1 text-left">
                                Class {cls}
                              </span>
                              <Badge variant="secondary">{students.length} students</Badge>
                              <span className="text-xs text-muted-foreground">
                                {students[0].exam_roll_no} — {students[students.length - 1].exam_roll_no}
                              </span>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            </button>

                            {isExpanded && (
                              <div className="border-t border-border">
                                <div className="divide-y divide-border">
                                  {students.map(r => (
                                    <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors">
                                      <span className="text-xs text-muted-foreground w-6 shrink-0">{r.serial_number}</span>
                                      <span className="font-mono font-bold text-primary w-20 shrink-0">{r.exam_roll_no}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm text-foreground truncate">{r.student_name}</p>
                                        <p className="text-xs text-muted-foreground">{r.father_name || ""}</p>
                                      </div>
                                      <span className="text-xs text-muted-foreground shrink-0">Roll: {r.class_roll_no}</span>
                                      <button
                                        onClick={() => downloadMySlip(r)}
                                        className="inline-flex items-center gap-1 text-xs text-primary font-semibold px-2 py-1.5 rounded-lg hover:bg-primary/10 transition-colors shrink-0"
                                      >
                                        <Download className="w-3 h-3" /> Card
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>
    </PageLayout>
  );
};

export default ExamRollNumbers;
