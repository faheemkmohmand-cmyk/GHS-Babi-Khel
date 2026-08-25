import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FileText, Trophy, Loader2, Timer, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubjectMark { obtained: number; total: number; }

interface ResultRecord {
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
  students: {
    full_name: string;
    roll_number: string;
    father_name: string | null;
    photo_url: string | null;
    class: string;
  } | null;
  total_students?: number | null;
  // Rank across the ENTIRE school for the same exam_type + year (not just
  // within the student's own class). Computed client-side below because
  // admin never persists this column either.
  school_rank?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Whole-school rank pools ALL published classes together for a given
// exam_type + year — e.g. if admin publishes classes 6,7,8,9,10 at once,
// rank #1 is the single best percentage across all of them, not split into
// a separate 6-8 pool and a separate 9-10 pool. (Previously this was split
// by CLASSES_BY_EXAM_TYPE, which caused rank to look "wrong" whenever all
// classes were published together — fixed per request.)
const ALL_CLASSES = ["6", "7", "8", "9", "10"];

// ─── Latest published exam (for the page title before any search) ─────────────
// The title needs to show which exam results are currently available, e.g.
// "Result - Final Semester 2026" — not just the word "Result". Since results
// are published per class/exam rather than under one global "current exam"
// record, we take the most recently published row (by year, then created_at)
// as the exam this page is presenting.
//
// IMPORTANT: this used to have staleTime: 5 min and NO refetchInterval. That
// meant when the admin scheduled a publish with a future `publish_at` and the
// timer fired (whether client-side via ResultCountdownTimer, or server-side
// via the Vercel cron), is_published flipped to true in the DB but this
// hook's cached result kept showing the OLD title (or no title at all) for
// up to 5 minutes. The user saw "no title or result" in the dashboard even
// though the data had actually published. We now refetch every 30s while the
// tab is open so the title updates promptly once publish fires.
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
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}

// ─── Scheduled publishes (upcoming countdown banner) ──────────────────────────
//
// Mirrors the same hook on the public /results page (Results.tsx) — when the
// admin has scheduled a future `publish_at` for any results, we show a
// countdown card so the user knows results are coming. Without this, the
// dashboard's Results tab gave zero feedback during the countdown window:
// no title (because nothing is_published yet), no countdown (because we
// never queried publish_at), and no search results (because the search
// filter is is_published=true). The user just saw an empty page for
// however many minutes/hours the schedule was set for.
//
// We dedupe by `publish_at` value — when admin clicks "All Classes At Once"
// every class row gets the same timestamp, so one card covers all of them
// ("All Classes (6, 7, 8, 9, 10) — exam year") instead of 5 identical cards.
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

      type Group = { publish_at: string; exam_type: string; year: number; classes: string[] };
      const byPublishAt = new Map<string, Group>();
      for (const r of (data ?? [])) {
        const key = r.publish_at;
        if (!byPublishAt.has(key)) {
          byPublishAt.set(key, { publish_at: r.publish_at, exam_type: r.exam_type, year: r.year, classes: [r.class] });
        } else {
          const g = byPublishAt.get(key)!;
          if (!g.classes.includes(r.class)) g.classes.push(r.class);
        }
      }
      return Array.from(byPublishAt.values())
        .map(g => ({ ...g, classes: g.classes.sort((a, b) => Number(a) - Number(b)) }))
        .sort((a, b) => a.publish_at.localeCompare(b.publish_at));
    },
    refetchInterval: 30000,
    staleTime: 0,
  });
}

// ── Dashboard-side auto-publish trigger ───────────────────────────────────
// Mirrors triggerHomeAutoPublish (Home.tsx) and triggerAutoPublish (Results.tsx)
// so the User Dashboard also fires the publish the instant a countdown reaches
// zero — not just the homepage and /results page.
//
// TWO-PATH PUBLISH (same as the other two surfaces):
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
//      admin has the dashboard open — even if the serverless function isn't
//      configured with a service role key.
let dashboardAutoPublishInFlight = false;
async function triggerDashboardAutoPublish(): Promise<boolean> {
  if (dashboardAutoPublishInFlight) return false;
  dashboardAutoPublishInFlight = true;
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
    dashboardAutoPublishInFlight = false;
  }
}

