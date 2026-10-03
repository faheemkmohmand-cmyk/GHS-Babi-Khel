import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, CalendarDays, X,
} from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, format, isSameMonth,
  isSameDay, isWithinInterval, parseISO,
} from "date-fns";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvents, EVENT_TYPE_META, type SchoolEvent, type EventType } from "@/hooks/useEvents";
import ExamCountdown from "@/components/Calendar/ExamCountdown";
import CalendarSubscribe from "@/components/Calendar/CalendarSubscribe";

// Filter chips: Exams / Holidays / Sports + All + PTMs + Results
const FILTERS: Array<{ value: EventType | "all"; label: string; emoji: string }> = [
  { value: "all",     label: "All",           emoji: "📅" },
  { value: "exam",    label: "Exams",         emoji: "📝" },
  { value: "holiday", label: "Holidays",      emoji: "🏖️" },
  { value: "ptm",     label: "PTMs",          emoji: "👨‍👩‍👧" },
  { value: "sports",  label: "Sports",        emoji: "⚽" },
  { value: "results", label: "Results",       emoji: "📊" },
];

const Calendar = () => {
  const [cursor, setCursor] = useState(new Date());
  const [filter, setFilter] = useState<EventType | "all">("all");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Pull a generous window: from start of grid to end of grid (covers spillover days).
  const gridStart = startOfWeek(startOfMonth(cursor));
  const gridEnd   = endOfWeek(endOfMonth(cursor));

  const { data: events = [], isLoading } = useEvents(
    format(gridStart, "yyyy-MM-dd"),
    format(addMonths(gridEnd, 1), "yyyy-MM-dd") // small buffer for multi-day events starting earlier
  );

  const filteredEvents = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.event_type === filter)),
    [events, filter]
  );

  // Build the 6x7 day grid
  const days = useMemo(() => {
    const result: Date[] = [];
    let day = gridStart;
    while (day <= gridEnd) {
      result.push(day);
      day = addDays(day, 1);
    }
    return result;
  }, [gridStart, gridEnd]);

  const eventsForDay = (day: Date): SchoolEvent[] =>
    filteredEvents.filter((e) => {
      const start = parseISO(e.start_date);
      const end = e.end_date ? parseISO(e.end_date) : start;
      return isWithinInterval(day, { start, end }) || isSameDay(day, start);
    });

  const selectedDayEvents = selectedDay ? eventsForDay(selectedDay) : [];

  return (
    <PageLayout>
      {/* Exam countdown banner — sticky at top, only shows during exam season */}
      <ExamCountdown />

      <PageBanner
        variant="premium"
        eyebrow="GHS Babi Khel"
        title="Event Calendar"
        subtitle="Exams, holidays, PTMs, sports day & more — all in one place"
      />

      <section className="py-8 md:py-12">
        <div className="container mx-auto px-4 max-w-5xl">

          {/* ── Subscribe card (one-time setup, syncs all events to phone) ── */}
          <div className="mb-6">
            <CalendarSubscribe />
          </div>

          {/* Filter chips — one thin scrollable row on mobile */}
          <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:px-0">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`shrink-0 inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-all active:scale-95 ${
                  filter === f.value
                    ? "gradient-hero border-gold/60 text-white shadow-md"
                    : "border-border bg-card text-muted-foreground hover:border-gold/50 hover:text-foreground"
                }`}
              >
                <span className="text-[13px] leading-none">{f.emoji}</span>
                {f.label}
              </button>
            ))}
          </div>

          {/* Calendar card */}
          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
            {/* Month nav — green header band */}
            <div className="relative flex items-center justify-between gradient-hero px-3 py-3.5 sm:px-5 sm:py-4 text-white">
              <div className="absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
              <button
                onClick={() => setCursor((c) => subMonths(c, 1))}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/10 transition-colors hover:bg-white/20 active:scale-90"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-center">
                <h2 className="font-heading text-lg font-bold leading-none sm:text-xl">{format(cursor, "MMMM")}</h2>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">{format(cursor, "yyyy")}</p>
              </div>
              <button
                onClick={() => setCursor((c) => addMonths(c, 1))}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/10 transition-colors hover:bg-white/20 active:scale-90"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 border-b border-border bg-muted/40 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:text-xs">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className={d === "Fri" ? "text-gold-strong dark:text-gold" : ""}>{d}</div>
              ))}
            </div>

            {/* Day grid */}
            {isLoading ? (
              <div className="grid grid-cols-7 gap-1 p-2">
                {Array.from({ length: 35 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 sm:h-20 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-px bg-border/70">
                {days.map((day) => {
                  const dayEvents = eventsForDay(day);
                  const inMonth = isSameMonth(day, cursor);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => dayEvents.length > 0 && setSelectedDay(day)}
                      className={`relative bg-card min-h-14 sm:min-h-20 p-1 sm:p-2 text-left transition-colors ${
                        inMonth ? "" : "opacity-35"
                      } ${isToday ? "bg-gold/10" : ""} ${dayEvents.length > 0 ? "cursor-pointer hover:bg-muted/60 active:bg-muted" : "cursor-default"}`}
                    >
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold sm:text-sm ${
                          isToday ? "gradient-hero text-white shadow-md ring-2 ring-gold/60" : "text-foreground"
                        }`}
                      >
                        {format(day, "d")}
                      </span>

                      {/* Event dots / chips */}
                      <div className="mt-1 flex flex-col gap-0.5">
                        {dayEvents.slice(0, 2).map((e) => (
                          <span
                            key={e.id}
                            className={`hidden sm:block text-[10px] leading-tight px-1.5 py-0.5 rounded truncate ${EVENT_TYPE_META[e.event_type].color}`}
                          >
                            {e.title}
                          </span>
                        ))}
                        {/* mobile: dots only */}
                        <div className="flex sm:hidden gap-0.5 pl-0.5">
                          {dayEvents.slice(0, 3).map((e) => (
                            <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${EVENT_TYPE_META[e.event_type].dot}`} />
                          ))}
                        </div>
                        {dayEvents.length > 2 && (
                          <span className="hidden sm:block text-[10px] text-muted-foreground">
                            +{dayEvents.length - 2} more
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3">
            {Object.entries(EVENT_TYPE_META).map(([key, meta]) => (
              <div key={key} className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </div>
            ))}
          </div>

          {/* Empty state */}
          {!isLoading && filteredEvents.length === 0 && (
            <div className="mt-6 rounded-3xl border border-border bg-card py-14 text-center shadow-card">
              <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No events scheduled for this view.</p>
            </div>
          )}
        </div>
      </section>

      {/* Day detail modal */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => setSelectedDay(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-elevated sm:rounded-3xl sm:p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold-strong dark:text-gold">{format(selectedDay, "EEEE")}</p>
                  <h3 className="font-heading text-lg font-bold text-foreground">{format(selectedDay, "dd MMMM yyyy")}</h3>
                </div>
                <button onClick={() => setSelectedDay(null)} className="grid h-8 w-8 place-items-center rounded-full border border-border hover:bg-muted" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                {selectedDayEvents.map((e) => (
                  <div key={e.id} className={`rounded-xl p-4 border ${EVENT_TYPE_META[e.event_type].color}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${EVENT_TYPE_META[e.event_type].dot}`} />
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        {EVENT_TYPE_META[e.event_type].label}
                      </span>
                    </div>
                    <p className="font-semibold text-foreground">{e.title}</p>
                    {e.description && (
                      <p className="text-sm text-muted-foreground mt-1">{e.description}</p>
                    )}
                    {e.end_date && e.end_date !== e.start_date && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {format(parseISO(e.start_date), "dd MMM")} – {format(parseISO(e.end_date), "dd MMM yyyy")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
};

export default Calendar;
