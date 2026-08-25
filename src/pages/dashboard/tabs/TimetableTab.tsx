import { useState, useMemo } from "react";
import { Clock, MapPin, Video, ChevronRight, CalendarDays, UserCheck } from "lucide-react";
import { useTimetable, useTimetableSettings } from "@/hooks/useTimetable";
import { useTodayTimetableOverrides } from "@/hooks/useTimetableOverrides";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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

// ─── Main TimetableTab Component ────────────────────────────────────────────

const TimetableTab = () => {
  const [selectedClass, setSelectedClass] = useState("6");



  const { data: entries = [], isLoading } = useTimetable(selectedClass);
  const { data: settings } = useTimetableSettings(selectedClass);
  const periodNames = (settings?.period_names || {}) as Record<string, string>;

  // ── Today's substitute-teacher overrides ─────────────────────────────────
  // If the admin marked a teacher absent and assigned substitutes, today's
  // timetable shows the SUBSTITUTE teacher's name instead of the regular
  // teacher's name. Only today's overrides are fetched (tomorrow's
  // timetable shows the regular teacher as usual).
  const { data: todayOverrides = [] } = useTodayTimetableOverrides();

  const today = getDayName();

  const periods = useMemo(() => {
    if (!entries.length) return [];
    return [...new Set(entries.map((e) => e.period_number))].sort((a, b) => a - b);
  }, [entries]);

  const getEntry = (day: string, period: number) =>
    entries.find((e) => e.day === day && e.period_number === period);

  /**
   * Returns the substitute teacher's name for a given entry IF an override
   * exists for it today. Returns null if no override exists (show the
   * regular teacher as usual).
   */
  const getSubstituteFor = (day: string, period: number, entryClass: string): string | null => {
    // Only show overrides for TODAY's actual entries — overrides for other
    // days don't apply (they're created with today's date only).
    if (day !== today) return null;
    const override = todayOverrides.find(
      (o) => o.day === day && o.period_number === period && o.class === entryClass
    );
    return override?.substitute_teacher ?? null;
  };

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

  // ─── Notification reminders removed (feature no longer exposed in UI) ──

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
            {currentEntry && (() => {
              const sub = getSubstituteFor(currentEntry.day, currentEntry.period_number, currentEntry.class);
              const regularTeacher = currentEntry.teacher || currentEntry.teacher_name;
              return (
                <div className="mb-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-primary text-primary-foreground text-[10px]">NOW</Badge>
                    <span className="font-bold text-foreground text-sm">{currentEntry.subject}</span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {sub ? (
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-amber-500" />
                        <span className="line-through opacity-60">{regularTeacher || "—"}</span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">→ {sub} (Sub)</span>
                      </span>
                    ) : regularTeacher ? (
                      <span className="flex items-center gap-1">{regularTeacher}</span>
                    ) : null}
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
              );
            })()}

            {/* Next class card */}
            {nextEntry && !currentEntry && (() => {
              const sub = getSubstituteFor(nextEntry.day, nextEntry.period_number, nextEntry.class);
              const regularTeacher = nextEntry.teacher || nextEntry.teacher_name;
              return (
                <div className="mb-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center gap-2 mb-1">
                    <ChevronRight className="w-4 h-4 text-emerald-500" />
                    <Badge variant="outline" className="text-emerald-600 text-[10px]">UP NEXT</Badge>
                    <span className="font-bold text-foreground text-sm">{nextEntry.subject}</span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {sub ? (
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-amber-500" />
                        <span className="line-through opacity-60">{regularTeacher || "—"}</span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">→ {sub} (Sub)</span>
                      </span>
                    ) : regularTeacher ? (
                      <span>{regularTeacher}</span>
                    ) : null}
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
              );
            })()}

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
                  <th className="px-3 py-3 text-center font-medium w-24">Period</th>
                  {days.map((d) => (
                    <th key={d} className={`px-3 py-3 text-center font-medium ${d === today ? "bg-primary-foreground/10" : ""}`}>
                      {d}
                      {d === today && <Badge variant="secondary" className="ml-1.5 text-[8px] h-4 px-1">Today</Badge>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p, pi) => (
                  <tr key={p} className={`border-t border-border ${pi % 2 === 1 ? "bg-secondary/20" : ""}`}>
                    <td className="px-3 py-3 font-semibold text-foreground text-xs text-center">
                      {periodNames[p] || `P${p}`}
                    </td>
                    {days.map((day) => {
                      const entry = getEntry(day, p);
                      if (!entry) return <td key={day} className="px-3 py-3 text-muted-foreground text-xs text-center">—</td>;
                      const sub = getSubstituteFor(entry.day, entry.period_number, entry.class);
                      const regularTeacher = entry.teacher || entry.teacher_name;
                      return (
                        <td key={day} className={`px-2 py-2 ${day === today ? "bg-primary/5" : ""}`}>
                          <div className={`rounded-lg border p-2 text-center ${getSubjectColor(entry.subject)} ${sub ? "ring-1 ring-amber-400/50" : ""}`}>
                            <div className="font-semibold text-xs">{entry.subject}</div>
                            {sub ? (
                              <div className="text-[10px] mt-0.5">
                                <span className="line-through opacity-50">{regularTeacher || "—"}</span>
                                <div className="flex items-center justify-center gap-0.5 text-amber-600 dark:text-amber-400 font-semibold">
                                  <UserCheck className="w-2.5 h-2.5" />{sub} (Sub)
                                </div>
                              </div>
                            ) : regularTeacher ? (
                              <div className="text-[10px] opacity-75 mt-0.5">{regularTeacher}</div>
                            ) : null}
                            {entry.start_time && entry.end_time && (
                              <div className="text-[10px] opacity-60 flex items-center justify-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" />{entry.start_time}-{entry.end_time}
                              </div>
                            )}
                            {entry.room && (
                              <div className="text-[10px] opacity-60 flex items-center justify-center gap-0.5">
                                <MapPin className="w-2.5 h-2.5" />{entry.room}
                              </div>
                            )}
                            {entry.meet_link && (
                              <a href={entry.meet_link} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-primary hover:underline flex items-center justify-center gap-0.5 mt-0.5">
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
                 
