
// ── Client-side auto-publish trigger ────────────────────────────────────────
// Calls the SAME server endpoint the Vercel Cron hits (api/auto-publish-
// results.js), but fires it the INSTANT any visitor's countdown reaches
// zero — instead of waiting for the cron's next scheduled tick (which, on
// most Vercel plans, only runs a few times a day). The endpoint is safe to
// call from any browser: it can only flip rows whose `publish_at` has
// ALREADY passed, so calling it early, repeatedly, or from an unauthenticated
// client does nothing harmful — it just reveals a result that was already
// due, possibly a few hours sooner than the next cron tick would have.
//
// This directly fixes the bug where the countdown said "Publishing now…"
// and then nothing actually happened: previously the ONLY code that ever
// flipped `is_published` was (a) the admin's own browser tab, if open, or
// (b) a cron job that was never registered in vercel.json. Now, the
// countdown itself performs the flip via this safe endpoint.
let autoPublishInFlight = false;
async function triggerAutoPublish(): Promise<boolean> {
  if (autoPublishInFlight) return false;
  autoPublishInFlight = true;
  try {
    const r = await fetch("/api/auto-publish-results", { method: "POST" });
    if (!r.ok) return false;
    const data = await r.json().catch(() => null);
    return !!data?.ok && (data.published_count ?? 0) > 0;
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
function useAutoPublishWatcher() {
  const { data: scheduled = [] } = useScheduledPublishes();
  const qc = useQueryClient();
  useEffect(() => {
    if (scheduled.length === 0) return;
    const check = async () => {
      const dueNow = scheduled.some(s => new Date(s.publish_at).getTime() <= Date.now());
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
      }
    };
    check();
    const t = setInterval(check, 3000);
    return () => clearInterval(t);
  }, [scheduled, qc]);
}


// ── Countdown timer for a single scheduled publish ─────────────────────────────
function CountdownCard({ item }: { item: { publish_at: string; exam_type: string; year: number; classes: string[] } }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const calc = () => {
      const diff = new Date(item.publish_at).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("Publishing now..."); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setTimeLeft(`${d}d ${h}h ${m}m ${s}s`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m ${s}s`);
      else setTimeLeft(`${m}m ${s}s`);
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

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-500/40 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-blue-400 flex items-center justify-center shrink-0">
          <Timer className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-xs font-bold text-blue-900 dark:text-blue-200">
            {classLabel} — {item.exam_type} {item.year}
          </p>
          <p className="text-[10px] text-blue-700 dark:text-blue-400">Results coming soon</p>
        </div>
      </div>
      <div className="sm:ml-auto bg-blue-100 dark:bg-blue-950/40 rounded-xl px-4 py-2 text-center min-w-[120px]">
        <p className="text-lg font-black text-blue-800 dark:text-blue-300 font-mono tracking-wide">{timeLeft}</p>
        <p className="text-[10px] text-blue-700 dark:text-blue-400 font-semibold uppercase tracking-wider">Publishes in</p>
      </div>
    </div>
  );
}

// ── Banner shown above results when some are pending publish ──────────────────
function ScheduledResultsBanner() {
  const { data: scheduled = [] } = useScheduledPublishes();
  if (!scheduled.length) return null;
  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Clock className="w-4 h-4 text-blue-500" />
        <p className="text-sm font-bold text-foreground">
          Upcoming Result Publications
        </p>
      </div>
      {scheduled.map((item, i) => (
        <CountdownCard key={`${item.publish_at}-${i}`} item={item} />
      ))}
    </div>
  );
}

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Trophy, Timer, Clock, ExternalLink, AlertCircle } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { Loader2, FileText } from "lucide-react";
import toast from "react-hot-toast";
// SEO content section — visible on-page FAQ + keyword-rich body copy.
// Renders BELOW the result search box, so the existing UX is untouched.
// Mirrors the JSON-LD stack defined in RouteSEOInjector.tsx for /results.
import ResultsSeoContent from "@/components/seo/ResultsSeoContent";
// Live BISEP exam title + countdown — replaces the old build-time
// VITE_BISEP_EXAM_TITLE env var. Polls /api/bisep-proxy?mode=current hourly.
import { useBisepCurrentExam, FALLBACK_TITLE } from "@/hooks/useBisepCurrentExam";

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

// Classes 6-8 record results under "1st/2nd Semester"; classes 9-10 record
// under "Annual-I/Annual-II". For a fair whole-school rank we need to know
// which classes share the same exam_type label so a "1st Semester" student
// in class 6 is ranked against all "1st Semester" students in classes 6, 7
// and 8 (not against class 9's "Annual-I" students who took a different exam).
const RC_ALL_CLASSES = ["6", "7", "8", "9", "10"];
const RC_CLASSES_BY_EXAM_TYPE: Record<string, string[]> = {
  "1st Semester": ["6", "7", "8"],
  "2nd Semester": ["6", "7", "8"],
  "Annual-I":     ["9", "10"],
  "Annual-II":    ["9", "10"],
};

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

  const handleReset = () => {
    setSearchRoll("");
    setSearched(false);
    setRcResults([]);
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

      const { data, error } = await query.limit(10);
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
        const { data: sessions } = await supabase
          .from("exam_roll_sessions")
          .select("id, exam_year, exam_term")
          .in("exam_year", years)
          .in("exam_term", terms);

        if (sessions?.length) {
          const { data: rolls } = await supabase
            .from("exam_roll_numbers")
            .select("student_id, class, exam_roll_no, session_id")
            .in("session_id", sessions.map(s => s.id));

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

      // ── Compute Class Position client-side ────────────────────────────────
      // The `position` column on the results table is never persisted by the
      // admin panel (AdminResults.tsx computes rank purely client-side), so
      // we replicate that same logic here: for each class/exam/year group,
      // fetch ALL published results, dedupe by student (keep latest/highest),
      // sort by percentage desc, and rank = index + 1.
      const groups = Array.from(new Set(rows.map(r => `${r.class}|${r.exam_type}|${r.year}`)));
      const rankMaps: Record<string, { rank: Map<string, number>; total: number }> = {};

      await Promise.all(groups.map(async (g) => {
        const [cls, examType, year] = g.split("|");
        const { data: groupRows, error: groupErr } = await supabase
          .from("results")
          .select("id,student_id,percentage,created_at")
          .eq("class", cls)
          .eq("exam_type", examType)
          .eq("year", Number(year))
          .eq("is_published", true);

        if (groupErr) {
          console.error("Rank lookup failed for group", g, groupErr);
          rankMaps[g] = { rank: new Map(), total: 0 };
          return;
        }

        const list = groupRows || [];
        const seen = new Map<string, typeof list[0]>();
        for (const r of list) {
          if (!seen.has(r.student_id)) {
            seen.set(r.student_id, r);
          } else {
            const existing = seen.get(r.student_id)!;
            if (r.percentage > existing.percentage || r.created_at > existing.created_at) {
              seen.set(r.student_id, r);
            }
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
      // Same per-exam_type scope as ResultCardTab.tsx / AdminDMCs.tsx —
      // "1st Semester" is shared by classes 6/7/8, "Annual-I" is shared by
      // classes 9/10 — so a student in class 6 is ranked against classes 6,
      // 7 and 8, never against classes 9/10 (those took a different exam).
      const examGroups = Array.from(new Set(rows.map(r => `${r.exam_type}|${r.year}`)));
      const schoolRankMaps: Record<string, Map<string, number>> = {};

      await Promise.all(examGroups.map(async (g) => {
        const [examType, year] = g.split("|");
        const classScope = RC_CLASSES_BY_EXAM_TYPE[examType] || RC_ALL_CLASSES;
        const { data: groupRows, error: groupErr } = await supabase
          .from("results")
          .select("id,student_id,percentage,created_at")
          .eq("exam_type", examType)
          .eq("year", Number(year))
          .in("class", classScope)
          .eq("is_published", true);

        if (groupErr) {
          console.error("School-wide rank lookup failed for group", g, groupErr);
          schoolRankMaps[g] = new Map();
          return;
        }

        const list = groupRows || [];
        const seen = new Map<string, typeof list[0]>();
        for (const r of list) {
          if (!seen.has(r.student_id)) {
            seen.set(r.student_id, r);
          } else {
            const existing = seen.get(r.student_id)!;
            if (r.percentage > existing.percentage || r.created_at > existing.created_at) {
              seen.set(r.student_id, r);
            }
          }
        }
        const deduped = Array.from(seen.values()).sort((a, b) => b.percentage - a.percentage);
        const rankMap = new Map<string, number>();
        deduped.forEach((r, i) => rankMap.set(r.student_id, i + 1));
        schoolRankMaps[g] = rankMap;
      }));

      rows = rows.map(r => {
        const key = `${r.exam_type}|${r.year}`;
        const rankMap = schoolRankMaps[key];
        return {
          ...r,
          school_rank: rankMap?.get(r.student_id) ?? null,
        };
      });

      setRcResults(rows);
    } catch { toast.error("Search failed. Try again."); }

    setSearched(true); setSearching(false);
  };

  return (
    <div>
      <h2 className="text-xl sm:text-2xl font-heading font-bold text-blue-600 text-center leading-snug mb-6">
        {rcResults.length > 0
          ? `Result - ${rcResults[0].exam_type} ${rcResults[0].year}`
          : latestExam
            ? `Result - ${latestExam.exam_type} ${latestExam.year}`
            : "Result"}
      </h2>

      <div className="bg-card rounded-2xl shadow-elevated p-5 mb-6 border border-border">
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Roll No</label>
            <input value={searchRoll} onChange={e => setSearchRoll(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="e.g. 123456"
              className="w-full rounded-xl border border-blue-200 bg-background px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <button onClick={handleSearch} disabled={searching}
            className={`w-full font-semibold py-3 rounded-xl flex items-center justify-center gap-2 border transition-all disabled:opacity-60 ${
              searched
                ? "bg-blue-600 border-blue-600 text-white shadow-card hover:shadow-elevated"
                : "bg-background border-blue-200 text-blue-600 hover:bg-blue-50"
            }`}>
            {searching ? <><Loader2 className="w-4 h-4 animate-spin" />Searching...</> : <><Search className="w-4 h-4" />Search Result</>}
          </button>
          <button onClick={handleReset}
            className="w-full font-medium py-3 rounded-xl border border-border text-foreground hover:bg-secondary transition-all">
            Reset
          </button>
        </div>
      </div>

      <AnimatePresence>
        {searched && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {rcResults.length === 0 ? (
              <div className="bg-card rounded-2xl p-8 text-center shadow-card border border-border">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="font-heading font-semibold text-foreground">No Result Found</h3>
                <p className="text-sm text-muted-foreground mt-1">Check your exam roll number. Results must be added by admin.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground font-medium">Found {rcResults.length} result{rcResults.length > 1 ? "s" : ""}</p>
                {rcResults.map(r => (
                  <motion.div key={r.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                    className="bg-card rounded-2xl shadow-elevated overflow-hidden border border-border">

                    <div className="gradient-hero px-5 py-4 text-primary-foreground">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          {r.students?.photo_url
                            ? <img src={r.students.photo_url} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white/40" />
                            : <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold border-2 border-white/30">{(r.students?.full_name || "S").charAt(0)}</div>
                          }
                          <div>
                            <p className="text-xs opacity-75">{r.exam_type} {r.year} — Class {r.class}</p>
                            <h3 className="font-heading font-bold text-lg">{r.students?.full_name}</h3>
                          </div>
                        </div>
                        {r.exam_roll_no && (
                          <div className="text-right shrink-0">
                            <p className="text-xs opacity-70">Exam Roll No</p>
                            <p className="font-mono font-bold text-xl tracking-wider">{r.exam_roll_no}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
                      {[{ l: "Total", v: r.total_marks }, { l: "Obtained", v: r.obtained_marks }, { l: "%", v: `${r.percentage}%` }, { l: "Grade", v: r.grade || "—" }]
                        .map(item => (
                          <div key={item.l} className="p-3 text-center">
                            <p className="text-xs text-muted-foreground">{item.l}</p>
                            <p className="text-lg font-bold text-foreground">{item.v}</p>
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
                          {entries.map(([sub, m]) => {
                            const pct = m.total > 0 ? Math.round((m.obtained / m.total) * 100) : 0;
                            return (
                              <div key={sub} className="flex items-center gap-3">
                                <span className="text-sm text-foreground w-32 shrink-0">{sub}</span>
                                <div className="flex-1 bg-secondary rounded-full h-2">
                                  <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                                <span className="text-sm font-semibold text-foreground w-16 text-right shrink-0">{m.obtained}/{m.total}</span>
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

                    <div className="px-5 py-3 flex items-center justify-between gap-2 flex-wrap border-b border-border">
                      <span className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-900 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold shrink-0">
                        <Trophy className="w-4 h-4" />
                        {/* Trophy = whole-school rank, not class rank. */}
                        {r.school_rank ? `Rank #${r.school_rank}` : "Rank —"}
                      </span>
                      <span className="inline-flex items-center px-4 py-1.5 rounded-xl text-sm font-bold shrink-0"
                        style={{ background: r.is_pass ? "#F0FDF4" : "#FEF2F2", color: r.is_pass ? "#16A34A" : "#DC2626", border: `1px solid ${r.is_pass ? "#BBF7D0" : "#FECACA"}` }}>
                        {r.is_pass ? "✓ PASS" : "✗ FAIL"}
                      </span>
                      <span className="text-xs sm:text-sm font-semibold text-foreground shrink-0">
                        {/* Class position shown as "#N" only — no "of M" suffix. */}
                        {r.position ? `Class Position: #${r.position}` : "Class Position: —"}
                      </span>
                    </div>
                    {/* DMC download button removed — the public homepage
                        Result Card is view-only (non-downloadable). The
                        standalone /result-card page still offers DMC download. */}
                  </motion.div>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
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
interface BiseSubject { sr: string; subject: string; theory: string; practical: string; }
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

// ── Countdown badge for the BISEP pre-announcement state ──────────────────
// Renders a small amber pill that ticks down to the BISEP-announced
// publish date. Self-contained — no external state, just an interval timer.
function BisepCountdownBadge({ targetDate, label }: { targetDate: string; label?: string | null }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const calc = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("Publishing now…"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setTimeLeft(`${d}d ${h}h ${m}m`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m ${s}s`);
      else setTimeLeft(`${m}m ${s}s`);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [targetDate]);

  return (
    <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1 rounded-full font-semibold">
      <Clock className="w-3 h-3" />
      {label ? `${label} · ` : ""}{timeLeft}
    </span>
  );
}

const BiseResultSearch = () => {
  // ── Live BISEP exam title + countdown ───────────────────────────────
  // Polls /api/bisep-proxy?mode=current hourly. Falls back to the env var /
  // hardcoded default if the proxy is down or BISEP's homepage structure
  // changes — so the page always shows SOMETHING sensible.
  const { data: bisepMeta } = useBisepCurrentExam();
  const liveTitle = bisepMeta?.exam_title || BISEP_EXAM_TITLE;
  const isLive = bisepMeta?.is_live ?? true; // assume live if proxy hasn't loaded yet
  const countdownDate = bisepMeta?.countdown_date;
  const countdownText = bisepMeta?.countdown_text;

  const [searchRoll, setSearchRoll] = useState("");
  const [searched, setSearched]     = useState(false);
  const [searching, setSearching]   = useState(false);
  const [result, setResult]         = useState<BiseResult | null>(null);
  const [notFoundMsg, setNotFoundMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);

  const handleReset = () => {
    setSearchRoll("");
    setSearched(false);
    setSearching(false);
    setResult(null);
    setNotFoundMsg(null);
    setErrorMsg(null);
  };

  const handleSearch = async () => {
    const roll = searchRoll.trim();
    if (!roll) { toast.error("Enter your BISE roll number"); return; }
    if (!/^\d{4,10}$/.test(roll)) { toast.error("Roll number must be 4–10 digits"); return; }

    setSearching(true); setSearched(false);
    setResult(null); setNotFoundMsg(null); setErrorMsg(null);

    try {
      const resp = await fetch(`/api/bisep-proxy?roll=${encodeURIComponent(roll)}`, {
        headers: { Accept: "application/json" },
      });

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
      } else if (data && typeof data.message === "string" && data.message) {
        // "Record not Found" — BISE returned a clean "no record" response.
        setNotFoundMsg(data.message);
      } else {
        // Proxy error (BISE down, Cloudflare challenge, parse failure, etc.)
        const errText =
          (data && typeof data.error === "string" && data.error)
            ? data.error
            : "Could not fetch result from BISE Peshawar.";
        setErrorMsg(errText);
      }
    } catch {
      // Network-level failure (DNS, offline, CORS-blocked, etc.).
      setErrorMsg("Network error while contacting BISE Peshawar. Please try again.");
    }

    setSearched(true); setSearching(false);
  };

  return (
    <div>
      <h2 className="text-xl sm:text-2xl font-heading font-bold text-blue-600 text-center leading-snug mb-2">
        Result - {liveTitle}
      </h2>

      {/* ── Live / Countdown badge ───────────────────────────────────────
          Shows "LIVE" when BISEP is serving results for the current exam,
          or a countdown when BISEP has announced a future publish date. */}
      <div className="flex items-center justify-center gap-2 mb-6 text-xs">
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 px-3 py-1 rounded-full font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            BISE Peshawar result is LIVE
          </span>
        ) : countdownDate ? (
          <BisepCountdownBadge targetDate={countdownDate} label={countdownText} />
        ) : countdownText ? (
          <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1 rounded-full font-semibold">
            <Clock className="w-3 h-3" /> {countdownText}
          </span>
        ) : null}
      </div>

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
          <button onClick={handleSearch} disabled={searching}
            className={`w-full font-semibold py-3 rounded-xl flex items-center justify-center gap-2 border transition-all disabled:opacity-60 ${
              searched && result
                ? "bg-blue-600 border-blue-600 text-white shadow-card hover:shadow-elevated"
                : "bg-background border-blue-200 text-blue-600 hover:bg-blue-50"
            }`}>
            {searching ? <><Loader2 className="w-4 h-4 animate-spin" />Searching...</> : <><Search className="w-4 h-4" />Search Result</>}
          </button>
          <button onClick={handleReset}
            className="w-full font-medium py-3 rounded-xl border border-border text-foreground hover:bg-secondary transition-all">
            Reset
          </button>
        </div>
      </div>

      <AnimatePresence>
        {searched && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
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
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-card rounded-2xl shadow-elevated overflow-hidden border border-border">

                <div className="gradient-hero px-5 py-4 text-primary-foreground">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold border-2 border-white/30">
                        {(result.name || "S").charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs opacity-75">{liveTitle} · BISE Peshawar</p>
                        <h3 className="font-heading font-bold text-lg">{result.name || "—"}</h3>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs opacity-70">Roll No</p>
                      <p className="font-mono font-bold text-xl tracking-wider">{result.roll_no}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-4">
                  {[
                    { l: "Marks", v: result.marks || "—" },
                    { l: "Grade", v: result.grade || "—" },
                    { l: "Remarks", v: result.remarks || "—" },
                    { l: "Father Name", v: result.father_name || "—" },
                  ].map(item => (
                    <div key={item.l} className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">{item.l}</p>
                      <p className="text-sm font-bold text-foreground break-words">{item.v}</p>
                    </div>
                  ))}
                </div>

                {result.subjects.length > 0 ? (
                  <div className="px-5 py-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject-wise Marks</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted-foreground border-b border-border">
                            <th className="py-2 pr-3 font-semibold">#</th>
                            <th className="py-2 pr-3 font-semibold">Subject</th>
                            <th className="py-2 pr-3 font-semibold text-center">Theory</th>
                            <th className="py-2 pr-3 font-semibold text-center">Practical</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.subjects.map((s, i) => (
                            <tr key={i} className="border-b border-border/60 last:border-0">
                              <td className="py-2 pr-3 text-muted-foreground">{s.sr}</td>
                              <td className="py-2 pr-3 font-medium text-foreground">{s.subject || "—"}</td>
                              <td className="py-2 pr-3 text-center font-semibold text-foreground">{s.theory || "—"}</td>
                              <td className="py-2 pr-3 text-center font-semibold text-foreground">{s.practical || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="px-5 py-4 border-b border-border">
                    <p className="text-xs text-muted-foreground text-center bg-secondary/40 rounded-lg py-3">
                      Subject-wise marks not available for this result.
                    </p>
                  </div>
                )}

                {result.collect_dmc_from && (
                  <div className="px-5 py-3 border-b border-border bg-red-50/60 dark:bg-red-950/10">
                    <p className="text-xs text-red-700 dark:text-red-400 font-semibold text-center">
                      Collect DMC From: <span className="font-bold">{result.collect_dmc_from}</span>
                    </p>
                  </div>
                )}
              </motion.div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
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
  const { data: scheduled = [] } = useScheduledPublishes();
  const hasActiveSchedule = scheduled.length > 0;
  const showBiseMode = hasSchoolResults.data === false && !hasActiveSchedule;

  // Watches every active schedule and fires the publish the instant one
  // reaches zero (see useAutoPublishWatcher above) — this is what actually
  // makes the countdown DO something when it hits 0, instead of just
  // freezing on "Publishing now…" forever.
  useAutoPublishWatcher();

  return (
    <PageLayout>
      <PageBanner title="Exam Results" subtitle="Check your examination results by roll number" />

      {/* Scheduled results countdown — shows when results are pending */}
      <div className="container mx-auto px-4 mt-6">
        <ScheduledResultsBanner />
      </div>

      <section className="py-8 sm:py-16">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="max-w-2xl mx-auto space-y-4">
            {showBiseMode ? <BiseResultSearch /> : <ResultCardSearch />}
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
