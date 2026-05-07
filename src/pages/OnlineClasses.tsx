/**
 * OnlineClasses.tsx  (/online-classes)
 * Premium student-facing Online Classes page.
 */
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageLayout from "@/components/layout/PageLayout";
import ClassCard from "@/components/shared/ClassCard";
import {
  Video, Wifi, Calendar, Clock, BookOpen, Search, Filter,
  GraduationCap, Zap, TrendingUp, Users, Star, ChevronRight,
  MonitorPlay, Sparkles
} from "lucide-react";
import { useOnlineClasses, CLASS_NAMES, SUBJECTS, SUBJECT_ICONS } from "@/hooks/useOnlineClasses";

// ── Animated counter ──────────────────────────────────────────────────────────
function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = to / 40;
    const id = setInterval(() => {
      start += step;
      if (start >= to) { setVal(to); clearInterval(id); }
      else setVal(Math.floor(start));
    }, 30);
    return () => clearInterval(id);
  }, [to]);
  return <>{val}{suffix}</>;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex gap-3">
        <div className="w-11 h-11 rounded-xl bg-secondary" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-secondary rounded w-2/3" />
          <div className="h-3 bg-secondary rounded w-1/2" />
        </div>
      </div>
      <div className="h-3 bg-secondary rounded w-full" />
      <div className="h-8 bg-secondary rounded-xl w-28" />
    </div>
  );
}

