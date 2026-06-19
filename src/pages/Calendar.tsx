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

const FILTERS: Array<{ value: EventType | "all"; label: string }> = [
  { value: "all",     label: "All" },
  { value: "exam",    label: "Exams" },
  { value: "holiday", label: "Holidays" },
  { value: "ptm",     label: "PTMs" },
  { value: "sports",  label: "Sports" },
  { value: "results", label: "Results" },
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
      <PageBanner
        title="Event Calendar"
        subtitle="Exams, holidays, PTMs, sports day &amp; more — all in one place"
      />

      <section className="py-16">
        <div className="container mx-auto px-4 max-w-5xl">

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-6">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Calendar card */}
          <div className="bg-card rounded-2xl shadow-card overflow-hidden">
            {/* Month nav */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <button
                onClick={() => setCursor((c) => subMonths(c, 1))}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="font-heading font-bold text-lg text-foreground">
                {format(cursor, "MMMM yyyy")}
              </h2>
              <button
                onClick={() => setCursor((c) => addMonths(c, 1))}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground py-2 border-b border-border">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
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
              <div className="grid grid-cols-7 gap-px bg-border">
                {days.map((day) => {
                  const dayEvents = eventsForDay(day);
                  const inMonth = isSameMonth(day, cursor);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => dayEvents.length > 0 && setSelectedDay(day)}
                      className={`relative bg-card min-h-16 sm:min-h-20 p-1.5 sm:p-2 text-left transition-colors ${
                        inMonth ? "" : "opacity-40"
                      } ${dayEvents.length > 0 ? "cursor-pointer hover:bg-muted/60" : "cursor-default"}`}
                    >
                      <span
                        className={`text-xs sm:text-sm inline-flex items-center justify-center w-6 h-6 rounded-full ${
                          isToday ? "bg-primary text-primary-foreground font-semibold" : "text-foreground"
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
                        <div className="flex sm:hidden gap-0.5">
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
          <div className="flex flex-wrap gap-3 mt-6">
            {Object.entries(EVENT_TYPE_META).map(([key, meta]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </div>
            ))}
          </div>

          {/* Empty state */}
          {!isLoading && filteredEvents.length === 0 && (
            <div className="text-center py-16 bg-card rounded-2xl shadow-card mt-6">
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
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedDay(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl shadow-card max-w-md w-full p-6 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-bold text-lg text-foreground">
                  {format(selectedDay, "EEEE, dd MMMM yyyy")}
                </h3>
                <button onClick={() => setSelectedDay(null)} className="p-1 rounded-lg hover:bg-muted">
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
