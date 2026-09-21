
// ── Client-side auto-publish trigger ────────────────────────────────────────
// Fires the INSTANT any visitor's countdown reaches zero — instead of waiting
// for the Vercel Cron's next scheduled tick. Safe to call from any browser:
// it can only flip rows whose `publish_at` has ALREADY passed, so calling it
// early, repeatedly, or from an unauthenticated client does nothing harmful.
//
// TWO-PATH PUBLISH (fixes "Publishing now… then nothing happens"):
//   1. Serverless endpoint — POST /api/auto-publish-results. Uses the
//      Supabase service role key if SUPABASE_SERVICE_ROLE_KEY is set on
//      Vercel, which bypasses RLS and works for anonymous visitors. If that
//      env var is NOT set, the endpoint falls back to the anon key, which
//      RLS blocks from UPDATE-ing `results` — so it returns
//      published_count=0 and publishes nothing.
//   2. Direct supabase UPDATE from the browser — runs whenever path #1
//      published 0 rows. Uses the current visitor's supabase session, so it
//      works for any authenticated admin (RLS allows admin UPDATE on
//      results). For anonymous visitors it silently updates 0 rows (no
//      harm). This is the path that actually publishes the result when an
//      admin has the /results page open — even if the serverless function
//      isn't configured with a service role key.
let autoPublishInFlight = false;
async function triggerAutoPublish(): Promise<boolean> {
  if (autoPublishInFlight) return false;
  autoPublishInFlight = true;
  try {
    // ── Path 1: serverless endpoint ──
    let publishedCount = 0;
    try {
      const r = await fetch("/api/auto-publish-results", { method: "POST" });
      if (r.ok) {
        const data = await r.json().catch(() => null);
        if (data?.ok) publishedCount = data.published_count ?? 0;
      }
    } catch { /* network error — fall through to direct update */ }

    // ── Path 2: direct browser UPDATE (fallback when #1 published 0) ──
    // Same narrow filter as the serverless endpoint: only rows whose
    // publish_at is in the past AND is_published is still false get
    // flipped. Safe to run from any browser.
    if (publishedCount === 0) {
      const nowIso = new Date().toISOString();
      const { data: updated, error } = await supabase
        .from("results")
        .update({ is_published: true, publish_at: null })
        .eq("is_published", false)
        .not("publish_at", "is", null)
        .lte("publish_at", nowIso)
        .select("id");
      if (!error && Array.isArray(updated)) {
        publishedCount = updated.length;
      }
    }

    return publishedCount > 0;
  } catch {
    return false;
  } finally {
    autoPublishInFlight = false;
  }
}

// ── Hook: fetch upcoming scheduled result publish times ────────────────────────
//
// IMPORTANT: when admin clicks "All Classes At Once" in AdminResults.tsx, the
// SAME `publish_at` timestamp is written to every class's results row for
// that exam_type+year. Previously this hook deduplicated by
// `class-exam_type-year`, so a single "All Classes" schedule produced 5
// separate countdown cards (Class 6, 7, 8, 9, 10) all showing the exact same
// ticking time — looking like 5 different schedules. We now dedupe by
// `publish_at` value itself, and aggregate every class that shares that
// publish_at into ONE card. The card then reads
// "All Classes (6, 7, 8, 9, 10) — <exam_type> <year>" instead of repeating
// the countdown 5 times.
function useScheduledPublishes() {
  return useQuery({
    queryKey: ["scheduled-result-publishes"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("results")
        .select("class, exam_type, year, publish_at")
        .eq("is_published", false)
        .not("publish_at", "is", null)
        .gt("publish_at", now)
        .order("publish_at", { ascending: true });

      // Group rows by `publish_at` value — every row that shares the same
      // scheduled timestamp belongs to one countdown card. Within each group,
      // collect the unique (exam_type, year) and the sorted list of classes.
      type Group = {
        publish_at: string;
        exam_type: string;
        year: number;
        classes: string[];
      };
      const byPublishAt = new Map<string, Group>();
      for (const r of (data ?? [])) {
        const key = r.publish_at;
        if (!byPublishAt.has(key)) {
          byPublishAt.set(key, {
            publish_at: r.publish_at,
            exam_type: r.exam_type,
            year: r.year,
            classes: [r.class],
          });
        } else {
          const g = byPublishAt.get(key)!;
          // Keep the first row's exam_type/year as the label (they should
          // all match since scheduling is always scoped to one exam_type+year).
          if (!g.classes.includes(r.class)) g.classes.push(r.class);
        }
      }

      // Sort each group's classes numerically (on a COPY — never mutate the
      // array in place with .sort(), which corrupts React Query's cached
      // data and can cause subtle re-render bugs) and return groups in
      // publish_at ascending order so the soonest-publishing card appears
      // first.
      return Array.from(byPublishAt.values())
        .map(g => ({
          ...g,
          classes: [...g.classes].sort((a, b) => Number(a) - Number(b)),
        }))
        .sort((a, b) => a.publish_at.localeCompare(b.publish_at));
    },
    // Also poll every 30s here as a belt-and-braces fallback in case the
    // countdown-triggered publish (below) doesn't fire for some reason
    // (tab in background throttled, etc.) — the next 30s refetch will pick
    // up the change once the cron or another visitor's tab has published it.
    refetchInterval: 30000,
    staleTime: 0,
  });
}

// ── Hook: watches every active schedule and fires the publish trigger the
// moment ANY of them reaches zero. Mounted once near the top of the Results
// page (and separately on the homepage) so publishing happens as soon as
// possible regardless of which page a visitor happens to be on.
//
// OPTIMIZED: Uses adaptive interval - checks every 500ms when within 10 seconds
// of publish time for near-instant response, otherwise every 2 seconds.
function useAutoPublishWatcher() {
  const { data: scheduled = [] } = useScheduledPublishes();
  const qc = useQueryClient();
  useEffect(() => {
    if (scheduled.length === 0) return;
    
    let intervalId: ReturnType<typeof setInterval>;
    
    const check = async () => {
      const now = Date.now();
      const dueNow = scheduled.some(s => new Date(s.publish_at).getTime() <= now);
      if (!dueNow) return;
      const publishedSomething = await triggerAutoPublish();
      if (publishedSomething) {
        // Refresh every cache that depends on is_published / publish_at so
        // the countdown disappears and the real result appears immediately,
        // without the visitor needing to refresh the page.
        qc.invalidateQueries({ queryKey: ["scheduled-result-publishes"] });
        qc.invalidateQueries({ queryKey: ["has-published-school-results"] });
        qc.invalidateQueries({ queryKey: ["latest-published-exam"] });
        qc.invalidateQueries({ queryKey: ["admin-results"] });
        qc.invalidateQueries({ queryKey: ["home-school-toppers"] });
        // Clear interval after successful publish to avoid repeated calls
        if (intervalId) clearInterval(intervalId);
      }
    };
    
    // Adaptive interval function - faster when close to publish time
    const setupAdaptiveInterval = () => {
      const getInterval = () => {
        const minDiff = Math.min(...scheduled.map(s => new Date(s.publish_at).getTime() - Date.now()));
        // Within 10 seconds: check every 500ms for near-instant publish
        if (minDiff <= 10000 && minDiff > 0) return 500;
        // Within 60 seconds: check every 1 second
        if (minDiff <= 60000) return 1000;
        // Otherwise: check every 2 seconds
        return 2000;
      };
      
      // Initial check
      check();
      
      // Setup interval with adaptive timing
      const tick = async () => {
        await check();
        // Recalculate interval based on remaining time
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = setInterval(tick, getInterval());
        }
      };
      
      intervalId = setInterval(tick, getInterval());
    };
    
    setupAdaptiveInterval();
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [scheduled, qc]);
}

