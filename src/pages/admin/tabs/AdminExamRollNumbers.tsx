import { useState, useCallback, useEffect } from "react";
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
import { Hash, Plus, Trash2, Eye, EyeOff, Loader2, ChevronUp, ChevronDown, Download, RefreshCw, ArrowLeft, Timer, Clock } from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { triggerConfetti } from "@/lib/confetti";

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

// ── Main Component ────────────────────────────────────────────────────────────
const AdminExamRollNumbers = () => {
  const qc = useQueryClient();
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
      toast.success(`✅ Generated ${rows.length} exam roll numbers!`);
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
    toast.success(session.is_published ? "Unpublished" : "Published! 🎉");
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
    toast.success("✅ Countdown set! Students will see it immediately.");
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

  const downloadPrint = () => {
    if (!selectedSession || rollNumbers.length === 0) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW  = 210; // A4 width mm
    const pageH  = 297; // A4 height mm
    const margin = 10;  // page margin mm

    // Slip layout: 2 columns × 4 rows = 8 slips per page
    const cols      = 2;
    const rows      = 4;
    const slipW     = (pageW - margin * 2 - 4) / cols;   // 4 mm gap between cols
    const slipH     = (pageH - margin * 2 - rows * 3) / rows; // ~3 mm gap between rows
    const gapX      = 4;
    const gapY      = 3;

    const drawSlip = (slip: ExamRollEntry, x: number, y: number) => {
      const w = slipW;
      const h = slipH;

      // Outer border — thin grey
      doc.setDrawColor(160, 160, 160);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, w, h, 2, 2, "S");

      // Top accent line — dark navy (not colorful)
      doc.setFillColor(30, 42, 83); // Royal Slate navy primary
      doc.rect(x, y, w, 5, "F");

      // School name in accent bar
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.text("GHS BABI KHEL", x + w / 2, y + 3.5, { align: "center" });

      // "ADMIT CARD" label
      doc.setTextColor(4, 44, 83);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.text("ADMIT CARD", x + w / 2, y + 9, { align: "center" });

      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(x + 3, y + 10.5, x + w - 3, y + 10.5);

      // Exam Roll Number — prominent
      doc.setTextColor(4, 44, 83);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(slip.exam_roll_no, x + w / 2, y + 19, { align: "center" });

      // "Roll Number" label under the number
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text("EXAM ROLL NUMBER", x + w / 2, y + 22.5, { align: "center" });

      // Divider
      doc.line(x + 3, y + 24, x + w - 3, y + 24);

      // Student name
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      // Truncate long names to fit
      const nameStr = slip.student_name.length > 28 ? slip.student_name.slice(0, 26) + "…" : slip.student_name;
      doc.text(nameStr, x + 3, y + 28.5);

      // Father name
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      const fatherStr = (slip.father_name || "—").length > 30 ? (slip.father_name || "—").slice(0, 28) + "…" : (slip.father_name || "—");
      doc.text(`S/O: ${fatherStr}`, x + 3, y + 32.5);

      // Class and class roll side by side
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(4, 44, 83);
      doc.text(`Class: ${slip.class}`, x + 3, y + 36.5);
      doc.text(`Class Roll: ${slip.class_roll_no}`, x + w / 2, y + 36.5);

      // Bottom info: session and year
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      const sessionStr = `${selectedSession!.exam_term} ${selectedSession!.exam_year}`;
      doc.text(sessionStr, x + w / 2, y + h - 2.5, { align: "center" });

      // Dashed cut line at bottom edge
      doc.setLineDashPattern([1, 1], 0);
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.15);
      doc.line(x, y + h, x + w, y + h);
      doc.setLineDashPattern([], 0); // reset dash
    };

    // Sort all roll numbers by class order then serial
    const ordered: ExamRollEntry[] = [];
    for (const cls of selectedSession.class_order) {
      const group = rollNumbers.filter(r => r.class === cls).sort((a, b) => a.serial_number - b.serial_number);
      ordered.push(...group);
    }

    let slipIdx = 0;
    for (const slip of ordered) {
      const posOnPage = slipIdx % (cols * rows);
      if (posOnPage === 0 && slipIdx > 0) {
        doc.addPage();
      }
      const col = posOnPage % cols;
      const row = Math.floor(posOnPage / cols);
      const x = margin + col * (slipW + gapX);
      const y = margin + row * (slipH + gapY);
      drawSlip(slip, x, y);
      slipIdx++;
    }

    doc.save(`AdmitCards-${selectedSession.title}-${selectedSession.exam_year}.pdf`);
    toast.success(`${ordered.length} admit cards downloaded — ${Math.ceil(ordered.length / (cols * rows))} pages`);
  };

  const filteredRolls = detailSearch
    ? rollNumbers.filter(r => r.student_name.toLowerCase().includes(detailSearch.toLowerCase()) || r.exam_roll_no.includes(detailSearch) || r.class_roll_no.includes(detailSearch) || r.class.includes(detailSearch))
    : rollNumbers;

  // ── LIST VIEW ────────────────────────────────────────────────────────────────
  if (view === "list") return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Hash className="w-6 h-6 text-primary" /> Exam Roll Numbers
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Generate and manage exam roll numbers for all classes</p>
        </div>
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
                      <Badge className="bg-blue-100 text-blue-800 gap-1"><Timer className="w-3 h-3" /> Countdown Set</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Classes: {s.class_order.join(" → ")} · Starting No: {s.starting_number}
                  </p>
                  {s.publish_at && !s.is_published && (
                    <CountdownTimer targetDate={s.publish_at} label={s.countdown_label || "Publishes in"} />
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => { setSelectedSession(s); setView("detail"); }} className="gap-1.5">
                    <Eye className="w-3.5 h-3.5" /> View
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => togglePublish(s)} className="gap-1.5">
                    {s.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {s.is_published ? "Unpublish" : "Publish"}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete "{s.title}"?</AlertDialogTitle><AlertDialogDescription>This will permanently delete all roll numbers.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteSession.mutate(s.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // ── CREATE VIEW ──────────────────────────────────────────────────────────────
  if (view === "create") return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setView("list")} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
        <h2 className="text-2xl font-heading font-bold text-foreground">Generate Exam Roll Numbers</h2>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Session Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div><Label>Session Title *</Label><Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. First Semester Examination 2025" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Exam Year *</Label><Input type="number" value={formYear} onChange={e => setFormYear(Number(e.target.value))} /></div>
            <div><Label>Exam Term *</Label>
              <select value={formTerm} onChange={e => setFormTerm(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div><Label>Starting Roll Number (6 digits) *</Label>
            <Input type="number" value={startingNumber} onChange={e => setStartingNumber(Number(e.target.value))} min={100000} max={999999} />
            <p className="text-xs text-muted-foreground mt-1">Roll numbers will be {startingNumber}, {startingNumber + 1}, {startingNumber + 2}...</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Select Classes & Order</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {ALL_CLASSES.map(cls => (
              <button key={cls} onClick={() => toggleClass(cls)} className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border-2 ${selectedClasses.includes(cls) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-primary/50"}`}>
                Class {cls}
              </button>
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
  );

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────────
  if (view === "detail" && selectedSession) {
    const byClass: Record<string, ExamRollEntry[]> = {};
    for (const r of filteredRolls) { if (!byClass[r.class]) byClass[r.class] = []; byClass[r.class].push(r); }

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => { setView("list"); setDetailSearch(""); }} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-heading font-bold text-foreground truncate">{selectedSession.title}</h2>
            <p className="text-sm text-muted-foreground">{selectedSession.exam_term} {selectedSession.exam_year} · {rollNumbers.length} students</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={downloadCSV} className="gap-1.5"><Download className="w-3.5 h-3.5" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={downloadPrint} className="gap-1.5"><Download className="w-3.5 h-3.5" /> Print List</Button>
            <Button size="sm" onClick={() => togglePublish(selectedSession)}
              className={`gap-1.5 ${selectedSession.is_published ? "bg-blue-500 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"} text-white`}>
              {selectedSession.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {selectedSession.is_published ? "Unpublish" : "Publish Now"}
            </Button>
          </div>
        </div>

        {/* ── COUNTDOWN SETTER ── */}
        <Card className="border-blue-200 dark:border-blue-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="w-4 h-4 text-blue-500" />
              Countdown Timer for Students
            </CardTitle>
            <p className="text-xs text-muted-foreground">Students will see a live countdown before roll numbers are published</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedSession.publish_at && !selectedSession.is_published && (
              <CountdownTimer targetDate={selectedSession.publish_at} label={selectedSession.countdown_label || "Roll numbers publish in"} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Publish Date</Label>
                <Input type="date" value={countdownDate} onChange={e => setCountdownDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
              </div>
              <div>
                <Label className="text-xs">Publish Time</Label>
                <Input type="time" value={countdownTime} onChange={e => setCountdownTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Countdown Message for Students</Label>
              <Input value={countdownLabel} onChange={e => setCountdownLabel(e.target.value)} placeholder="Exam Roll Numbers will be published in" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => saveCountdown(selectedSession)} disabled={savingCountdown} className="gap-2 bg-blue-500 hover:bg-blue-700 text-white">
                {savingCountdown ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Timer className="w-3.5 h-3.5" />}
                Set Countdown
              </Button>
              {selectedSession.publish_at && (
                <Button variant="outline" size="sm" onClick={() => clearCountdown(selectedSession)} className="text-destructive">Remove Countdown</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Input placeholder="Search by name, exam roll no, class..." value={detailSearch} onChange={e => setDetailSearch(e.target.value)} className="max-w-sm" />

        {loadingRolls ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
        ) : (
          <div className="space-y-6">
            {selectedSession.class_order.map(cls => {
              const students = byClass[cls];
              if (!students?.length) return null;
              return (
                <Card key={cls}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">{cls}</span>
                      Class {cls} <Badge variant="secondary">{students.length} students</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>Exam Roll No</TableHead><TableHead>Student Name</TableHead><TableHead>Father Name</TableHead><TableHead>Class Roll No</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {students.map(r => (
                            <TableRow key={r.id}>
                              <TableCell className="text-muted-foreground text-sm">{r.serial_number}</TableCell>
                              <TableCell><span className="font-mono font-bold text-primary text-base">{r.exam_roll_no}</span></TableCell>
                              <TableCell className="font-medium">{r.student_name}</TableCell>
                              <TableCell className="text-muted-foreground">{r.father_name || "—"}</TableCell>
                              <TableCell className="text-muted-foreground">{r.class_roll_no}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default AdminExamRollNumbers;
