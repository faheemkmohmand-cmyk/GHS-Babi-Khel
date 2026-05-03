// src/pages/dashboard/tabs/HomeworkTab.tsx
// Student view: see homework, mark as done, sorted by due date

import { useState } from "react";
import { motion } from "framer-motion";
import { BookMarked, CheckCircle2, Circle, Clock, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useHomework, useMyHomeworkCompletions, useToggleHomeworkComplete } from "@/hooks/useNewFeatures";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isPast, isToday, differenceInDays } from "date-fns";

const SUBJECTS_ALL = ["All", "English", "Urdu", "Maths", "Physics", "Chemistry", "Biology",
  "Islamiyat", "Pakistan Studies", "Computer Science", "Geography", "History", "G.Science", "Pashto", "M.Quran"];

function DueBadge({ dueDate }: { dueDate: string }) {
  const date = new Date(dueDate);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = differenceInDays(date, today);
  if (isPast(date) && !isToday(date)) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">
      <AlertTriangle className="w-2.5 h-2.5" /> Overdue
    </span>
  );
  if (isToday(date)) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 px-2 py-0.5 rounded-full">
      <Clock className="w-2.5 h-2.5" /> Due Today
    </span>
  );
  if (diff <= 2) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-0.5 rounded-full">
      <Clock className="w-2.5 h-2.5" /> {diff}d left
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
      <Clock className="w-2.5 h-2.5" /> {diff}d left
    </span>
  );
}

const HomeworkTab = () => {
  const { user, profile } = useAuth();
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const classFilter = profile?.class || undefined;
  const { data: homeworks = [], isLoading } = useHomework(classFilter);
  const { data: completions = [] } = useMyHomeworkCompletions(user?.id);
  const toggleComplete = useToggleHomeworkComplete();

  const completedIds = new Set(completions.map((c) => c.homework_id));

  const filtered = homeworks.filter((h) =>
    subjectFilter === "All" || h.subject === subjectFilter
  );

  const pending = filtered.filter((h) => !completedIds.has(h.id));
  const done = filtered.filter((h) => completedIds.has(h.id));

  const handleToggle = (hwId: string) => {
    if (!user) return;
    toggleComplete.mutate({
      homeworkId: hwId,
      userId: user.id,
      isCompleted: completedIds.has(hwId),
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-primary" /> Homework
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pending.length} pending · {done.length} completed
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Class {profile?.class}</p>
        </div>
      </div>

      {/* Subject filter */}
      <div className="flex gap-1.5 flex-wrap">
        {["All", "English", "Urdu", "Maths", "Physics", "Chemistry", "Biology", "Islamiyat", "Computer Science"].map((s) => (
          <button
            key={s}
            onClick={() => setSubjectFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              subjectFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl p-10 text-center shadow-card">
          <BookMarked className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No homework assigned yet</p>
        </div>
      ) : (
        <>
          {/* Pending */}
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pending</p>
              {pending.map((hw) => (
                <motion.div
                  key={hw.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
                >
                  <div className="p-4 flex items-start gap-3">
                    <button
                      onClick={() => handleToggle(hw.id)}
                      disabled={toggleComplete.isPending}
                      className="mt-0.5 shrink-0"
                    >
                      <Circle className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{hw.title}</span>
                        <DueBadge dueDate={hw.due_date} />
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] bg-primary/10 text-primary font-medium px-2 py-0.5 rounded">{hw.subject}</span>
                        <span className="text-[11px] text-muted-foreground">Due: {format(new Date(hw.due_date), "dd MMM yyyy")}</span>
                        {hw.teacher_name && <span className="text-[11px] text-muted-foreground">by {hw.teacher_name}</span>}
                      </div>
                      {hw.description && (
                        <button
                          onClick={() => setExpandedId(expandedId === hw.id ? null : hw.id)}
                          className="text-[11px] text-primary mt-1 flex items-center gap-0.5"
                        >
                          {expandedId === hw.id ? <><ChevronUp className="w-3 h-3" /> Hide details</> : <><ChevronDown className="w-3 h-3" /> Show details</>}
                        </button>
                      )}
                      {expandedId === hw.id && hw.description && (
                        <p className="text-xs text-muted-foreground mt-2 bg-secondary/50 rounded-lg p-2.5 leading-relaxed">
                          {hw.description}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Completed */}
          {done.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Completed ✓</p>
              {done.map((hw) => (
                <div key={hw.id} className="bg-card/60 rounded-xl border border-border/50 p-4 flex items-start gap-3 opacity-70">
                  <button onClick={() => handleToggle(hw.id)} disabled={toggleComplete.isPending} className="mt-0.5 shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-through">{hw.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] bg-secondary text-muted-foreground font-medium px-2 py-0.5 rounded">{hw.subject}</span>
                      <span className="text-[11px] text-muted-foreground">Due: {format(new Date(hw.due_date), "dd MMM")}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default HomeworkTab;
