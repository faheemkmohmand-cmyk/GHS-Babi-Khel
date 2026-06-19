/**
 * ExamCountdown.tsx
 * Sticky banner that appears at top of the page during "exam season"
 * (any exam within 14 days). Shows live countdown to the next exam.
 * Auto-hides if no upcoming exams.
 */
import { useEffect, useState, useMemo } from "react";
import { AlertCircle, X } from "lucide-react";
import { useEvents, type SchoolEvent } from "@/hooks/useEvents";

function formatRemaining(ms: number): { d: number; h: number; m: number; s: number } {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000) % 24;
  const d = Math.floor(ms / 86400000);
  return { d, h, m, s };
}

const PAD = (n: number) => String(n).padStart(2, "0");

export default function ExamCountdown({ onClose }: { onClose?: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const sixMonthsAhead = new Date();
  sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);

  const { data: events = [] } = useEvents(today, sixMonthsAhead.toISOString().slice(0, 10));

  const nextExam = useMemo<SchoolEvent | null>(() => {
    const exams = events.filter(e => e.event_type === "exam" && e.start_date >= today);
    return exams.length > 0 ? exams[0] : null;
  }, [events, today]);

  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Tick every second
  useEffect(() => {
    if (!nextExam || dismissed) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [nextExam, dismissed]);

  // Auto-dismiss after exam starts (won't show stale "0:0:0" forever)
  useEffect(() => {
    if (!nextExam) return;
    const startMs = new Date(nextExam.start_date + "T00:00:00").getTime();
    if (now > startMs + 86400000) setDismissed(true); // hide 24h after exam start
  }, [nextExam, now]);

  if (!nextExam || dismissed) return null;

  const startMs = new Date(nextExam.start_date + "T00:00:00").getTime();
  const remaining = formatRemaining(startMs - now);
  const isUrgent = remaining.d <= 3;

  const close = () => { setDismissed(true); onClose?.(); };

  return (
    <div className={`sticky top-0 z-30 w-full ${isUrgent ? "bg-red-600" : "bg-amber-500"} text-white shadow-lg`}>
      <div className="max-w-5xl mx-auto px-3 py-2 flex items-center gap-2 sm:gap-3">
        <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-xs sm:text-sm font-bold whitespace-nowrap">
            {isUrgent ? "🚨 EXAM ALERT:" : "📚 Next Exam:"}
          </span>
          <span className="text-xs sm:text-sm font-semibold truncate min-w-0 flex-1">
            {nextExam.title}
          </span>
          <div className="flex items-center gap-1 font-mono text-xs sm:text-sm font-bold tabular-nums shrink-0">
            {remaining.d > 0 && (
              <span className="bg-white/20 px-1.5 py-0.5 rounded">
                {remaining.d}<span className="text-[10px] opacity-80 ml-0.5">d</span>
              </span>
            )}
            <span className="bg-white/20 px-1.5 py-0.5 rounded">
              {PAD(remaining.h)}<span className="text-[10px] opacity-80 ml-0.5">h</span>
            </span>
            <span className="bg-white/20 px-1.5 py-0.5 rounded">
              {PAD(remaining.m)}<span className="text-[10px] opacity-80 ml-0.5">m</span>
            </span>
            <span className="bg-white/20 px-1.5 py-0.5 rounded hidden sm:inline-block">
              {PAD(remaining.s)}<span className="text-[10px] opacity-80 ml-0.5">s</span>
            </span>
          </div>
        </div>
        <button
          onClick={close}
          aria-label="Dismiss"
          className="p-1 rounded hover:bg-white/20 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
