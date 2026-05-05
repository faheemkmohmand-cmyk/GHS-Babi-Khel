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
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      // Outer border
      doc.setDrawColor(4, 44, 83);
      doc.setLineWidth(1);
      doc.rect(4, 4, pageW - 8, pageH - 8, "S");

      // Header bar
      doc.setFillColor(4, 44, 83);
      doc.rect(4, 4, pageW - 8, 26, "F");
      doc.setFillColor(212, 175, 55);
      doc.rect(4, 30, pageW - 8, 1.5, "F");

      // School name centered
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Government High School Babi Khel", pageW / 2, 16, { align: "center" });
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("EXAMINATION ADMIT CARD", pageW / 2, 25, { align: "center" });

      // Roll number box + QR side by side
      const heroY = 37;
      const qrSize = 26;
      const qrX = pageW - qrSize - 10;

      // Roll box (left side)
      const rollBoxW = qrX - 14;
      doc.setFillColor(240, 247, 255);
      doc.roundedRect(10, heroY, rollBoxW, 22, 2, 2, "F");
      doc.setDrawColor(14, 165, 233);
      doc.setLineWidth(0.4);
      doc.roundedRect(10, heroY, rollBoxW, 22, 2, 2, "S");
      doc.setTextColor(14, 165, 233);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.text("EXAM ROLL NUMBER", 10 + rollBoxW / 2, heroY + 7, { align: "center" });
      doc.setTextColor(4, 44, 83);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text(r.exam_roll_no, 10 + rollBoxW / 2, heroY + 17, { align: "center" });

      // QR code (right side)
      const qrData = encodeExamQRData(selectedSession.id, r.student_id, r.exam_roll_no);
      const qrDataURL = await QRCode.toDataURL(qrData, { width: 400, margin: 1, errorCorrectionLevel: "M", color: { dark: "#042C53", light: "#FFFFFF" } });
      doc.setDrawColor(4, 44, 83);
      doc.setLineWidth(0.3);
      doc.roundedRect(qrX - 1, heroY - 1, qrSize + 2, qrSize + 2, 1.5, 1.5, "S");
      doc.addImage(qrDataURL, "PNG", qrX, heroY, qrSize, qrSize);
      doc.setFontSize(4.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text("Scan for Attendance", qrX + qrSize / 2, heroY + qrSize + 3.5, { align: "center" });

      // Student detail rows
      let detailY = heroY + 32;
      const leftX = 12;
      const drawDetail = (label: string, value: string, yy: number) => {
        const safeVal = value.length > 30 ? value.slice(0, 28) + "…" : value;
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(label, leftX, yy);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(17, 24, 39);
        doc.text(safeVal, leftX + 32, yy);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(leftX, yy + 2, pageW - 12, yy + 2);
        return yy + 9;
      };
      detailY = drawDetail("Student Name:", r.student_name, detailY);
      detailY = drawDetail("Father Name:", r.father_name || "—", detailY);
      detailY = drawDetail("Class:", `Class ${r.class}`, detailY);
      detailY = drawDetail("Class Roll No:", r.class_roll_no, detailY);
      drawDetail("Examination:", `${selectedSession.exam_term} ${selectedSession.exam_year}`, detailY);

      // Footer
      const footerY = pageH - 14;
      doc.setFillColor(4, 44, 83);
      doc.rect(4, footerY, pageW - 8, 10, "F");
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      doc.text("GHS BABI KHEL  |  DISTRICT MOHMAND  |  KPK", pageW / 2, footerY + 4.5, { align: "center" });
      doc.setTextColor(160, 180, 200);
      doc.setFontSize(4.5);
      doc.setFont("helvetica", "normal");
      doc.text("Bring this admit card to the examination hall. Keep it safe.", pageW / 2, footerY + 8.5, { align: "center" });

      doc.save(`AdmitCard-${r.exam_roll_no}-${r.student_name.replace(/\s+/g, "_")}.pdf`);
      toast.success("Admit card with QR downloaded!");
    } catch {
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
  