// Watches every active schedule and fires the publish trigger the moment ANY
// of them reaches zero. Mounted once in ResultCardTab so the dashboard also
// performs the publish — not just displays the countdown.
function useDashboardAutoPublishWatcher() {
  const { data: scheduled = [] } = useScheduledPublishes();
  const qc = useQueryClient();
  useEffect(() => {
    if (scheduled.length === 0) return;
    const check = async () => {
      const dueNow = scheduled.some(s => new Date(s.publish_at).getTime() <= Date.now());
      if (!dueNow) return;
      const publishedSomething = await triggerDashboardAutoPublish();
      if (publishedSomething) {
        // Refresh every cache that depends on is_published / publish_at so
        // the countdown disappears and the real result appears immediately,
        // without the visitor needing to refresh the page.
        qc.invalidateQueries({ queryKey: ["scheduled-result-publishes"] });
        qc.invalidateQueries({ queryKey: ["scheduled-result-publishes-raw"] });
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

function ScheduledResultsBanner() {
  const { data: scheduled = [] } = useScheduledPublishes();
  if (!scheduled.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Clock className="w-4 h-4 text-blue-500" />
        <p className="text-sm font-bold text-foreground">Upcoming Result Publications</p>
      </div>
      {scheduled.map((item, i) => (
        <CountdownCard key={`${item.publish_at}-${i}`} item={item} />
      ))}
    </div>
  );
}

// ─── Tab Component ────────────────────────────────────────────────────────────

const ResultCardTab = () => {
  const [searchRoll, setSearchRoll] = useState("");
  const [searched,   setSearched]   = useState(false);
  const [searching,  setSearching]  = useState(false);
  const [results,    setResults]    = useState<ResultRecord[]>([]);
  const { data: latestExam } = useLatestPublishedExam();

  // Fire the publish the instant any active schedule reaches zero — so the
  // dashboard doesn't just DISPLAY the countdown, it also performs the
  // actual publish (via the serverless endpoint AND a direct supabase UPDATE
  // fallback for authenticated admins). Without this, a user sitting on the
  // dashboard when the countdown ended would see "Publishing now..." and
  // then nothing — the schedule would disappear (refetch drops past
  // publish_at) but is_published would never flip to true.
  useDashboardAutoPublishWatcher();

  const handleReset = () => {
    setSearchRoll("");
    setSearched(false);
    setResults([]);
  };

  const handleSearch = async () => {
    if (!searchRoll.trim()) {
      toast.error("Enter your exam roll number"); return;
    }
    setSearching(true); setSearched(false);

    try {
      const query = supabase
        .from("results")
        .select("id,student_id,class,exam_type,year,total_marks,obtained_marks,percentage,grade,is_pass,remarks,exam_roll_no,position,subject_marks,students(full_name,roll_number,father_name,photo_url,class)")
        .eq("is_published", true)
        .eq("exam_roll_no", searchRoll.trim())
        .order("year", { ascending: false });

      const { data, error } = await query.limit(10);
      if (error) throw error;
      let rows = (data ?? []) as unknown as ResultRecord[];

      // ── Fallback: fill in exam_roll_no from exam_roll_numbers table ──────
      // (see ResultCard.tsx for full explanation — a result row can have a
      // blank exam_roll_no even though a roll number exists for the student.
      // exam_roll_numbers is scoped by session_id, and each session has its
      // own exam_year + exam_term, so we match through exam_roll_sessions on
      // year + term + class + student rather than just student_id + class.)
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
              // Primary match: same student_id + class + session year/term
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

      // ── Compute Rank + Class Position client-side ────────────────────────
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
        const { data: groupRows, error: groupErr } = await supabase
          .from("results")
          .select("id,student_id,percentage,created_at")
          .eq("class", cls)
          .eq("exam_type", examType)
          .eq("year", Number(year))
          .eq("is_published", true);

        if (groupErr) {
          // Don't silently drop rank data on a query failure — leave this
          // group's map empty so the UI shows "—" rather than a wrong rank,
          // but the underlying cause (e.g. RLS blocking the query) needs to
          // be visible rather than swallowed.
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

      // ── Compute WHOLE-SCHOOL rank (not class rank) for the Trophy badge ──
      // The trophy "Rank #N" is the student's standing across the WHOLE
      // school for a given publish batch — i.e. everything the admin
      // selected in Schedule Publish together. Classes 6-8 are stored under
      // exam_type "1st/2nd Semester" and classes 9-10 under "Annual-I/II"
      // (different label sets, required elsewhere in the app — see
      // AdminResults.tsx), but that label is NOT what should define the
      // rank pool. Per explicit requirement: if admin publishes classes
      // 6,7,8,9,10 together, rank must be ONE pool across all of them, not
      // split by exam_type. The only thing that reliably ties a publish
      // batch together after publish (once publish_at is cleared to null)
      // is `year` — so we pool by year alone now.
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
        const classScope = ALL_CLASSES;
        const { data: groupRows, error: groupErr } = await supabase
          .from("results")
          .select("id,student_id,percentage,created_at")
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

      setResults(rows);
    } catch { toast.error("Search failed. Try again."); }

    setSearched(true); setSearching(false);
  };

  return (
    <div className="space-y-5">
      <h2 className="text-xl sm:text-2xl font-heading font-bold text-blue-600 text-center leading-snug">
        {results.length > 0
          ? `Result - ${results[0].exam_type} ${results[0].year}`
          : latestExam
            ? `Result - ${latestExam.exam_type} ${latestExam.year}`
            : "Result"}
      </h2>

      {/* Scheduled results countdown — shows when admin has scheduled a
          future publish_at but it hasn't fired yet. Gives the user a
          visible "results coming in Xd Yh Zm" indicator instead of an
          empty page with no title and a search that finds nothing. */}
      <ScheduledResultsBanner />

      {/* Search */}
      <div className="bg-card rounded-2xl shadow-card p-5 border border-border">
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
          <button onClick={handleSearch} disabled={searching}
            className={`w-full font-semibold py-3 rounded-xl flex items-center justify-center gap-2 border transition-all disabled:opacity-60 ${
              searched
                ? "bg-blue-600 border-blue-600 text-white shadow-card hover:shadow-elevated"
                : "bg-background border-blue-200 text-blue-600 hover:bg-blue-50"
            }`}>
            {searching ? <><Loader2 className="w-4 h-4 animate-spin"/>Searching...</> : <><Search className="w-4 h-4"/>Search Result</>}
          </button>
          <button onClick={handleReset}
            className="w-full font-medium py-3 rounded-xl border border-border text-foreground hover:bg-secondary transition-all">
            Reset
          </button>
        </div>
      </div>

      {/* Results */}
      <AnimatePresence>
        {searched && (
          <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} className="space-y-4">
            {results.length === 0 ? (
              <div className="bg-card rounded-2xl p-10 text-center shadow-card">
                <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="font-heading font-semibold text-foreground">No Result Found</h3>
                <p className="text-sm text-muted-foreground mt-2">Check your name or exam roll number. Results must be added by admin.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground font-medium">Found {results.length} result{results.length>1?"s":""}</p>
                {results.map(r => (
                  <motion.div key={r.id} initial={{opacity:0,scale:0.98}} animate={{opacity:1,scale:1}}
                    className="bg-card rounded-2xl shadow-elevated overflow-hidden border border-border">

                    <div className="gradient-hero px-6 py-4 text-primary-foreground">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          {r.students?.photo_url
                            ? <img src={r.students.photo_url} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white/40" />
                            : <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold border-2 border-white/30">{(r.students?.full_name||"S").charAt(0)}</div>
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
                      {[{l:"Total",v:r.total_marks},{l:"Obtained",v:r.obtained_marks},{l:"%",v:`${r.percentage}%`},{l:"Grade",v:r.grade||"—"}]
                        .map(item => (
                          <div key={item.l} className="p-3 text-center">
                            <p className="text-xs text-muted-foreground">{item.l}</p>
                            <p className="text-lg font-bold text-foreground">{item.v}</p>
                          </div>
                        ))}
                    </div>

                    {(() => {
                      // Show subject-wise marks whenever they actually exist on
                      // the row. Previously this block hid the per-subject list
                      // when every subject was 0 but the top-level obtained_marks
                      // was > 0, treating that as "stale" data — but that hid
                      // legitimate per-subject data any time the admin re-saved
                      // a result with partial entries, so users saw "not entered"
                      // even though subjects were on file. We now show whatever
                      // is in subject_marks; the "not entered" notice only
                      // appears when the field is truly missing/empty.
                      const entries = r.subject_marks
                        ? Object.entries(r.subject_marks).filter(
                            ([, m]) => m && typeof m === "object" && typeof m.obtained === "number" && typeof m.total === "number"
                          )
                        : [];
                      const hasSubjects = entries.length > 0;
                      return hasSubjects ? (
                        <div className="px-5 py-4 border-b border-border space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject-wise Marks</p>
                          {entries.map(([sub, m]) => {
                            const pct = m.total > 0 ? Math.round((m.obtained/m.total)*100) : 0;
                            return (
                              <div key={sub} className="flex items-center gap-3">
                                <span className="text-sm text-foreground w-32 shrink-0">{sub}</span>
                                <div className="flex-1 bg-secondary rounded-full h-2">
                                  <div className="h-2 rounded-full bg-primary" style={{width:`${Math.min(pct,100)}%`}} />
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
                        <Trophy className="w-4 h-4"/>
                        {/* Trophy = whole-school rank, not class rank. */}
                        {r.school_rank ? `Rank #${r.school_rank}` : "Rank —"}
                      </span>
                      <span className="inline-flex items-center px-4 py-1.5 rounded-xl text-sm font-bold shrink-0"
                        style={{background:r.is_pass?"#F0FDF4":"#FEF2F2",color:r.is_pass?"#16A34A":"#DC2626",border:`1px solid ${r.is_pass?"#BBF7D0":"#FECACA"}`}}>
                        {r.is_pass?"✓ PASS":"✗ FAIL"}
                      </span>
                      <span className="text-xs sm:text-sm font-semibold text-foreground shrink-0">
                        {/* Class position shown as "#N" only — no "of M" suffix. */}
                        {r.position ? `Class Position: #${r.position}` : "Class Position: —"}
                      </span>
                    </div>
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

export default ResultCardTab;