// ── Realistic countdown clock icon (layered SVG, not a flat glyph) ───────
// Same design used on the Merit List countdown for visual consistency.
// IMPORTANT: hours/minutes/seconds here must be the REAL wall-clock time
// the hands should point at (e.g. the actual target announcement time,
// like 3:00:00 PM) — NOT the remaining countdown duration. A duration
// like "17h 38m" is not a valid clock reading (there's no 17 o'clock);
// passing it in made the hands land on nonsense positions. Callers pass
// real hour-of-day / minute / second values instead.
function RealisticClockIcon({ className = "w-8 h-8", hours = 0, minutes = 0, seconds = 0 }: { className?: string; hours?: number; minutes?: number; seconds?: number }) {
  // Standard analog clock hand geometry, driven by real time-of-day.
  const secAngle = (seconds % 60) * 6;
  const minAngle = (minutes % 60) * 6 + (seconds % 60) * 0.1;
  const hourAngle = (hours % 12) * 30 + (minutes % 60) * 0.5;
  const hand = (angleDeg: number, len: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x2: 32 + Math.sin(rad) * len, y2: 34 - Math.cos(rad) * len };
  };
  const hourHand = hand(hourAngle, 8.5);
  const minHand = hand(minAngle, 12);
  const secHand = hand(secAngle, 13.5);
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="resultClockFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFDF5" />
          <stop offset="100%" stopColor="#F3E9C7" />
        </linearGradient>
        <linearGradient id="resultClockRim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4C550" />
          <stop offset="100%" stopColor="#C6912A" />
        </linearGradient>
      </defs>
      {/* Bells */}
      <circle cx="16" cy="10" r="5.5" fill="url(#resultClockRim)" />
      <circle cx="48" cy="10" r="5.5" fill="url(#resultClockRim)" />
      {/* Legs */}
      <rect x="22" y="52" width="4.5" height="8" rx="2" fill="#8A6416" />
      <rect x="37.5" y="52" width="4.5" height="8" rx="2" fill="#8A6416" />
      {/* Outer rim */}
      <circle cx="32" cy="34" r="24" fill="url(#resultClockRim)" />
      {/* Face */}
      <circle cx="32" cy="34" r="19.5" fill="url(#resultClockFace)" stroke="#C6912A" strokeWidth="1.5" />
      {/* Tick marks */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * 30 * Math.PI) / 180;
        const x1 = 32 + Math.sin(angle) * 16.5;
        const y1 = 34 - Math.cos(angle) * 16.5;
        const x2 = 32 + Math.sin(angle) * 14;
        const y2 = 34 - Math.cos(angle) * 14;
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#B08628" strokeWidth={i % 3 === 0 ? 1.4 : 0.8} strokeLinecap="round" />
        );
      })}
      {/* Hands — rotate live with the actual countdown remaining */}
      <line x1="32" y1="34" x2={hourHand.x2} y2={hourHand.y2} stroke="#3F2E10" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="32" y1="34" x2={minHand.x2} y2={minHand.y2} stroke="#3F2E10" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="32" y1="34" x2={secHand.x2} y2={secHand.y2} stroke="#D64545" strokeWidth="1.3" strokeLinecap="round" />
      {/* Center pin */}
      <circle cx="32" cy="34" r="2.2" fill="#3F2E10" />
    </svg>
  );
}

// ── Countdown timer for a single scheduled publish ─────────────────────────────
// REDESIGNED: Big, bold RED countdown matching reference design.
// Shows large HHh MMm SSs format with "TIME REMAINING" label.
function CountdownCard({ item }: { item: { publish_at: string; exam_type: string; year: number; classes: string[] } }) {
  const [timeLeft, setTimeLeft] = useState<{ h: number; m: number; s: number; d: number; isDue: boolean }>({ h: 0, m: 0, s: 0, d: 0, isDue: false });
  // Live "now" tick — used to derive the REAL current time-of-day for the
  // analog clock hands, separate from timeLeft (which is the remaining
  // duration used for the digital HHh MMm SSs readout). The clock face
  // must show what a real clock reads right now, ticking normally toward
  // the target time (e.g. 3:00:00 PM) — not the countdown duration.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const calc = () => {
      const diff = new Date(item.publish_at).getTime() - Date.now();
      setNow(new Date());
      if (diff <= 0) { setTimeLeft(prev => ({ ...prev, isDue: true })); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft({ d, h, m, s, isDue: false });
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [item.publish_at]);

  // If only one class is scheduled, show "Class N — exam year".
  // If multiple classes share the same publish_at, show
  // "All Classes (6, 7, 8, 9, 10) — exam year" so it's clear this is ONE
  // schedule, not five separate ones.
  const classLabel = item.classes.length > 1
    ? `All Classes (${item.classes.join(", ")})`
    : `Class ${item.classes[0]}`;

  // Format announcement date nicely
  const announceDate = new Date(item.publish_at);
  const formattedDate = announceDate.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const PAD = (n: number) => String(n).padStart(2, '0');

  // Slow, cinematic breathing zoom for the entire countdown — subtle in/out
  // scale, not a hard blink — active any time a countdown is running.
  const isRunning = !timeLeft.isDue;

  // When due, show publishing state
  if (timeLeft.isDue) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6 sm:p-8 text-center border border-gray-200 dark:border-gray-700">
        <div className="mb-3">
          <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">
            {classLabel} — {examTypeLabel(item.exam_type)} {item.year}
          </p>
        </div>
        <div className="animate-pulse">
          <p className="text-2xl sm:text-3xl font-black text-green-600 dark:text-green-400">
            🎉 Publishing Now...
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Results will appear in seconds!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl p-8 sm:p-12 text-center border border-gray-200 dark:border-gray-700 overflow-hidden relative">
      {/* Realistic clock icon */}
      <div className="flex justify-center mb-4">
        <RealisticClockIcon className="w-16 h-16 sm:w-20 sm:h-20" hours={now.getHours()} minutes={now.getMinutes()} seconds={now.getSeconds()} />
      </div>

      {/* Result Title */}
      <h3 className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 mb-4">
        Result – {examTypeLabel(item.exam_type)} {item.year}
      </h3>
      
      {/* TIME REMAINING Label */}
      <p className="text-base sm:text-lg font-bold text-green-600 dark:text-green-400 tracking-wide uppercase mb-4">
        Time Remaining
      </p>
      
      {/* BIG RED COUNTDOWN NUMBERS — slow cinematic breathing zoom for the
          whole countdown; a calm, professional pulse, not a jarring blink. */}
      <motion.div
        className="flex items-center justify-center gap-3 sm:gap-4 mb-5"
        animate={isRunning ? { scale: [1, 1.055, 1] } : { scale: 1 }}
        transition={isRunning ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
      >
        {timeLeft.d > 0 && (
          <div className="flex flex-col items-center">
            <span className="text-4xl sm:text-6xl md:text-7xl font-black text-red-600 dark:text-red-500 tabular-nums">
              {PAD(timeLeft.d)}<span className="text-xl sm:text-3xl md:text-4xl">d</span>
            </span>
          </div>
        )}
        <div className="flex flex-col items-center">
          <span className="text-4xl sm:text-6xl md:text-7xl font-black text-red-600 dark:text-red-500 tabular-nums">
            {PAD(timeLeft.h)}<span className="text-xl sm:text-3xl md:text-4xl">h</span>
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-4xl sm:text-6xl md:text-7xl font-black text-red-600 dark:text-red-500 tabular-nums">
            {PAD(timeLeft.m)}<span className="text-xl sm:text-3xl md:text-4xl">m</span>
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-4xl sm:text-6xl md:text-7xl font-black text-red-600 dark:text-red-500 tabular-nums">
            {PAD(timeLeft.s)}<span className="text-xl sm:text-3xl md:text-4xl">s</span>
          </span>
        </div>
      </motion.div>
      
      {/* Announcement Date */}
      <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
        Announced on {formattedDate}
      </p>
    </div>
  );
}

