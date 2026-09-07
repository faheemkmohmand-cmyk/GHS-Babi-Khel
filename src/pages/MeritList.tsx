import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { isAfter, format } from "date-fns";
import {
  Trophy, Crown, Medal, Sparkles, Clock, Search, Users, Target,
  TrendingUp, CheckCircle2, School, BookOpen, ArrowRight, Award,
  CalendarDays, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { examTypeLabel } from "@/utils/examTypeLabel";
import { Skeleton } from "@/components/ui/skeleton";
import PageLayout from "@/components/layout/PageLayout";

/* ═══════════════════════════════════════════════════════════════════════════
   PUBLIC MERIT LIST PAGE  (/merit-list)
   The official examination rankings — previously locked inside the student
   dashboard, now a first-class public page linked from the Navbar.

   Data source: the admin-managed `merit_lists` table (snapshot v2).
     • is_published + publish_at in the past  → LIVE (rankings visible)
     • is_published + publish_at in the future → COMING SOON (live countdown)
   Legacy rows without a snapshot fall back to a live `results` query.

   Design notes:
   • GPU-safe only — no backdrop-filter, no hover:scale, no infinite CSS
     animations (Android Chrome compositing fixes in index.css).
   • 100% theme-token based → looks right in BOTH System and Dark themes.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Types ───────────────────────────────────────────────────────────────────
interface MeritStudentEntry {
  student_id: string; full_name: string; roll_number: string;
  class: string; exam_type?: string; photo_url: string | null;
  obtained_marks: number; total_marks: number; percentage: number;
  grade: string; position: number;
}

interface PublishedMeritList {
  id: string;
  scope: string;            // 'class' | 'school'
  class: string;            // '6'-'10' or 'school'
  exam_type: string | null;
  year: number;
  is_published: boolean;
  publish_at: string | null;
  title: string | null;
  notes: string | null;
  created_at: string;
  entries?: MeritStudentEntry[] | null;
  total_students?: number;
  passing_count?: number;
  highest_percentage?: number;
  average_percentage?: number;
  theme?: string | null;
}

// Visual theme presets — match the admin's publish-time pick
const ML_THEME_PRESETS: Record<string, { from: string; to: string; softBg: string; accentText: string }> = {
  gold:    { from: "from-amber-500",   to: "to-yellow-600",   softBg: "bg-amber-500/10",   accentText: "text-amber-600 dark:text-amber-300"   },
  royal:   { from: "from-blue-600",    to: "to-indigo-700",   softBg: "bg-blue-500/10",    accentText: "text-blue-600 dark:text-blue-300"     },
  emerald: { from: "from-emerald-500", to: "to-teal-700",     softBg: "bg-emerald-500/10", accentText: "text-emerald-600 dark:text-emerald-300" },
  rose:    { from: "from-rose-500",    to: "to-pink-700",     softBg: "bg-rose-500/10",    accentText: "text-rose-600 dark:text-rose-300"     },
  violet:  { from: "from-violet-500",  to: "to-purple-700",   softBg: "bg-violet-500/10",  accentText: "text-violet-600 dark:text-violet-300" },
};
function getMlTheme(id?: string | null) {
  return ML_THEME_PRESETS[id || "gold"] || ML_THEME_PRESETS.gold;
}

// ─── Data hooks (same contract as the admin/ dashboard views) ────────────────
function usePublishedMeritLists() {
  return useQuery<PublishedMeritList[]>({
    queryKey: ["published-merit-lists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merit_lists")
        .select(`
          id, scope, class, exam_type, year, is_published, publish_at,
          title, notes, created_at,
          entries, total_students, passing_count,
          highest_percentage, average_percentage, theme
        `)
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("[MeritListPage] fetch error:", error.message);
        return [];
      }
      return (data ?? []) as PublishedMeritList[];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

function useMeritListData(ml: PublishedMeritList | null) {
  return useQuery<MeritStudentEntry[]>({
    queryKey: ["merit-list-data", ml?.id],
    queryFn: async () => {
      if (!ml) return [];
      // Path 1: snapshot (v2) — decoupled from the results table
      if (Array.isArray(ml.entries) && ml.entries.length > 0) {
        const sorted = [...ml.entries].sort((a, b) => b.percentage - a.percentage);
        return sorted.map((e: any, i: number) => ({
          student_id: e.student_id,
          full_name: e.full_name || "Unknown",
          roll_number: e.roll_number || "-",
          class: e.class,
          exam_type: e.exam_type,
          photo_url: e.photo_url || null,
          obtained_marks: Number(e.obtained_marks) || 0,
          total_marks: Number(e.total_marks) || 0,
          percentage: Number(e.percentage) || 0,
          grade: e.grade || "—",
          position: i + 1,
        }));
      }
      // Path 2: legacy fallback (live results query for pre-snapshot rows)
      let q = supabase
        .from("results")
        .select("student_id,obtained_marks,total_marks,percentage,grade,position,class,exam_type,is_published,students(full_name,roll_number,photo_url)")
        .eq("year", ml.year)
        .eq("is_published", true)
        .order("percentage", { ascending: false });
      if (ml.scope === "class") {
        q = q.eq("class", ml.class);
        if (ml.exam_type) q = q.eq("exam_type", ml.exam_type);
      }
      const { data, error } = await q.limit(1000);
      if (error) throw error;
      const best = new Map<string, any>();
      for (const r of (data ?? [])) {
        const key = r.student_id + "_" + r.class;
        if (!best.has(key) || r.percentage > best.get(key).percentage) {
          best.set(key, r);
        }
      }
      return Array.from(best.values())
        .sort((a, b) => b.percentage - a.percentage)
        .map((r: any, i: number) => ({
          student_id: r.student_id,
          full_name: r.students?.full_name || "Unknown",
          roll_number: r.students?.roll_number || "-",
          class: r.class,
          exam_type: r.exam_type,
          photo_url: r.students?.photo_url || null,
          obtained_marks: r.obtained_marks,
          total_marks: r.total_marks,
          percentage: Number(r.percentage) || 0,
          grade: r.grade || "—",
          position: i + 1,
        }));
    },
    enabled: !!ml,
  });
}

// 1-second ticker for the live countdown
function useNowTick(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ─── Shared motion variants (one-shot, GPU-safe) ─────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const listTitle = (ml: PublishedMeritList) =>
  ml.title || (ml.scope === "school"
    ? `School Merit List ${ml.year}`
    : `Class ${ml.class} Merit List ${ml.year}`);

const listMeta = (ml: PublishedMeritList) =>
  `${ml.scope === "school" ? "School" : `Class ${ml.class}`}` +
  `${ml.exam_type ? ` · ${examTypeLabel(ml.exam_type)}` : ""} · Year ${ml.year}`;

// ─── Avatar with graceful fallback ───────────────────────────────────────────
function MeritAvatar({ photoUrl, fullName, size = "w-9 h-9" }: { photoUrl: string | null; fullName: string; size?: string }) {
  const [imgError, setImgError] = useState(false);
  return photoUrl && !imgError ? (
    <img src={photoUrl} alt={`${fullName}'s photo`} className={`${size} rounded-full object-cover shrink-0 ring-2 ring-border`} onError={() => setImgError(true)} loading="lazy" decoding="async" />
  ) : (
    <div className={`${size} rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0 ring-2 ring-border`}>
      {(fullName || "?")[0]}
    </div>
  );
}

// ─── Countdown unit tile ─────────────────────────────────────────────────────
function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-card border-2 border-gold/40 rounded-2xl px-4 py-3 min-w-[68px] shadow-card text-center">
      <p className="text-2xl md:text-3xl font-black tabular-nums text-gold leading-none">
        {String(Math.max(0, value)).padStart(2, "0")}
      </p>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mt-1.5">{label}</p>
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function MeritStatCard({ icon: Icon, label, value, sub, tile }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number; sub?: string; tile: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className={`absolute -right-5 -top-5 w-20 h-20 rounded-full ${tile.split(" ")[0]} opacity-20`} />
      <div className="relative">
        <div className={`w-10 h-10 rounded-xl ${tile} flex items-center justify-center mb-3 shadow-sm`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-2xl font-black tabular-nums leading-none text-foreground">{value}</p>
        <p className="text-[11px] font-semibold text-muted-foreground mt-1.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Top-3 podium — the showpiece ────────────────────────────────────────────
const PODIUM_STYLES = [
  { // 2nd — silver
    ring: "from-slate-300 to-slate-500 dark:from-slate-400 dark:to-slate-600",
    column: "from-slate-300 to-slate-400 dark:from-slate-500 dark:to-slate-700",
    nameColor: "text-foreground",
    pctColor: "text-slate-600 dark:text-slate-300",
    badge: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
  },
  { // 1st — gold
    ring: "from-amber-400 to-yellow-600 dark:from-amber-400 dark:to-yellow-500",
    column: "from-amber-400 to-yellow-500 dark:from-amber-500 dark:to-yellow-600",
    nameColor: "text-amber-700 dark:text-amber-300",
    pctColor: "text-amber-600 dark:text-amber-300",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200",
  },
  { // 3rd — bronze
    ring: "from-orange-400 to-amber-700 dark:from-orange-500 dark:to-amber-700",
    column: "from-orange-400 to-amber-600 dark:from-orange-600 dark:to-amber-800",
    nameColor: "text-foreground",
    pctColor: "text-orange-600 dark:text-orange-300",
    badge: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200",
  },
];

function PodiumItem({ entry, rank, style, heightClass, showClass, delay }: {
  entry: MeritStudentEntry;
  rank: number;
  style: typeof PODIUM_STYLES[number];
  heightClass: string;
  showClass: boolean;
  delay: number;
}) {
  const [imgError, setImgError] = useState(false);
  const isFirst = rank === 1;
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="flex flex-col items-center text-center flex-1 max-w-[150px]"
    >
      {/* Avatar with medal ring */}
      <div className="relative mb-3">
        {isFirst && (
          <Crown className="absolute -top-7 left-1/2 -translate-x-1/2 w-6 h-6 text-gold" fill="currentColor" />
        )}
        <div className={`relative ${isFirst ? "w-20 h-20 sm:w-24 sm:h-24" : "w-16 h-16 sm:w-20 sm:h-20"} rounded-full p-[3px] bg-gradient-to-br ${style.ring} shadow-elevated`}>
          {entry.photo_url && !imgError ? (
            <img src={entry.photo_url} alt={`${entry.full_name}'s photo`} className="w-full h-full rounded-full object-cover border-2 border-card" onError={() => setImgError(true)} loading="lazy" decoding="async" />
          ) : (
            <div className="w-full h-full rounded-full bg-card flex items-center justify-center font-black text-xl text-foreground border-2 border-card">
              {(entry.full_name || "?")[0]}
            </div>
          )}
        </div>
        <span className={`absolute -bottom-2 -right-1 text-xl ${isFirst ? "text-2xl" : ""}`} aria-hidden>
          {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
        </span>
      </div>

      {/* Name + class */}
      <p className={`text-sm font-bold leading-tight w-full truncate ${style.nameColor}`}>{entry.full_name}</p>
      <div className="flex items-center justify-center gap-1.5 mt-1 flex-wrap">
        {showClass && (
          <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">Cls {entry.class}</span>
        )}
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>{entry.grade}</span>
      </div>

      {/* Percentage */}
      <p className={`text-lg sm:text-xl font-black tabular-nums mt-1.5 ${style.pctColor}`}>
        {Number(entry.percentage).toFixed(1)}%
      </p>
      <p className="text-[10px] text-muted-foreground font-mono">Roll {entry.roll_number}</p>

      {/* Podium column */}
      <div className={`mt-3 w-full ${heightClass} rounded-t-2xl bg-gradient-to-b ${style.column} flex items-start justify-center pt-2 shadow-card`}>
        <span className="text-white font-black text-2xl sm:text-3xl leading-none drop-shadow-sm">{rank}</span>
      </div>
    </motion.div>
  );
}

