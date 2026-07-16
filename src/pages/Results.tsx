
// ── Hook: fetch upcoming scheduled result publish times ────────────────────────
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

      // Deduplicate by class+exam+year — one entry per group
      const seen = new Set<string>();
      const groups: { class: string; exam_type: string; year: number; publish_at: string }[] = [];
      for (const r of (data ?? [])) {
        const key = `${r.class}-${r.exam_type}-${r.year}`;
        if (!seen.has(key)) { seen.add(key); groups.push(r as any); }
      }
      return groups;
    },
    refetchInterval: 30000, // refetch every 30s
    staleTime: 0,
  });
}

// ── Countdown timer for a single scheduled publish ─────────────────────────────
function CountdownCard({ item }: { item: { class: string; exam_type: string; year: number; publish_at: string } }) {
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

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-500/40 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-blue-400 flex items-center justify-center shrink-0">
          <Timer className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-xs font-bold text-blue-900 dark:text-blue-200">
            Class {item.class} — {item.exam_type} {item.year}
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
        <CountdownCard key={i} item={item} />
      ))}
    </div>
  );
}

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Trophy, Timer, Clock } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { Loader2, FileText } from "lucide-react";
import toast from "react-hot-toast";



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

const Results = () => {
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
            <ResultCardSearch />
          </div>
        </div>
      </section>
    </PageLayout>
  );
};

export default Results;