// ── Banner shown above results when some are pending publish ──────────────────
// REDESIGNED: Clean layout without extra header - just shows the countdown card
function ScheduledResultsBanner() {
  const { data: scheduled = [] } = useScheduledPublishes();
  if (!scheduled.length) return null;
  return (
    <div className="mb-6 space-y-4">
      {scheduled.map((item, i) => (
        <CountdownCard key={`${item.publish_at}-${i}`} item={item} />
      ))}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Search, Trophy, ExternalLink, AlertCircle, Share2 } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { supabase } from "@/lib/supabase";
import { withRetry } from "@/lib/retrySupabase";

// ── fetch() retry for the BISE Peshawar proxy call ──────────────────────────
// A raw fetch() to /api/bisep-proxy has no retry of its own — on a slow or
// flaky mobile connection, a single dropped packet or gateway hiccup used to
// fall straight through to the catch block, showing "No Result Found" even
// though the student genuinely has a result. This gives it 2 short retries
// (fast — this is a foreground search a student is actively waiting on)
// before giving up for real.
async function fetchWithRetryFn(url: string, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      // Treat gateway/server errors as retryable too — not just network
      // failures — since Vercel cold-starts can surface as a 502/504.
      if (resp.ok || (resp.status < 500 && resp.status !== 429)) return resp;
      lastErr = new Error(`HTTP ${resp.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { Loader2, FileText } from "lucide-react";
// Report Card bulk-result generator (password-gated, opens modal)
import ReportCardButton from "@/components/ReportCard";
import toast from "react-hot-toast";
// AI Summary card removed from the results UI per site-owner request.
// SEO content section — visible on-page FAQ + keyword-rich body copy.
// Renders BELOW the result search box, so the existing UX is untouched.
// Mirrors the JSON-LD stack defined in RouteSEOInjector.tsx for /results.
import ResultsSeoContent from "@/components/seo/ResultsSeoContent";
// Live BISEP exam title + countdown — replaces the old build-time
// VITE_BISEP_EXAM_TITLE env var. Polls /api/bisep-proxy?mode=current hourly.
import { useBisepCurrentExam, FALLBACK_TITLE } from "@/hooks/useBisepCurrentExam";
import { examTypeLabel } from "@/utils/examTypeLabel";
// ── Beautiful shareable marks-card generator ────────────────────────────
// Turns any displayed result (school or BISE Peshawar) into a professional,
// school-branded PNG and hands it to the OS share sheet (WhatsApp etc.);
// the caption always carries the homepage Results link.
import {
  shareSchoolResultCard,
  shareBiseResultCard,
  toastShareOutcome,
} from "@/utils/shareResultCard";
// ── Result Reveal Theater — cinematic curtain-lift / scratch-card moment ────
// Shown ONCE after a successful search, always skippable, sound muted by
// default, reduced-motion aware. The full result cards below are untouched.
import ResultRevealOverlay, { type RevealResultData } from "@/components/results/ResultReveal";
import { Sparkles } from "lucide-react";

// ── BISE Peshawar live title (replaces the old static constant) ─────────────
// Previously: `const BISEP_EXAM_TITLE = import.meta.env.VITE_BISEP_EXAM_TITLE || "..."`
// — a build-time value that was always out of date vs. what BISEP was actually
// serving on cloud.bisep.edu.pk.
//
// Now: the `BiseResultSearch` component (below) calls `useBisepExamTitle()`
// to get the live title from BISEP's homepage, polled hourly. The
// `BISEP_PORTAL_URL` constant is unchanged.
//
// The old `BISEP_EXAM_TITLE` constant is kept as a thin alias to
// `FALLBACK_TITLE` so any other code that imported it still compiles,
// but the live UI uses the hook output.
const BISEP_EXAM_TITLE = FALLBACK_TITLE;
const BISEP_PORTAL_URL = "https://cloud.bisep.edu.pk/";



// ── Inline Result Card Search ──────────────────────────────────────────────────
// This mirrors `ResultCardTab.tsx` (the User Dashboard → Results → Result Card
// tab) exactly, so the homepage Result Card behaves the same way:
//   • Subject-wise marks with progress bars
//   • Fallback exam_roll_no lookup via exam_roll_sessions + exam_roll_numbers
//   • Client-side class position (#N) — admin never persists the column
//   • Client-side whole-school rank (Trophy badge) — scoped per exam_type
// Previously this homepage variant showed only the totals row, never the
// per-subject breakdown, and never computed rank/position — so the two
// "Result Card" surfaces disagreed. They now match.
interface SubjectMark { obtained: number; total: number; }
interface RCResult {
  id: string;
  student_id: string;
  class: string;
  exam_type: string;
  year: number;
  total_marks: number;
  obtained_marks: number;
  percentage: number;
  grade: string | null;
  is_pass: boolean;
  remarks: string | null;
  exam_roll_no: string | null;
  position: number | null;
  subject_marks: Record<string, SubjectMark> | null;
  students: { full_name: string; roll_number: string; father_name: string | null; photo_url: string | null; class: string; } | null;
  total_students?: number | null;
  // Whole-school rank for the same exam_type + year (not just class rank).
  // Computed client-side because admin never persists this column.
  school_rank?: number | null;
}

// Whole-school rank pools ALL published classes together for a given
// exam_type + year — e.g. if admin publishes classes 6,7,8,9,10 at once,
// rank #1 is the single best percentage across all of them, not split into
// a separate 6-8 pool and a separate 9-10 pool. (Previously split via
// RC_CLASSES_BY_EXAM_TYPE, causing rank to look "wrong" when all classes
// were published together — fixed per request.)
const RC_ALL_CLASSES = ["6", "7", "8", "9", "10"];

const gradeFromPct = (pct: number) => {
  if (pct >= 90) return "A+"; if (pct >= 80) return "A";
  if (pct >= 60) return "B"; if (pct >= 45) return "C";
  if (pct >= 33) return "D"; return "Fail";
};

// NOTE: buildDMC() and the "Download DMC as PDF" button were removed from
// ResultCardSearch — the public homepage Result Card is now view-only
// (non-downloadable). The standalone /result-card page (ResultCard.tsx) is
// unaffected and still offers DMC download for whoever has that direct link.

// ── Latest published exam (for the page title before any search) ──────────────
// Mirrors ResultCardTab.tsx: shows which exam's results are currently
// available, e.g. "Result - Final Semester 2026", even before a search.
function useLatestPublishedExam() {
  return useQuery({
    queryKey: ["latest-published-exam"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("exam_type, year, created_at")
        .eq("is_published", true)
        .order("year", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

const ResultCardSearch = () => {
  // useSchoolSettings / school object removed — they were only used by the
  // DMC download button, which has been removed so the public homepage
  // Result Card is view-only (non-downloadable).
  const [searchRoll, setSearchRoll] = useState("");
  const [searched, setSearched]     = useState(false);
  const [searching, setSearching]   = useState(false);
  const [rcResults, setRcResults]   = useState<RCResult[]>([]);
  const { data: latestExam } = useLatestPublishedExam();
  // ── Share Result — generates a beautiful school-branded marks-card image
  // and hands it to the OS share sheet (WhatsApp etc.). The caption always
  // carries the website's homepage Results link.
  const [sharingId, setSharingId] = useState<string | null>(null);
  // ── Result Reveal Theater — opens after a successful search; `revealKey`
  // remounts the overlay so "Replay reveal" restarts the experience fresh.
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealKey, setRevealKey] = useState(0);
  // Closing the reveal (X / back, or "View Full Result Card") should land
  // the student ON the result card below, not wherever the page happened
  // to be scrolled before the overlay opened.
  const resultsAnchorRef = useRef<HTMLDivElement | null>(null);
  const closeReveal = () => {
    setRevealOpen(false);
    requestAnimationFrame(() => {
      resultsAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleShareResult = async (r: RCResult) => {
    setSharingId(r.id);
    const outcome = await shareSchoolResultCard({
      studentName: r.students?.full_name || "Student",
      className: String(r.class),
      examLabel: `${examTypeLabel(r.exam_type)} ${r.year}`,
      rollNo: r.exam_roll_no || r.students?.roll_number || "—",
      totalMarks: r.total_marks,
      obtainedMarks: r.obtained_marks,
      percentage: r.percentage,
      grade: r.grade || gradeFromPct(r.percentage),
      isPass: r.is_pass,
      schoolRank: r.school_rank ?? null,
      classPosition: r.position ?? null,
      subjects: Object.entries(r.subject_marks ?? {})
        .filter(([, m]) => m && typeof m.obtained === "number" && typeof m.total === "number" && !(m.obtained === 0 && m.total === 0))
        .map(([name, m]) => ({ name, obtained: m.obtained, total: m.total })),
      photoUrl: r.students?.photo_url ?? null,
    });
    toastShareOutcome(outcome);
    setSharingId(null);
  };

  const handleReset = () => {
    setSearchRoll("");
    setSearched(false);
    setRcResults([]);
    setRevealOpen(false);
  };

  const handleSearch = async () => {
    if (!searchRoll.trim()) { toast.error("Enter your exam roll number"); return; }
    setSearching(true); setSearched(false);

    try {
      const query = supabase.from("results")
        .select("id,student_id,class,exam_type,year,total_marks,obtained_marks,percentage,grade,is_pass,remarks,exam_roll_no,position,subject_marks,students(full_name,roll_number,father_name,photo_url,class)")
        .eq("is_published", true)
        .eq("exam_roll_no", searchRoll.trim())
        .order("year", { ascending: false });

      const { data, error } = await withRetry(() => query.limit(10));
      if (error) throw error;
      let rows = (data ?? []) as unknown as RCResult[];

      // ── Fallback: fill in exam_roll_no from exam_roll_numbers table ──────
      // A result row can have a blank exam_roll_no even though a roll number
      // exists for the student. exam_roll_numbers is scoped by session_id,
      // and each session has its own exam_year + exam_term, so we match
      // through exam_roll_sessions on year + term + class + student rather
      // than just student_id + class. (Mirrors ResultCardTab.tsx.)
      const missing = rows.filter(r => !r.exam_roll_no && r.student_id && r.class);
      if (missing.length > 0) {
        const years = Array.from(new Set(missing.map(r => r.year)));
        const terms = Array.from(new Set(missing.map(r => r.exam_type)));
        const { data: sessions } = await withRetry(() => supabase
          .from("exam_roll_sessions")
          .select("id, exam_year, exam_term")
          .in("exam_year", years)
          .in("exam_term", terms));

        if (sessions?.length) {
          const { data: rolls } = await withRetry(() => supabase
            .from("exam_roll_numbers")
            .select("student_id, class, exam_roll_no, session_id")
            .in("session_id", sessions.map(s => s.id)));

          if (rolls?.length) {
            const sessionKey = (id: string) => {
              const s = sessions.find(s => s.id === id);
              return s ? `${s.exam_year}|${s.exam_term}` : "";
            };
            rows = rows.map(r => {
              if (r.exam_roll_no) return r;
              // Primary: same student_id + class + session year/term
              let match = rolls.find(rl =>
                rl.student_id === r.student_id &&
                rl.class === r.class &&
                sessionKey(rl.session_id) === `${r.year}|${r.exam_type}`
              );
              // Fallback: same student_id + session year/term, ignore class
              // (covers cases where the roll was issued for a slightly
              // different class label, e.g. "8" vs "8th")
              if (!match) {
                match = rolls.find(rl =>
                  rl.student_id === r.student_id &&
                  sessionKey(rl.session_id) === `${r.year}|${r.exam_type}`
                );
              }
              return match ? { ...r, exam_roll_no: match.exam_roll_no } : r;
            });
          }
        }
      }

      // ── Compute Rank + Class Position client-side ──────────────────────────
      // The `position` column on the results table is never persisted by the
      // admin panel (AdminResults.tsx computes rank purely client-side), so
      // we replicate that same logic here: for each class/exam/year group,
      // fetch ALL published results, dedupe by student (keep HIGHEST
      // percentage), sort by percentage desc, and rank = index + 1.
      //
      // CRITICAL: dedupe by HIGHEST PERCENTAGE ONLY — do NOT use
      // `|| r.created_at > existing.created_at`. The old `||` logic meant a
      // newer-but-lower-percentage row would replace a higher-percentage row,
      // which then ranked the student at a lower position than they earned.
      // (Mirrors the dedupe in AdminDMCs.tsx schoolRankMap.)
      const groups = Array.from(new Set(rows.map(r => `${r.class}|${r.exam_type}|${r.year}`)));
      const rankMaps: Record<string, { rank: Map<string, number>; total: number }> = {};

      await Promise.all(groups.map(async (g) => {
        const [cls, examType, year] = g.split("|");
        const { data: groupRows, error: groupErr } = await withRetry(() => supabase
          .from("results")
          .select("id,student_id,percentage,created_at")
          .eq("class", cls)
          .eq("exam_type", examType)
          .eq("year", Number(year))
          .eq("is_published", true));

        if (groupErr) {
          console.error("Rank lookup failed for group", g, groupErr);
          rankMaps[g] = { rank: new Map(), total: 0 };
          return;
        }

        const list = groupRows || [];
        const seen = new Map<string, typeof list[0]>();
        for (const r of list) {
          // Keep the row with the HIGHEST percentage per student. Ties (same
          // percentage) keep whichever was seen first — doesn't matter for
          // ranking because both get the same sort key.
          if (!seen.has(r.student_id) || r.percentage > seen.get(r.student_id)!.percentage) {
            seen.set(r.student_id, r);
          }
        }
        const deduped = Array.from(seen.values()).sort((a, b) => b.percentage - a.percentage);
        const rankMap = new Map<string, number>();
        deduped.forEach((r, i) => rankMap.set(r.student_id, i + 1));
        rankMaps[g] = { rank: rankMap, total: deduped.length };
      }));

      rows = rows.map(r => {
        const key = `${r.class}|${r.exam_type}|${r.year}`;
        const g = rankMaps[key];
        return {
          ...r,
          position: g?.rank.get(r.student_id) ?? null,
          total_students: g?.total ?? null,
        };
      });

      // ── Compute WHOLE-SCHOOL rank (Trophy badge) ──────────────────────────
      // Rank pools by YEAR ONLY — not exam_type. Classes 6-8 store exam_type
      // as "1st/2nd Semester" and classes 9-10 as "Annual-I/II" (different
      // label sets, required for other logic — see AdminResults.tsx), but
      // that label must NOT define the rank pool. Per explicit requirement:
      // whatever classes the admin selects together in Schedule Publish
      // (e.g. 6,7,8,9,10 all at once) must rank as ONE pool. `year` is the
      // only value that reliably ties a publish batch together once
      // publish_at is cleared to null after publishing.
      //
      // CRITICAL: same dedupe-by-highest-percentage fix as the class position
      // block above — the old `|| r.created_at > existing.created_at` logic
      // was the root cause of "Rank shows completely wrong while Class
      // position shows accurate" — the school rank pool is larger so the bug
      // manifested more often there.
      const examGroups = Array.from(new Set(rows.map(r => `${r.year}`)));
      const schoolRankMaps: Record<string, Map<string, number>> = {};

      await Promise.all(examGroups.map(async (g) => {
        const year = g;
        const classScope = RC_ALL_CLASSES;
        const { data: groupRows, error: groupErr } = await withRetry(() => supabase
          .from("results")
          .select("id,student_id,percentage,created_at")
          .eq("year", Number(year))
          .in("class", classScope)
          .eq("is_published", true));

        if (groupErr) {
          console.error("School-wide rank lookup failed for group", g, groupErr);
          schoolRankMaps[g] = new Map();
          return;
        }

        const list = groupRows || [];
        const seen = new Map<string, typeof list[0]>();
        for (const r of list) {
          // Keep the row with the HIGHEST percentage per student — same fix
          // as the class position block above.
          if (!seen.has(r.student_id) || r.percentage > seen.get(r.student_id)!.percentage) {
            seen.set(r.student_id, r);
          }
        }
        const deduped = Array.from(seen.values()).sort((a, b) => b.percentage - a.percentage);
        const rankMap = new Map<string, number>();
        deduped.forEach((r, i) => rankMap.set(r.student_id, i + 1));
        schoolRankMaps[g] = rankMap;
      }));

      rows = rows.map(r => {
        const key = `${r.year}`;
        const rankMap = schoolRankMaps[key];
        return {
          ...r,
          school_rank: rankMap?.get(r.student_id) ?? null,
        };
      });

      setRcResults(rows);
      // Cinematic reveal for a successful lookup — covers the FIRST (latest)
      // result; full cards stay below, fully functional, always skippable.
      if (rows.length > 0) {
        setRevealKey(k => k + 1);
        setRevealOpen(true);
      }
    } catch { toast.error("Search failed. Try again."); }

    setSearched(true); setSearching(false);
  };

  return (
    <div>
      <h2 className="text-xl sm:text-2xl font-heading font-bold text-blue-600 text-center leading-snug mb-6">
        {rcResults.length > 0
          ? `Result - ${examTypeLabel(rcResults[0].exam_type)} ${rcResults[0].year}`
          : latestExam
            ? `Result - ${examTypeLabel(latestExam.exam_type)} ${latestExam.year}`
            : "Result"}
      </h2>

      <div className="bg-card rounded-2xl shadow-elevated p-5 mb-6 border border-border">
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Roll No</label>
            <input value={searchRoll} onChange={e => setSearchRoll(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="e.g. 123456"
              inputMode="numeric"
              pattern="\d*"
              autoComplete="off"
              className="w-full rounded-xl border border-blue-200 bg-background px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <div className="flex items-stretch gap-2">
            <button onClick={handleSearch} disabled={searching}
              className="flex-1 min-w-0 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 border border-blue-500 dark:border-blue-400 bg-white dark:bg-background text-blue-600 dark:text-blue-400 shadow-sm hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:shadow-card active:scale-[0.98] transition-all duration-200 disabled:opacity-60">
              {searching ? <><Loader2 className="w-4 h-4 animate-spin" />Searching...</> : <><Search className="w-4 h-4" />Search Result</>}
            </button>
            <button onClick={handleReset}
              className="shrink-0 px-5 font-medium py-3 rounded-xl border border-blue-500 dark:border-blue-400 bg-white dark:bg-background text-blue-600 dark:text-blue-400 shadow-sm hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:shadow-card active:scale-[0.98] transition-all duration-200">
              Reset
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {searched && (
          <motion.div ref={resultsAnchorRef} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {rcResults.length === 0 ? (
              <div className="bg-card rounded-2xl p-8 text-center shadow-card border border-border">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="font-heading font-semibold text-foreground">No Result Found</h3>
                <p className="text-sm text-muted-foreground mt-1">Check your exam roll number. Results must be added by admin.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground font-medium">
                  Found {rcResults.length} result{rcResults.length > 1 ? "s" : ""}
                  <button
                    onClick={() => { setRevealKey(k => k + 1); setRevealOpen(true); }}
                    className="ml-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#B8860B] hover:text-[#8f6a0d] hover:underline underline-offset-4 transition-colors align-middle">
                    <Sparkles className="w-3 h-3" /> Replay the reveal
                  </button>
                </p>
                {rcResults.map(r => (
                  <motion.div key={r.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                    className="bg-card rounded-2xl shadow-elevated overflow-hidden border border-border">

                    <div className="result-hero-blue px-5 py-5 text-white relative overflow-hidden">
                      {/* premium decorations — gold hairline + dual orbs */}
                      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#E3B341] to-transparent" />
                      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                      <div className="absolute -bottom-16 -left-12 w-44 h-44 rounded-full bg-[#E3B341]/20 blur-2xl pointer-events-none" />
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 relative z-10">
                        <div className="flex items-center gap-4 min-w-0">
                          {r.students?.photo_url
                            ? <img src={r.students.photo_url} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-[#FDE68A] shadow-lg shrink-0" />
                            : <div className="w-14 h-14 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-xl font-black border-2 border-[#E3B341]/80 shadow-lg shrink-0">{(r.students?.full_name || "S").charAt(0)}</div>
                          }
                          <div className="min-w-0 flex-1">
                            <span className="inline-flex items-center bg-white/15 backdrop-blur-sm border border-white/25 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase mb-1 max-w-full whitespace-normal break-words leading-tight">
                              {examTypeLabel(r.exam_type)} {r.year} · Class {r.class}
                            </span>
                            <h3 className="font-heading font-extrabold text-lg sm:text-xl drop-shadow-sm break-words">{r.students?.full_name}</h3>
                          </div>
                        </div>
                        {r.exam_roll_no && (
                          <div className="text-right sm:shrink-0 self-start sm:self-auto bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-3.5 py-2">
                            <p className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">Exam Roll No</p>
                            <p className="font-mono font-extrabold text-xl tracking-wider text-[#FDE68A]">{r.exam_roll_no}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
                      {[
                        { l: "Total", v: r.total_marks, c: "text-foreground" },
                        { l: "Obtained", v: r.obtained_marks, c: "text-blue-600 dark:text-blue-400" },
                        { l: "%", v: `${r.percentage}%`, c: "text-emerald-600 dark:text-emerald-400" },
                        { l: "Grade", v: r.grade || "—", c: "text-amber-600 dark:text-amber-400" },
                      ].map(item => (
                        <div key={item.l} className="p-3 sm:p-4 text-center">
                          <p className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-semibold">{item.l}</p>
                          <p className={`text-lg sm:text-2xl font-extrabold ${item.c}`}>{item.v}</p>
                        </div>
                      ))}
                    </div>

                    {(() => {
                      // Show subject-wise marks whenever they actually exist
                      // on the row. Filters out subjects where both obtained
                      // AND total are 0 (those were not part of this result).
                      // Matches the User Dashboard ResultCardTab behavior.
                      const entries = r.subject_marks
                        ? Object.entries(r.subject_marks).filter(
                            ([, m]) => m && typeof m === "object" && typeof m.obtained === "number" && typeof m.total === "number" && !(m.obtained === 0 && m.total === 0)
                          )
                        : [];
                      const hasSubjects = entries.length > 0;
                      return hasSubjects ? (
                        <div className="px-5 py-4 border-b border-border space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject-wise Marks</p>
                          {entries.map(([sub, m], i) => {
                            const pct = m.total > 0 ? Math.round((m.obtained / m.total) * 100) : 0;
                            const failed = pct < 33;
                            return (
                              <div key={sub} className="flex items-center gap-3">
                                <span className="text-sm text-foreground w-32 shrink-0 truncate font-medium" title={sub}>{sub}</span>
                                <div className="flex-1 bg-secondary rounded-full h-2.5 overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(pct, 100)}%` }}
                                    transition={{ duration: 0.7, delay: 0.06 * i, ease: "easeOut" }}
                                    className={`h-full rounded-full ${failed ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-blue-600 to-sky-400"}`}
                                  />
                                </div>
                                <span className="text-sm font-bold text-foreground w-16 text-right shrink-0 tabular-nums">{m.obtained}/{m.total}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="px-5 py-4 border-b border-border">
                          <p className="text-xs text-muted-foreground text-center bg-secondary/40 rounded-lg py-3">
                            Subject-wise marks not entered for this result. See totals above.
                          </p>
                        </div>
                      );
                    })()}

                    {/* Rank · Class Position · Result — MOBILE FIX.
                        This strip used three different styles in a
                        justify-between/flex-wrap row (amber pill left, PASS
                        pill right, plain "Class Position: #N" text that
                        wrapped alone onto a second line) — on phones it
                        rendered scattered and unbalanced. Rebuilt as one
                        symmetric 3-column strip with divide-x, mirroring the
                        TOTAL/OBTAINED/%/GRADE row above: every value sits
                        centered in its own cell on every screen width. */}
                    <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                      <div className="p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-center gap-1 whitespace-nowrap">
                          <Trophy className="w-3 h-3 text-amber-500" />
                          {/* Trophy = whole-school rank, not class rank. */}
                          Rank
                        </p>
                        <p className="text-base sm:text-xl font-extrabold text-amber-600 dark:text-amber-400">
                          {r.school_rank ? `#${r.school_rank}` : "—"}
                        </p>
                      </div>
                      <div className="p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">
                          Class Position
                        </p>
                        <p className="text-base sm:text-xl font-extrabold text-blue-600 dark:text-blue-400">
                          {/* Class position shown as "#N" — no "of M" suffix. */}
                          {r.position ? `#${r.position}` : "—"}
                        </p>
                      </div>
                      <div className="p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">
                          Result
                        </p>
                        <p className={`text-base sm:text-xl font-extrabold ${r.is_pass ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {r.is_pass ? "PASS" : "FAIL"}
                        </p>
                      </div>
                    </div>
                    {/* DMC download button removed — the public homepage
                        Result Card is view-only (non-downloadable). The
                        standalone /result-card page still offers DMC download. */}

                    {/* ── Share bar — premium gradient action ──────────
                        Generates the school-branded marks-card image and
                        hands it to the OS share sheet; the caption always
                        carries the homepage Results link. */}
                    <div className="px-5 py-4 bg-gradient-to-r from-blue-50/70 via-transparent to-sky-50/70 dark:from-blue-950/20 dark:via-transparent dark:to-sky-950/10">
                      <button
                        onClick={() => handleShareResult(r)}
                        disabled={sharingId === r.id}
                        className="sheen w-full rounded-2xl py-3.5 px-5 font-bold text-white bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-60 disabled:hover:translate-y-0"
                      >
                        <span className="relative z-10 flex items-center justify-center gap-2.5 text-sm sm:text-base">
                          {sharingId === r.id
                            ? <><Loader2 className="w-5 h-5 animate-spin" /> Preparing your card…</>
                            : <><Share2 className="w-5 h-5" /> Share Result<span className="hidden sm:inline text-xs font-semibold text-white/70"> · beautiful marks card + website link</span></>}
                        </span>
                      </button>
                      <p className="text-center text-[11px] text-muted-foreground mt-2">
                        Shares a professional marks-card image with your name, marks &amp; this website — perfect for WhatsApp.
                      </p>
                    </div>
                  </motion.div>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Result Reveal Theater — curtain lift / scratch card ──
          Pure overlay: one-tap skip, sound muted by default, reduced-motion
          aware. Closing it lands back on the full result cards below. */}
      {rcResults.length > 0 && (() => {
        const r0 = rcResults[0];
        const revealData: RevealResultData = {
          studentName: r0.students?.full_name || "Student",
          className: String(r0.class),
          examLabel: `${examTypeLabel(r0.exam_type)} ${r0.year}`,
          rollNo: r0.exam_roll_no,
          obtained: r0.obtained_marks,
          total: r0.total_marks,
          percentage: r0.percentage,
          grade: r0.grade || gradeFromPct(r0.percentage),
          isPass: r0.is_pass,
          subjects: Object.entries(r0.subject_marks ?? {})
            .filter(([, m]) => m && typeof m === "object" && typeof m.obtained === "number" && typeof m.total === "number" && !(m.obtained === 0 && m.total === 0))
            .map(([name, m]) => ({ name, obtained: m.obtained, total: m.total })),
          photoUrl: r0.students?.photo_url ?? null,
          // FIX: the reveal card (Grand Reveal + Scratch) showed the same
          // marks as the full card but silently dropped Rank and Class
          // Position. Pass BOTH so SummaryCard can badge them — school_rank
          // (whole-school Trophy rank) and position (class rank).
          schoolRank: r0.school_rank ?? null,
          classPosition: r0.position ?? null,
        };
        return (
          <ResultRevealOverlay
            key={revealKey}
            open={revealOpen}
            onClose={closeReveal}
            data={revealData}
          />
        );
      })()}
    </div>
  );
};

// ── Has any school result been published? ───────────────────────────────────
// Single count(*) on published rows. Used by the main Results page to
// decide between SCHOOL mode and BISE Peshawar fallback mode. Cached for
// 60s on the client to avoid re-querying on every render.
function useHasPublishedSchoolResults() {
  return useQuery<boolean>({
    queryKey: ["has-published-school-results"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("results")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

// ── BISE Peshawar result search (fallback mode) ─────────────────────────────
// Rendered when NO school result has been published by the admin. Searches
// BISE Peshawar's board result via our /api/bisep-proxy serverless function
// (which in turn calls cloud.bisep.edu.pk with realistic browser headers
// to bypass Cloudflare's challenge, parses the returned HTML, and caches
// the parsed result for 24h on the edge).
// ── Thin blue subject bar (BISE Peshawar table) ─────────────────────────
// BISEP does NOT send a per-subject maximum, so we never invent one. The
// bar length is the subject's OBTAINED marks (theory + practical, strict
// numbers only) relative to the highest obtained subject on this card.
// Red = a failed part (BISEP's own fail flag). Non-numeric cells (blank /
// absent) render an empty track — never a guessed length.
function bisePartNumber(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  return Number(t);
}
function biseSubjectObtained(s: { theory: string; practical: string }): number | null {
  const th = bisePartNumber(s.theory);
  const pr = bisePartNumber(s.practical);
  if (th === null && pr === null) return null;
  return (th ?? 0) + (pr ?? 0);
}
function SubjectBar({ pct, fail, delay }: { pct: number | null; fail: boolean; delay: number }) {
  const w = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden" role="presentation">
      {pct !== null && (
        <motion.div
          className={`h-full rounded-full ${fail ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-blue-600 to-sky-400"}`}
          initial={{ width: 0 }}
          animate={{ width: `${w}%` }}
          transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </div>
  );
}
interface BiseSubject { sr: string; subject: string; theory: string; practical: string; theory_fail?: boolean; practical_fail?: boolean; }
interface BiseResult {
  roll_no: string;
  name: string;
  father_name: string;
  marks: string;
  grade: string;
  remarks: string;
  collect_dmc_from: string;
  subjects: BiseSubject[];
}
interface BiseProxyResponse {
  found: boolean;
  message?: string;
  error?: string;
  // When found === true, the result fields are spread onto the response:
  roll_no?: string;
  name?: string;
  father_name?: string;
  marks?: string;
  grade?: string;
  remarks?: string;
  collect_dmc_from?: string;
  subjects?: BiseSubject[];
}

