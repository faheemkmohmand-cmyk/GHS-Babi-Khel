/**
 * OnlineClasses.tsx  (/online-classes)
 * Mobile-first Online Classes page — no floating overlap, clean layout.
 *
 * Now supports real-time live classes via Jitsi Meet (free, no Zoom license).
 * Click any "Join Live" class card → opens JitsiMeet component with:
 *  - Video conferencing via meet.jit.si
 *  - Live in-class polls (teacher launches 30-sec MCQs, results stream live)
 *  - Hand-raise queue (visible to teacher)
 *  - Emoji reactions (floating animations on screen)
 *  - "I'm confused" button → anonymous heatmap to teacher
 */
import { useState, useMemo, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageLayout from "@/components/layout/PageLayout";
import ClassCard from "@/components/shared/ClassCard";
import {
  Video, Wifi, Calendar, Clock, TrendingUp,
  Search, ChevronRight, Sparkles, Loader2, X
} from "lucide-react";
import { useOnlineClasses, CLASS_NAMES, SUBJECTS, SUBJECT_ICONS, type OnlineClass } from "@/hooks/useOnlineClasses";
import { useAuth } from "@/hooks/useAuth";

// Lazy-load JitsiMeet — it's heavy (broadcast channel + emoji rendering)
const JitsiMeet = lazy(() => import("@/components/jitsi/JitsiMeet"));

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
  const { user, profile } = useAuth();

  const [search,        setSearch]        = useState("");
  const [classFilter,   setClassFilter]   = useState("All");
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [tab,           setTab]           = useState<"today" | "upcoming" | "completed">("today");
  const [activeLiveClass, setActiveLiveClass] = useState<OnlineClass | null>(null);

  const filtered = useMemo(() => {
    const pool = tab === "today" ? todayClasses : tab === "upcoming" ? upcomingClasses : completedClasses;
    return pool.filter(c => {
      const matchSearch  = !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.subject.toLowerCase().includes(search.toLowerCase()) || c.teacher_name.toLowerCase().includes(search.toLowerCase());
      const matchClass   = classFilter   === "All" || c.class_name === classFilter;
      const matchSubject = subjectFilter === "All" || c.subject    === subjectFilter;
      return matchSearch && matchClass && matchSubject;
    });
  }, [tab, todayClasses, upcomingClasses, completedClasses, search, classFilter, subjectFilter]);

  // Build a Jitsi room name from class info (must be alphanumeric+dash for meet.jit.si)
  const buildRoomName = (cls: OnlineClass) => {
    const slug = `ghs-${cls.class_name.replace(/\s+/g, "-")}-${cls.subject.replace(/\s+/g, "-")}-${cls.id.slice(-6)}`.toLowerCase();
    return slug.replace(/[^a-z0-9-]/g, "").slice(0, 60);
  };

  const joinLiveClass = (cls: OnlineClass) => {
    setActiveLiveClass(cls);
  };

  return (
    <PageLayout>
      <div className="min-h-screen bg-background">

        {/* ── Hero — compact, no overlap ───────────────────────────────────── */}
        <section className="bg-gradient-to-br from-[hsl(var(--primary-dark))] via-primary to-[hsl(var(--primary-light))] px-4 pt-6 pb-6">
          <div className="max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-white/90 text-xs font-semibold mb-3 border border-white/20">
              <Sparkles className="w-3 h-3" />
              GHS Babi Khel · Live Online Classes
            </div>

            <h1 className="font-heading font-extrabold text-white text-2xl leading-tight mb-1">
              Learn From Anywhere
            </h1>
            <p className="text-white/75 text-xs mb-4 max-w-xs">
              Join live Google Meet classes. Access recordings, homework, and notes in one place.
            </p>

            {/* Live alert inside hero */}
            {liveClasses.length > 0 && (
              <button
                onClick={() => setTab("today")}
                className="flex items-center gap-2 bg-red-500 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-lg"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                {liveClasses.length} Class{liveClasses.length > 1 ? "es" : ""} Live Now!
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </section>

        {/* ── Stats — below hero, no overlap ───────────────────────────────── */}
        <section className="bg-background border-b border-border px-4 py-4">
          <div className="max-w-4xl mx-auto grid grid-cols-4 gap-2">
            {[
              { icon: Wifi,       label: "Live",      value: liveClasses.length,      color: "text-red-500"     },
              { icon: Calendar,   label: "Today",     value: todayClasses.length,     color: "text-blue-500"    },
              { icon: Clock,      label: "Upcoming",  value: upcomingClasses.length,  color: "text-primary"     },
              { icon: TrendingUp, label: "Completed", value: completedClasses.length, color: "text-emerald-500" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <s.icon className={`w-4 h-4 mx-auto mb-0.5 ${s.color}`} />
                <p className="font-heading font-extrabold text-base text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-3 py-4 pb-10">

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              placeholder="Search classes, subjects, teachers…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
            <select
              className="px-2.5 py-1.5 rounded-xl bg-card border border-border text-xs font-medium text-foreground outline-none cursor-pointer shrink-0"
              value={classFilter} onChange={e => setClassFilter(e.target.value)}
            >
              <option value="All">All Classes</option>
              {CLASS_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              className="px-2.5 py-1.5 rounded-xl bg-card border border-border text-xs font-medium text-foreground outline-none cursor-pointer shrink-0"
              value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
            >
              <option value="All">All Subjects</option>
              {SUBJECTS.map(s => <option key={s} value={s}>{SUBJECT_ICONS[s]} {s}</option>)}
            </select>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 mb-4">
            {([
              { key: "today",     label: "Today",     count: todayClasses.length     },
              { key: "upcoming",  label: "Upcoming",  count: upcomingClasses.length  },
              { key: "completed", label: "Completed", count: completedClasses.length },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-2 px-1 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
                  tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {t.label}
                <span className={`px-1 py-0.5 rounded-full text-[10px] font-bold ${
                  tab === t.key ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* Classes */}
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <CardSkeleton key={i} />)}</div>
          ) : filtered.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-10 text-center">
              <div className="text-4xl mb-3">
                {tab === "today" ? "📅" : tab === "upcoming" ? "🗓️" : "✅"}
              </div>
              <p className="font-bold text-foreground text-sm mb-1">
                {tab === "today" ? "No classes today" : tab === "upcoming" ? "No upcoming classes" : "No completed classes"}
              </p>
              <p className="text-xs text-muted-foreground">
                {search ? "Try adjusting your search or filters." : "Check back later for scheduled classes."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {filtered.map((cls, i) => (
                  <ClassCard key={cls.id} cls={cls} role="student" index={i} onJoinLive={joinLiveClass} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* ── Footer banner ────────────────────────────────────────────────── */}
        <section className="border-t border-border py-5 px-4 text-center">
          <p className="text-2xl mb-1">🎓</p>
          <p className="font-heading font-bold text-foreground text-sm">Knowledge is Power — Attend Every Class</p>
          <p className="text-xs text-muted-foreground mt-1">Consistent attendance leads to better results. Your future starts today.</p>
        </section>

      </div>

      {/* ── Live class modal (Jitsi Meet + polls + reactions) ───────────────── */}
      <AnimatePresence>
        {activeLiveClass && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
            onClick={() => setActiveLiveClass(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto"
            >
              {/* Modal header */}
              <div className="sticky top-0 z-10 bg-card border-b border-border p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-foreground text-sm truncate">{activeLiveClass.title}</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {SUBJECT_ICONS[activeLiveClass.subject] || "📚"} {activeLiveClass.subject} · {activeLiveClass.class_name} · {activeLiveClass.teacher_name}
                  </p>
                </div>
                <button
                  onClick={() => setActiveLiveClass(null)}
                  className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/70 flex items-center justify-center shrink-0"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* JitsiMeet component */}
              <div className="p-3">
                <Suspense fallback={
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                }>
                  <JitsiMeet
                    roomName={buildRoomName(activeLiveClass)}
                    displayName={profile?.full_name || user?.email || "Guest Student"}
                    isTeacher={profile?.role === "teacher" || profile?.role === "admin"}
                    classId={activeLiveClass.id}
                    subjectColor="#3b82f6"
                  />
                </Suspense>

                {/* Sign-in prompt for guests */}
                {!user && (
                  <div className="mt-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                    💡 Sign in to participate in polls, raise your hand, and react. As a guest you can watch only.
                    <a href="/auth/signin" className="ml-1 underline font-semibold">Sign in →</a>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
          }
               
