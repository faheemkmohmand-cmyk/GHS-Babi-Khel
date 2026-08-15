import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, BookOpen, ChevronRight, Sparkles, GraduationCap, Star, WifiOff, RefreshCw } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import { useNoteSubjects } from "@/hooks/useNotes";
import { Skeleton } from "@/components/ui/skeleton";

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
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 py-8 sm:py-10 px-4">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=60 height=60 viewBox=0 0 60 60 xmlns=http://www.w3.org/2000/svg%3E%3Cg fill=none fill-rule=evenodd%3E%3Cg fill=%23ffffff fill-opacity=0.05%3E%3Ccircle cx=30 cy=30 r=4/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]" />
        <div className="relative max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-semibold mb-3">
              <Sparkles className="w-3 h-3" /> Interactive Study Notes
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-2 leading-tight">
              Study Smarter, <span className="text-blue-300">Not Harder</span>
            </h1>
            <p className="text-xs sm:text-sm text-white/80 mb-4 max-w-md mx-auto">
              Beautiful notes, interactive animations, quizzes and graphs — all for free, for GHS Babi Khel students.
            </p>

            {/* Search */}
            <div className="relative max-w-xs sm:max-w-sm mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search subjects..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-white/30 text-sm shadow-lg"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-white dark:bg-card border-b border-border py-2.5">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap justify-center gap-4 sm:gap-6">
          {[
            { label: "Subjects", value: subjects.length, icon: BookOpen },
            { label: "Interactive", value: "100%", icon: Sparkles },
            { label: "Free Forever", value: "✓", icon: Star },
            { label: "Classes", value: "6–10", icon: GraduationCap },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-primary" />
              <span className="font-bold text-sm text-foreground">{value}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Filter buttons */}
      <section className="max-w-6xl mx-auto px-4 pt-5">
        <div className="flex flex-wrap gap-2 mb-5">
          {CLASS_FILTERS.map(f => (
            <button key={f} onClick={() => setClassFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                classFilter === f ? "bg-primary text-primary-foreground shadow-md" : "bg-secondary text-muted-foreground hover:bg-secondary/70"
              }`}>{f}</button>
          ))}
        </div>

        {/* Subject grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
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
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-semibold text-foreground">No subjects found</p>
            <p className="text-sm text-muted-foreground mt-1">Try a different search or filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
            {filtered.map((subject, i) => (
              <motion.div key={subject.id}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -4, scale: 1.01 }}
                className="group">
                <Link to={`/notes/${subject.slug}`}>
                  <div className="relative overflow-hidden rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 h-36"
                    style={{ background: `linear-gradient(135deg, ${subject.color}, ${subject.color}dd)` }}>

                    {/* Background pattern */}
                    <div className="absolute inset-0 opacity-10"
                      style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />

                    {/* Big emoji */}
                    <div className="absolute top-3 right-3 text-3xl opacity-30 group-hover:opacity-50 transition-opacity">
                      {subject.emoji}
                    </div>

                    <div className="relative p-3.5 flex flex-col h-full justify-between">
                      <div>
                        <span className="text-xl">{subject.emoji}</span>
                        <h3 className="text-base font-black text-white mt-1">{subject.name}</h3>
                        <p className="text-xs text-white/80 mt-0.5 line-clamp-1">{subject.description}</p>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">
                          Class {subject.class_level}
                        </span>
                        <div className="flex items-center gap-1 text-white font-semibold text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg transition-colors">
                          Start Learning <ChevronRight className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </PageLayout>
  );
};

export default NotesPage;
