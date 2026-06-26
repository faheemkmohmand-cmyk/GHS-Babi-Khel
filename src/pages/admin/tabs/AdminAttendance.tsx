import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  CalendarIcon, Check, X, Clock, Palmtree, Loader2, Download,
  ChevronLeft, ChevronRight, Search, RotateCcw, CheckCheck,
  Users, TrendingUp, AlertTriangle, FileText, Printer, ArrowUpDown, BarChart3,
  Sunrise,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend,
  addDays, subDays, isToday, isFuture, isSameDay,
} from "date-fns";
import toast from "react-hot-toast";
import { triggerConfetti } from "@/lib/confetti";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { computeAttendancePercentage } from "@/hooks/useAttendanceAnalytics";
import AttendanceAnalytics from "./AttendanceAnalytics";

type Status = "present" | "absent" | "late" | "leave" | "halfday";

interface Student {
  id: string;
  full_name: string;
  roll_number: string;
  photo_url: string | null;
}
interface AttendanceRecord {
  id?: string;
  student_id: string;
  date: string;
  status: Status;
}

const STATUS_ORDER: Status[] = ["present", "absent", "late", "leave", "halfday"];

const statusConfig: Record<Status, {
  icon: React.ReactNode;
  label: string;
  short: string;
  badge: string;
  ring: string;
  soft: string;
  text: string;
}> = {
  present: {
    icon: <Check className="w-3.5 h-3.5" />, label: "Present", short: "P",
    badge: "bg-[hsl(var(--success))] text-white hover:bg-[hsl(var(--success))]",
    ring:  "ring-2 ring-[hsl(var(--success))] bg-[hsl(var(--success))] text-white",
    soft:  "bg-muted text-muted-foreground hover:bg-[hsl(var(--success))]/15",
    text:  "text-[hsl(var(--success))]",
  },
  absent: {
    icon: <X className="w-3.5 h-3.5" />, label: "Absent", short: "A",
    badge: "bg-destructive text-destructive-foreground hover:bg-destructive",
    ring:  "ring-2 ring-destructive bg-destructive text-destructive-foreground",
    soft:  "bg-muted text-muted-foreground hover:bg-destructive/15",
    text:  "text-destructive",
  },
  late: {
    icon: <Clock className="w-3.5 h-3.5" />, label: "Late", short: "L",
    badge: "bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]",
    ring:  "ring-2 ring-[hsl(var(--warning))] bg-[hsl(var(--warning))] text-white",
    soft:  "bg-muted text-muted-foreground hover:bg-[hsl(var(--warning))]/15",
    text:  "text-[hsl(var(--warning))]",
  },
  leave: {
    icon: <Palmtree className="w-3.5 h-3.5" />, label: "Leave", short: "V",
    badge: "bg-primary/80 text-primary-foreground hover:bg-primary/80",
    ring:  "ring-2 ring-primary bg-primary text-primary-foreground",
    soft:  "bg-muted text-muted-foreground hover:bg-primary/15",
    text:  "text-primary",
  },
  halfday: {
    icon: <Sunrise className="w-3.5 h-3.5" />, label: "Half-Day", short: "HD",
    badge: "bg-purple-500 text-white hover:bg-purple-600",
    ring:  "ring-2 ring-purple-500 bg-purple-500 text-white",
    soft:  "bg-muted text-muted-foreground hover:bg-purple-500/15",
    text:  "text-purple-500",
  },
};

const classes = ["6", "7", "8", "9", "10"];
const FILTERS = ["all", "present", "absent", "late", "leave", "halfday"] as const;
type FilterKey = (typeof FILTERS)[number];

