
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

import { useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, GraduationCap, Trophy, Medal, Users, TrendingUp, Award, XCircle, Timer, Clock } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { useResults, useResultYears, getGradeFromPercentage, getGradeColor } from "@/hooks/useResults";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatePresence } from "framer-motion";
import { Loader2, FileText, Printer } from "lucide-react";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import toast from "react-hot-toast";

const classes = ["6", "7", "8", "9", "10"];
const examTypes: Record<string, string[]> = {
  "6": ["1st Semester", "2nd Semester"],
  "7": ["1st Semester", "2nd Semester"],
  "8": ["1st Semester", "2nd Semester"],
  "9": ["Annual-I", "Annual-II"],
  "10": ["Annual-I", "Annual-II"],
};

const positionStyles = [
  { border: "border-[hsl(45,93%,47%)]", bg: "bg-[hsl(45,93%,47%)]/10", badge: "bg-[hsl(45,93%,47%)]", label: "🥇 1st Position" },
  { border: "border-[hsl(0,0%,75%)]", bg: "bg-[hsl(0,0%,75%)]/10", badge: "bg-[hsl(0,0%,75%)]", label: "🥈 2nd Position" },
  { border: "border-[hsl(30,60%,50%)]", bg: "bg-[hsl(30,60%,50%)]/10", badge: "bg-[hsl(30,60%,50%)]", label: "🥉 3rd Position" },
];


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

