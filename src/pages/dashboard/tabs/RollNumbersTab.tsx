import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Hash, Search, Download, Loader2, Timer, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import jsPDF from "jspdf";

interface ExamSession {
  id: string; title: string; exam_year: number; exam_term: string;
  classes: string[]; class_order: string[]; is_published: boolean;
  publish_at: string | null; countdown_label: string | null;
}
interface RollEntry {
  id: string; student_name: string; father_name: string | null;
  class: string; class_roll_no: string; exam_roll_no: string; serial_number: number;
}

// Live countdown timer — auto-publishes when it hits zero
function CountdownTimer({ targetDate, label, sessionId }: { targetDate: string; label: string; sessionId: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [expired, setExpired] = useState(false);
  const qc = useQueryClient(); // ← must be INSIDE the component

  useEffect(() => {
    const calc = async () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        if (!expired) {
          setExpired(true);
          setTimeLeft("");
          // Auto-publish when countdown finishes
          await supabase
            .from("exam_roll_sessions")
            .update({ is_published: true })
            .eq("id", sessionId)
            .eq("is_published", false);
          qc.invalidateQueries({ queryKey: ["dash-exam-sessions"] });
          qc.invalidateQueries({ queryKey: ["dash-exam-rolls"] });
        }
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setTimeLeft(`${d} days ${h}h ${m}m ${s}s`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m ${s}s`);
      else setTimeLeft(`${m}m ${s}s`);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [targetDate, sessionId, expired, qc]);

  if (expired) return null;

  return (
    <div className="bg-gradient-to-br from-blue-50 to-orange-50 dark:from-blue-950/20 dark:to-orange-900/20 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-6 text-center">
      <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
        <Timer className="w-7 h-7 text-blue-500" />
      </div>
      <p className="text-sm font-medium text-blue-800 dark:text-blue-400 mb-2">{label || "Exam Roll Numbers will be published in"}</p>
      <p className="text-3xl font-bold font-mono text-blue-900 dark:text-blue-300 tracking-wider">{timeLeft}</p>
      <p className="text-xs text-blue-700 dark:text-blue-500 mt-3">Please check back when the countdown ends</p>
    </div>
  );
}

const RollNumbersTab = () => {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: sessions = [], isLoading: loadingSessions } = useQuery<ExamSession[]>({
    queryKey: ["dash-exam-sessions"],
    queryFn: async () => {
      // Show all sessions that are either published OR have a countdown set
      const { data, error } = await supabase
        .from("exam_roll_sessions")
        .select("id, title, exam_year, exam_term, classes, class_order, is_published, publish_at, countdown_label")
        .or("is_published.eq.true,publish_at.not.is.null")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 1000, // refresh every 30s so countdown can show when published
    refetchInterval: 30 * 1000,
  });

  const selectedSession = sessions.find(s => s.id === selectedSessionId) || sessions[0] || null;
  const isLocked = selectedSession && !selectedSession.is_published;

  const { data: rollNumbers = [], isLoading: loadingRolls } = useQuery<RollEntry[]>({
    queryKey: ["dash-exam-rolls", selectedSession?.id],
    queryFn: async () => {
      if (!selectedSession || !selectedSession.is_published) return [];
      const { data, error } = await supabase
        .from("exam_roll_numbers")
        .select("id, student_name, father_name, class, class_roll_no, exam_roll_no, serial_number")
        .eq("session_id", selectedSession.id)
        .order("serial_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedSession?.is_published,
    staleTime: 5 * 60 * 1000,
  });

  const myRollNumber = profile?.roll_number;
  const myClass = profile?.class;
  const myRecord = myRollNumber ? rollNumbers.find(r => r.class_roll_no === myRollNumber && r.class === myClass) : null;

  const filtered = search
    ? rollNumbers.filter(r =>
        r.student_name.toLowerCase().includes(search.toLowerCase()) ||
        r.exam_roll_no.includes(search) ||
        r.class_roll_no.includes(search) ||
        r.class.includes(search)
      )
    : rollNumbers;

  const downloadSlip = (r: RollEntry) => {
    if (!selectedSession) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    doc.setFillColor(240, 249, 255);
    doc.rect(0, 0, pageW, pageH, "F");
    doc.setDrawColor(14, 165, 233);
    doc.setLineWidth(1.2);
    doc.roundedRect(6, 6, pageW - 12, pageH - 12, 4, 4, "S");

    doc.setFillColor(14, 165, 233);
    doc.roundedRect(6, 6, pageW - 12, 28, 4, 4, "F");
    doc.setFillColor(14, 165, 233);
    doc.rect(6, 22, pageW - 12, 12, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Government High School Babi Khel", pageW / 2, 18, { align: "center" });
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text("Examination Admit Card", pageW / 2, 26, { align: "center" });

    doc.setFillColor(3, 105, 161);
    doc.roundedRect(pageW / 2 - 30, 40, 60, 22, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.text("EXAM ROLL NUMBER", pageW / 2, 47, { align: "center" });
    doc.setFontSize(20); doc.setFont("helvetica", "bold");
    doc.text(r.exam_roll_no, pageW / 2, 58, { align: "center" });

    doc.setDrawColor(224, 242, 254); doc.setLineWidth(0.5);
    doc.line(14, 70, pageW - 14, 70);

    const rows: [string, string][] = [
      ["Student Name", r.student_name],
      ["Father Name", r.father_name || "—"],
      ["Class", `Class ${r.class}`],
      ["Class Roll No", r.class_roll_no],
      ["Examination", `${selectedSession.exam_term} ${selectedSession.exam_year}`],
    ];

    let y = 78;
    rows.forEach(([label, value]) => {
      doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(107, 114, 128);
      doc.text(label, 16, y);
      doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
      doc.text(value, pageW - 16, y, { align: "right" });
      doc.setDrawColor(240, 249, 255); doc.setLineWidth(0.3);
      doc.line(14, y + 3, pageW - 14, y + 3);
      y += 12;
    });

    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(156, 163, 175);
    doc.text("Government High School Babi Khel", pageW / 2, pageH - 12, { align: "center" });
    doc.text("Keep this card safe. Bring it to the examination hall.", pageW / 2, pageH - 7, { align: "center" });

    doc.save(`AdmitCard-${r.exam_roll_no}-${r.student_name.replace(/\s+/g, "_")}.pdf`);
    toast.success("Admit card PDF downloaded!");
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
          <Hash className="w-6 h-6 text-primary" /> Exam Roll Numbers
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">Find your exam roll number and download your admit card</p>
      </div>

      {loadingSessions ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : sessions.length === 0 ? (
        <div className="bg-card rounded-xl p-10 text-center shadow-card">
          <Hash className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-semibold text-foreground">No Roll Numbers Yet</p>
          <p className="text-sm text-muted-foreground mt-1">Check back when exam roll numbers are published</p>
        </div>
      ) : (
        <>
          {/* Session tabs */}
          <div className="flex flex-wrap gap-2">
            {sessions.map(s => (
              <button key={s.id} onClick={() => setSelectedSessionId(s.id)}
                className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all border flex items-center gap-1.5 ${
                  selectedSession?.id === s.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-primary/50"
                }`}>
                {!s.is_published && <Lock className="w-3 h-3" />}
                {s.exam_term} {s.exam_year}
              </button>
            ))}
          </div>

          {/* Countdown shown when not yet published but has publish_at */}
          {selectedSession && !selectedSession.is_published && selectedSession.publish_at && (
            <CountdownTimer
              targetDate={selectedSession.publish_at}
              label={selectedSession.countdown_label || "Exam Roll Numbers will be published in"}
              sessionId={selectedSession.id}
            />
          )}

          {/* Locked state — no countdown set */}
          {selectedSession && !selectedSession.is_published && !selectedSession.publish_at && (
            <div className="bg-card rounded-2xl p-8 text-center border border-border">
              <Lock className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-semibold text-foreground">Not Yet Published</p>
              <p className="text-sm text-muted-foreground mt-1">Roll numbers for this session are not yet available</p>
            </div>
          )}

          {/* Published — show roll numbers */}
          {selectedSession?.is_published && (
            <>
              {/* My Roll Number Card */}
              {myRecord && (
                <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-6 text-primary-foreground shadow-elevated">
                  <p className="text-sm opacity-80 mb-1">Your Exam Roll Number</p>
                  <h3 className="text-4xl font-bold tracking-widest mb-3">{myRecord.exam_roll_no}</h3>
                  <p className="text-sm opacity-90">{myRecord.student_name} · Class {myRecord.class} · {selectedSession.exam_term} {selectedSession.exam_year}</p>
                  <button onClick={() => downloadSlip(myRecord)}
                    className="mt-4 inline-flex items-center gap-2 bg-white text-primary font-semibold px-4 py-2 rounded-xl text-sm hover:bg-white/90 transition-colors">
                    <Download className="w-4 h-4" /> Download Admit Card
                  </button>
                </div>
              )}

              {/* Search */}
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, roll no, class..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-input bg-background text-sm focus:ring-2 focus:ring-ring outline-none" />
              </div>

              {/* List */}
              {loadingRolls ? (
                <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
              ) : (
                <div className="space-y-2">
                  {filtered.slice(0, 50).map(r => (
                    <div key={r.id} className="bg-card rounded-xl px-4 py-3 shadow-card flex items-center gap-3">
                      <span className="font-mono font-bold text-primary w-20 shrink-0 text-base">{r.exam_roll_no}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{r.student_name}</p>
                        <p className="text-xs text-muted-foreground">Class {r.class} · Roll: {r.class_roll_no}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">Class {r.class}</Badge>
                      <button onClick={() => downloadSlip(r)}
                        className="inline-flex items-center gap-1 text-xs text-primary font-semibold px-2.5 py-1.5 rounded-lg hover:bg-primary/10 transition-colors shrink-0">
                        <Download className="w-3 h-3" /> Card
                      </button>
                    </div>
                  ))}
                  {filtered.length > 50 && (
                    <p className="text-center text-sm text-muted-foreground pt-2">Showing 50 of {filtered.length} — use search to find specific student</p>
                  )}
                  {filtered.length === 0 && search && (
                    <div className="text-center py-8 text-muted-foreground">No students found for "{search}"</div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default RollNumbersTab;