const AdminAttendance = () => {
  const qc = useQueryClient();
  const [cls, setCls] = useState("6");
  const [date, setDate] = useState(new Date());
  const [tab, setTab] = useState<"mark" | "report" | "analytics">("mark");
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [initialStatuses, setInitialStatuses] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  // Report
  const [reportMonth, setReportMonth] = useState(new Date());
  const [thresholdOnly, setThresholdOnly] = useState(false);
  const [sortKey, setSortKey] = useState<"roll" | "name" | "pct">("roll");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const dateStr = format(date, "yyyy-MM-dd");

  /* ───────────────────── data ───────────────────── */
  const { data: students = [], isLoading: loadingStudents } = useQuery<Student[]>({
    queryKey: ["attendance-students", cls],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, roll_number, photo_url")
        .eq("class", cls)
        .eq("is_active", true)
        .order("roll_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: existingAttendance = [], isLoading: loadingAttendance } =
    useQuery<AttendanceRecord[]>({
      queryKey: ["attendance-day", cls, dateStr],
      queryFn: async () => {
        const studentIds = students.map((s) => s.id);
        if (!studentIds.length) return [];
        const { data, error } = await supabase
          .from("attendance")
          .select("*")
          .eq("date", dateStr)
          .in("student_id", studentIds);
        if (error) throw error;
        return (data ?? []) as AttendanceRecord[];
      },
      enabled: students.length > 0,
    });

  useEffect(() => {
    const map: Record<string, Status> = {};
    students.forEach((s) => { map[s.id] = "present"; });
    existingAttendance.forEach((a) => { map[a.student_id] = a.status; });
    setStatuses(map);
    setInitialStatuses(map);
  }, [students, existingAttendance]);

  const alreadySaved = existingAttendance.length > 0 || Object.keys(initialStatuses).length > 0;
  const isDirty = useMemo(() => {
    const a = Object.keys(statuses);
    const b = Object.keys(initialStatuses);
    if (a.length !== b.length) return true;
    return a.some((k) => statuses[k] !== initialStatuses[k]);
  }, [statuses, initialStatuses]);

  /* ───────────────────── handlers ───────────────────── */
  const setStatus = (id: string, s: Status) =>
    setStatuses((prev) => ({ ...prev, [id]: s }));

  const markAll = (s: Status) =>
    setStatuses(() => {
      const map: Record<string, Status> = {};
      students.forEach((st) => { map[st.id] = s; });
      return map;
    });

  const resetToSaved = () => setStatuses(initialStatuses);

  const handleSave = async () => {
    if (!students.length) {
      toast.error("No students to save attendance for");
      return;
    }
    setSaving(true);

    const studentIds = students.map((s) => s.id);
    const rows = students.map((s) => ({
      student_id: s.id,
      class: cls,
      date: dateStr,
      status: statuses[s.id] || "present",
    }));

    // Step 1: Delete all existing attendance records for these students on this date.
    // We filter by student_id + date (NOT class) so it works even if the class
    // column doesn't exist yet in the DB.
    const { error: delErr } = await supabase
      .from("attendance")
      .delete()
      .eq("date", dateStr)
      .in("student_id", studentIds);

    if (delErr) {
      console.error("[Attendance] delete failed:", delErr.message);
      toast.error(`Save failed: ${delErr.message}`, { duration: 6000 });
      setSaving(false);
      return;
    }

    // Step 2: Insert fresh rows. Sending without `class` first in case column
    // doesn't exist, then retrying with it if that also works. We include it
    // because the migration adds it — once run, this will populate the column.
    const { error: insErr } = await supabase
      .from("attendance")
      .insert(rows);

    if (insErr) {
      // If insert failed because of the `class` column not existing, retry without it
      const rowsNoClass = students.map((s) => ({
        student_id: s.id,
        date: dateStr,
        status: statuses[s.id] || "present",
      }));
      const { error: insErr2 } = await supabase
        .from("attendance")
        .insert(rowsNoClass);

      if (insErr2) {
        console.error("[Attendance] insert failed:", insErr2.message);
        toast.error(`Save failed: ${insErr2.message}`, { duration: 6000 });
        setSaving(false);
        return;
      }
    }

    // Update initialStatuses so isDirty resets and "Saved" badge appears
    setInitialStatuses({ ...statuses });

    toast.success("Attendance saved ✓");
    qc.invalidateQueries({ queryKey: ["attendance-day", cls, dateStr] });
    qc.invalidateQueries({ queryKey: ["attendance-month", cls] });
    qc.invalidateQueries({ queryKey: ["attendance-monthly-trend", cls] });
    qc.invalidateQueries({ queryKey: ["attendance-class-comparison"] });
    qc.invalidateQueries({ queryKey: ["attendance-day-of-week", cls] });
    qc.invalidateQueries({ queryKey: ["attendance-heatmap", cls] });
    qc.invalidateQueries({ queryKey: ["attendance-metrics", cls] });
    qc.invalidateQueries({ queryKey: ["attendance-warnings", cls] });

    const values = Object.values(statuses);
    if (values.length && values.every((s) => s === "present")) {
      triggerConfetti("sides");
      toast.success("🌟 Perfect Attendance Today!");
    }
    setSaving(false);
  };

  const goPrevDay = () => setDate((d) => subDays(d, 1));
  const goNextDay = () =>
    setDate((d) => (isFuture(addDays(d, 1)) ? d : addDays(d, 1)));
  const goToday = () => setDate(new Date());

  /* ───────────────────── live counters ───────────────────── */
  const counts = useMemo(() => {
    const c: Record<Status, number> = { present: 0, absent: 0, late: 0, leave: 0, halfday: 0 };
    Object.values(statuses).forEach((s) => { c[s] += 1; });
    return c;
  }, [statuses]);

  const total = students.length;
  // halfday counts as 0.5 in attendance percentage
  const presentPct = total ? Math.round(((counts.present + counts.late + counts.halfday * 0.5) / total) * 100) : 0;

  /* ───────────────────── filter + search ───────────────────── */
  const visibleStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (q && !s.full_name.toLowerCase().includes(q) && !s.roll_number.toLowerCase().includes(q))
        return false;
      if (filter !== "all" && statuses[s.id] !== filter) return false;
      return true;
    });
  }, [students, search, filter, statuses]);

  /* ───────────────────── monthly report ───────────────────── */
  const monthStart = startOfMonth(reportMonth);
  const monthEnd = endOfMonth(reportMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
    .filter((d) => !isWeekend(d));

  const { data: monthlyData = [], isLoading: loadingMonth } = useQuery<AttendanceRecord[]>({
    queryKey: ["attendance-month", cls, format(reportMonth, "yyyy-MM")],
    queryFn: async () => {
      const studentIds = students.map((s) => s.id);
      if (!studentIds.length) return [];
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .in("student_id", studentIds)
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return (data ?? []) as AttendanceRecord[];
    },
    enabled: (tab === "report") && students.length > 0,
  });

  const reportData = useMemo(() => {
    const rows = students.map((s) => {
      const records = monthlyData.filter((r) => r.student_id === s.id);
      const present = records.filter((r) => r.status === "present").length;
      const absent  = records.filter((r) => r.status === "absent").length;
      const late    = records.filter((r) => r.status === "late").length;
      const leave   = records.filter((r) => r.status === "leave").length;
      const halfday = records.filter((r) => r.status === "halfday").length;
      const totalDays   = monthDays.length;
      // halfday = 0.5 in percentage calc
      const effectivePresent = present + late + halfday * 0.5;
      const pct     = totalDays > 0 ? Math.round((effectivePresent / totalDays) * 100) : 0;
      return { ...s, present, absent, late, leave, halfday, total: totalDays, pct };
    });
    const filtered = thresholdOnly ? rows.filter((r) => r.pct < 75) : rows;
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "roll") cmp = a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true });
      else if (sortKey === "name") cmp = a.full_name.localeCompare(b.full_name);
      else cmp = a.pct - b.pct;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [students, monthlyData, monthDays, thresholdOnly, sortKey, sortDir]);

  const reportSummary = useMemo(() => {
    if (!reportData.length) return { avg: 0, low: 0, perfect: 0, halfdayTotal: 0 };
    const avg = Math.round(reportData.reduce((sum, r) => sum + r.pct, 0) / reportData.length);
    const low = reportData.filter((r) => r.pct < 75).length;
    const perfect = reportData.filter((r) => r.pct === 100).length;
    const halfdayTotal = reportData.reduce((sum, r) => sum + r.halfday, 0);
    return { avg, low, perfect, halfdayTotal };
  }, [reportData]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "pct" ? "desc" : "asc"); }
  };

  /* ───────────────────── exports ───────────────────── */
  const exportExcel = () => {
    const month = format(reportMonth, "MMMM");
    const year = reportMonth.getFullYear();
    const wsData = [
      [`Attendance Report — Class ${cls} — ${month} ${year}`],
      [`Average Attendance: ${reportSummary.avg}%   |   Below 75%: ${reportSummary.low}   |   Perfect (100%): ${reportSummary.perfect}   |   Half-Days: ${reportSummary.halfdayTotal}`],
      [],
      ["Roll No", "Student Name", "Present", "Absent", "Late", "Leave", "Half-Day", "Working Days", "Attendance %"],
      ...reportData.map((r) => [r.roll_number, r.full_name, r.present, r.absent, r.late, r.leave, r.halfday, r.total, `${r.pct}%`]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
    ];
    ws["!cols"] = [{ wch: 10 }, { wch: 26 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${month} ${year}`);
    XLSX.writeFile(wb, `Attendance-Class${cls}-${month}-${year}.xlsx`);
    toast.success("Excel downloaded");
  };

  const exportPDF = () => {
    const month = format(reportMonth, "MMMM");
    const year = reportMonth.getFullYear();
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Attendance Report — Class ${cls} — ${month} ${year}`, 14, 16);
    doc.setFontSize(10);
    doc.text(
      `Average: ${reportSummary.avg}%    Below 75%: ${reportSummary.low}    Perfect: ${reportSummary.perfect}    Half-Days: ${reportSummary.halfdayTotal}    Working days: ${monthDays.length}`,
      14, 23,
    );
    autoTable(doc, {
      startY: 28,
      head: [["Roll", "Name", "P", "A", "L", "V", "HD", "Days", "%"]],
      body: reportData.map((r) => [r.roll_number, r.full_name, r.present, r.absent, r.late, r.leave, r.halfday, r.total, `${r.pct}%`]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 64, 175] },
    });
    doc.save(`Attendance-Class${cls}-${month}-${year}.pdf`);
    toast.success("PDF downloaded");
  };

  const printReport = () => window.print();

  /* ───────────────────── keyboard shortcuts ───────────────────── */
  useEffect(() => {
    if (tab !== "mark") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") goPrevDay();
      if (e.key === "ArrowRight") goNextDay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);

  const handleTabChange = useCallback((v: string) => setTab(v as "mark" | "report" | "analytics"), []);

  /* ───────────────────── render ───────────────────── */
  return (
    <div className="space-y-4 pb-28 md:pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-heading font-bold text-foreground">Attendance</h2>
        {alreadySaved && tab === "mark" && (
          <Badge variant="secondary" className="gap-1">
            <Check className="w-3 h-3" /> Saved for {format(date, "dd MMM")}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={cls} onValueChange={setCls}>
          <SelectTrigger className="w-28 sm:w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {classes.map((c) => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Tabs value={tab} onValueChange={handleTabChange} className="flex-1 min-w-[18rem]">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="mark" className="flex-1 sm:flex-none gap-1.5">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 shrink-0">
                <Check className="w-3 h-3 text-emerald-500" />
              </span>
              <span className="hidden xs:inline">Mark</span>
            </TabsTrigger>
            <TabsTrigger value="report" className="flex-1 sm:flex-none gap-1.5">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-100 dark:bg-blue-900/40 shrink-0">
                <BarChart3 className="w-3 h-3 text-blue-500" />
              </span>
              <span className="hidden xs:inline">Report</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex-1 sm:flex-none gap-1.5">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-purple-100 dark:bg-purple-900/40 shrink-0">
                <TrendingUp className="w-3 h-3 text-purple-500" />
              </span>
              <span className="hidden xs:inline">Analytics</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ============ MARK TAB ============ */}
      {tab === "mark" && (
        <div className="space-y-4">
          {/* Date nav */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-md border border-border bg-card">
              <Button variant="ghost" size="icon" onClick={goPrevDay} className="h-9 w-9">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" className="gap-2 h-9 px-3 font-medium">
                    <CalendarIcon className="w-4 h-4" />
                    <span className="hidden xs:inline">{format(date, "EEE, dd MMM yyyy")}</span>
                    <span className="xs:hidden">{format(date, "dd MMM")}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    disabled={(d) => isFuture(d)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="icon"
                onClick={goNextDay}
                disabled={isFuture(addDays(date, 1))}
                className="h-9 w-9"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            {!isToday(date) && (
              <Button variant="outline" size="sm" onClick={goToday} className="h-9">Today</Button>
            )}
            <Badge variant="secondary" className="gap-1">
              <Users className="w-3 h-3" /> {students.length}
            </Badge>
          </div>

          {/* Live counters — now includes Half-Day */}
          {total > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {STATUS_ORDER.map((s) => {
                const cfg = statusConfig[s];
                const n = counts[s];
                const pct = total ? Math.round((n / total) * 100) : 0;
                return (
                  <button
                    key={s}
                    onClick={() => setFilter(filter === s ? "all" : s)}
                    className={`rounded-lg border border-border bg-card p-2.5 sm:p-3 text-left transition-all ${
                      filter === s ? "ring-2 ring-primary" : "hover:border-primary/40"
                    }`}
                  >
                    <div className={`text-[10px] sm:text-[11px] font-medium uppercase tracking-wide ${cfg.text}`}>
                      {cfg.label}
                    </div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-lg sm:text-xl font-bold">{n}</span>
                      <span className="text-xs text-muted-foreground">/ {total}</span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${cfg.badge.split(" ")[0]}`} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 sm:p-3 col-span-3 sm:col-span-1">
                <div className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wide text-primary">
                  Attendance
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-lg sm:text-xl font-bold">{presentPct}%</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${presentPct}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Toolbar: search + quick actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[10rem]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or roll…"
                className="pl-8 h-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAll("present")}
              className="gap-1.5 h-9"
            >
              <CheckCheck className="w-4 h-4" /> All Present
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={resetToSaved}
              disabled={!isDirty}
              className="gap-1.5 h-9"
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </Button>
          </div>

          {/* Filter chips */}
          {filter !== "all" && (
            <div className="text-xs text-muted-foreground">
              Filtering by <span className="font-medium text-foreground capitalize">{filter === "halfday" ? "Half-Day" : filter}</span>.{" "}
              <button onClick={() => setFilter("all")} className="text-primary underline underline-offset-2">
                Clear
              </button>
            </div>
          )}

          {/* Student grid — now 5 buttons per student */}
          {loadingStudents || loadingAttendance ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          ) : visibleStudents.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
              {students.length === 0 ? "No students in this class yet." : "No students match your filters."}
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleStudents.map((s) => {
                const status = statuses[s.id] || "present";
                const cfg = statusConfig[status];
                const changed = initialStatuses[s.id] && initialStatuses[s.id] !== status;
                return (
                  <Card
                    key={s.id}
                    className={`border-border transition-all ${changed ? "ring-1 ring-primary/40" : ""}`}
                  >
                    <CardContent className="p-3 space-y-2.5">
                      <div className="flex items-center gap-3">
                        {s.photo_url ? (
                          <img
                            src={s.photo_url}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                            {s.full_name.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{s.full_name}</p>
                          <p className="text-xs text-muted-foreground">Roll {s.roll_number}</p>
                        </div>
                        <Badge className={`${cfg.badge} gap-1 shrink-0 text-[10px] px-1.5 py-0.5`}>
                          {cfg.icon}
                        </Badge>
                      </div>
                      {/* 5 status buttons: P, A, L, V, HD */}
                      <div className="grid grid-cols-5 gap-1.5">
                        {STATUS_ORDER.map((opt) => {
                          const o = statusConfig[opt];
                          const active = status === opt;
                          return (
                            <button
                              key={opt}
                              onClick={() => setStatus(s.id, opt)}
                              aria-label={o.label}
                              aria-pressed={active}
                              className={`h-9 rounded-md flex items-center justify-center gap-0.5 text-[10px] sm:text-xs font-semibold transition-all ${
                                active ? o.ring : o.soft
                              }`}
                            >
                              {o.icon}
                              <span className="hidden sm:inline">{o.short}</span>
                            </button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Sticky save bar */}
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur p-3 md:static md:bg-transparent md:border-0 md:p-0 md:pt-2">
            <div className="flex items-center justify-between gap-2 max-w-screen-xl mx-auto">
              <div className="text-xs text-muted-foreground hidden sm:block">
                {isDirty ? (
                  <span className="text-[hsl(var(--warning))] font-medium">Unsaved changes</span>
                ) : alreadySaved ? (
                  <span>All changes saved</span>
                ) : (
                  <span>Tap a student's P / A / L / V / HD</span>
                )}
              </div>
              <Button
                onClick={handleSave}
                disabled={saving || !students.length}
                className="gap-1.5 w-full md:w-auto"
                size="lg"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {alreadySaved ? "Update" : "Save"} Attendance
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============ REPORT TAB ============ */}
      {tab === "report" && (
        <div className="space-y-4 print:space-y-2">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="flex items-center rounded-md border border-border bg-card">
              <Button
                variant="ghost" size="icon" className="h-9 w-9"
                onClick={() => setReportMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Input
                type="month"
                value={format(reportMonth, "yyyy-MM")}
                onChange={(e) => e.target.value && setReportMonth(new Date(e.target.value + "-01"))}
                className="w-36 border-0 h-9 focus-visible:ring-0"
              />
              <Button
                variant="ghost" size="icon" className="h-9 w-9"
                onClick={() => setReportMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                disabled={isSameDay(startOfMonth(reportMonth), startOfMonth(new Date())) || isFuture(new Date(reportMonth.getFullYear(), reportMonth.getMonth() + 1, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <Button
              variant={thresholdOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setThresholdOnly((v) => !v)}
              className="gap-1.5 h-9"
            >
              <AlertTriangle className="w-4 h-4" /> Below 75%
            </Button>

            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5 h-9">
                <Download className="w-4 h-4" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={exportPDF} className="gap-1.5 h-9">
                <FileText className="w-4 h-4" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={printReport} className="gap-1.5 h-9">
                <Printer className="w-4 h-4" /> Print
              </Button>
            </div>
          </div>

          {/* Summary cards — now includes Half-Day count */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <SummaryStat
              icon={<TrendingUp className="w-4 h-4" />}
              label="Average"
              value={`${reportSummary.avg}%`}
              tone="primary"
            />
            <SummaryStat
              icon={<Check className="w-4 h-4" />}
              label="Perfect (100%)"
              value={reportSummary.perfect}
              tone="success"
            />
            <SummaryStat
              icon={<AlertTriangle className="w-4 h-4" />}
              label="Below 75%"
              value={reportSummary.low}
              tone="destructive"
            />
            <SummaryStat
              icon={<Sunrise className="w-4 h-4" />}
              label="Half-Days"
              value={reportSummary.halfdayTotal}
              tone="purple"
            />
            <SummaryStat
              icon={<CalendarIcon className="w-4 h-4" />}
              label="Working Days"
              value={monthDays.length}
              tone="muted"
            />
          </div>

          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => toggleSort("roll")} className="cursor-pointer select-none">
                    <span className="inline-flex items-center gap-1">Roll <ArrowUpDown className="w-3 h-3" /></span>
                  </TableHead>
                  <TableHead onClick={() => toggleSort("name")} className="cursor-pointer select-none">
                    <span className="inline-flex items-center gap-1">Name <ArrowUpDown className="w-3 h-3" /></span>
                  </TableHead>
                  <TableHead className="text-center">P</TableHead>
                  <TableHead className="text-center">A</TableHead>
                  <TableHead className="text-center">L</TableHead>
                  <TableHead className="text-center">V</TableHead>
                  <TableHead className="text-center text-purple-600">HD</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">Days</TableHead>
                  <TableHead onClick={() => toggleSort("pct")} className="cursor-pointer select-none text-center">
                    <span className="inline-flex items-center gap-1">% <ArrowUpDown className="w-3 h-3" /></span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingMonth && reportData.length === 0 ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={9}><Skeleton className="h-6 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : reportData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">
                      No data for this month.
                    </TableCell>
                  </TableRow>
                ) : (
                  reportData.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.roll_number}</TableCell>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell className="text-center text-[hsl(var(--success))] font-semibold">{r.present}</TableCell>
                      <TableCell className="text-center text-destructive font-semibold">{r.absent}</TableCell>
                      <TableCell className="text-center text-[hsl(var(--warning))] font-semibold">{r.late}</TableCell>
                      <TableCell className="text-center text-primary font-semibold">{r.leave}</TableCell>
                      <TableCell className="text-center text-purple-500 font-semibold">{r.halfday}</TableCell>
                      <TableCell className="text-center hidden sm:table-cell">{r.total}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={
                            r.pct >= 90 ? "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]"
                            : r.pct >= 75 ? "bg-primary hover:bg-primary"
                            : r.pct >= 50 ? "bg-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))] text-white"
                            : "bg-destructive hover:bg-destructive"
                          }
                        >
                          {r.pct}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </div>
      )}

      {/* ============ ANALYTICS TAB ============ */}
      {tab === "analytics" && (
        <AttendanceAnalytics />
      )}
    </div>
  );
};

/* ─────────────── tiny summary card ─────────────── */
const toneMap: Record<string, string> = {
  primary:     "border-primary/30 bg-primary/5 text-primary",
  success:     "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  muted:       "border-border bg-muted text-muted-foreground",
  purple:      "border-purple-300 bg-purple-50 text-purple-600 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-400",
};
const SummaryStat = ({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: keyof typeof toneMap }) => (
  <div className={`rounded-lg border p-3 ${toneMap[tone]}`}>
    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide opacity-80">
      {icon}{label}
    </div>
    <div className="mt-1 text-2xl font-bold text-foreground">{value}</div>
  </div>
);

export default AdminAttendance;
