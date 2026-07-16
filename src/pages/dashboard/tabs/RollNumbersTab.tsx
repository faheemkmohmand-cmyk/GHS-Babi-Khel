/**
 * RollNumbersTab.tsx
 * User/student dashboard tab — view and download exam roll numbers with QR codes.
 * Now downloads professional admit cards matching admin's PDF style.
 */
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Hash, Search, Eye, Loader2, Timer, Lock, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import QRCode from "qrcode";
import { encodeExamQRData } from "@/hooks/useExamAttendance";

interface ExamSession {
  id: string; title: string; exam_year: number; exam_term: string;
  classes: string[]; class_order: string[]; is_published: boolean;
  publish_at: string | null; countdown_label: string | null;
}
interface RollEntry {
  id: string; student_id?: string; student_name: string; father_name: string | null;
  class: string; class_roll_no: string; exam_roll_no: string; serial_number: number;
}

// Live countdown timer — auto-publishes when it hits zero
function CountdownTimer({ targetDate, label, sessionId }: { targetDate: string; label: string; sessionId: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [expired, setExpired] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const calc = async () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        if (!expired) {
          setExpired(true);
          setTimeLeft("");
          await supabase.from("exam_roll_sessions").update({ is_published: true }).eq("id", sessionId).eq("is_published", false);
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
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: sessions = [], isLoading: loadingSessions } = useQuery<ExamSession[]>({
    queryKey: ["dash-exam-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_roll_sessions")
        .select("id, title, exam_year, exam_term, classes, class_order, is_published, publish_at, countdown_label")
        .or("is_published.eq.true,publish_at.not.is.null")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 1000,
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
        .select("id, student_id, student_name, father_name, class, class_roll_no, exam_roll_no, serial_number")
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


  // ── On-screen Admit Card preview (view-only, no PDF/file download) ───────
  const [viewCard, setViewCard] = useState<{ entry: RollEntry; qrDataURL: string } | null>(null);

  const viewSlip = async (r: RollEntry) => {
    if (!selectedSession || !r.student_id) return;
    setDownloading(r.exam_roll_no);
    try {
      const qrData = encodeExamQRData(selectedSession.id, r.student_id, r.exam_roll_no);
      const qrDataURL = await QRCode.toDataURL(qrData, { width: 400, margin: 1, errorCorrectionLevel: "M", color: { dark: "#333333", light: "#FFFFFF" } });
      setViewCard({ entry: r, qrDataURL });
    } catch {
      toast.error("Failed to load admit card");
    }
    setDownloading(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
          <Hash className="w-6 h-6 text-primary" /> Exam Roll Numbers
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">Find your exam roll number and view your admit card with QR</p>
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

          {/* Countdown */}
          {selectedSession && !selectedSession.is_published && selectedSession.publish_at && (
            <CountdownTimer targetDate={selectedSession.publish_at} label={selectedSession.countdown_label || "Exam Roll Numbers will be published in"} sessionId={selectedSession.id} />
          )}

          {/* Locked state */}
          {selectedSession && !selectedSession.is_published && !selectedSession.publish_at && (
            <div className="bg-card rounded-2xl p-8 text-center border border-border">
              <Lock className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-semibold text-foreground">Not Yet Published</p>
              <p className="text-sm text-muted-foreground mt-1">Roll numbers for this session are not yet available</p>
            </div>
          )}

          {/* Published */}
          {selectedSession?.is_published && (
            <>
              {/* My Roll Number Card */}
              {myRecord && (
                <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-6 text-primary-foreground shadow-elevated">
                  <p className="text-sm opacity-80 mb-1">Your Exam Roll Number</p>
                  <h3 className="text-4xl font-bold tracking-widest mb-3">{myRecord.exam_roll_no}</h3>
                  <p className="text-sm opacity-90">{myRecord.student_name} · Class {myRecord.class} · {selectedSession.exam_term} {selectedSession.exam_year}</p>
                  <button onClick={() => viewSlip(myRecord)} disabled={downloading === myRecord.exam_roll_no}
                    className="mt-4 inline-flex items-center gap-2 bg-white text-primary font-semibold px-4 py-2 rounded-xl text-sm hover:bg-white/90 transition-colors disabled:opacity-50">
                    {downloading === myRecord.exam_roll_no ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} View Admit Card
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
                      <button onClick={() => viewSlip(r)} disabled={downloading === r.exam_roll_no}
                        className="inline-flex items-center gap-1 text-xs text-primary font-semibold px-2.5 py-1.5 rounded-lg hover:bg-primary/10 transition-colors shrink-0 disabled:opacity-50">
                        {downloading === r.exam_roll_no ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />} View
                      </button>
                    </div>
                  ))}
                  {filtered.length > 50 && <p className="text-center text-sm text-muted-foreground pt-2">Showing 50 of {filtered.length} — use search to find specific student</p>}
                  {filtered.length === 0 && search && <div className="text-center py-8 text-muted-foreground">No students found for "{search}"</div>}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* On-screen Admit Card preview — view only, no PDF file is generated */}
      {viewCard && selectedSession && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setViewCard(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewCard(null)} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-gray-700">
              <X className="w-4 h-4" />
            </button>

            <div className="p-5 text-center border-b border-gray-200">
              <h3 className="text-sm font-bold text-gray-800">Government High School Babi Khel</h3>
              <p className="text-xs font-semibold text-gray-500 mt-1 tracking-wide">EXAMINATION ADMIT CARD</p>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex-1">
                  <p className="text-[10px] text-gray-500 tracking-wide">EXAM ROLL NUMBER</p>
                  <p className="text-2xl font-bold text-gray-800 tracking-widest">{viewCard.entry.exam_roll_no}</p>
                </div>
                <div className="shrink-0 border border-gray-200 rounded-xl p-1.5">
                  <img src={viewCard.qrDataURL} alt="QR code" className="w-20 h-20" />
                  <p className="text-[8px] text-gray-500 text-center mt-1">Scan for Attendance</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {[
                  { label: "Student Name", value: viewCard.entry.student_name },
                  { label: "Father Name", value: viewCard.entry.father_name || "—" },
                  { label: "Class", value: `Class ${viewCard.entry.class}` },
                  { label: "Class Roll No", value: viewCard.entry.class_roll_no },
                  { label: "Examination", value: `${selectedSession.exam_term} ${selectedSession.exam_year}` },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                    <span className="text-gray-500 text-xs">{row.label}</span>
                    <span className="font-semibold text-gray-800 text-xs">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-50 px-5 py-3 text-center border-t border-gray-200">
              <p className="text-[10px] font-bold text-gray-600 tracking-wide">GHS BABI KHEL · DISTRICT MOHMAND · KPK</p>
              <p className="text-[9px] text-gray-400 mt-0.5">Bring this admit card to the examination hall.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RollNumbersTab;
