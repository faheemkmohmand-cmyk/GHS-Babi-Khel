/**
 * TeacherExamScanTab.tsx
 * Teacher dashboard tab — scan QR codes during exams to mark attendance.
 * Mobile-first design: big scan button, live scanned list, manual fallback.
 * Uses BarcodeDetector API (Chrome/Edge) for real QR scanning from camera.
 * Falls back to manual roll number entry if camera is unavailable.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ScanLine, Camera, Check, X, Palmtree, Search, Loader2,
  Keyboard, Users, AlertCircle, CheckCircle2, History, FileText,
} from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Html5Qrcode } from "html5-qrcode";
import {
  useExamSessions, useExamRollNumbers, useExamAttendance,
  useInitExamAttendance, useScanExamAttendance, useUpdateExamAttendance,
  EXAM_SUBJECTS,
  decodeExamQRData, ExamAttStatus, ExamAttendanceRecord,
} from "@/hooks/useExamAttendance";
import { useAuth } from "@/hooks/useAuth";

type Status = ExamAttStatus;
const statusConfig: Record<Status, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  present: { icon: <Check className="w-4 h-4" />, label: "Present", color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  absent:  { icon: <X className="w-4 h-4" />, label: "Absent",  color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30" },
  leave:   { icon: <Palmtree className="w-4 h-4" />, label: "Leave",  color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" },
};

// ── Camera QR Scanner using html5-qrcode ───────────────────────────────────
function QRScanner({ onScan, enabled }: { onScan: (data: string) => void; enabled: boolean }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerIdRef = useRef(`tqr-reader-${Math.random().toString(36).slice(2)}`);

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

const TeacherExamScanTab = () => {
  const { profile } = useAuth();
  const teacherId = profile?.id || null;

  // Selections
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // Manual entry
  const [manualRoll, setManualRoll] = useState<string>("");
  const [showScanner, setShowScanner] = useState(false);

  // Scan history
  const [scanLog, setScanLog] = useState<{ name: string; roll: string; time: string; status: string }[]>([]);

  // Data
  const { data: sessions = [], isLoading: loadingSessions } = useExamSessions();
  const availableClasses = useMemo(() => {
    const s = sessions.find(s => s.id === selectedSession);
    return s?.classes ?? [];
  }, [sessions, selectedSession]);

  const { data: rollNumbers = [] } = useExamRollNumbers(selectedSession, selectedClass);
  const { data: attendance = [], isLoading: loadingAtt } = useExamAttendance(selectedSession, selectedClass, selectedSubject, selectedDate);

  const initAttendance = useInitExamAttendance();
  const scanAttendance = useScanExamAttendance();
  const updateAttendance = useUpdateExamAttendance();

  const isInitialized = attendance.length > 0;

  const attMap = useMemo(() => {
    const map = new Map<string, { id: string; status: Status }>();
    attendance.forEach(r => { if (r.id) map.set(r.student_id, { id: r.id, status: r.status }); });
    return map;
  }, [attendance]);

  const stats = useMemo(() => {
    const present = attendance.filter(r => r.status === "present").length;
    const absent = attendance.filter(r => r.status === "absent").length;
    const leave = attendance.filter(r => r.status === "leave").length;
    return { present, absent, leave, total: attendance.length };
  }, [attendance]);

  const rollMap = useMemo(() => {
    const map = new Map<string, typeof rollNumbers[0]>();
    rollNumbers.forEach(r => map.set(r.exam_roll_no, r));
    return map;
  }, [rollNumbers]);

  // Handlers
  const handleInitSheet = () => {
    if (rollNumbers.length === 0) { toast.error("No students found"); return; }
    initAttendance.mutate({
      sessionId: selectedSession, cls: selectedClass,
      subject: selectedSubject, examDate: selectedDate,
      students: rollNumbers.map(r => ({
        student_id: r.student_id, student_name: r.student_name,
        class_roll_no: r.class_roll_no, exam_roll_no: r.exam_roll_no,
      })),
    });
  };

  const handleQRScan = (qrData: string) => {
    const parsed = decodeExamQRData(qrData);
    if (!parsed) { toast.error("Invalid QR code — not an exam roll number"); return; }
    if (parsed.sessionId !== selectedSession) { toast.error("This QR code belongs to a different exam session"); return; }
    const student = rollNumbers.find(r => r.student_id === parsed.studentId);
    if (!student) { toast.error("Student not found in this class"); return; }
    doScan(parsed.studentId, student.student_name, parsed.examRollNo);
  };

  const handleManualRoll = () => {
    const roll = manualRoll.trim();
    if (!roll) return;
    const student = rollMap.get(roll);
    if (!student) { toast.error(`Roll number ${roll} not found in Class ${selectedClass}`); return; }
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
      sessionId: selectedSession, studentId, subject: selectedSubject,
      examDate: selectedDate, cls: selectedClass, scannedBy: teacherId,
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

  const handleManualStatus = (studentId: string, recordId: string, newStatus: Status) => {
    updateAttendance.mutate({
      id: recordId, status: newStatus,
      sessionId: selectedSession, cls: selectedClass,
      subject: selectedSubject, examDate: selectedDate,
    });
  };

  // ── Export Attendance PDF ──
  const exportAttendancePDF = () => {
    if (!attendance.length) { toast.error("No data to export"); return; }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();

    // Header — clean white with double-line accent
    doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.8); doc.line(0, 36, w, 36);
    doc.setLineWidth(0.3); doc.line(0, 37.5, w, 37.5);
    doc.setTextColor(40, 40, 40); doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text("Government High School Babi Khel", w / 2, 14, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100); doc.text("District Mohmand, KPK", w / 2, 21, { align: "center" });
    doc.setTextColor(60, 60, 60); doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text("EXAM ATTENDANCE REPORT", w / 2, 30, { align: "center" });

    // Info box
    doc.setFillColor(250, 250, 250); doc.roundedRect(12, 42, w - 24, 18, 2, 2, "F");
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3); doc.roundedRect(12, 42, w - 24, 18, 2, 2, "S");
    const infoItems = [{ label: "CLASS", value: `Class ${selectedClass}` }, { label: "SUBJECT", value: selectedSubject }, { label: "DATE", value: selectedDate }, { label: "PRESENT", value: String(stats.present) }, { label: "ABSENT", value: String(stats.absent) }];
    const infoW = (w - 24) / infoItems.length;
    infoItems.forEach((item, i) => {
      const cx = 12 + i * infoW + infoW / 2;
      doc.setTextColor(120, 120, 120); doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.text(item.label, cx, 48, { align: "center" });
      doc.setTextColor(40, 40, 40); doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text(item.value, cx, 55, { align: "center" });
    });

    const tableBody = attendance.map((r, idx) => {
      const statusStr = r.status === "present" ? "Present" : r.status === "absent" ? "Absent" : "Leave";
      return [String(idx + 1), r.class_roll_no, r.exam_roll_no, r.student_name, statusStr, r.scanned_at ? new Date(r.scanned_at).toLocaleTimeString() : "Manual"];
    });
    autoTable(doc, {
      startY: 66, head: [["#", "Class Roll", "Exam Roll", "Student Name", "Status", "Time"]], body: tableBody,
      headStyles: { fillColor: [245, 245, 245], textColor: [60, 60, 60], fontStyle: "bold", fontSize: 8, halign: "center", cellPadding: 3.5, lineWidth: 0.3, lineColor: [200, 200, 200] },
      bodyStyles: { fontSize: 9, cellPadding: 3, valign: "middle", textColor: [40, 40, 40] },
      columnStyles: { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: 22, halign: "center" }, 2: { cellWidth: 26, halign: "center", fontStyle: "bold" }, 3: { cellWidth: 60, halign: "left", overflow: "ellipsize" }, 4: { cellWidth: 22, halign: "center", fontStyle: "bold" }, 5: { cellWidth: 26, halign: "center" } },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      didParseCell: (data: any) => { if (data.section === "body" && data.column.index === 4) { const val = data.cell.raw; if (val === "Present") { data.cell.styles.textColor = [40, 40, 40]; data.cell.styles.fontStyle = "bold"; } else if (val === "Absent") { data.cell.styles.textColor = [80, 80, 80]; data.cell.styles.fontStyle = "normal"; } else if (val === "Leave") { data.cell.styles.textColor = [120, 120, 120]; data.cell.styles.fontStyle = "italic"; } } },
      margin: { left: 12, right: 12, bottom: 28 },
    });

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      // Footer — clean white with double-line accent
      doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.3); doc.line(0, h - 19.5, w, h - 19.5);
      doc.setLineWidth(0.8); doc.line(0, h - 18, w, h - 18);
      doc.setTextColor(100, 100, 100); doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.text("GHS BABI KHEL — EXAM ATTENDANCE REPORT", w / 2, h - 11, { align: "center" });
      doc.setTextColor(160, 160, 160); doc.setFontSize(5.5); doc.text(`Page ${p}/${totalPages}`, w - 18, h - 11, { align: "right" });
      // Signatures
      const sigY = h - 38;
      doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
      doc.line(20, sigY, 65, sigY); doc.setTextColor(140, 140, 140); doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.text("Class Teacher Signature", 42.5, sigY + 4, { align: "center" });
      doc.line(w - 65, sigY, w - 20, sigY); doc.text("Principal Signature", w - 42.5, sigY + 4, { align: "center" });
    }
    doc.save(`ExamAttendance-Class${selectedClass}-${selectedSubject}-${selectedDate}.pdf`);
    toast.success("Attendance PDF exported!");
  };

  const mergedList = useMemo(() => {
    return rollNumbers.map(r => ({
      ...r,
      att: attMap.get(r.student_id) || null,
      status: attMap.get(r.student_id)?.status || ("absent" as Status),
    }));
  }, [rollNumbers, attMap]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-primary" /> Exam Attendance Scanner
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Scan QR codes or enter roll numbers to mark attendance</p>
        </div>
        {isInitialized && (
          <Button variant="outline" size="sm" onClick={exportAttendancePDF} className="gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Export PDF
          </Button>
        )}
      </div>

      {/* Selectors */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Exam Session</label>
              {loadingSessions ? <Skeleton className="h-10 rounded-lg" /> : (
                <select value={selectedSession} onChange={e => { setSelectedSession(e.target.value); setSelectedClass(""); setSelectedSubject(""); }}
                  className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Select Session</option>
                  {sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Class</label>
              <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedSubject(""); }} disabled={!selectedSession}
                className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50">
                <option value="">Select Class</option>
                {availableClasses.map(c => <option key={c} value={c}>Class {c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Subject / Paper</label>
              <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} disabled={!selectedClass}
                className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50">
                <option value="">Select Subject</option>
                {EXAM_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Exam Date</label>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedSession && selectedClass && selectedSubject && selectedDate && (
        <>
          {!isInitialized ? (
            <Card className="border-dashed border-2">
              <CardContent className="py-10 text-center space-y-3">
                <Users className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <p className="font-heading font-semibold">Start Attendance for This Paper</p>
                <p className="text-xs text-muted-foreground">{rollNumbers.length} students in Class {selectedClass}</p>
                <Button onClick={handleInitSheet} disabled={initAttendance.isPending || rollNumbers.length === 0} className="gap-2">
                  {initAttendance.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
                  Initialize & Start Scanning
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: Check, label: "Present", value: stats.present, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
                  { icon: X, label: "Absent", value: stats.absent, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/20" },
                  { icon: Palmtree, label: "Leave", value: stats.leave, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
                ].map(s => (
                  <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center border border-border/50`}>
                    <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
                    <p className="font-bold text-lg text-foreground">{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Scan toggle button */}
              <Button onClick={() => setShowScanner(!showScanner)}
                className={`w-full gap-2 ${showScanner ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"} text-white`} size="lg">
                {showScanner ? <><X className="w-5 h-5" /> Close Scanner</> : <><Camera className="w-5 h-5" /> Open QR Scanner</>}
              </Button>

              {/* Scanner area */}
              {showScanner && (
                <Card className="border-emerald-200 dark:border-emerald-800/50">
                  <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ScanLine className="w-4 h-4 text-emerald-500" /> Scan or Enter Roll Number</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {/* Camera scanner */}
                    <QRScanner onScan={handleQRScan} enabled={!!selectedSession && !!selectedSubject} />
                    {/* Manual entry */}
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Keyboard className="w-3 h-3" />Manual Roll Number</label>
                      <div className="flex gap-2">
                        <input className="flex-1 px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono"
                          placeholder="e.g. 100001" value={manualRoll} onChange={e => setManualRoll(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleManualRoll(); }} />
                        <Button onClick={handleManualRoll} disabled={!manualRoll.trim()}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 shrink-0"><Check className="w-4 h-4" /> Present</Button>
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

              {/* Student list */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Student List — Class {selectedClass}</p>
                {loadingAtt ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
                ) : (
                  mergedList.map(s => {
                    const att = s.att;
                    const status = s.status;
                    const cfg = statusConfig[status];
                    return (
                      <div key={s.student_id} className={`rounded-xl border p-3 ${cfg.bg} border-border/50`}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">{s.serial_number}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">{s.student_name}</p>
                            <p className="text-xs text-muted-foreground">Roll: {s.exam_roll_no} · Class Roll: {s.class_roll_no}</p>
                          </div>
                          <Badge className={`${cfg.bg} ${cfg.color} gap-1 shrink-0`}>{cfg.icon}{cfg.label}</Badge>
                        </div>
                        {att && (
                          <div className="flex gap-1.5 mt-2">
                            {(["present", "absent", "leave"] as Status[]).map(st => {
                              const c = statusConfig[st];
                              return (
                                <button key={st} onClick={() => handleManualStatus(s.student_id, att.id, st)}
                                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                    status === st ? `${c.bg} ${c.color} border-current` : "bg-secondary/50 text-muted-foreground border-transparent"
                                  }`}>{c.label}</button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </>
      )}

      {(!selectedSession || !selectedClass || !selectedSubject || !selectedDate) && (
        <Card className="border-dashed border-2"><CardContent className="py-14 text-center">
          <ScanLine className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="font-heading font-semibold">Select Exam Details</p>
          <p className="text-xs text-muted-foreground mt-1">Choose session, class, subject, and date to start scanning</p>
        </CardContent></Card>
      )}
    </div>
  );
};

export default TeacherExamScanTab;
