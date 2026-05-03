/**
 * OnlineClassesTab.tsx
 * Tab for the Student dashboard — shows today's + upcoming classes.
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import ClassCard from "@/components/shared/ClassCard";
import { useOnlineClasses } from "@/hooks/useOnlineClasses";
import { useAuth } from "@/hooks/useAuth";
import {
  Video, Wifi, Calendar, Clock, ExternalLink, BookOpen, Search
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex gap-3"><div className="w-11 h-11 rounded-xl bg-muted" /><div className="flex-1 space-y-2"><div className="h-4 bg-muted rounded w-2/3" /><div className="h-3 bg-muted rounded w-1/2" /></div></div>
      <div className="h-3 bg-muted rounded" />
      <div className="h-9 bg-muted rounded-xl w-28" />
    </div>
  );
}

export default function OnlineClassesTab() {
  const { profile } = useAuth();
  const { classes, liveClasses, upcomingClasses, todayClasses, loading } = useOnlineClasses();
  const [search, setSearch] = useState("");

  // Filter by student's class if known
  const myClasses = useMemo(() => {
    const all = classes.filter(c => {
      if (profile?.class && c.class_name !== `Class ${profile.class}`) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.title.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q);
      }
      return true;
    });
    return all;
  }, [classes, profile, search]);

  const myToday     = todayClasses.filter(c => !profile?.class || c.class_name === `Class ${profile.class}`);
  const myUpcoming  = upcomingClasses.filter(c => !profile?.class || c.class_name === `Class ${profile.class}`);
  const myLive      = liveClasses.filter(c => !profile?.class || c.class_name === `Class ${profile.class}`);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            Online Classes
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Join live Google Meet classes with your teachers
          </p>
        </div>
        <Link
          to="/online-classes"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Full Schedule
        </Link>
      </div>

      {/* Live alert */}
      <AnimatePresence>
        {myLive.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-2xl p-4 flex items-center gap-3"
          >
            <span className="relative flex h-4 w-4 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-600 dark:text-red-400">
                {myLive.length} Class{myLive.length > 1 ? "es" : ""} Live Right Now!
              </p>
              <p className="text-xs text-red-500/80 dark:text-red-400/70">
                {myLive.map(c => c.subject).join(" · ")}
              </p>
            </div>
            <a
              href={myLive[0].meet_link}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors flex items-center gap-1.5"
            >
              <Wifi className="w-3.5 h-3.5" /> Join Now
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Wifi,     label: "Live Now",    value: myLive.length,     color: "text-red-500",     bg: "bg-red-50 dark:bg-red-950/20"     },
          { icon: Calendar, label: "Today",       value: myToday.length,    color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-950/20"  },
          { icon: Clock,    label: "Upcoming",    value: myUpcoming.length, color: "text-primary",     bg: "bg-primary/5"                      },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center border border-border/50`}>
            <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
            <p className="font-bold text-lg text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          placeholder="Search classes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Today's Classes */}
      {loading ? (
        <div className="space-y-3">{[1,2].map(i => <CardSkeleton key={i} />)}</div>
      ) : myToday.length > 0 ? (
        <section>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-primary" /> Today's Classes
          </p>
          <div className="space-y-3">
            {myToday.map((cls, i) => (
              <ClassCard key={cls.id} cls={cls} role="student" index={i} />
            ))}
          </div>
        </section>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-10 text-center">
          <div className="text-4xl mb-3">📅</div>
          <p className="font-semibold text-foreground mb-1">No classes today</p>
          <p className="text-xs text-muted-foreground">Upcoming classes are shown below.</p>
        </div>
      )}

      {/* Upcoming */}
      {!loading && myUpcoming.length > 0 && (
        <section>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary" /> Upcoming
          </p>
          <div className="space-y-3">
            {myUpcoming.slice(0, 4).map((cls, i) => (
              <ClassCard key={cls.id} cls={cls} role="student" index={i} />
            ))}
            {myUpcoming.length > 4 && (
              <Link
                to="/online-classes"
                className="block text-center py-3 rounded-xl bg-secondary hover:bg-secondary/80 text-sm font-semibold text-primary transition-colors"
              >
                View {myUpcoming.length - 4} more upcoming classes →
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
