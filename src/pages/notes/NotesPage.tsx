import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, BookOpen, ChevronRight, Sparkles, GraduationCap, Star, WifiOff, RefreshCw, SearchX } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import { useNoteSubjects } from "@/hooks/useNotes";
import { Skeleton } from "@/components/ui/skeleton";
import { getSubjectGradient, getSubjectSolid, getSubjectTint, getSubjectTintDeep } from "@/lib/subjectTheme";

const CLASS_FILTERS = ["All Classes", "6-7", "8", "9-10"];

const NotesPage = () => {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("All Classes");
  const { data: subjects = [], isLoading, isError, refetch } = useNoteSubjects();

  const filtered = subjects.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchClass = classFilter === "All Classes" || s.class_level?.includes(classFilter.split("-")[0]);
    return matchSearch && matchClass;
  });

  return (
    <PageLayout>
      {/* ─── Hero — Emerald Prestige: deep emerald + antique gold ─── */}
      <section className="relative overflow-hidden px-4 py-10 sm:py-14" style={{ background: "var(--gradient-hero)" }}>
        {/* Ambient glows */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 85% 12%, hsl(43 60% 58% / 0.16), transparent 52%)" }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 8% 95%, hsl(160 45% 30% / 0.4), transparent 55%)" }} />
        {/* Fine dot texture */}
        <div className="absolute inset-0 opacity-[0.35]" style={{ backgroundImage: "radial-gradient(hsl(45 40% 97% / 0.07) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />

        <div className="relative max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-1.5 bg-gold/10 border border-gold/25 text-gold-soft px-3.5 py-1.5 rounded-full text-xs font-semibold mb-4">
              <Sparkles className="w-3.5 h-3.5" /> Interactive Study Notes
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-heading font-black text-white mb-3 leading-tight tracking-tight">
              Study Smarter,{" "}
              <span className="bg-gradient-to-r from-gold to-[hsl(45_75%_74%)] bg-clip-text text-transparent">
                Not Harder
              </span>
            </h1>
            <p className="text-sm sm:text-base text-white/70 mb-6 max-w-lg mx-auto">
              Beautiful notes, interactive animations, quizzes and graphs — all for free, for GHS Babi Khel students.
            </p>

            {/* Search */}
            <div className="relative max-w-sm mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search subjects..."
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-gold/60 text-sm shadow-xl transition-shadow"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Stats bar — refined pills ─── */}
      <section className="bg-background border-b border-border py-3.5">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap justify-center gap-2.5 sm:gap-3">
          {[
            { label: "Subjects", value: subjects.length, icon: BookOpen },
            { label: "Interactive", value: "100%", icon: Sparkles },
            { label: "Free Forever", value: "✓", icon: Star },
            { label: "Classes", value: "6–10", icon: GraduationCap },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 shadow-sm">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary">
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="font-heading font-bold text-sm text-foreground">{value}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Filters + Subject grid ─── */}
      <section className="max-w-6xl mx-auto px-4 pt-6">
        <div className="flex flex-wrap gap-2 mb-6">
          {CLASS_FILTERS.map(f => (
            <button key={f} onClick={() => setClassFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 ${
                classFilter === f
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}>{f}</button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-44 rounded-3xl" />)}
          </div>
        ) : isError ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-4">
              <WifiOff className="w-8 h-8 text-orange-500" />
            </div>
            <p className="font-semibold text-foreground text-lg">Can't load subjects</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">You appear to be offline. Subjects you've visited before will load from cache.</p>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <SearchX className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground">No subjects found</p>
            <p className="text-sm text-muted-foreground mt-1">Try a different search or filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pb-14">
            {filtered.map((subject, i) => {
              const solid = getSubjectSolid(subject.color);
              return (
              <motion.div key={subject.id}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -6 }}
                className="group"
                style={{ "--sc": solid, "--sc-soft": getSubjectTintDeep(subject.color, 0.45) } as React.CSSProperties}>
                <Link to={`/notes/${subject.slug}`} className="block h-full">
                  <div className="relative h-44 overflow-hidden rounded-3xl bg-card border border-border shadow-sm transition-all duration-300 group-hover:shadow-[0_22px_44px_-18px_var(--sc)] group-hover:border-[color:var(--sc-soft)] group-hover:ring-1 group-hover:ring-[color:var(--sc-soft)]">

                    {/* Signature color strip */}
                    <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: getSubjectGradient(subject.color) }} />

                    {/* Soft corner wash */}
                    <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full pointer-events-none"
                      style={{ background: `radial-gradient(circle, ${getSubjectTint(subject.color, 0.22)}, transparent 68%)` }} />

                    <div className="relative p-5 flex flex-col h-full justify-between">
                      <div>
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-3 transition-transform duration-300 group-hover:scale-110"
                          style={{ backgroundColor: getSubjectTint(subject.color, 0.14), boxShadow: `inset 0 0 0 1px ${getSubjectTintDeep(subject.color, 0.28)}` }}>
                          {subject.emoji}
                        </div>
                        <h3 className="font-heading text-lg font-bold text-foreground leading-snug">{subject.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{subject.description}</p>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold bg-secondary text-secondary-foreground">
                          Class {subject.class_level}
                        </span>
                        <div className="flex items-center gap-1 text-xs font-bold text-white pl-3 pr-2.5 py-2 rounded-xl shadow-sm transition-all duration-300 group-hover:gap-2 group-hover:shadow-md"
                          style={{ background: getSubjectGradient(subject.color) }}>
                          Start Learning <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </PageLayout>
  );
};

export default NotesPage;
