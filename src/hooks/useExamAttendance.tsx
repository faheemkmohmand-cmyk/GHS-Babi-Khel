/**
 * AdminExamAttendance.tsx
 * Admin tab — manage exam attendance per class, per paper.
 * View attendance records, manually mark absent/present/leave, initialize sheets, export.
 * Mobile-friendly: cards on mobile, table on desktop.
 */
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardCheck, Search, Download, Loader2, Check, X, Palmtree,
  CalendarDays, BookOpen, Users, FileSpreadsheet, Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  useExamSessions, useExamRollNumbers, useExamAttendance,
  useExamAttendanceOverview, useInitExamAttendance, useUpdateExamAttendance,
  useDeleteExamAttendance, EXAM_SUBJECTS, ALL_CLASSES,
  ExamAttendanceRecord, ExamAttStatus,
} from "@/hooks/useExamAttendance";

type Status = ExamAttStatus;
const statusConfig: Record<Status, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  present: { icon: <Check className="w-4 h-4" />, label: "Present", color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700/50" },
  absent:  { icon: <X className="w-4 h-4" />, label: "Absent",  color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700/50" },
  leave:   { icon: <Palmtree className="w-4 h-4" />, label: "Leave",  color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700/50" },
};

const AdminExamAttendance = () => {
  const qc = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [tab, setTab] = useState<"scan" | "overview">("scan");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Data
  const { data: sessions = [], isLoading: loadingSessions } = useExamSessions();
  const { data: rollNumbers = [], isLoading: loadingRolls } = useExamRollNumbers(selectedSession, selectedClass);
  const { data: attendance = [], isLoading: loadingAtt } = useExamAttendance(selectedSession, selectedClass, selectedSubject, selectedDate);
  const { data: overviewData = [], isLoading: loadingOverview } = useExamAttendanceOverview(tab === "overview" ? selectedSession : undefined, tab === "overview" ? selectedClass : undefined);

  const initAttendance = useInitExamAttendance();
  const updateAttendance = useUpdateExamAttendance();
  const deleteAttendance = useDeleteExamAttendance();

  // Available classes from selected session
  const availableClasses = useMemo(() => {
    const session = sessions.find(s => s.id === selectedSession);
    return session?.classes ?? [];
  }, [sessions, selectedSession]);

  // Check if attendance sheet is initialized
  const isInitialized = attendance.length > 0;

  // Build attendance map: student_id -> record
  const attMap = useMemo(() => {
    const map = new Map<string, ExamAttendanceRecord>();
    attendance.forEach(r => map.set(r.student_id, r));
    return map;
  }, [attendance]);

  // Merged list: roll numbers + attendance status
  const mergedList = useMemo(() => {
    return rollNumbers.map(r => ({
      ...r,
      attRecord: attMap.get(r.student_id) || null,
      status: attMap.get(r.student_id)?.status || ("absent" as Status),
    }));
  }, [rollNumbers, attMap]);

  const filtered = search
    ? mergedList.filter(s => s.student_name.toLowerCase().includes(search.toLowerCase()) || s.exam_roll_no.includes(search) || s.class_roll_no.includes(search))
    : mergedList;

  // Stats
  const stats = useMemo(() => {
    const present = attendance.filter(r => r.status === "present").length;
    const absent = attendance.filter(r => r.status === "absent").length;
    const leave = attendance.filter(r => r.status === "leave").length;
    return { present, absent, leave, total: attendance.length };
  }, [attendance]);

  // Overview: pivot — subjects as columns, students as rows
  const overviewPivot = useMemo(() => {
    if (!overviewData.length) return { students: [], subjects: [], grid: {} };
    const subjectSet = new Set(overviewData.map(r => r.subject));
    const subjects = Array.from(subjectSet).sort();
    const studentMap = new Map<string, { name: string; rollNo: string; examRoll: string }>();
    overviewData.forEach(r => {
      if (!studentMap.has(r.student_id)) {
        studentMap.set(r.student_id, { name: r.student_name, rollNo: r.class_roll_no, examRoll: r.exam_roll_no });
      }
    });
    const students = Array.from(studentMap.entries()).map(([id, info]) => ({ id, ...info }));
    const grid: Record<string, Record<string, Status>> = {};
    overviewData.forEach(r => {
      if (!grid[r.student_id]) grid[r.student_id] = {};
      grid[r.student_id][r.subject] = r.status;
    });
    return { students, subjects, grid };
  }, [overviewData]);

  // Handlers
  const handleInitSheet = async () => {
    if (!selectedSession || !selectedClass || !selectedSubject || !selectedDate) {
      toast.error("Select session, class, subject, and date first");
      return;
    }
    if (rollNumbers.length === 0) {
      toast.error("No students found for this class");
      return;
    }
    initAttendance.mutate({
      sessionId: selectedSession,
      cls: selectedClass,
      subject: selectedSubject,
      examDate: selectedDate,
      students: rollNumbers.map(r => ({
        student_id: r.student_id,
        student_name: r.student_name,
        class_roll_no: r.class_roll_no,
        exam_roll_no: r.exam_roll_no,
      })),
    });
  };

  const handleStatusChange = (record: ExamAttendanceRecord, newStatus: Status) => {
    updateAttendance.mutate({
      id: record.id!,
      status: newStatus,
      sessionId: selectedSession,
      cls: selectedClass,
      subject: selectedSubject,
      examDate: selectedDate,
    });
  };

  const handleDeleteSheet = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    deleteAttendance.mutate({
      sessionId: selectedSession,
      cls: selectedClass,
      subject: selectedSubject,
      examDate: selectedDate,
    }, {
      onSettled: () => setConfirmDelete(false),
    });
  };

  const exportExcel = () => {
    if (!attendance.length) { toast.error("No data to export"); return; }
    const header = ["Class Roll", "Exam Roll", "Student Name", "Subject", "Exam Date", "Status", "Scanned At"];
    const rows = attendance.map(r => [
      r.class_roll_no, r.exam_roll_no, r.student_name, r.subject, r.exam_date,
      r.status, r.scanned_at ? new Date(r.scanned_at).toLocaleString() : "Manual",
    ]);
    const wsData = [
      [`Exam Attendance — Class ${selectedClass} — ${selectedSubject} — ${selectedDate}`],
      [],
      header,
      ...rows,
      [],
      ["Summary"],
      ["Present", stats.present],
      ["Absent", stats.absent],
      ["Leave", stats.leave],
      ["Total", stats.total],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
    ws["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 25 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `ExamAttendance-Class${selectedClass}-${selectedSubject}-${selectedDate}.xlsx`);
    toast.success("Excel downloaded!");
  };

  const exportOverviewExcel = () => {
    if (!overviewPivot.students.length) { toast.error("No data"); return; }
    const header = ["Class Roll", "Exam Roll", "Student Name", ...overviewPivot.subjects, "Present Count", "Absent Count"];
    const rows = overviewPivot.students.map(s => {
      const subjectStatuses = overviewPivot.subjects.map(sub => {
        const st = overviewPivot.grid[s.id]?.[sub] || "—";
        return st === "present" ? "P" : st === "absent" ? "A" : st === "leave" ? "L" : "—";
      });
      const presentCount = subjectStatuses.filter(s => s === "P").length;
      const absentCount = subjectStatuses.filter(s => s === "A").length;
      return [s.rollNo, s.examRoll, s.name, ...subjectStatuses, presentCount, absentCount];
    });
    const wsData = [
      [`Exam Attendance Overview — Class ${selectedClass}`],
      [],
      header,
      ...rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Overview");
    XLSX.writeFile(wb, `ExamAttendance-Overview-Class${selectedClass}.xlsx`);
    toast.success("Overview Excel downloaded!");
  };

  return (
    <div className="space-y-5" style={{ contain: "layout style" }}>
      {/* Header */}
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary" /> Exam Attendance
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">Track exam attendance per class & paper via QR scan or manual entry</p>
      </div>

      {/* Session/Class/Subject/Date selectors */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Session */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Exam Session</label>
              {loadingSessions ? <Skeleton className="h-10 rounded-lg" /> : (
                <select value={selectedSession} onChange={e => { setSelectedSession(e.target.value); setSelectedClass(""); setSelectedSubject(""); }}
                  className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Select Session</option>
                  {sessions.map(s => <option key={s.id} value={s.id}>{s.title} ({s.exam_term} {s.exam_year})</option>)}
                </select>
              )}
            </div>
            {/* Class */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Class</label>
              <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedSubject(""); }}
                disabled={!selectedSession}
                className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50">
                <option value="">Select Class</option>
                {availableClasses.map(c => <option key={c} value={c}>Class {c}</option>)}
              </select>
            </div>
            {/* Subject */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Subject / Paper</label>
              <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
                disabled={!selectedClass}
                className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50">
                <option value="">Select Subject</option>
                {EXAM_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {/* Date */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Exam Date</label>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                disabled={!selectedSubject}
                className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50" />
            </div>
          </div>

          {/* Tab toggle */}
          <div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
            <button onClick={() => setTab("scan")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === "scan" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              <ClipboardCheck className="w-3.5 h-3.5 inline mr-1" />Paper Attendance
            </button>
            <button onClick={() => setTab("overview")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === "overview" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1" />Class Overview
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── SCAN / PAPER ATTENDANCE TAB ──────────────────────────────────── */}
      {tab === "scan" && selectedSession && selectedClass && selectedSubject && selectedDate && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Check, label: "Present", value: stats.present, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
              { icon: X, label: "Absent", value: stats.absent, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/20" },
              { icon: Palmtree, label: "Leave", value: stats.leave, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center border border-border/50`}>
                <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
                <p className="font-bold text-xl text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Initialize / Actions */}
          {!isInitialized ? (
            <Card className="border-dashed border-2">
              <CardContent className="py-10 text-center space-y-3">
                <CalendarDays className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <p className="font-heading font-semibold text-foreground">No Attendance Sheet Yet</p>
                <p className="text-xs text-muted-foreground">
                  Initialize to create attendance records for all {rollNumbers.length} students of Class {selectedClass}
                </p>
                <Button onClick={handleInitSheet} disabled={initAttendance.isPending || rollNumbers.length === 0} className="gap-2">
                  {initAttendance.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                  Initialize Attendance Sheet
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Action bar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input className="w-full pl-9 pr-4 py-2 rounded-xl bg-secondary/50 border border-border text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Search student..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5"><Download className="w-3.5 h-3.5" /> Excel</Button>
                <Button variant="outline" size="sm" onClick={handleDeleteSheet}
                  className={`gap-1.5 ${confirmDelete ? "bg-red-500 text-white hover:bg-red-600" : "text-destructive hover:bg-destructive/10"}`}>
                  <Trash2 className="w-3.5 h-3.5" /> {confirmDelete ? "Confirm Delete?" : "Delete Sheet"}
                </Button>
              </div>

              {/* Attendance list — mobile cards / desktop table */}
              {loadingAtt || loadingRolls ? (
                <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
              ) : filtered.length === 0 ? (
                <Card><CardContent className="py-10 text-center"><p className="text-muted-foreground">No students found</p></CardContent></Card>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-2">
                    {filtered.map(s => {
                      const att = s.attRecord;
                      const status = att?.status || "absent";
                      const cfg = statusConfig[status];
                      return (
                        <div key={s.student_id} className={`rounded-xl border p-3 ${cfg.bg}`}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                              {s.serial_number}
                            </div>
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
                                return (
                                  <button key={st} onClick={() => handleStatusChange(att, st)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                      status === st ? `${c.bg} ${c.color} border-current` : "bg-secondary/50 text-muted-foreground border-transparent hover:border-border"
                                    }`}>
                                    {c.label}
                                  </button>
                                );
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
                          {filtered.map(s => {
                            const att = s.attRecord;
                            const status = att?.status || "absent";
                            const cfg = statusConfig[status];
                            return (
                              <tr key={s.student_id} className="border-b border-border/50 hover:bg-secondary/20">
                                <td className="p-3 text-muted-foreground">{s.serial_number}</td>
                                <td className="p-3"><span className="font-mono font-bold text-primary">{s.exam_roll_no}</span></td>
                                <td className="p-3 font-medium">{s.student_name}</td>
                                <td className="p-3 text-muted-foreground">{s.class_roll_no}</td>
                                <td className="p-3 text-center">
                                  <Badge className={`${cfg.bg} ${cfg.color} gap-1`}>{cfg.icon}{cfg.label}</Badge>
                                </td>
                                <td className="p-3">
                                  {att && (
                                    <div className="flex justify-center gap-1">
                                      {(["present", "absent", "leave"] as Status[]).map(st => {
                                        const c = statusConfig[st];
                                        return (
                                          <button key={st} onClick={() => handleStatusChange(att, st)}
                                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                                              status === st ? `${c.bg} ${c.color} ring-1 ring-current` : "text-muted-foreground hover:text-foreground"
                                            }`}>
                                            {c.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>
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

      {/* Empty state when no selection */}
      {tab === "scan" && (!selectedSession || !selectedClass || !selectedSubject || !selectedDate) && (
        <Card className="border-dashed border-2">
          <CardContent className="py-14 text-center">
            <ClipboardCheck className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="font-heading font-semibold text-foreground">Select Exam Details Above</p>
            <p className="text-xs text-muted-foreground mt-1">Choose a session, class, subject, and date to manage attendance</p>
          </CardContent>
        </Card>
      )}

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
      {tab === "overview" && selectedSession && selectedClass && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={exportOverviewExcel} disabled={!overviewPivot.students.length} className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> Export Overview
            </Button>
            <Badge variant="secondary">{overviewPivot.students.length} students · {overviewPivot.subjects.length} papers</Badge>
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
            <Card><CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead><tr className="border-b border-border bg-secondary/30">
                  <th className="text-left p-2 text-xs font-semibold text-muted-foreground sticky left-0 bg-secondary/30 z-10">Student</th>
                  <th className="text-left p-2 text-xs font-semibold text-muted-foreground">Exam Roll</th>
                  {overviewPivot.subjects.map(sub => (
                    <th key={sub} className="text-center p-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">{sub}</th>
                  ))}
                  <th className="text-center p-2 text-xs font-semibold text-muted-foreground">Present</th>
                  <th className="text-center p-2 text-xs font-semibold text-muted-foreground">Absent</th>
                </tr></thead>
                <tbody>
                  {overviewPivot.students.map(s => {
                    const statuses = overviewPivot.grid[s.id] || {};
                    const presentCount = overviewPivot.subjects.filter(sub => statuses[sub] === "present").length;
                    const absentCount = overviewPivot.subjects.filter(sub => statuses[sub] === "absent").length;
                    return (
                      <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td className="p-2 font-medium sticky left-0 bg-card z-10">{s.name}</td>
                        <td className="p-2 font-mono text-primary font-bold">{s.examRoll}</td>
                        {overviewPivot.subjects.map(sub => {
                          const st = statuses[sub] || "—";
                          const cfg = st !== "—" ? statusConfig[st as Status] : null;
                          return (
                            <td key={sub} className="p-2 text-center">
                              {cfg ? (
                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>
                                  {st === "present" ? "P" : st === "absent" ? "A" : "L"}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-2 text-center font-bold text-emerald-600">{presentCount}</td>
                        <td className="p-2 text-center font-bold text-red-600">{absentCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent></Card>
          )}
        </>
      )}

      {tab === "overview" && (!selectedSession || !selectedClass) && (
        <Card className="border-dashed border-2"><CardContent className="py-14 text-center">
          <FileSpreadsheet className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="font-heading font-semibold">Select Session & Class</p>
          <p className="text-xs text-muted-foreground mt-1">Choose a session and class to see attendance overview for all papers</p>
        </CardContent></Card>
      )}
    </div>
  );
};

export default AdminExamAttendance;