const buildDMC = (r: RCResult, school: { school_name: string; address: string; emis_code: string; logo_url: string | null; phone: string | null }): string => {
  const subjects = r.subject_marks
    ? Object.entries(r.subject_marks).filter(([, m]) => !(m.obtained === 0 && m.total === 0))
    : [];
  const grade = r.grade || gradeFromPct(r.percentage);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>DMC - ${r.students?.full_name}</title>
  <style>
  @page{size:A4 portrait;margin:12mm}
  body{font-family:Arial,sans-serif;padding:20px;max-width:700px;margin:auto}
  h1{font-size:20px;margin:0}p{margin:2px 0;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px}
  th{background:#f0f0f0}.pass{color:green;font-weight:bold}.fail{color:red;font-weight:bold}
  .header{display:flex;align-items:center;gap:16px;border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:14px}
  .grade{font-size:28px;font-weight:900;text-align:center}</style></head><body>
  <div class="header">${school.logo_url ? `<img src="${school.logo_url}" height="64" style="border-radius:8px">` : ""}
  <div><h1>${school.school_name}</h1><p>${school.address}</p><p>EMIS: ${school.emis_code}${school.phone ? ` | ${school.phone}` : ""}</p></div></div>
  <p><strong>Exam:</strong> ${r.exam_type} — ${r.year} &nbsp;|&nbsp; <strong>Class:</strong> ${r.class}${r.exam_roll_no ? ` &nbsp;|&nbsp; <strong>Exam Roll:</strong> ${r.exam_roll_no}` : ""}</p>
  <p><strong>Student:</strong> ${r.students?.full_name || "—"} &nbsp;|&nbsp; <strong>Father:</strong> ${r.students?.father_name || "—"} &nbsp;|&nbsp; <strong>Roll #:</strong> ${r.students?.roll_number || "—"}</p>
  ${subjects.length > 0 ? `<table><tr><th>Subject</th><th>Obtained</th><th>Total</th><th>%</th></tr>${subjects.map(([sub, m]) => `<tr><td>${sub}</td><td>${m.obtained}</td><td>${m.total}</td><td>${m.total > 0 ? Math.round((m.obtained / m.total) * 100) : 0}%</td></tr>`).join("")}</table>` : ""}
  <table style="margin-top:10px"><tr><th>Total Marks</th><th>Obtained</th><th>Percentage</th><th>Grade</th><th>Status</th></tr>
  <tr><td>${r.total_marks}</td><td>${r.obtained_marks}</td><td>${r.percentage}%</td><td class="grade">${grade}</td><td class="${r.is_pass ? "pass" : "fail"}">${r.is_pass ? "PASS" : "FAIL"}</td></tr></table>
  ${r.remarks ? `<p style="margin-top:10px"><strong>Remarks:</strong> ${r.remarks}</p>` : ""}
  <p style="margin-top:20px;font-size:11px;color:#999;text-align:center">Generated by ${school.school_name} · ${new Date().toLocaleDateString()}</p>
  </body></html>`;
};

const ResultCardSearch = () => {
  const { data: settings } = useSchoolSettings();
  const school = {
    school_name: settings?.school_name || "GHS Babi Khel",
    address: settings?.address || "Babi Khel, District Mohmand, KPK",
    emis_code: settings?.emis_code || "60673",
    logo_url: settings?.logo_url || null,
    phone: settings?.phone || null,
  };
  const [searchName, setSearchName] = useState("");
  const [searchRoll, setSearchRoll] = useState("");
  const [searched, setSearched]     = useState(false);
  const [searching, setSearching]   = useState(false);
  const [rcResults, setRcResults]   = useState<RCResult[]>([]);

  const handleSearch = async () => {
    if (!searchName.trim() && !searchRoll.trim()) { toast.error("Enter your name or exam roll number"); return; }
    setSearching(true); setSearched(false);

    try {
      let query = supabase.from("results")
        .select("id,student_id,class,exam_type,year,total_marks,obtained_marks,percentage,grade,is_pass,remarks,exam_roll_no,position,subject_marks,students(full_name,roll_number,father_name,photo_url,class)")
        .eq("is_published", true)
        .order("year", { ascending: false });

      if (searchRoll.trim()) {
        query = query.eq("exam_roll_no", searchRoll.trim());
      } else {
        const { data: stds } = await supabase.from("students").select("id").ilike("full_name", `%${searchName.trim()}%`);
        if (!stds?.length) { setRcResults([]); setSearched(true); setSearching(false); return; }
        query = query.in("student_id", stds.map(s => s.id));
      }

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
      <div className="bg-card rounded-2xl shadow-elevated p-5 mb-6 border border-border">
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Student Name</label>
            <input value={searchName} onChange={e => setSearchName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Enter your full name..."
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <div className="flex items-center gap-3"><div className="flex-1 h-px bg-border" /><span className="text-xs text-muted-foreground font-medium">OR</span><div className="flex-1 h-px bg-border" /></div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Exam Roll Number</label>
            <input value={searchRoll} onChange={e => setSearchRoll(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="e.g. 100001"
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <button onClick={handleSearch} disabled={searching}
            className="w-full gradient-accent text-primary-foreground font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 shadow-card hover:shadow-elevated transition-all">
            {searching ? <><Loader2 className="w-4 h-4 animate-spin" />Searching...</> : <><Search className="w-4 h-4" />Search Result Card</>}
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
                <p className="text-sm text-muted-foreground mt-1">Check your name or exam roll number. Results must be added by admin.</p>
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

                    <div className="p-4">
                      <button onClick={() => {
                        const w = window.open("", "_blank");
                        if (w) { w.document.write(buildDMC(r, school)); w.document.close(); setTimeout(() => w.print(), 500); }
                      }}
                        className="w-full gradient-accent text-primary-foreground font-semibold py-3 rounded-xl flex items-center justify-center gap-2 shadow-card hover:shadow-elevated transition-all">
                        <Printer className="w-4 h-4" /> Download DMC as PDF
                      </button>
                      <p className="text-xs text-center text-muted-foreground mt-1.5">Print window opens → Save as PDF</p>
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

const Results = () => {
  // ── URL <-> state sync (fix for issue 2.5) ─────────────────────────────────
  // Previously the page ignored ?class=N entirely — the footer's
  // /results?class=6/7/8/9/10 links all landed on the default (Class 6).
  // Now we read the `class` search param on mount, validate it against the
  // allowed list, and use it as the initial selection. When the user
  // clicks a class tab we also push the new value back into the URL so the
  // page becomes shareable / back-button friendly.
  const [searchParams, setSearchParams] = useSearchParams();
  const classFromUrl = searchParams.get("class");
  const initialClass  = classes.includes(classFromUrl ?? "") ? (classFromUrl as string) : "6";

  const [selectedClass, setSelectedClass] = useState(initialClass);
  const [selectedExam, setSelectedExam] = useState(examTypes[initialClass][0]);
  const [selectedYear, setSelectedYear] = useState<number | undefined>();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const { data: years = [] } = useResultYears();
  const { data: results = [], isLoading } = useResults({
    classFilter: selectedClass,
    examType: selectedExam,
    year: selectedYear,
    search: debouncedSearch,
  });

  const handleClassChange = (cls: string) => {
    setSelectedClass(cls);
    setSelectedExam(examTypes[cls][0]);
    // Reflect the change in the URL without triggering a navigation.
    // `replace: true` keeps the browser history clean (no extra back entry).
    setSearchParams(
      (prev) => {
        if (cls === "6") prev.delete("class");     // "6" is the default — keep URL clean
        else             prev.set("class", cls);
        return prev;
      },
      { replace: true }
    );
  };

  // Stats
  const stats = useMemo(() => {
    if (!results.length) return null;
    const total = results.length;
    const passed = results.filter((r) => r.is_pass).length;
    const failed = total - passed;
    const avgPct = results.reduce((sum, r) => sum + (r.percentage || 0), 0) / total;
    const highest = Math.max(...results.map((r) => r.obtained_marks));
    return { total, passed, failed, avgPct, highest, passPct: (passed / total) * 100 };
  }, [results]);

  // Top 3 & rest
  const top3 = results.filter((r) => r.position && r.position <= 3).sort((a, b) => (a.position || 99) - (b.position || 99));
  const tableResults = results.filter((r) => !r.position || r.position > 3);

  return (
    <PageLayout>
      <PageBanner title="Exam Results" subtitle="Check your examination results" />

      {/* Scheduled results countdown — shows when results are pending */}
      <div className="container mx-auto px-4 mt-6">
        <ScheduledResultsBanner />
      </div>

      <section className="py-8 sm:py-16">
        <div className="container mx-auto px-3 sm:px-4">
          {/* Class Tabs */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
            {classes.map((cls) => (
              <button
                key={cls}
                onClick={() => handleClassChange(cls)}
                className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  selectedClass === cls
                    ? "gradient-hero text-primary-foreground shadow-card"
                    : "bg-card text-muted-foreground hover:bg-secondary shadow-card"
                }`}
              >
                Class {cls}
              </button>
            ))}
          </div>

          {/* Sub-tabs: exam type */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-4 sm:mb-6">
            {examTypes[selectedClass].map((exam) => (
              <button
                key={exam}
                onClick={() => setSelectedExam(exam)}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  selectedExam === exam
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                {exam}
                {(selectedClass === "9" || selectedClass === "10") && (
                  <span className="hidden sm:inline text-xs opacity-75 ml-1">(BISE Peshawar)</span>
                )}
              </button>
            ))}
          </div>

          {/* Filters row: search + year — stacks on mobile */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6 sm:mb-8">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by name or roll number..."
                className="w-full rounded-xl border border-input bg-card pl-10 pr-4 py-2.5 text-sm shadow-card focus:ring-2 focus:ring-ring outline-none"
              />
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              <span className="text-sm font-medium text-muted-foreground shrink-0">Year:</span>
              <input
                type="number"
                value={selectedYear || ""}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value) : undefined;
                  if (val === undefined || (!isNaN(val) && val >= 1900 && val <= 2200)) setSelectedYear(val);
                }}
                className="flex-1 sm:flex-none sm:w-28 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-card focus:ring-2 focus:ring-ring outline-none"
                min="1900"
                max="2200"
                placeholder="All Years"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-44 rounded-2xl" />
                ))}
              </div>
              <Skeleton className="h-64 rounded-2xl mt-6" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-2xl shadow-card">
              <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No results found.</p>
              <p className="text-sm text-muted-foreground mt-1">Try selecting a different class, exam type, or year.</p>
            </div>
          ) : (
            <>
              {/* Stats Bar */}
              {stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
                  {[
                    { icon: Users, label: "Total Students", value: stats.total },
                    { icon: Award, label: "Passed", value: `${stats.passed} (${stats.passPct.toFixed(0)}%)` },
                    { icon: XCircle, label: "Failed", value: stats.failed },
                    { icon: TrendingUp, label: "Class Average", value: `${stats.avgPct.toFixed(1)}%` },
                    { icon: Trophy, label: "Highest Marks", value: stats.highest },
                  ].map((s) => (
                    <motion.div
                      key={s.label}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-card rounded-xl p-4 shadow-card text-center"
                    >
                      <s.icon className="w-5 h-5 text-primary mx-auto mb-1" />
                      <div className="text-lg font-heading font-bold text-foreground">{s.value}</div>
                      <div className="text-xs text-muted-foreground">{s.label}</div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Top 3 */}
              {top3.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  {top3.map((r, i) => {
                    const style = positionStyles[i] || positionStyles[2];
                    const grade = r.grade || getGradeFromPercentage(r.percentage || 0);
                    return (
                      <motion.div
                        key={r.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className={`bg-card rounded-2xl p-6 shadow-card border-2 ${style.border} ${style.bg} text-center`}
                      >
                        <div className={`inline-flex items-center gap-1 ${style.badge} text-white text-xs font-bold px-3 py-1 rounded-full mb-3`}>
                          {style.label}
                        </div>
                        {r.students?.photo_url ? (
                          <img
                            src={r.students.photo_url}
                            alt={r.students.full_name}
                            className="w-16 h-16 rounded-full mx-auto mb-3 object-cover ring-4 ring-card"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full mx-auto mb-3 gradient-hero flex items-center justify-center text-primary-foreground font-heading font-bold text-lg">
                            {r.students?.full_name?.charAt(0) || "?"}
                          </div>
                        )}
                        <h3 className="font-heading font-bold text-foreground">{r.students?.full_name || "Unknown"}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Roll # {r.students?.roll_number}</p>
                        <div className="mt-3 text-2xl font-heading font-extrabold text-primary">
                          {r.obtained_marks}/{r.total_marks}
                        </div>
                        <p className="text-sm text-muted-foreground">{(r.percentage || 0).toFixed(1)}%</p>
                        <span className={`inline-block mt-2 text-xs font-bold px-2.5 py-0.5 rounded-full ${getGradeColor(grade)}`}>
                          {grade}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Results Table */}
              {(tableResults.length > 0 || top3.length === 0) && (
                <>
                  {/* Mobile card list (sm and below) */}
                  <div className="md:hidden space-y-2.5">
                    {(top3.length === 0 ? results : tableResults).map((r, i) => {
                      const grade = r.grade || getGradeFromPercentage(r.percentage || 0);
                      const rank = r.position || i + (top3.length > 0 ? 4 : 1);
                      return (
                        <div key={r.id} className="bg-card rounded-xl shadow-card p-3 flex items-center gap-3">
                          <div className="shrink-0 w-7 text-center text-sm font-bold text-muted-foreground">#{rank}</div>
                          {r.students?.photo_url ? (
                            <img src={r.students.photo_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-full gradient-accent flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
                              {r.students?.full_name?.charAt(0) || "?"}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground text-sm truncate">{r.students?.full_name || "Unknown"}</p>
                            <p className="text-[11px] text-muted-foreground">Roll #{r.students?.roll_number} · {r.obtained_marks}/{r.total_marks} · {(r.percentage || 0).toFixed(1)}%</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getGradeColor(grade)}`}>{grade}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.is_pass ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" : "bg-destructive/15 text-destructive"}`}>
                              {r.is_pass ? "Pass" : "Fail"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop table (md+) */}
                  <div className="hidden md:block bg-card rounded-2xl shadow-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="gradient-hero text-primary-foreground">
                            <th className="px-4 py-3 text-left font-medium">Rank</th>
                            <th className="px-4 py-3 text-left font-medium">Photo</th>
                            <th className="px-4 py-3 text-left font-medium">Name</th>
                            <th className="px-4 py-3 text-left font-medium">Roll #</th>
                            <th className="px-4 py-3 text-left font-medium">Marks</th>
                            <th className="px-4 py-3 text-left font-medium">%</th>
                            <th className="px-4 py-3 text-left font-medium">Grade</th>
                            <th className="px-4 py-3 text-left font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(top3.length === 0 ? results : tableResults).map((r, i) => {
                            const grade = r.grade || getGradeFromPercentage(r.percentage || 0);
                            return (
                              <tr
                                key={r.id}
                                className={`border-t border-border hover:bg-secondary/50 transition-colors ${
                                  i % 2 === 1 ? "bg-secondary/20" : ""
                                }`}
                              >
                                <td className="px-4 py-3 font-medium text-foreground">{r.position || i + (top3.length > 0 ? 4 : 1)}</td>
                                <td className="px-4 py-3">
                                  {r.students?.photo_url ? (
                                    <img src={r.students.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full gradient-accent flex items-center justify-center text-primary-foreground text-xs font-bold">
                                      {r.students?.full_name?.charAt(0) || "?"}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 font-medium text-foreground">{r.students?.full_name || "Unknown"}</td>
                                <td className="px-4 py-3 text-muted-foreground">{r.students?.roll_number}</td>
                                <td className="px-4 py-3 text-muted-foreground">{r.obtained_marks}/{r.total_marks}</td>
                                <td className="px-4 py-3 font-medium text-foreground">{(r.percentage || 0).toFixed(1)}%</td>
                                <td className="px-4 py-3">
                                  <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full ${getGradeColor(grade)}`}>
                                    {grade}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  {r.is_pass ? (
                                    <span className="inline-block text-xs font-bold px-2.5 py-0.5 rounded-full bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">
                                      Pass
                                    </span>
                                  ) : (
                                    <span className="inline-block text-xs font-bold px-2.5 py-0.5 rounded-full bg-destructive/15 text-destructive">
                                      Fail
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>

      {/* ══ RESULT CARD SECTION ══ */}
      <section className="py-10 sm:py-14 bg-secondary/30 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-lg mx-auto">
            <div className="text-center mb-6">
              <span className="inline-block bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3">
                Result Card / DMC
              </span>
              <h2 className="text-2xl font-heading font-bold text-foreground">Find Your Result Card</h2>
              <p className="text-muted-foreground text-sm mt-2">
                Search by name or exam roll number to download your official DMC
              </p>
            </div>
            <ResultCardSearch />
          </div>
        </div>
      </section>
    </PageLayout>
  );
};

export default Results;
                
