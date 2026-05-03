import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, BookOpen, ChevronRight, Sparkles, GraduationCap, Star } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import { useNoteSubjects } from "@/hooks/useNotes";
import { Skeleton } from "@/components/ui/skeleton";

const CLASS_FILTERS = ["All Classes", "6-7", "8", "9-10"];

const NotesPage = () => {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("All Classes");
  const { data: subjects = [], isLoading } = useNoteSubjects();

  const filtered = subjects.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchClass = classFilter === "All Classes" || s.class_level?.includes(classFilter.split("-")[0]);
    return matchSearch && matchClass;
  });

  return (
    <PageLayout>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 py-20 px-4">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=60 height=60 viewBox=0 0 60 60 xmlns=http://www.w3.org/2000/svg%3E%3Cg fill=none fill-rule=evenodd%3E%3Cg fill=%23ffffff fill-opacity=0.05%3E%3Ccircle cx=30 cy=30 r=4/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]" />
        <div className="relative max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-semibold mb-6">
              <Sparkles className="w-4 h-4" /> Interactive Study Notes
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-white mb-4 leading-tight">
              Study Smarter,<br />
              <span className="text-blue-300">Not Harder</span>
            </h1>
            <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">
              Beautiful notes, interactive animations, quizzes and graphs — all for free, all for GHS Babi Khel students.
            </p>

            {/* Search */}
            <div className="relative max-w-md mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search subjects..."
                className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white text-gray-900 placeholder-gray-400 outline-none focus:ring-4 focus:ring-white/30 text-base shadow-xl"
              />
            </div>
          </motion.div>
        </div>

        {/* Floating subject pills */}
        <div className="absolute top-8 left-8 hidden lg:flex flex-col gap-2 opacity-60">
          {["Math ✏️", "Physics ⚡", "Chemistry 🧪"].map((s, i) => (
            <motion.div key={s} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 0.6 }} transition={{ delay: i * 0.1 }}
              className="bg-white/20 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full">{s}</motion.div>
          ))}
        </div>
        <div className="absolute top-8 right-8 hidden lg:flex flex-col gap-2 opacity-60">
          {["English 📖", "Biology 🌿", "Urdu ✍️"].map((s, i) => (
            <motion.div key={s} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 0.6 }} transition={{ delay: i * 0.1 }}
              className="bg-white/20 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full">{s}</motion.div>
          ))}
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-white dark:bg-card border-b border-border py-4">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap justify-center gap-8">
          {[
            { label: "Subjects", value: subjects.length, icon: BookOpen },
            { label: "Interactive", value: "100%", icon: Sparkles },
            { label: "Free Forever", value: "✓", icon: Star },
            { label: "Classes", value: "6–10", icon: GraduationCap },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-primary" />
              <span className="font-bold text-foreground">{value}</span>
              <span className="text-sm text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Filter buttons */}
      <section className="max-w-6xl mx-auto px-4 pt-8">
        <div className="flex flex-wrap gap-2 mb-8">
          {CLASS_FILTERS.map(f => (
            <button key={f} onClick={() => setClassFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                classFilter === f ? "bg-primary text-primary-foreground shadow-md" : "bg-secondary text-muted-foreground hover:bg-secondary/70"
              }`}>{f}</button>
          ))}
        </div>

        {/* Subject grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-52 rounded-3xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-semibold text-foreground">No subjects found</p>
            <p className="text-sm text-muted-foreground mt-1">Try a different search or filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-16">
            {filtered.map((subject, i) => (
              <motion.div key={subject.id}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -6, scale: 1.01 }}
                className="group">
                <Link to={`/notes/${subject.slug}`}>
                  <div className="relative overflow-hidden rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-300 h-52"
                    style={{ background: `linear-gradient(135deg, ${subject.color}, ${subject.color}dd)` }}>

                    {/* Background pattern */}
                    <div className="absolute inset-0 opacity-10"
                      style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />

                    {/* Big emoji */}
                    <div className="absolute top-4 right-4 text-5xl opacity-30 group-hover:opacity-50 transition-opacity">
                      {subject.emoji}
                    </div>

                    <div className="relative p-6 flex flex-col h-full justify-between">
                      <div>
                        <span className="text-3xl">{subject.emoji}</span>
                        <h3 className="text-xl font-black text-white mt-2">{subject.name}</h3>
                        <p className="text-sm text-white/80 mt-1 line-clamp-2">{subject.description}</p>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs bg-white/20 text-white px-2.5 py-1 rounded-full font-medium">
                          Class {subject.class_level}
                        </span>
                        <div className="flex items-center gap-1 text-white font-semibold text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl transition-colors">
                          Start Learning <ChevronRight className="w-4 h-4" />
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