function Top3Podium({ entries, showClass }: { entries: MeritStudentEntry[]; showClass: boolean }) {
  if (entries.length < 1) return null;
  const top3 = entries.slice(0, 3);
  const order = [
    { entry: top3[1], rank: 2, height: "h-20 sm:h-24", delay: 0.15 },
    { entry: top3[0], rank: 1, height: "h-28 sm:h-32", delay: 0 },
    { entry: top3[2], rank: 3, height: "h-16 sm:h-20", delay: 0.3 },
  ].filter((o) => Boolean(o.entry));

  return (
    <div className="relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/10 via-card to-gold/5 p-5 sm:p-7 shadow-elevated">
      <div className="orb orb-gold w-56 h-56 -top-24 -right-16 opacity-60" />
      <div className="relative flex items-center gap-2 mb-6">
        <span className="icon-tile w-9 h-9"><Crown className="w-4 h-4" /></span>
        <div>
          <h3 className="font-heading font-bold text-foreground leading-none">Top 3 Achievers</h3>
          <p className="text-[11px] text-muted-foreground mt-1">Hall of fame — this exam's champions</p>
        </div>
        <Medal className="w-4 h-4 text-gold ml-auto" />
      </div>
      <div className="relative flex items-end justify-center gap-4 sm:gap-8">
        {order.map((o) => (
          <PodiumItem
            key={`${o.entry.student_id}-${o.rank}`}
            entry={o.entry}
            rank={o.rank}
            style={PODIUM_STYLES[o.rank - 1]}
            heightClass={o.height}
            showClass={showClass}
            delay={o.delay}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
const MeritListPage = () => {
  const now = useNowTick(1000);
  const { data: publishedLists = [], isLoading: listsLoading } = usePublishedMeritLists();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const liveLists = publishedLists.filter(
    (ml) => ml.is_published && (!ml.publish_at || !isAfter(new Date(ml.publish_at), now))
  );
  const scheduledLists = publishedLists.filter(
    (ml) => ml.is_published && ml.publish_at && isAfter(new Date(ml.publish_at), now)
  );

  // Default selection = most recent live list, else the next scheduled one
  useEffect(() => {
    const stillExists = selectedId && publishedLists.some((l) => l.id === selectedId);
    if (stillExists) return;
    const firstLive = liveLists[0];
    const firstScheduled = scheduledLists[0];
    setSelectedId(firstLive?.id || firstScheduled?.id || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishedLists]);

  const selectedList = publishedLists.find((l) => l.id === selectedId) || null;
  const isSelectedLive =
    selectedList && (!selectedList.publish_at || !isAfter(new Date(selectedList.publish_at), now));

  const { data: entries = [], isLoading: entriesLoading } = useMeritListData(
    isSelectedLive ? selectedList : null
  );

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase().trim();
    return entries.filter(
      (e) =>
        (e.full_name || "").toLowerCase().includes(q) ||
        (e.roll_number || "").toLowerCase().includes(q) ||
        String(e.class || "").includes(q)
    );
  }, [entries, search]);

  const stats = useMemo(() => {
    const total = selectedList?.total_students ?? entries.length;
    const passing = selectedList?.passing_count ?? entries.filter((e) => e.percentage >= 33).length;
    const highest =
      selectedList?.highest_percentage != null
        ? Number(selectedList.highest_percentage)
        : entries.length ? Math.max(...entries.map((e) => e.percentage)) : 0;
    const avg =
      selectedList?.average_percentage != null
        ? Number(selectedList.average_percentage)
        : entries.length ? Math.round(entries.reduce((s, e) => s + e.percentage, 0) / entries.length) : 0;
    const passRate = total ? Math.round((passing / total) * 100) : 0;
    return { total, passing, highest, avg, passRate };
  }, [selectedList, entries]);

  const theme = getMlTheme(selectedList?.theme);

  return (
    <PageLayout>
    <div className="min-h-screen bg-background">
      {/* ══════════ PREMIUM HERO ══════════ */}
      <section className="relative overflow-hidden gradient-hero">
        <div className="orb orb-gold w-[420px] h-[420px] -top-40 -right-24 opacity-70" />
        <div className="orb orb-light w-[300px] h-[300px] -bottom-28 -left-16" />
        <div className="absolute inset-0 dot-grid opacity-[0.12]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />

        <div className="container mx-auto px-4 relative z-10 py-16 md:py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-white/10 px-4 py-1.5 text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-gold"
          >
            <Trophy className="w-3.5 h-3.5" />
            Official Rankings
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.55 }}
            className="mt-6 text-4xl md:text-6xl font-display font-semibold leading-[1.08] text-on-hero"
          >
            The <span className="italic text-gold">Merit List.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.55 }}
            className="mt-5 text-on-hero-soft text-sm md:text-lg max-w-2xl mx-auto leading-relaxed"
          >
            Celebrating our highest achievers — official examination rankings,
            published straight from the school office.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32, duration: 0.55 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-2.5"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-2 text-xs sm:text-sm font-medium text-on-hero">
              <ShieldCheck className="w-3.5 h-3.5 text-gold" /> Official Verified
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-2 text-xs sm:text-sm font-medium text-on-hero">
              <CalendarDays className="w-3.5 h-3.5 text-gold" />
              {liveLists.length} live · {scheduledLists.length} upcoming
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-2 text-xs sm:text-sm font-medium text-on-hero">
              <Award className="w-3.5 h-3.5 text-gold" /> Est. 2018
            </span>
          </motion.div>
        </div>
      </section>

      <section className="section-y-sm">
        <div className="container mx-auto px-4 max-w-5xl">
          {listsLoading ? (
            /* ── Loading skeleton ── */
            <div className="space-y-4">
              <Skeleton className="h-10 w-64 rounded-xl" />
              <Skeleton className="h-72 rounded-3xl" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
              </div>
            </div>
          ) : publishedLists.length === 0 ? (
            /* ── Empty state ── */
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
              className="relative overflow-hidden bg-card rounded-3xl border border-border p-12 text-center shadow-card">
              <div className="orb orb-gold w-48 h-48 -top-16 -right-12 opacity-50" />
              <div className="relative">
                <span className="icon-tile w-16 h-16 !rounded-2xl mx-auto mb-5"><Trophy className="w-8 h-8" /></span>
                <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">No merit list published yet</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
                  When the school office publishes the next merit list, it will appear
                  here instantly — ranked, verified and ready to celebrate.
                </p>
                <Link
                  to="/results"
                  className="sheen mt-6 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-6 py-3 shadow-elevated hover:opacity-95 transition-opacity"
                >
                  Check Exam Results <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-6">
              {/* ── Coming soon — scheduled reveals with live countdown ── */}
              {scheduledLists.length > 0 && (
                <motion.div variants={fadeUp} initial="hidden" animate="visible" className="space-y-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.16em] flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-gold" /> Coming Soon
                  </p>
                  {scheduledLists.map((ml) => {
                    const target = new Date(ml.publish_at!);
                    const diff = target.getTime() - now.getTime();
                    const days = Math.floor(diff / 86400000);
                    const hours = Math.floor((diff % 86400000) / 3600000);
                    const mins = Math.floor((diff % 3600000) / 60000);
                    const secs = Math.floor((diff % 60000) / 1000);
                    const isSelected = selectedId === ml.id;
                    return (
                      <button
                        key={ml.id}
                        onClick={() => setSelectedId(ml.id)}
                        className={`w-full text-left p-5 rounded-2xl border-2 transition-all shadow-card ${
                          isSelected ? "border-gold bg-gold/5" : "border-border bg-card hover:border-gold/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="flex items-start gap-3 min-w-0">
                            <span className="icon-tile w-11 h-11 shrink-0"><Clock className="w-5 h-5" /></span>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-foreground truncate">{listTitle(ml)}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{listMeta(ml)}</p>
                              {ml.notes && <p className="text-xs text-muted-foreground mt-1 italic line-clamp-1">"{ml.notes}"</p>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] text-muted-foreground font-medium">Goes live in</p>
                            <p className="text-lg font-black text-gold tabular-nums leading-tight">
                              {days > 0 ? `${days}d ` : ""}{hours}h {mins}m {secs}s
                            </p>
                            <p className="text-[10px] text-muted-foreground">{format(target, "dd MMM, h:mm a")}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              )}

              {/* ── List picker — scannable pills ── */}
              {liveLists.length > 1 && (
                <motion.div variants={fadeUp} initial="hidden" animate="visible" className="space-y-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.16em] flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Live Now — choose a list
                  </p>
                  <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
                    {liveLists.map((ml) => {
                      const mlTheme = getMlTheme(ml.theme);
                      const isSelected = selectedId === ml.id;
                      return (
                        <button
                          key={ml.id}
                          onClick={() => setSelectedId(ml.id)}
                          className={`shrink-0 inline-flex items-center gap-2.5 rounded-full border-2 pl-1.5 pr-4 py-1.5 transition-all shadow-sm ${
                            isSelected
                              ? "border-gold bg-gold/10"
                              : "border-border bg-card hover:border-gold/40"
                          }`}
                        >
                          <span className={`w-8 h-8 rounded-full bg-gradient-to-br ${mlTheme.from} ${mlTheme.to} text-white flex items-center justify-center shrink-0`}>
                            {ml.scope === "school" ? <School className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                          </span>
                          <span className="text-xs font-bold text-foreground whitespace-nowrap">
                            {ml.scope === "school" ? "School" : `Class ${ml.class}`}
                            <span className="text-muted-foreground font-medium"> · {ml.year}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* ── Selected list ── */}
              {selectedList && (
                isSelectedLive ? (
                  <div className="space-y-6">
                    {/* Header band in the list's own theme */}
                    <motion.div
                      key={selectedList.id}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45 }}
                      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${theme.from} ${theme.to} px-6 py-7 text-white shadow-elevated`}
                    >
                      <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/10 -translate-y-14 translate-x-14" />
                      <div className="absolute bottom-0 left-0 w-28 h-28 rounded-full bg-white/5 translate-y-8 -translate-x-8" />
                      <div className="relative flex items-start gap-4 flex-wrap">
                        <span className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 shadow-card">
                          <Trophy className="w-7 h-7" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-xl md:text-2xl font-heading font-black leading-tight">{listTitle(selectedList)}</h2>
                          <p className="text-sm text-white/85 mt-1">
                            {listMeta(selectedList)} · {entries.length} students ranked
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-white/20 px-3 py-1.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
                        </span>
                      </div>
                    </motion.div>

                    {/* Stats */}
                    {entries.length > 0 && (
                      <motion.div variants={fadeUp} initial="hidden" animate="visible"
                        className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <MeritStatCard icon={Users} label="Total Students" value={stats.total}
                          tile="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300" />
                        <MeritStatCard icon={CheckCircle2} label="Pass Rate" value={`${stats.passRate}%`}
                          sub={`${stats.passing} passed`}
                          tile="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300" />
                        <MeritStatCard icon={TrendingUp} label="Highest %" value={`${stats.highest.toFixed(1)}%`}
                          tile="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300" />
                        <MeritStatCard icon={Target} label="Average %" value={`${stats.avg}%`}
                          tile="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300" />
                      </motion.div>
                    )}

                    {/* Podium */}
                    {entries.length > 0 && (
                      <Top3Podium entries={entries} showClass={selectedList.scope === "school"} />
                    )}

                    {entriesLoading ? (
                      <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
                    ) : entries.length === 0 ? (
                      <div className="bg-card rounded-2xl p-12 text-center border border-border">
                        <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm font-medium text-foreground">No results data found</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          This merit list is published but no matching results exist yet.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Search */}
                        <div className="relative">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={`Search by name, roll no${selectedList.scope === "school" ? ", or class" : ""}…`}
                            className="w-full pl-11 pr-16 py-3 text-sm rounded-2xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold/50 shadow-card"
                          />
                          {search && (
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">
                              {filteredEntries.length}/{entries.length}
                            </span>
                          )}
                        </div>

                        {/* Ranked table */}
                        <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-elevated">
                          <div className={`bg-gradient-to-r ${theme.from} ${theme.to} text-white px-5 py-4 flex items-center justify-between gap-3`}>
                            <div className="min-w-0">
                              <h3 className="font-bold text-sm truncate">{listTitle(selectedList)}</h3>
                              <p className="text-xs text-white/80 mt-0.5">Official rankings · {entries.length} students</p>
                            </div>
                            <Sparkles className="w-5 h-5 shrink-0" />
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-muted/50 border-b border-border">
                                  <th className="p-3 text-center font-bold text-xs uppercase tracking-wide text-muted-foreground">Rank</th>
                                  {selectedList.scope === "school" && (
                                    <th className="p-3 text-center font-bold text-xs uppercase tracking-wide text-muted-foreground">Class</th>
                                  )}
                                  <th className="p-3 text-left font-bold text-xs uppercase tracking-wide text-muted-foreground">Roll No</th>
                                  <th className="p-3 text-left font-bold text-xs uppercase tracking-wide text-muted-foreground">Student</th>
                                  <th className="p-3 text-center font-bold text-xs uppercase tracking-wide text-muted-foreground">Marks</th>
                                  <th className="p-3 text-center font-bold text-xs uppercase tracking-wide text-muted-foreground">%</th>
                                  <th className="p-3 text-center font-bold text-xs uppercase tracking-wide text-muted-foreground">Grade</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredEntries.map((e) => {
                                  const idx = entries.indexOf(e);
                                  const isTop3 = idx < 3;
                                  return (
                                    <tr
                                      key={`${e.student_id}-${idx}`}
                                      className={`border-b border-border/50 transition-colors ${
                                        idx === 0 ? "bg-amber-50/70 dark:bg-amber-500/10" :
                                        idx === 1 ? "bg-slate-50 dark:bg-slate-500/10" :
                                        idx === 2 ? "bg-orange-50/70 dark:bg-orange-500/10" :
                                        "hover:bg-muted/30"
                                      }`}
                                    >
                                      <td className="p-3 text-center">
                                        <span
                                          className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-xs font-black shadow-sm ${
                                            idx === 0 ? "bg-gradient-to-br from-amber-400 to-yellow-500 text-white" :
                                            idx === 1 ? "bg-gradient-to-br from-slate-300 to-slate-500 text-white" :
                                            idx === 2 ? "bg-gradient-to-br from-orange-400 to-amber-600 text-white" :
                                            "bg-muted text-muted-foreground font-bold"
                                          }`}
                                        >
                                          {isTop3 ? ["🥇", "🥈", "🥉"][idx] : idx + 1}
                                        </span>
                                      </td>
                                      {selectedList.scope === "school" && (
                                        <td className="p-3 text-center">
                                          <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-1 rounded-full">{e.class}</span>
                                        </td>
                                      )}
                                      <td className="p-3 font-mono text-xs text-muted-foreground">{e.roll_number}</td>
                                      <td className="p-3">
                                        <div className="flex items-center gap-2.5 min-w-[140px]">
                                          <MeritAvatar photoUrl={e.photo_url} fullName={e.full_name} size="w-8 h-8" />
                                          <span className="text-sm font-semibold text-foreground">{e.full_name}</span>
                                        </div>
                                      </td>
                                      <td className="p-3 text-center text-xs text-muted-foreground tabular-nums">{e.obtained_marks}/{e.total_marks}</td>
                                      <td className="p-3 text-center font-black text-sm tabular-nums text-foreground">
                                        {Number(e.percentage).toFixed(1)}%
                                      </td>
                                      <td className="p-3 text-center">
                                        <span className="text-[10px] font-bold bg-secondary text-secondary-foreground px-2.5 py-1 rounded-full border border-border">
                                          {e.grade}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                                {filteredEntries.length === 0 && (
                                  <tr>
                                    <td colSpan={selectedList.scope === "school" ? 7 : 6} className="p-8 text-center text-sm text-muted-foreground">
                                      No students match "{search}".
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  /* ── Selected list is still scheduled — big countdown panel ── */
                  selectedList.publish_at && (
                    <motion.div
                      variants={fadeUp}
                      initial="hidden"
                      animate="visible"
                      className="relative overflow-hidden rounded-3xl border-2 border-gold/40 bg-gradient-to-br from-gold/10 via-card to-gold/5 p-8 text-center shadow-elevated"
                    >
                      <div className="orb orb-gold w-56 h-56 -top-20 left-1/2 -translate-x-1/2 opacity-60" />
                      <div className="relative">
                        <span className="icon-tile w-16 h-16 !rounded-2xl mx-auto mb-5"><Clock className="w-8 h-8" /></span>
                        <h2 className="text-lg md:text-xl font-heading font-bold text-foreground">{listTitle(selectedList)}</h2>
                        <p className="text-xs text-muted-foreground mt-1">{listMeta(selectedList)}</p>
                        <p className="text-xs text-muted-foreground mt-4 mb-5 font-medium">
                          Goes live {format(new Date(selectedList.publish_at), "EEEE, dd MMMM yyyy 'at' h:mm a")}
                        </p>
                        <div className="flex justify-center gap-3 flex-wrap">
                          {(() => {
                            const target = new Date(selectedList.publish_at!);
                            const diff = target.getTime() - now.getTime();
                            const days = Math.floor(diff / 86400000);
                            const hours = Math.floor((diff % 86400000) / 3600000);
                            const mins = Math.floor((diff % 3600000) / 60000);
                            const secs = Math.floor((diff % 60000) / 1000);
                            return (
                              <>
                                {days > 0 && <CountdownUnit value={days} label="Days" />}
                                <CountdownUnit value={hours} label="Hours" />
                                <CountdownUnit value={mins} label="Min" />
                                <CountdownUnit value={secs} label="Sec" />
                              </>
                            );
                          })()}
                        </div>
                        {selectedList.notes && (
                          <p className="text-xs text-muted-foreground mt-6 italic max-w-md mx-auto">"{selectedList.notes}"</p>
                        )}
                      </div>
                    </motion.div>
                  )
                )
              )}
            </div>
          )}
        </div>
      </section>
    </div>
    </PageLayout>
  );
};

export default MeritListPage;

