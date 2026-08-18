import { useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, BookOpen, CheckCircle, Lock, Zap, Download, PlayCircle, WifiOff, RefreshCw } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import { useNoteSubjects, useNoteChapters, useNoteProgress } from "@/hooks/useNotes";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { getReadableTextColor, getReadableTextColorMuted } from "@/lib/contrastColor";

const DIFFICULTY_COLOR = { easy: "text-green-600 bg-green-100", medium: "text-blue-700 bg-blue-100", hard: "text-red-600 bg-red-100" };
const DIFFICULTY_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" };

const SubjectPage = () => {
  const { subject: slug } = useParams<{ subject: string }>();
  const { user } = useAuth();
  const { data: subjects = [], isLoading: loadingSubjects, isError: subjectsError, refetch: refetchSubjects } = useNoteSubjects();
  const subject = (() => {
    const matches = subjects.filter(s => s.slug === slug);
    if (matches.length <= 1) return matches[0];
    // Duplicate slug guard: if the same slug exists on more than one
    // subject row (e.g. a subject was accidentally created twice), picking
    // the first one can silently show "0 chapters" even though chapters
    // were published — they're just attached to the *other* row's id.
    // We can't know here which one has chapters without fetching both, so
    // prefer the most recently created row (the one an admin is most
    // likely to have just been working in), and warn in the console.
    console.warn(`[Notes] Multiple subjects share the slug "${slug}" — this can cause chapters to appear missing. Check Admin > Notes Manager for a duplicate subject.`, matches);
    return [...matches].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0];
  })();
  const { data: chapters = [], isLoading: loadingChapters, isError: chaptersError, refetch: refetchChapters } = useNoteChapters(subject?.id);
  const { data: progress = [] } = useNoteProgress(user?.id);

  if (loadingSubjects) return <PageLayout><div className="p-8"><Skeleton className="h-48 rounded-3xl mb-6" />{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl mb-3" />)}</div></PageLayout>;

  // Offline error state for subjects
  if (subjectsError && !subjects.length) return (
    <PageLayout>
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-4">
          <WifiOff className="w-8 h-8 text-orange-500" />
        </div>
        <p className="font-semibold text-foreground text-lg">Can't load subject</p>
        <p className="text-sm text-muted-foreground mt-1 mb-4">You appear to be offline. Please check your connection.</p>
        <button onClick={() => refetchSubjects()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
        <Link to="/notes" className="block text-primary text-sm mt-4">← Back to Notes</Link>
      </div>
    </PageLayout>
  );

  if (!subject && !loadingSubjects) return <Navigate to="/notes" replace />;
  if (!subject) return null;

  const completedIds = new Set(progress.filter(p => p.completed).map(p => p.chapter_id));
  const completedCount = chapters.filter(c => completedIds.has(c.id)).length;
  const progressPct = chapters.length > 0 ? Math.round((completedCount / chapters.length) * 100) : 0;

  const headerText = getReadableTextColor(subject.color);
  const headerTextMuted = getReadableTextColorMuted(subject.color);
  const isDarkHeaderText = headerText === "#111827";
  const headerChipBg = isDarkHeaderText ? "rgba(17,24,39,0.10)" : "rgba(255,255,255,0.2)";
  const headerTrackBg = isDarkHeaderText ? "rgba(17,24,39,0.14)" : "rgba(255,255,255,0.2)";

  return (
    <PageLayout>
      {/* Header */}
      <section className="relative overflow-hidden py-5 sm:py-7 px-4" style={{ background: `linear-gradient(135deg, ${subject.color}, ${subject.color}bb)` }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 70% 30%, ${headerText} 1px, transparent 1px)`, backgroundSize: "24px 24px" }} />
        <div className="relative max-w-4xl mx-auto">
          <Link to="/notes" className="inline-flex items-center gap-1 text-xs mb-3 transition-colors" style={{ color: headerTextMuted }}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back to All Subjects
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-3xl sm:text-4xl shrink-0">{subject.emoji}</div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black leading-tight" style={{ color: headerText }}>{subject.name}</h1>
              <p className="text-xs sm:text-sm mt-0.5 line-clamp-1" style={{ color: headerTextMuted }}>{subject.description}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: headerChipBg, color: headerText }}>Class {subject.class_level}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: headerChipBg, color: headerText }}>{chapters.length} Chapters</span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {user && chapters.length > 0 && (
            <div className="mt-3.5">
              <div className="flex justify-between text-[11px] mb-1" style={{ color: headerTextMuted }}>
                <span>{completedCount} of {chapters.length} chapters completed</span>
                <span className="font-bold">{progressPct}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: headerTrackBg }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-full" style={{ backgroundColor: headerText }} />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Chapters */}
      <section className="max-w-4xl mx-auto px-4 py-5 sm:py-7">
        {loadingChapters ? (
          <div className="space-y-2.5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        ) : chaptersError && !chapters.length ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-4">
              <WifiOff className="w-8 h-8 text-orange-500" />
            </div>
            <p className="font-semibold text-foreground text-lg">Can't load chapters</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">You appear to be offline. Chapters you've visited before will load from cache.</p>
            <button onClick={() => refetchChapters()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
          </div>
        ) : chapters.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">📝</p>
            <p className="font-semibold text-foreground text-lg">No chapters yet</p>
            <p className="text-sm text-muted-foreground mt-1">Chapters will appear here when published by admin</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {chapters.map((ch, i) => {
              const done = completedIds.has(ch.id);
              return (
                <motion.div key={ch.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <Link to={`/notes/${slug}/${ch.slug}`}>
                    <div className={`group relative bg-card border rounded-xl p-3 hover:shadow-md transition-all duration-200 hover:border-[${subject.color}]/50 ${done ? "border-green-200 dark:border-green-800/40" : "border-border"}`}>
                      {/* Left color stripe */}
                      <div className="absolute left-0 top-3 bottom-3 w-1 rounded-full" style={{ backgroundColor: subject.color }} />

                      <div className="pl-3 flex items-center gap-3">
                        {/* Chapter number */}
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-black text-white text-sm"
                          style={{ backgroundColor: done ? "#16a34a" : subject.color }}>
                          {done ? <CheckCircle className="w-4 h-4" /> : ch.chapter_number}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-bold text-foreground text-sm">{ch.title}</h3>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${DIFFICULTY_COLOR[ch.difficulty]}`}>
                              {DIFFICULTY_LABEL[ch.difficulty]}
                            </span>
                            {done && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-green-700 bg-green-100">✓ Done</span>}
                          </div>
                          {ch.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{ch.description}</p>}
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> {ch.read_time_mins} min read</span>
                            {ch.animation_code && <span className="flex items-center gap-0.5 text-purple-600"><Zap className="w-2.5 h-2.5" /> Interactive</span>}
                            {ch.pdf_url && <span className="flex items-center gap-0.5 text-blue-600"><Download className="w-2.5 h-2.5" /> PDF</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white shrink-0 group-hover:opacity-90 transition-opacity"
                          style={{ backgroundColor: subject.color }}>
                          <PlayCircle className="w-3.5 h-3.5" />
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
