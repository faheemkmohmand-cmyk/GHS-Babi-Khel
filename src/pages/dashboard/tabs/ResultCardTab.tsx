import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FileText, Trophy, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
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
}

// ─── Tab Component ────────────────────────────────────────────────────────────

const ResultCardTab = () => {
  const [searchName, setSearchName] = useState("");
  const [searchRoll, setSearchRoll] = useState("");
  const [searched,   setSearched]   = useState(false);
  const [searching,  setSearching]  = useState(false);
  const [results,    setResults]    = useState<ResultRecord[]>([]);

  const handleSearch = async () => {
    if (!searchName.trim() && !searchRoll.trim()) {
      toast.error("Enter your name or exam roll number"); return;
    }
    setSearching(true); setSearched(false);

    try {
      let query = supabase
        .from("results")
        .select("id,student_id,class,exam_type,year,total_marks,obtained_marks,percentage,grade,is_pass,remarks,exam_roll_no,position,subject_marks,students(full_name,roll_number,father_name,photo_url,class)")
        .eq("is_published", true)
        .order("year", { ascending: false });

      if (searchRoll.trim()) {
        query = query.eq("exam_roll_no", searchRoll.trim());
      } else {
        const { data: stds } = await supabase.from("students").select("id").ilike("full_name", `%${searchName.trim()}%`);
        if (!stds?.length) { setResults([]); setSearched(true); setSearching(false); return; }
        query = query.in("student_id", stds.map(s => s.id));
      }

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
      // fetch ALL published results, dedupe by student (keep latest/highest),
      // sort by percentage desc, and rank = index + 1.
      const groups = Array.from(new Set(rows.map(r => `${r.class}|${r.exam_type}|${r.year}`)));
      const rankMaps: Record<string, { rank: Map<string, number>; total: number }> = {};

      await Promise.all(groups.map(async (g) => {
        const [cls, examType, year] = g.split("|");
        const { data: groupRows } = await supabase
          .from("results")
          .select("id,student_id,percentage,created_at")
          .eq("class", cls)
          .eq("exam_type", examType)
          .eq("year", Number(year))
          .eq("is_published", true);

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

      setResults(rows);
    } catch { toast.error("Search failed. Try again."); }

    setSearched(true); setSearching(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" />
          Result Card
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">Search your result by name or exam roll number</p>
      </div>

      {/* Search */}
      <div className="bg-card rounded-2xl shadow-card p-5 border border-border">
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Student Name</label>
            <input value={searchName} onChange={e => setSearchName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Enter your full name..."
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground font-medium">OR</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Exam Roll Number</label>
            <input value={searchRoll} onChange={e => setSearchRoll(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="e.g. 100001"
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <button onClick={handleSearch} disabled={searching}
            className="w-full gradient-accent text-primary-foreground font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 shadow-card hover:shadow-elevated transition-all">
            {searching ? <><Loader2 className="w-4 h-4 animate-spin"/>Searching...</> : <><Search className="w-4 h-4"/>Search Result</>}
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

                    {r.subject_marks && Object.keys(r.subject_marks).length > 0 ? (
                      <div className="px-5 py-4 border-b border-border space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject-wise Marks</p>
                        {Object.entries(r.subject_marks).map(([sub, m]) => {
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
                    )}

                    <div className="px-5 py-3 flex items-center justify-between gap-2 flex-wrap border-b border-border">
                      <span className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-900 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold shrink-0">
                        <Trophy className="w-4 h-4"/>
                        {r.position ? `Rank #${r.position}` : "Rank —"}
                      </span>
                      <span className="inline-flex items-center px-4 py-1.5 rounded-xl text-sm font-bold shrink-0"
                        style={{background:r.is_pass?"#F0FDF4":"#FEF2F2",color:r.is_pass?"#16A34A":"#DC2626",border:`1px solid ${r.is_pass?"#BBF7D0":"#FECACA"}`}}>
                        {r.is_pass?"✓ PASS":"✗ FAIL"}
                      </span>
                      <span className="text-xs sm:text-sm font-semibold text-foreground shrink-0">
                        {r.position && r.total_students ? `Class Position: ${r.position} of ${r.total_students}` : "Class Position: —"}
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
            
