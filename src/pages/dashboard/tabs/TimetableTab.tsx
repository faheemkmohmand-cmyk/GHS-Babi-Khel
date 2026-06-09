import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Printer, Download, Share2, Bell, BellOff, Clock, MapPin, Video, ChevronRight, CalendarDays } from "lucide-react";
import { useTimetable, useTimetableSettings, requestNotificationPermission, scheduleClassReminder } from "@/hooks/useTimetable";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const classes = ["6", "7", "8", "9", "10"];
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const subjectColors: Record<string, string> = {
  Mathematics: "bg-primary/10 text-primary border-primary/20",
  English: "bg-[hsl(280,60%,50%)]/10 text-[hsl(280,60%,50%)] border-[hsl(280,60%,50%)]/20",
  Science: "bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/20",
  Urdu: "bg-warning/10 text-warning border-warning/20",
  Islamiat: "bg-[hsl(172,66%,40%)]/10 text-[hsl(172,66%,40%)] border-[hsl(172,66%,40%)]/20",
  "Pak Studies": "bg-[hsl(25,95%,53%)]/10 text-[hsl(25,95%,53%)] border-[hsl(25,95%,53%)]/20",
  "Social Studies": "bg-accent/10 text-accent-foreground border-accent/20",
  Computer: "bg-primary-dark/10 text-primary-dark border-primary-dark/20",
};

const getSubjectColor = (subject: string) => {
  for (const [key, val] of Object.entries(subjectColors)) {
    if (subject.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return "bg-secondary text-secondary-foreground border-border";
};

const getDayName = () => {
  const d = new Date().toLocaleDateString("en-US", { weekday: "long" });
  return days.includes(d) ? d : null;
};

// ─── PDF Export ──────────────────────────────────────────────────────────────

function exportPDF(
  selectedClass: string,
  entries: any[],
  periodNames: Record<string, string>,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const ML = 10, MR = 10;

  // Header
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.8);
  doc.line(ML, 8, w - MR, 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(10, 10, 10);
  doc.text("GOVERNMENT HIGH SCHOOL BABI KHEL", w / 2, 15, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  doc.text("District Mohmand, Khyber Pakhtunkhwa", w / 2, 20, { align: "center" });
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.25);
  doc.line(ML, 23, w - MR, 23);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(10, 10, 10);
  doc.text(`CLASS ${selectedClass} TIMETABLE`, w / 2, 29, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  doc.text(`Academic Year ${new Date().getFullYear()}`, w / 2, 34, { align: "center" });
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.8);
  doc.line(ML, 37, w - MR, 37);

  const periodNums = [...new Set(entries.map((e) => e.period_number))].sort((a, b) => a - b);
  const head = [["Period", ...days]];
  const body = periodNums.map((p) => {
    const pName = periodNames[p] || `Period ${p}`;
    const row: string[] = [pName];
    days.forEach((d) => {
      const entry = entries.find((e) => e.day === d && e.period_number === p);
      if (entry) {
        let text = entry.subject;
        const teacher = entry.teacher || entry.teacher_name;
        if (teacher) text += `\n${teacher}`;
        if (entry.start_time && entry.end_time) text += `\n${entry.start_time}-${entry.end_time}`;
        if (entry.room) text += `\nRoom: ${entry.room}`;
        row.push(text);
      } else {
        row.push("—");
      }
    });
    return row;
  });

  autoTable(doc, {
    startY: 40, head, body,
    headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9, halign: "center", cellPadding: 4 },
    bodyStyles: { fontSize: 8, cellPadding: 3, textColor: [20, 20, 20], lineHeight: 1.3 },
    columnStyles: { 0: { cellWidth: 28, fontStyle: "bold", halign: "center" }, ...Object.fromEntries(days.map((_, i) => [i + 1, { cellWidth: "auto" }])) },
    alternateRowStyles: { fillColor: [246, 247, 250] },
    margin: { left: ML, right: MR, bottom: 14 },
    didDrawPage: () => {
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.25);
      doc.line(ML, h - 10, w - MR, h - 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text("GHS Babi Khel — Class Timetable", ML, h - 6);
      doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, w / 2, h - 6, { align: "center" });
    },
  });

  doc.save(`Timetable_Class${selectedClass}.pdf`);
}

// ─── Image Export ────────────────────────────────────────────────────────────

