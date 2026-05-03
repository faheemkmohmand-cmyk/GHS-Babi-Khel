import { useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, BookOpen, CheckCircle, Lock, Zap, Download, PlayCircle } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import { useNoteSubjects, useNoteChapters, useNoteProgress } from "@/hooks/useNotes";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

const DIFFICULTY_COLOR = { easy: "text-green-600 bg-green-100", medium: "text-blue-700 bg-blue-100", hard: "text-red-600 bg-red-100" };
const DIFFICULTY_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" };

const SubjectPage = () => {
  const { subject: slug } = useParams<{ subject: string }>();
  const { user } = useAuth();
  const { data: subjects = [], isLoading: loadingSubjects } = useNoteSubjects();
  const subject = subjects.find(s => s.slug === slug);
  const { data: chapters = [], isLoading: loadingChapters } = useNoteChapters(subject?.id);
  const { data: progress = [] } = useNoteProgress(user?.id);

  if (loadingSubjects) return <PageLayout><div className="p-8"><Skeleton className="h-48 rounded-3xl mb-6" />{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl mb-3" />)}</div></PageLayout>;
  if (!subject && !loadingSubjects) return <Navigate to="/notes" replace />;
  if (!subject) return null;

  const completedIds = new Set(progress.filter(p => p.completed).map(p => p.chapter_id));
  const completedCount = chapters.filter(c => completedIds.has(c.id)).length;
  const progressPct = chapters.length > 0 ? Math.round((completedCount / chapters.length) * 100) : 0;

  return (
    <PageLayout>
      {/* Header */}
      <section className="relative overflow-hidden py-14 px-4" style={{ background: `linear-gradient(135deg, ${subject.color}, ${subject.color}bb)` }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 70% 30%, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="relative max-w-4xl mx-auto">
          <Link to="/notes" className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to All Subjects
          </Link>
          <div className="flex items-center gap-4">
            <div className="text-6xl">{subject.emoji}</div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white">{subject.name}</h1>
              <p className="text-white/80 mt-1">{subject.description}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs bg-white/20 text-white px-2.5 py-1 rounded-full">Class {subject.class_level}</span>
                <span className="text-xs bg-white/20 text-white px-2.5 py-1 rounded-full">{chapters.length} Chapters</span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {user && chapters.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between text-sm text-white/80 mb-2">
                <span>{completedCount} of {chapters.length} chapters completed</span>
                <span className="font-bold">{progressPct}%</span>
              </div>
              <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full bg-white rounded-full" />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Chapters */}
      <section className="max-w-4xl mx-auto px-4 py-10">
        {loadingChapters ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        ) : chapters.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">📝</p>
            <p className="font-semibold text-foreground text-lg">No chapters yet</p>
            <p className="text-sm text-muted-foreground mt-1">Chapters will appear here when published by admin</p>
          </div>
        ) : (
          <div className="space-y-3">
            {chapters.map((ch, i) => {
              const done = completedIds.has(ch.id);
              return (
                <motion.div key={ch.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <Link to={`/notes/${slug}/${ch.slug}`}>
                    <div className={`group relative bg-card border rounded-2xl p-5 hover:shadow-lg transition-all duration-200 hover:border-[${subject.color}]/50 ${done ? "border-green-200 dark:border-green-800/40" : "border-border"}`}>
                      {/* Left color stripe */}
                      <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full" style={{ backgroundColor: subject.color }} />

                      <div className="pl-4 flex items-center gap-4">
                        {/* Chapter number */}
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-black text-white text-lg"
                          style={{ backgroundColor: done ? "#16a34a" : subject.color }}>
                          {done ? <CheckCircle className="w-6 h-6" /> : ch.chapter_number}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-foreground text-base">{ch.title}</h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${DIFFICULTY_COLOR[ch.difficulty]}`}>
                              {DIFFICULTY_LABEL[ch.difficulty]}
                            </span>
                            {done && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-green-700 bg-green-100">✓ Done</span>}
                          </div>
                          {ch.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{ch.description}</p>}
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {ch.read_time_mins} min read</span>
                            {ch.animation_code && <span className="flex items-center gap-1 text-purple-600"><Zap className="w-3 h-3" /> Interactive</span>}
                            {ch.pdf_url && <span className="flex items-center gap-1 text-blue-600"><Download className="w-3 h-3" /> PDF</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white shrink-0 group-hover:opacity-90 transition-opacity"
                          style={{ backgroundColor: subject.color }}>
                          <PlayCircle className="w-4 h-4" />
                          {done ? "Review" : "Read"}
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

export default SubjectPage;