export default function OnlineClasses() {
  const { classes, liveClasses, upcomingClasses, completedClasses, todayClasses, loading } = useOnlineClasses();

  const [search,      setSearch]      = useState("");
  const [classFilter, setClassFilter] = useState("All");
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [tab,         setTab]         = useState<"today" | "upcoming" | "completed">("today");

  const filtered = useMemo(() => {
    const pool = tab === "today" ? todayClasses : tab === "upcoming" ? upcomingClasses : completedClasses;
    return pool.filter(c => {
      const matchSearch  = !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.subject.toLowerCase().includes(search.toLowerCase()) || c.teacher_name.toLowerCase().includes(search.toLowerCase());
      const matchClass   = classFilter   === "All" || c.class_name === classFilter;
      const matchSubject = subjectFilter === "All" || c.subject    === subjectFilter;
      return matchSearch && matchClass && matchSubject;
    });
  }, [tab, todayClasses, upcomingClasses, completedClasses, search, classFilter, subjectFilter]);

  const stats = [
    { icon: Wifi,       label: "Live Now",     value: liveClasses.length,      suffix: "",  color: "text-red-500",     bg: "bg-red-50 dark:bg-red-950/30"      },
    { icon: Calendar,   label: "Today",        value: todayClasses.length,     suffix: "",  color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-950/30"  },
    { icon: Clock,      label: "Upcoming",     value: upcomingClasses.length,  suffix: "",  color: "text-primary",     bg: "bg-primary/5"                      },
    { icon: TrendingUp, label: "Completed",    value: completedClasses.length, suffix: "",  color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30"},
  ];

  return (
    <PageLayout>
      <div className="min-h-screen bg-background">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-br from-[hsl(var(--primary-dark))] via-primary to-[hsl(var(--primary-light))] pt-10 sm:pt-20 md:pt-28 pb-8 sm:pb-12 md:pb-16 px-4">
          {/* Decorative blobs */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/3 blur-3xl pointer-events-none" />

          {/* Floating subject icons */}
          {["📐","⚛️","🧪","🧬","📖","💻"].map((ico, i) => (
            <motion.div
              key={i}
              className="absolute text-2xl opacity-20 pointer-events-none"
              style={{ top: `${15 + (i * 13) % 60}%`, left: `${5 + (i * 17) % 90}%` }}
              animate={{ y: [0, -12, 0], rotate: [0, 10, 0] }}
              transition={{ duration: 4 + i, repeat: Infinity, ease: "easeInOut" }}
            >
              {ico}
            </motion.div>
          ))}

          <div className="relative max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-full text-white/90 text-xs font-semibold mb-5 border border-white/20"
            >
              <Sparkles className="w-3.5 h-3.5" />
              GHS Babi Khel · Live Online Classes
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="font-heading font-extrabold text-white text-3xl sm:text-4xl md:text-5xl leading-tight mb-4"
            >
              Learn From{" "}
              <span className="relative inline-block">
                Anywhere
                <span className="absolute -bottom-1 left-0 right-0 h-1 bg-white/50 rounded-full" />
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-white/80 text-sm sm:text-base md:text-lg max-w-xl mx-auto mb-6 sm:mb-8"
            >
              Join live Google Meet classes with your teachers. Never miss a lesson — access recordings, homework, and class notes all in one place.
            </motion.p>

            {/* Live Classes Banner */}
            {liveClasses.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="inline-flex items-center gap-3 bg-red-500 text-white px-5 py-3 rounded-2xl shadow-lg shadow-red-500/40 cursor-pointer hover:scale-105 transition-transform"
                onClick={() => setTab("today")}
              >
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                </span>
                <span className="font-bold text-sm">
                  {liveClasses.length} Class{liveClasses.length > 1 ? "es" : ""} Live Right Now!
                </span>
                <ChevronRight className="w-4 h-4" />
              </motion.div>
            )}
          </div>
        </section>

        {/* ── Stats ────────────────────────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-4 -mt-8 mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className={`${s.bg} rounded-2xl p-3 sm:p-4 border border-border/50 shadow-sm text-center`}
              >
                <s.icon className={`w-5 h-5 mx-auto mb-1.5 ${s.color}`} />
                <p className="font-heading font-extrabold text-xl sm:text-2xl text-foreground">
                  <CountUp to={s.value} suffix={s.suffix} />
                </p>
                <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-4 pb-16">

          {/* Search & Filters */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-2xl border border-border p-4 mb-6 space-y-3"
          >
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                placeholder="Search classes, subjects, teachers…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Filter className="w-3.5 h-3.5" />
              </div>
              <select
                className="px-3 py-1.5 rounded-xl bg-secondary/50 border border-border text-xs font-medium text-foreground outline-none cursor-pointer flex-shrink-0"
                value={classFilter} onChange={e => setClassFilter(e.target.value)}
              >
                <option value="All">All Classes</option>
                {CLASS_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                className="px-3 py-1.5 rounded-xl bg-secondary/50 border border-border text-xs font-medium text-foreground outline-none cursor-pointer"
                value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
              >
                <option value="All">All Subjects</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{SUBJECT_ICONS[s]} {s}</option>)}
              </select>
            </div>
          </motion.div>

          {/* Tabs */}
          <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 mb-6">
            {([
              { key: "today",     label: "Today",     count: todayClasses.length     },
              { key: "upcoming",  label: "Upcoming",  count: upcomingClasses.length  },
              { key: "completed", label: "Completed", count: completedClasses.length },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 ${
                  tab === t.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  tab === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* Classes grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1,2,3,4].map(i => <CardSkeleton key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-card rounded-2xl border border-border p-16 text-center"
            >
              <div className="text-5xl mb-4">
                {tab === "today" ? "📅" : tab === "upcoming" ? "🗓️" : "✅"}
              </div>
              <p className="font-heading font-bold text-foreground text-lg mb-1">
                {tab === "today" ? "No classes today" : tab === "upcoming" ? "No upcoming classes" : "No completed classes"}
              </p>
              <p className="text-sm text-muted-foreground">
                {search ? "Try adjusting your search or filters." : "Check back later for scheduled classes."}
              </p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence mode="popLayout">
                {filtered.map((cls, i) => (
                  <ClassCard key={cls.id} cls={cls} role="student" index={i} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* ── Motivational Banner ───────────────────────────────────────────── */}
        <section className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-t border-border py-10 px-4">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
            <div className="text-5xl">🎓</div>
            <div className="flex-1">
              <h3 className="font-heading font-bold text-foreground text-xl mb-1">
                Knowledge is Power — Attend Every Class
              </h3>
              <p className="text-sm text-muted-foreground">
                Consistent attendance in online classes leads to better understanding and higher marks. Your future starts today.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {["📐","⚛️","🧬","📖","💻"].map((ico, i) => (
                <div key={i} className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-lg shadow-sm">
                  {ico}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