function exportImage(
  selectedClass: string,
  entries: any[],
  periodNames: Record<string, string>,
) {
  const canvas = document.createElement("canvas");
  const cellW = 140, cellH = 70, headerH = 40, labelW = 110, padding = 20;
  const periodNums = [...new Set(entries.map((e) => e.period_number))].sort((a, b) => a - b);
  const totalW = labelW + days.length * cellW + padding * 2;
  const totalH = headerH + periodNums.length * cellH + padding * 2 + 60;

  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalW, totalH);

  ctx.fillStyle = "#1a1a2e";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GHS Babi Khel", totalW / 2, 28);
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#555";
  ctx.fillText(`Class ${selectedClass} Timetable — ${new Date().getFullYear()}`, totalW / 2, 48);

  let y = padding + 60;

  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(padding, y, labelW, headerH);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText("Period", padding + labelW / 2, y + 25);
  days.forEach((d, i) => {
    const x = padding + labelW + i * cellW;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(x, y, cellW, headerH);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(d, x + cellW / 2, y + 25);
  });
  y += headerH;

  periodNums.forEach((p, pi) => {
    const isAlt = pi % 2 === 1;
    const pName = periodNames[p] || `Period ${p}`;

    ctx.fillStyle = isAlt ? "#f0f0f5" : "#f8f8fc";
    ctx.fillRect(padding, y, labelW, cellH);
    ctx.fillStyle = "#1a1a2e";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(pName, padding + labelW / 2, y + cellH / 2 + 4);

    days.forEach((d, di) => {
      const x = padding + labelW + di * cellW;
      ctx.fillStyle = isAlt ? "#f0f0f5" : "#f8f8fc";
      ctx.fillRect(x, y, cellW, cellH);
      const entry = entries.find((e) => e.day === d && e.period_number === p);
      if (entry) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#1a1a2e";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(entry.subject, x + cellW / 2, y + 20);
        const teacher = entry.teacher || entry.teacher_name;
        if (teacher) { ctx.fillStyle = "#555"; ctx.font = "10px sans-serif"; ctx.fillText(teacher, x + cellW / 2, y + 35); }
        if (entry.start_time && entry.end_time) { ctx.fillStyle = "#888"; ctx.font = "9px sans-serif"; ctx.fillText(`${entry.start_time}-${entry.end_time}`, x + cellW / 2, y + 48); }
        if (entry.room) { ctx.fillStyle = "#888"; ctx.font = "9px sans-serif"; ctx.fillText(`Room: ${entry.room}`, x + cellW / 2, y + 60); }
      }
      ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1; ctx.strokeRect(x, y, cellW, cellH);
    });
    ctx.strokeStyle = "#ddd"; ctx.strokeRect(padding, y, labelW, cellH);
    y += cellH;
  });

  y += 10;
  ctx.fillStyle = "#999"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("GHS Babi Khel — Generated: " + new Date().toLocaleDateString("en-GB"), totalW / 2, y + 10);

  const link = document.createElement("a");
  link.download = `Timetable_Class${selectedClass}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// ─── Main TimetableTab Component ────────────────────────────────────────────

const TimetableTab = () => {
  const [selectedClass, setSelectedClass] = useState("6");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const reminderTimeouts = useRef<number[]>([]);

  const { data: entries = [], isLoading } = useTimetable(selectedClass);
  const { data: settings } = useTimetableSettings(selectedClass);
  const periodNames = (settings?.period_names || {}) as Record<string, string>;

  const today = getDayName();

  const periods = useMemo(() => {
    if (!entries.length) return [];
    return [...new Set(entries.map((e) => e.period_number))].sort((a, b) => a - b);
  }, [entries]);

  const getEntry = (day: string, period: number) =>
    entries.find((e) => e.day === day && e.period_number === period);

  // ─── 2.6 Today's Schedule + What's Next ───────────────────────────────
  const todayEntries = useMemo(() => {
    if (!today) return [];
    return entries
      .filter((e) => e.day === today)
      .sort((a, b) => a.period_number - b.period_number);
  }, [entries, today]);

  const currentEntry = useMemo(() => {
    if (!todayEntries.length) return null;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    for (const e of todayEntries) {
      if (!e.start_time || !e.end_time) continue;
      const [sh, sm] = e.start_time.split(":").map(Number);
      const [eh, em] = e.end_time.split(":").map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      if (nowMinutes >= start && nowMinutes <= end) return e;
    }
    return null;
  }, [todayEntries]);

  const nextEntry = useMemo(() => {
    if (!todayEntries.length) return null;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    for (const e of todayEntries) {
      if (!e.start_time) continue;
      const [sh, sm] = e.start_time.split(":").map(Number);
      const start = sh * 60 + sm;
      if (nowMinutes < start) return e;
    }
    return null;
  }, [todayEntries]);

  // ─── 2.6 Notification Reminders ───────────────────────────────────────
  const enableNotifications = useCallback(async () => {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    if (granted) {
      // Schedule reminders for today's classes
      reminderTimeouts.current.forEach((t) => window.clearTimeout(t));
      reminderTimeouts.current = [];
      todayEntries.forEach((e) => {
        const t = scheduleClassReminder({
          subject: e.subject,
          teacher: e.teacher || e.teacher_name,
          room: e.room,
          start_time: e.start_time,
          meet_link: e.meet_link,
        }, 5);
        if (t) reminderTimeouts.current.push(t);
      });
    }
  }, [todayEntries]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      reminderTimeouts.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // Check if notifications already granted
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "granted") {
      setNotificationsEnabled(true);
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* ─── Top Bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {classes.map((c) => (
            <button
              key={c}
              onClick={() => setSelectedClass(c)}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                selectedClass === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-secondary shadow-card"
              }`}
            >
              Class {c}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={enableNotifications}
            className={`gap-1.5 text-xs ${notificationsEnabled ? "text-emerald-600 border-emerald-300" : ""}`}
          >
            {notificationsEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{notificationsEnabled ? "Reminders On" : "Enable Reminders"}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(selectedClass, entries, periodNames)} className="gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">PDF</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportImage(selectedClass, entries, periodNames)} className="gap-1.5 text-xs">
            <Share2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Share</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 text-xs">
            <Printer className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Print</span>
          </Button>
        </div>
      </div>

      {/* ─── 2.6 Today's Schedule Card ──────────────────────────────────── */}
      {today && todayEntries.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-5 h-5 text-primary" />
              <h3 className="font-heading font-bold text-foreground">Today — {today}</h3>
              <Badge variant="outline" className="text-xs ml-auto">{todayEntries.length} classes</Badge>
            </div>

            {/* Current class highlight */}
            {currentEntry && (
              <div className="mb-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-primary text-primary-foreground text-[10px]">NOW</Badge>
                  <span className="font-bold text-foreground text-sm">{currentEntry.subject}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {(currentEntry.teacher || currentEntry.teacher_name) && (
                    <span className="flex items-center gap-1">{currentEntry.teacher || currentEntry.teacher_name}</span>
                  )}
                  {currentEntry.start_time && currentEntry.end_time && (
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{currentEntry.start_time}–{currentEntry.end_time}</span>
                  )}
                  {currentEntry.room && (
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{currentEntry.room}</span>
                  )}
                  {currentEntry.meet_link && (
                    <a href={currentEntry.meet_link} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline">
                      <Video className="w-3 h-3" /> Join Class
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Next class card */}
            {nextEntry && !currentEntry && (
              <div className="mb-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <ChevronRight className="w-4 h-4 text-emerald-500" />
                  <Badge variant="outline" className="text-emerald-600 text-[10px]">UP NEXT</Badge>
                  <span className="font-bold text-foreground text-sm">{nextEntry.subject}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {(nextEntry.teacher || nextEntry.teacher_name) && (
                    <span>{nextEntry.teacher || nextEntry.teacher_name}</span>
                  )}
                  {nextEntry.start_time && nextEntry.end_time && (
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{nextEntry.start_time}–{nextEntry.end_time}</span>
                  )}
                  {nextEntry.room && (
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{nextEntry.room}</span>
                  )}
                  {nextEntry.meet_link && (
                    <a href={nextEntry.meet_link} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline">
                      <Video className="w-3 h-3" /> Join Class
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Compact today timeline */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {todayEntries.map((e, i) => {
                const isCurrent = currentEntry?.period_number === e.period_number;
                const isNext = nextEntry?.period_number === e.period_number;
                return (
                  <div
                    key={i}
                    className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
                      isCurrent
                        ? "bg-primary text-primary-foreground border-primary"
                        : isNext
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                        : "bg-card border-border text-muted-foreground"
                    }`}
                  >
                    <p className="font-semibold truncate max-w-[80px]">{e.subject}</p>
                    {e.start_time && <p className="text-[10px] opacity-70">{e.start_time}</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Full Timetable Table ───────────────────────────────────────── */}
      {isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : entries.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl shadow-card">
          <p className="text-muted-foreground">No timetable data available for Class {selectedClass}.</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="gradient-hero text-primary-foreground">
                  <th className="px-3 py-3 text-left font-medium w-24">Period</th>
                  {days.map((d) => (
                    <th key={d} className={`px-3 py-3 text-left font-medium ${d === today ? "bg-primary-foreground/10" : ""}`}>
                      {d}
                      {d === today && <Badge variant="secondary" className="ml-1.5 text-[8px] h-4 px-1">Today</Badge>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p, pi) => (
                  <tr key={p} className={`border-t border-border ${pi % 2 === 1 ? "bg-secondary/20" : ""}`}>
                    <td className="px-3 py-3 font-semibold text-foreground text-xs">
                      {periodNames[p] || `P${p}`}
                    </td>
                    {days.map((day) => {
                      const entry = getEntry(day, p);
                      if (!entry) return <td key={day} className="px-3 py-3 text-muted-foreground text-xs">—</td>;
                      return (
                        <td key={day} className={`px-2 py-2 ${day === today ? "bg-primary/5" : ""}`}>
                          <div className={`rounded-lg border p-2 ${getSubjectColor(entry.subject)}`}>
                            <div className="font-semibold text-xs">{entry.subject}</div>
                            {(entry.teacher || entry.teacher_name) && (
                              <div className="text-[10px] opacity-75 mt-0.5">{entry.teacher || entry.teacher_name}</div>
                            )}
                            {entry.start_time && entry.end_time && (
                              <div className="text-[10px] opacity-60 flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" />{entry.start_time}-{entry.end_time}
                              </div>
                            )}
                            {entry.room && (
                              <div className="text-[10px] opacity-60 flex items-center gap-0.5">
                                <MapPin className="w-2.5 h-2.5" />{entry.room}
                              </div>
                            )}
                            {entry.meet_link && (
                              <a href={entry.meet_link} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-primary hover:underline flex items-center gap-0.5 mt-0.5">
                                <Video className="w-2.5 h-2.5" />Join
                              </a>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimetableTab;
