/**
 * TeacherOnlineClassesTab.tsx
 * Teacher dashboard tab — create, edit, manage own classes, add homework/notes.
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ClassCard from "@/components/shared/ClassCard";
import ClassFormModal from "@/components/shared/ClassFormModal";
import { useOnlineClasses, OnlineClass } from "@/hooks/useOnlineClasses";
import { useAuth } from "@/hooks/useAuth";
import {
  Video, Plus, Wifi, Calendar, Clock, CheckCircle,
  BarChart3, Search
} from "lucide-react";

export default function TeacherOnlineClassesTab() {
  const { profile } = useAuth();
  const { classes, liveClasses, upcomingClasses, completedClasses, loading, createClass, updateClass, deleteClass } = useOnlineClasses();

  const [modalOpen,  setModalOpen]  = useState(false);
  const [editTarget, setEditTarget] = useState<OnlineClass | null>(null);
  const [search,     setSearch]     = useState("");
  const [tab,        setTab]        = useState<"upcoming" | "completed">("upcoming");

  const teacherName = profile?.full_name || "Teacher";
  const teacherId   = profile?.id || "";

  // Filter to this teacher's classes
  const myClasses = useMemo(() =>
    classes.filter(c =>
      !c.teacher_id
        ? c.teacher_name.toLowerCase() === teacherName.toLowerCase()
        : c.teacher_id === teacherId
    ), [classes, teacherName, teacherId]);

  const myUpcoming  = myClasses.filter(c => c.status === "upcoming");
  const myLive      = myClasses.filter(c => c.status === "live");
  const myCompleted = myClasses.filter(c => c.status === "completed");

  const displayed = (tab === "upcoming" ? [...myLive, ...myUpcoming] : myCompleted)
    .filter(c => !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.subject.toLowerCase().includes(search.toLowerCase()));

  const handleEdit = (cls: OnlineClass) => {
    setEditTarget(cls);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    if (editTarget) return updateClass(editTarget.id, data);
    return createClass({ ...data, teacher_name: teacherName, teacher_id: teacherId });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            My Online Classes
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create and manage your Google Meet classes
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-md"
        >
          <Plus className="w-4 h-4" /> New Class
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Wifi,         label: "Live Now",   value: myLive.length,      color: "text-red-500",     bg: "bg-red-50 dark:bg-red-950/20"     },
          { icon: BarChart3,    label: "My Classes", value: myClasses.length,   color: "text-primary",     bg: "bg-primary/5"                     },
          { icon: Clock,        label: "Upcoming",   value: myUpcoming.length,  color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-950/20" },
          { icon: CheckCircle,  label: "Completed",  value: myCompleted.length, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/20"},
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 text-center border border-border/50`}>
            <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
            <p className="font-bold text-2xl text-foreground">{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Live banner */}
      <AnimatePresence>
        {myLive.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800/50 rounded-2xl p-4 flex items-center gap-3"
          >
            <span className="relative flex h-4 w-4 shrink-0">
              <span className="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-600 dark:text-red-400">Your class is live right now!</p>
              <p className="text-xs text-red-500/80">{myLive.map(c => c.title).join(" · ")}</p>
            </div>
            <a
              href={myLive[0].meet_link} target="_blank" rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors"
            >
              Open Meet
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search + Tabs */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            placeholder="Search your classes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
          {([["upcoming","Upcoming & Live"],["completed","Completed"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              {label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === key ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                {key === "upcoming" ? myUpcoming.length + myLive.length : myCompleted.length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Classes */}
      {loading ? (
        <div className="space-y-3">
          {[1,2].map(i => (
            <div key={i} className="rounded-2xl border bg-card p-4 space-y-3 animate-pulse">
              <div className="flex gap-3"><div className="w-11 h-11 rounded-xl bg-muted" /><div className="flex-1 space-y-2"><div className="h-4 bg-muted rounded w-2/3" /><div className="h-3 bg-muted rounded w-1/2" /></div></div>
              <div className="h-8 bg-muted rounded-xl w-24" />
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-card rounded-2xl border border-border p-14 text-center">
          <div className="text-5xl mb-4">{tab === "upcoming" ? "🗓️" : "✅"}</div>
          <p className="font-semibold text-foreground mb-1">
            {tab === "upcoming" ? "No upcoming classes" : "No completed classes yet"}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {tab === "upcoming" ? "Create your first class to get started." : "Completed classes will appear here."}
          </p>
          {tab === "upcoming" && (
            <button onClick={handleCreate}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors">
              + Create Class
            </button>
          )}
        </motion.div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {displayed.map((cls, i) => (
              <ClassCard key={cls.id} cls={cls} role="teacher" index={i} onEdit={handleEdit} onDelete={deleteClass} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Modal */}
      <ClassFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSubmit={handleSubmit}
        initial={editTarget}
        teacherName={teacherName}
        teacherId={teacherId}
        showTeacherField={false}
      />
    </div>
  );
}
