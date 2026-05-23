/**
 * AdminOnlineClasses.tsx
 * Admin dashboard tab — full control over all online classes.
 */
import { useState, useMemo } from "react";
import ClassCard from "@/components/shared/ClassCard";
import ClassFormModal from "@/components/shared/ClassFormModal";
import { useOnlineClasses, OnlineClass, CLASS_NAMES, SUBJECTS } from "@/hooks/useOnlineClasses";
import {
  Video, Plus, Wifi, Calendar, Clock, CheckCircle,
  BarChart3, Search, Filter, Users, TrendingUp,
  AlertCircle, Trash2
} from "lucide-react";

// ── Animated counter ──────────────────────────────────────────────────────────
function Num({ n }: { n: number }) {
  return <span className="font-heading font-extrabold text-3xl text-foreground">{n}</span>;
}

export default function AdminOnlineClasses() {
  const {
    classes, liveClasses, upcomingClasses, completedClasses, todayClasses,
    completedToday, loading, createClass, updateClass, deleteClass
  } = useOnlineClasses();

  const [modalOpen,    setModalOpen]    = useState(false);
  const [editTarget,   setEditTarget]   = useState<OnlineClass | null>(null);
  const [search,       setSearch]       = useState("");
  const [classFilter,  setClassFilter]  = useState("All");
  const [subjectFilter,setSubjectFilter]= useState("All");
  const [tab,          setTab]          = useState<"all" | "live" | "upcoming" | "completed">("all");
  const [confirmId,    setConfirmId]    = useState<string | null>(null);

  const filtered = useMemo(() => {
    const pool = tab === "all" ? classes : tab === "live" ? liveClasses : tab === "upcoming" ? upcomingClasses : completedClasses;
    return pool.filter(c => {
      const q = search.toLowerCase();
      const matchSearch  = !search || c.title.toLowerCase().includes(q) || c.teacher_name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q);
      const matchClass   = classFilter   === "All" || c.class_name === classFilter;
      const matchSubject = subjectFilter === "All" || c.subject    === subjectFilter;
      return matchSearch && matchClass && matchSubject;
    });
  }, [tab, classes, liveClasses, upcomingClasses, completedClasses, search, classFilter, subjectFilter]);

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
    return createClass(data);
  };

  const handleDelete = async (id: string) => {
    await deleteClass(id);
    setConfirmId(null);
  };

  const analytics = [
    { icon: BarChart3,   label: "Total Classes",     value: classes.length,         color: "text-primary",     bg: "from-primary/10 to-primary/5",             border: "border-primary/20"           },
    { icon: Wifi,        label: "Live Right Now",     value: liveClasses.length,     color: "text-red-500",     bg: "from-red-500/10 to-red-500/5",             border: "border-red-400/20"           },
    { icon: TrendingUp,  label: "Completed Today",    value: completedToday.length,  color: "text-emerald-500", bg: "from-emerald-500/10 to-emerald-500/5",     border: "border-emerald-400/20"       },
    { icon: Clock,       label: "Upcoming",           value: upcomingClasses.length, color: "text-blue-500",   bg: "from-blue-500/10 to-blue-500/5",         border: "border-blue-400/20"         },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            Online Classes Manager
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full control over all scheduled online classes
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-md"
        >
          <Plus className="w-4 h-4" /> Schedule Class
        </button>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {analytics.map((a, i) => (
          <div
            key={a.label}
            className={`bg-gradient-to-br ${a.bg} rounded-2xl border ${a.border} p-4 relative overflow-hidden`}
          >
            <a.icon className={`w-5 h-5 mb-3 ${a.color}`} />
            <Num n={a.value} />
            <p className="text-xs text-muted-foreground mt-0.5">{a.label}</p>
            {a.label === "Live Right Now" && a.value > 0 && (
              <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
                <span className="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Live warning */}
      {liveClasses.length > 0 && (
          <div
            className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-2xl p-4 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                {liveClasses.length} active class{liveClasses.length > 1 ? "es" : ""} live right now
              </p>
              <p className="text-xs text-red-500/80">{liveClasses.map(c => `${c.subject} — ${c.teacher_name}`).join(" · ")}</p>
            </div>
          </div>
        )}

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            placeholder="Search by title, teacher, subject…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <select className="px-3 py-1.5 rounded-xl bg-secondary/50 border border-border text-xs font-medium outline-none cursor-pointer"
            value={classFilter} onChange={e => setClassFilter(e.target.value)}>
            <option value="All">All Classes</option>
            {CLASS_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="px-3 py-1.5 rounded-xl bg-secondary/50 border border-border text-xs font-medium outline-none cursor-pointer"
            value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
            <option value="All">All Subjects</option>
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
        {([
          ["all",       "All",       classes.length],
          ["live",      "Live",      liveClasses.length],
          ["upcoming",  "Upcoming",  upcomingClasses.length],
          ["completed", "Completed", completedClasses.length],
        ] as const).map(([key, label, count]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {label}
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === key ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Classes list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-2xl border bg-card p-4 animate-pulse space-y-3">
              <div className="flex gap-3"><div className="w-11 h-11 rounded-xl bg-muted" /><div className="flex-1 space-y-2"><div className="h-4 bg-muted rounded w-2/3" /><div className="h-3 bg-muted rounded w-1/2" /></div></div>
              <div className="flex gap-2"><div className="h-8 bg-muted rounded-xl w-20" /><div className="h-8 bg-muted rounded-xl w-16" /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-14 text-center">
          <div className="text-5xl mb-4">🗓️</div>
          <p className="font-semibold text-foreground mb-1">No classes found</p>
          <p className="text-xs text-muted-foreground mb-4">
            {search ? "Try adjusting your search." : "Schedule the first class to get started."}
          </p>
          <button onClick={handleCreate}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold">
            + Schedule Class
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((cls, i) => (
              <ClassCard key={cls.id} cls={cls} role="admin" index={i} onEdit={handleEdit}
                onDelete={(id) => setConfirmId(id)} />
            ))}
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              onClick={() => setConfirmId(null)}
              className="absolute inset-0 bg-black/60" />
            <div
              className="relative bg-card rounded-2xl border border-border p-6 max-w-sm w-full shadow-2xl text-center">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="font-heading font-bold text-foreground mb-2">Delete Class?</h3>
              <p className="text-sm text-muted-foreground mb-5">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmId(null)}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold">Cancel</button>
                <button onClick={() => handleDelete(confirmId)}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold">Delete</button>
              </div>
            </div>
          </div>
        )}

      {/* Modal */}
      <ClassFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSubmit={handleSubmit}
        initial={editTarget}
        showTeacherField={true}
      />
    </div>
  );
}