// ── Small realistic clock icon + label + big digital countdown ─────────
// Wraps RealisticClockIcon (same small alarm-clock design used on Merit
// List / Roll Slip) together with the "TIME REMAINING" label and the big
// red HH:MM:SS digits, all driven off ONE shared ticking interval so the
// clock hands and the digits always agree.
function BisepClockAndCountdown({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [hms, setHms] = useState({ h: 0, m: 0, s: 0 });
  // Real current time-of-day, for the analog clock face — separate from
  // the remaining-duration digits below it. See note on RealisticClockIcon:
  // the hands must read an actual clock time (e.g. ticking normally toward
  // 3:00:00 PM), not the countdown duration.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const calc = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      setNow(new Date());
      if (diff <= 0) {
        setTimeLeft("00h 00m 00s");
        setIsRunning(false);
        setHms({ h: 0, m: 0, s: 0 });
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const ss = String(s).padStart(2, "0");
      setTimeLeft(d > 0 ? `${d}d ${hh}h ${mm}m ${ss}s` : `${hh}h ${mm}m ${ss}s`);
      setHms({ h, m, s });
      setIsRunning(true);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [targetDate]);

  return (
    <>
      <span className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
        <RealisticClockIcon className="w-14 h-14" hours={now.getHours()} minutes={now.getMinutes()} seconds={now.getSeconds()} />
      </span>
      <p className="text-sm font-bold text-green-600 dark:text-green-400 tracking-wide uppercase mb-3">
        Time Remaining
      </p>
      <motion.p
        className="font-mono font-extrabold text-red-600 dark:text-red-500 text-3xl sm:text-4xl tracking-wider"
        animate={isRunning ? { scale: [1, 1.055, 1] } : { scale: 1 }}
        transition={isRunning ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
      >
        {timeLeft}
      </motion.p>
    </>
  );
}



const BiseResultSearch = () => {
  // ── Live BISEP exam title + countdown ───────────────────────────────
  // Polls /api/bisep-proxy?mode=current every 15s (1s near a countdown's
  // end). Falls back to the env var / hardcoded default title if the
  // proxy is down or BISEP's homepage structure changes — so the page
  // always shows SOMETHING sensible.
  const { data: bisepMeta, isLoading: bisepLoading } = useBisepCurrentExam();
  const liveTitle = bisepMeta?.exam_title || BISEP_EXAM_TITLE;
  // FIX: previously this defaulted to `true` while the first fetch was
  // still in flight, which made the page briefly render the Roll No /
  // Search / Reset card (wrong — a countdown was actually active) before
  // flipping to the real countdown card 3-4s later once data arrived.
  // That flip was the "cached page then real page" flash reported by the
  // user — it isn't caching at all, it's a wrong assumption made before
  // we actually know the state. Now `isLive` is only ever `true` or
  // `false` once we KNOW; while loading, neither the search card nor the
  // countdown card renders — a neutral skeleton does instead — so there
  // is nothing wrong to flash.
  const isLive = bisepMeta?.is_live ?? false;
  const countdownDate = bisepMeta?.countdown_date;
  const countdownText = bisepMeta?.countdown_text;

  const [searchRoll, setSearchRoll] = useState("");
  const [searched, setSearched]     = useState(false);
  const [searching, setSearching]   = useState(false);
  const [result, setResult]         = useState<BiseResult | null>(null);
  const [notFoundMsg, setNotFoundMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  // ── Share Result (BISE Peshawar) — board-styled marks-card image via the
  // OS share sheet; the caption carries the GHS Babi Khel homepage link.
  const [sharingBise, setSharingBise] = useState(false);
  // ── Result Reveal Theater (BISE Peshawar) — the SAME Grand Reveal /
  // Scratch experience the school results get. `revealKey` remounts the
  // overlay so "Replay the reveal" restarts the experience fresh.
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealKey, setRevealKey] = useState(0);
  // Closing the reveal should land the student ON the board result card
  // below, not wherever the page happened to be scrolled before it opened.
  const resultsAnchorRef = useRef<HTMLDivElement | null>(null);
  const closeReveal = () => {
    setRevealOpen(false);
    requestAnimationFrame(() => {
      resultsAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleShareBiseResult = async () => {
    if (!result) return;
    setSharingBise(true);
    const outcome = await shareBiseResultCard({
      examTitle: liveTitle,
      studentName: result.name || "Student",
      fatherName: result.father_name || "—",
      rollNo: result.roll_no,
      marks: result.marks || "",
      grade: result.grade || "",
      remarks: result.remarks || "",
      subjects: result.subjects.map(s => ({
        sr: s.sr,
        subject: s.subject,
        theory: s.theory,
        practical: s.practical,
        theoryFail: s.theory_fail === true,
        practicalFail: s.practical_fail === true,
      })),
    });
    toastShareOutcome(outcome);
    setSharingBise(false);
  };

  const handleReset = () => {
    setSearchRoll("");
    setSearched(false);
    setSearching(false);
    setResult(null);
    setNotFoundMsg(null);
    setErrorMsg(null);
    setRevealOpen(false);
  };

  const handleSearch = async () => {
    const roll = searchRoll.trim();
    if (!roll) { toast.error("Enter your BISE roll number"); return; }
    if (!/^\d{4,10}$/.test(roll)) { toast.error("Roll number must be 4–10 digits"); return; }

    setSearching(true); setSearched(false);
    setResult(null); setNotFoundMsg(null); setErrorMsg(null);

    try {
      const resp = await fetchWithRetryFn(`/api/bisep-proxy?roll=${encodeURIComponent(roll)}`);

      // ── Defensive JSON parsing ─────────────────────────────────────
      // The proxy should always return JSON, but Vercel itself can return
      // an HTML error page (502/504 gateway timeouts, function crash
      // pages, etc.) if the function misbehaves. We must NEVER let a
      // malformed response crash the React tree — the top-level
      // ErrorBoundary catches it and shows "Something went wrong",
      // which is exactly the bug we're fixing here. So:
      //   1. Try to parse as JSON. If parsing throws, fall back to a
      //      safe "invalid response" object.
      //   2. If parsing succeeds but yields null/undefined/non-object,
      //      fall back to the same safe object.
      //   3. If we got a valid object, normalize every field we read
      //      from it (default to "" / []) so rendering can never throw
      //      on a missing or null field.
      let raw: unknown = null;
      try {
        raw = await resp.json();
      } catch {
        raw = null;
      }
      const safeRaw: BiseProxyResponse | null =
        (raw && typeof raw === "object")
          ? (raw as BiseProxyResponse)
          : null;
      const data: BiseProxyResponse = safeRaw ?? {
        found: false,
        error: "Invalid response from BISE Peshawar proxy.",
      };

      if (data && data.found === true) {
        // Server returns { found: true, roll_no, name, father_name, marks,
        // grade, remarks, collect_dmc_from, subjects } — re-shape into our
        // BiseResult interface for clean rendering. Every field is
        // normalized to a safe default so a missing/null field on the
        // server side can never crash the client render.
        const safeSubjects = Array.isArray(data.subjects)
          ? data.subjects
              .filter((s): s is BiseSubject =>
                s != null && typeof s === "object"
              )
              .map((s) => ({
                sr:       typeof s.sr       === "string" ? s.sr       : String(s.sr ?? ""),
                subject:  typeof s.subject  === "string" ? s.subject  : String(s.subject  ?? ""),
                theory:   typeof s.theory   === "string" ? s.theory   : String(s.theory   ?? ""),
                practical:typeof s.practical=== "string" ? s.practical: String(s.practical?? ""),
                theory_fail:    s.theory_fail    === true,
                practical_fail: s.practical_fail === true,
              }))
          : [];

        setResult({
          roll_no:          typeof data.roll_no          === "string" ? data.roll_no          : roll,
          name:             typeof data.name             === "string" ? data.name             : "",
          father_name:      typeof data.father_name      === "string" ? data.father_name      : "",
          marks:            typeof data.marks            === "string" ? data.marks            : "",
          grade:            typeof data.grade            === "string" ? data.grade            : "",
          remarks:          typeof data.remarks          === "string" ? data.remarks          : "",
          collect_dmc_from: typeof data.collect_dmc_from === "string" ? data.collect_dmc_from : "",
          subjects:         safeSubjects,
        });
        // Cinematic reveal for the board result too — same Grand Reveal /
        // Scratch moment the school results get. Full board card stays
        // below, fully functional, always skippable.
        setRevealKey(k => k + 1);
        setRevealOpen(true);
      } else if (data && typeof data.message === "string" && data.message) {
        // "Record not Found" — BISE returned a clean "no record" response.
        setNotFoundMsg(data.message);
      } else {
        // Proxy error (BISE down, Cloudflare challenge, parse failure, etc.)
        // UX FIX: don't show a scary technical error ("Could not parse the
        // response...") for what is, from the user's point of view, simply
        // "this roll number has no result yet" (or a transient hiccup while
        // searching). Treat every non-"found" / non-clean-"not found" case
        // the same way the user sees a genuine "not found" — a calm
        // "No Result Found" card — rather than an alarming error panel.
        setNotFoundMsg(
          "No Result Found. Please check your Roll No and try again, or try again in a moment."
        );
      }
    } catch {
      // Network-level failure (DNS, offline, CORS-blocked, etc.). Same UX
      // fix as above — show the calm "No Result Found" state instead of a
      // scary technical error, since the user can't tell the difference
      // between "no result" and "connection hiccup" anyway.
      setNotFoundMsg(
        "No Result Found. Please check your internet connection and try again."
      );
    }

    setSearched(true); setSearching(false);
  };

  // ── Result Reveal data (BISE Peshawar) ───────────────────────────
  // Maps the board's result shape onto the shared RevealResultData:
  //   • marks arrive as a raw string ("455/550") → split into obtained /
  //     total when parseable, otherwise shown as-is via marksLine
  //   • subjects carry theory/practical STRINGS and per-part fail flags →
  //     shown as neat chips in the reveal card (no fake progress bars)
  //   • pass/fail is inferred from those fail flags + the remarks text
  //     (never displayed in red — the reveal stays respectful, no shame)
  let bisepRevealData: RevealResultData | null = null;
  if (result) {
    const mk = /(\d+)\s*\/\s*(\d+)/.exec(result.marks || "");
    const plainNum = mk ? NaN : parseInt((result.marks || "").replace(/[^\d]/g, ""), 10);
    const obtained = mk ? parseInt(mk[1], 10) : (Number.isFinite(plainNum) ? plainNum : null);
    const total = mk ? parseInt(mk[2], 10) : null;
    const percentage = obtained != null && total ? Math.round((obtained / total) * 100) : null;
    const anyPartFailed = result.subjects.some(s => s.theory_fail || s.practical_fail);
    const isPass = !anyPartFailed && !/fail/i.test(result.remarks || "");
    bisepRevealData = {
      studentName: result.name || "Student",
      className: null,
      examLabel: liveTitle,
      rollNo: result.roll_no,
      obtained,
      total,
      percentage,
      grade: result.grade || "—",
      isPass,
      subjects: result.subjects.map(s => ({
        name: s.subject || "Subject",
        obtained: 0,
        total: null,
        theory: s.theory,
        practical: s.practical,
      })),
      photoUrl: null,
      marksLine: result.marks || null,
      remarksLine: result.remarks || null,
    };
  }

  return (
    <div>
      <h2 className="text-xl sm:text-2xl font-heading font-bold text-blue-600 text-center leading-snug mb-2">
        Result - {liveTitle}
      </h2>

      {/* ── Live badge ────────────────────────────────────────────────────
          Only shows the small green "LIVE" pill here. The countdown pill
          was REMOVED from this spot — it duplicated the big red "TIME
          REMAINING" card directly below (same date, same ticking value),
          which is exactly the double-countdown the user reported. The big
          card is now the single source of truth for the countdown display. */}
      {isLive && (
        <div className="flex items-center justify-center gap-2 mb-6 text-xs">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 px-3 py-1 rounded-full font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            BISE Peshawar result is LIVE
          </span>
        </div>
      )}

      {/* ── Loading skeleton (first paint, before we know live/countdown) ──
          FIX for the "shows old card then flips to real card" flash: we no
          longer guess `isLive = true` while data is in flight. Instead,
          for the brief moment before the first /api/bisep-proxy response
          lands, we render a neutral pulsing skeleton — never the actual
          Roll No / Search card, never the countdown card — so there is
          nothing incorrect to visibly swap out once real data arrives.
          On slow connections this skeleton is what's visible instead of a
          wrong page; the instant real data lands, the correct card
          (search OR countdown) renders directly. */}
      {bisepLoading ? (
        <div className="bg-card rounded-2xl shadow-elevated p-8 mb-6 border border-border text-center animate-pulse">
          <div className="h-3 w-32 bg-muted rounded mx-auto mb-4" />
          <div className="h-9 w-48 bg-muted rounded mx-auto mb-3" />
          <div className="h-3 w-40 bg-muted rounded mx-auto" />
        </div>
      ) : !isLive && countdownDate ? (
        /* ── Big BISEP-style countdown (pre-announcement state) ──────────
            While a countdown is active, the Roll No / Search / Reset card
            is HIDDEN — searching is pointless before BISEP has published
            anything, and showing it invites confusing "No Result Found"
            searches. Instead we show a big, board-style countdown display
            mirroring cloud.bisep.edu.pk's own presentation: a green
            "TIME REMAINING" label with a large red HH:MM:SS below it.
            The moment isLive flips true (picked up within ~1s thanks to
            the adaptive 1s poll in useBisepCurrentExam once the countdown
            nears zero), this block disappears and the search card appears
            automatically — no page refresh needed. */
        <div className="bg-card rounded-2xl shadow-elevated p-8 mb-6 border border-border text-center">
          <BisepClockAndCountdown targetDate={countdownDate} />
          {countdownText && (
            <p className="text-xs text-muted-foreground mt-4">{countdownText}</p>
          )}
        </div>
      ) : (
      <div className="bg-card rounded-2xl shadow-elevated p-5 mb-6 border border-border">
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Roll No</label>
            <input value={searchRoll} onChange={e => setSearchRoll(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="e.g. 703902"
              inputMode="numeric"
              pattern="\d*"
              className="w-full rounded-xl border border-blue-200 bg-background px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <div className="flex items-stretch gap-2">
            <button onClick={handleReset}
              className="shrink-0 px-5 font-medium py-3 rounded-xl border border-blue-500 dark:border-blue-400 bg-white dark:bg-background text-blue-600 dark:text-blue-400 shadow-sm hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:shadow-card active:scale-[0.98] transition-all duration-200">
              Reset
            </button>
            <button onClick={handleSearch} disabled={searching}
              className="flex-1 min-w-0 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 border border-blue-500 dark:border-blue-400 bg-white dark:bg-background text-blue-600 dark:text-blue-400 shadow-sm hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:shadow-card active:scale-[0.98] transition-all duration-200 disabled:opacity-60">
              {searching ? <><Loader2 className="w-4 h-4 animate-spin" />Searching...</> : <><Search className="w-4 h-4" />Search Result</>}
            </button>
          </div>
        </div>
      </div>
      )}

      <AnimatePresence>
        {searched && (
          <motion.div ref={resultsAnchorRef} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {errorMsg ? (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/40 rounded-2xl p-6 text-center">
                <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                <h3 className="font-heading font-semibold text-amber-900 dark:text-amber-200">Couldn't fetch result</h3>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">{errorMsg}</p>
                <a href={`${BISEP_PORTAL_URL}ShowResult.php?Search=RollNo&RollNo=${encodeURIComponent(searchRoll.trim())}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-4 text-xs font-semibold text-amber-900 dark:text-amber-200 underline">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Try directly on BISE Peshawar
                </a>
              </div>
            ) : notFoundMsg ? (
              <div className="bg-card rounded-2xl p-8 text-center shadow-card border border-border">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="font-heading font-semibold text-foreground">No Result Found</h3>
                <p className="text-sm text-muted-foreground mt-1">{notFoundMsg}</p>
              </div>
            ) : result ? (
              <>
                {/* Replay chip — same styling as the school-mode replay */}
                <p className="text-center">
                  <button onClick={() => { setRevealKey(k => k + 1); setRevealOpen(true); }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#B8860B] hover:text-[#8f6a0d] hover:underline underline-offset-4 transition-colors">
                    <Sparkles className="w-3 h-3" /> Replay the reveal
                  </button>
                </p>
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                  className="bg-card rounded-2xl shadow-elevated overflow-hidden border border-border">

                <div className="result-hero-blue px-5 py-5 text-white relative overflow-hidden">
                  {/* premium decorations — gold hairline + dual orbs */}
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#E3B341] to-transparent" />
                  <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                  <div className="absolute -bottom-16 -left-12 w-44 h-44 rounded-full bg-[#E3B341]/20 blur-2xl pointer-events-none" />
                  {/* BISE Peshawar's own results page header pattern: bold
                      title on the left, a "ROLL NUMBER" pill on the right —
                      kept in this site's orange/gold theme instead of BISEP's
                      green. */}
                  <div className="flex items-center justify-between gap-3 relative z-10">
                    <h3 className="font-heading font-extrabold text-lg sm:text-xl drop-shadow-sm">Student Result Details</h3>
                    <div className="text-right shrink-0 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-3.5 py-2">
                      <p className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">Roll Number</p>
                      <p className="font-mono font-extrabold text-xl tracking-wider text-[#FDE68A]">{result.roll_no}</p>
                    </div>
                  </div>
                  <p className="mt-2 relative z-10">
                    <span className="inline-flex items-center bg-white/15 backdrop-blur-sm border border-white/25 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase max-w-full whitespace-normal break-words leading-tight">
                      {liveTitle} · BISE Peshawar
                    </span>
                  </p>
                </div>

                {/* ── Candidate Information — BISE Peshawar's own label/value
                    table pattern (Student Name, Father Name, Roll Number,
                    Marks, Grade, Remarks, Collect DMC From), same orange
                    theme as the rest of this card. */}
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-xs font-bold uppercase tracking-wide text-orange-700 dark:text-orange-400 mb-2">Candidate Information</p>
                  <div className="rounded-xl border border-border overflow-hidden">
                    {[
                      { l: "Student Name", v: result.name || "—" },
                      { l: "Father Name", v: result.father_name || "—" },
                      { l: "Roll Number", v: result.roll_no || "—" },
                      { l: "Marks", v: result.marks || "—", bold: true },
                      { l: "Grade", v: result.grade || "—" },
                      { l: "Remarks", v: result.remarks || "—" },
                      ...(result.collect_dmc_from ? [{ l: "Collect DMC From", v: result.collect_dmc_from, accent: true }] : []),
                    ].map((row, i) => (
                      <div key={row.l} className={`grid grid-cols-[auto,1fr] gap-3 px-3.5 py-2.5 ${i % 2 === 1 ? "bg-secondary/30" : ""} ${i !== 0 ? "border-t border-border" : ""}`}>
                        <span className={`text-xs sm:text-sm font-semibold shrink-0 ${row.accent ? "text-orange-700 dark:text-orange-400" : "text-muted-foreground"}`}>{row.l}</span>
                        <span className={`text-sm text-right sm:text-left break-words ${row.bold ? "font-extrabold text-orange-600 dark:text-orange-400 text-base" : row.accent ? "font-bold text-orange-700 dark:text-orange-400" : "font-semibold text-foreground"}`}>{row.v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {result.subjects.length > 0 ? (
                  <div className="px-5 py-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-orange-700 dark:text-orange-400">Subject Wise Marks</p>
                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-muted-foreground bg-secondary/50 border-b border-border">
                              <th className="py-2.5 pl-3.5 pr-3 font-semibold">#</th>
                              <th className="py-2.5 pr-3 font-semibold">Subject</th>
                              <th className="py-2.5 pr-3 font-semibold w-[26%] sm:w-[34%]">Bar</th>
                              <th className="py-2.5 pr-3 font-semibold text-center">Theory</th>
                              <th className="py-2.5 pr-3.5 font-semibold text-center">Practical</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const obtainedList = result.subjects.map(biseSubjectObtained);
                              const maxObtained = Math.max(0, ...obtainedList.filter((n): n is number => n !== null));
                              return result.subjects.map((s, i) => {
                              const ob = obtainedList[i];
                              const pct = ob === null || maxObtained === 0 ? null : (ob / maxObtained) * 100;
                              return (
                              <tr key={i} className={`${i % 2 === 1 ? "bg-secondary/30" : ""} ${i !== 0 ? "border-t border-border" : ""}`}>
                                <td className="py-2.5 pl-3.5 pr-3 text-muted-foreground">{s.sr}</td>
                                <td className="py-2.5 pr-3 font-semibold text-foreground">{s.subject || "—"}</td>
                                <td className="py-2.5 pr-3 align-middle"><SubjectBar pct={pct} fail={s.theory_fail === true || s.practical_fail === true} delay={0.05 * i} /></td>
                                <td className={`py-2.5 pr-3 text-center font-semibold ${s.theory_fail ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>{s.theory || "—"}</td>
                                <td className={`py-2.5 pr-3.5 text-center font-semibold ${s.practical_fail ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>{s.practical || "—"}</td>
                              </tr>
                              );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground pt-1">Bars compare obtained marks (theory + practical) within this result.</p>
                  </div>
                ) : (
                  <div className="px-5 py-4 border-b border-border">
                    <p className="text-xs text-muted-foreground text-center bg-secondary/40 rounded-lg py-3">
                      Subject-wise marks not available for this result.
                    </p>
                  </div>
                )}

                {/* ── Share bar — premium gradient action ──────────────
                    Generates a board-styled marks-card image with GHS Babi
                    Khel branding; the caption carries the homepage link. */}
                <div className="px-5 py-4 bg-gradient-to-r from-blue-50/70 via-transparent to-sky-50/70 dark:from-blue-950/20 dark:via-transparent dark:to-sky-950/10">
                  <button
                    onClick={handleShareBiseResult}
                    disabled={sharingBise}
                    className="w-full rounded-xl py-2.5 px-5 font-bold text-blue-600 dark:text-blue-400 bg-background border border-blue-300 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all disabled:opacity-60"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2.5 text-sm sm:text-base">
                      {sharingBise
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing your card…</>
                        : <><Share2 className="w-4 h-4" /> Share Result<span className="hidden sm:inline text-xs font-semibold text-blue-600/70 dark:text-blue-400/70"> · beautiful marks card + website link</span></>}
                    </span>
                  </button>
                  <p className="text-center text-[11px] text-muted-foreground mt-2">
                    Shares a professional marks-card image with your marks &amp; this website — perfect for WhatsApp.
                  </p>
                </div>
                </motion.div>
              </>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Result Reveal Theater — BISE Peshawar edition ──
          Same curtain lift / scratch card as school mode: one-tap skip,
          celebration sounds + confetti at the payoff, reduced-motion aware.
          Closing it lands back on the full board result card below. */}
      {bisepRevealData && (
        <ResultRevealOverlay
          key={revealKey}
          open={revealOpen}
          onClose={closeReveal}
          data={bisepRevealData}
        />
      )}
    </div>
  );
};

const Results = () => {
  // ── Decide which search mode to render ────────────────────────────────
  //
  //   1. SCHOOL mode  — admin has published at least one result in the
  //                      admin panel (Manage Result), OR has an active
  //                      schedule pending (publish_at set, in the future).
  //                      The page searches school results by exam roll
  //                      number and shows the school's own result title
  //                      (e.g. "Result - 1st Semester 2026").
  //
  //   2. BISE mode    — no school result has been published AND no school
  //                      schedule is pending. The page falls back to BISE
  //                      Peshawar's board result search.
  //
  // BUG FIX: previously `showBiseMode` only checked `hasSchoolResults`, so
  // BISE Peshawar's search stayed visible and usable for the ENTIRE
  // duration of an active school countdown — the school's own schedule had
  // no effect on this toggle at all. Now, a pending schedule also puts the
  // page in SCHOOL mode (matching the countdown banner above it), so BISE
  // Peshawar disappears the moment a school schedule is set, not just once
  // it actually publishes.
  const hasSchoolResults = useHasPublishedSchoolResults();
  const { data: scheduled = [], isLoading: scheduleLoading } = useScheduledPublishes();
  const hasActiveSchedule = scheduled.length > 0;
  const showBiseMode = hasSchoolResults.data === false && !hasActiveSchedule;
  // FIX: this is the real source of the "old Roll No / Search Result /
  // Reset card flashes for half a second" bug. `hasSchoolResults.data` is
  // `undefined` while ITS OWN query is still loading, and
  // `undefined === false` evaluates to `false` — so `showBiseMode` was
  // `false` by default on first paint, which rendered `ResultCardSearch`
  // (the SCHOOL result card) immediately, even when the site was actually
  // supposed to be in BISE mode. The instant `hasSchoolResults` finished
  // loading and `showBiseMode` flipped to `true`, React swapped in
  // `BiseResultSearch` — that swap was the visible "old card, then real
  // card" flash. `modeKnown` tracks whether BOTH queries this decision
  // depends on have actually finished, so we render neither card (a
  // neutral skeleton instead) until we truly know which one is correct.
  const modeKnown = !hasSchoolResults.isLoading && !scheduleLoading;

  // Watches every active schedule and fires the publish the instant one
  // reaches zero (see useAutoPublishWatcher above) — this is what actually
  // makes the countdown DO something when it hits 0, instead of just
  // freezing on "Publishing now…" forever.
  useAutoPublishWatcher();

  return (
    <PageLayout>
      <PageBanner title="Exam Results" subtitle="Check your examination results by roll number">
        {/* Report Card — small white rectangle button with thin blue border,
            opens the password-gated Report Card modal for bulk result
            generation (PDF + Excel). Rendered inside the green hero banner
            (below the subtitle) so it visually belongs to the "Exam Results"
            header instead of floating below it. */}
        <ReportCardButton />
      </PageBanner>

      {/* Scheduled results countdown — shows when results are pending */}
      <div className="container mx-auto px-4 mt-6">
        <ScheduledResultsBanner />
      </div>

      <section className="py-8 sm:py-16">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="max-w-2xl mx-auto space-y-4">
            {!modeKnown ? (
              // Neutral skeleton — mirrors the search-card shape without
              // committing to either SCHOOL or BISE mode, so nothing
              // incorrect is ever shown even for a fraction of a second.
              <div className="bg-card rounded-2xl shadow-elevated p-5 border border-border animate-pulse">
                <div className="h-3 w-16 bg-muted rounded mb-2" />
                <div className="h-11 w-full bg-muted rounded-xl mb-3" />
                <div className="h-11 w-full bg-muted rounded-xl mb-3" />
                <div className="h-11 w-full bg-muted rounded-xl" />
              </div>
            ) : showBiseMode ? <BiseResultSearch /> : hasActiveSchedule ? null : <ResultCardSearch />}
          </div>
        </div>
      </section>

      {/*
        ── SEO content section ────────────────────────────────────────────────
        Renders BELOW the result search box. Purely additive — does NOT modify
        the search UI, BISEP proxy, school-mode/BISE-mode toggle, or any other
        existing logic. Provides Google-rich on-page content (FAQ, HowTo,
        result-types grid, internal links, authority statement) targeting the
        search queries: BISE Peshawar Result, SSC Result, BISEP Result,
        Peshawar Board Result, BISE Result, 9th/10th/11th/12th class result.
        The matching structured data lives in RouteSEOInjector.tsx.
      ──────────────────────────────────────────────────────────────────────
      */}
      <ResultsSeoContent />
    </PageLayout>
  );
};

export default Results;
