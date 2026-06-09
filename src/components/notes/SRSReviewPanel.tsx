/**
 * SRSReviewPanel.tsx
 * Student-facing Spaced Repetition review panel.
 * Shows cards due today, runs through them with SM-2 grading,
 * and displays a completion summary.
 *
 * Usage in student notes dashboard:
 *   <SRSReviewPanel userId={userId} />
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSRSDueToday, useSRSUpcoming, useSRSStats, useSubmitSRSAnswer, useRemoveSRSCard, answerToQuality, type SRSCard, type SM2Quality } from "@/hooks/useSRS";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain, CalendarDays, CheckCircle2, XCircle, Flame,
  ChevronRight, Trophy, RotateCcw, Sparkles, Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import confetti from "canvas-confetti";

// ─────────────────────────────── Props ───────────────────────────────────────

interface SRSReviewPanelProps {
  userId: string;
}

// ─────────────────────────────── Review Card UI ──────────────────────────────

const ReviewCard = ({
  card,
  onAnswer,
  onDismiss,
  cardIndex,
  totalCards,
}: {
  card: SRSCard;
  onAnswer: (quality: SM2Quality) => void;
  onDismiss: () => void;
  cardIndex: number;
  totalCards: number;
}) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const opts = [
    { key: "a", label: card.option_a },
    { key: "b", label: card.option_b },
    { key: "c", label: card.option_c },
    { key: "d", label: card.option_d },
  ].filter(o => o.label);

  const handleSelect = (key: string) => {
    if (revealed) return;
    setSelected(key);
    setRevealed(true);
  };

  const correct = card.correct;
  const isCorrect = selected === correct;

  const difficulty = (card.difficulty ?? "medium") as "easy" | "medium" | "hard";

  const handleGrade = () => {
    if (!revealed) return;
    const quality = answerToQuality(isCorrect, difficulty);
    onAnswer(quality);
  };

  const progress = totalCards > 0 ? ((cardIndex) / totalCards) * 100 : 0;

  return (
    <motion.div
      key={card.id}
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -60, scale: 0.95 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-violet-500" />
            Card {cardIndex + 1} of {totalCards}
          </span>
          <span>
            {card.subject_emoji} {card.subject_name}
            {card.chapter_title && ` · ${card.chapter_title}`}
          </span>
        </div>
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <Card className="border-violet-200 dark:border-violet-800/50 shadow-md">
        <CardContent className="p-5 space-y-5">
          {/* Question */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0 mt-0.5">
              <Brain className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <p className="font-semibold text-base leading-snug pt-1">{card.question}</p>
          </div>

          {/* Options */}
          <div className="space-y-2.5">
            {opts.map(({ key, label }) => {
              const isChosen = selected === key;
              const isAnswer = key === correct;
              let cls = "w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all ";
              if (!revealed) {
                cls += "border-border hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20";
              } else if (isAnswer) {
                cls += "border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400";
              } else if (isChosen && !isAnswer) {
                cls += "border-red-400 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 line-through opacity-70";
              } else {
                cls += "border-border opacity-50";
              }

              return (
                <button key={key} className={cls} onClick={() => handleSelect(key)}>
                  <span className="font-bold mr-2 uppercase">{key}.</span>
                  {label}
                  {revealed && isAnswer && <CheckCircle2 className="inline w-4 h-4 ml-2 text-green-500" />}
                  {revealed && isChosen && !isAnswer && <XCircle className="inline w-4 h-4 ml-2 text-red-400" />}
                </button>
              );
            })}
          </div>

          {/* Result & Explanation */}
          <AnimatePresence>
            {revealed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-3"
              >
                <div className={`flex items-center gap-2 text-sm font-bold ${isCorrect ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {isCorrect
                    ? <><CheckCircle2 className="w-4 h-4" /> Correct! Well done!</>
                    : <><XCircle className="w-4 h-4" /> Incorrect — review this again</>
                  }
                </div>

                {card.explanation && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
                    <span className="font-semibold">💡 Explanation: </span>{card.explanation}
                  </div>
                )}

                {/* Interval info */}
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {isCorrect
                    ? `Next review in ~${Math.round((card.interval ?? 1) * (card.ease_factor ?? 2.5))} days`
                    : "Will repeat tomorrow"
                  }
                </p>

                <Button onClick={handleGrade} className="w-full gap-2 mt-1">
                  Next Card <ChevronRight className="w-4 h-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {!revealed && (
            <p className="text-xs text-center text-muted-foreground">Tap an option to answer</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

// ─────────────────────────────── Completion Screen ───────────────────────────

const CompletionScreen = ({
  correct,
  total,
  onRestart,
}: {
  correct: number;
  total: number;
  onRestart: () => void;
}) => {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const emoji = pct === 100 ? "🏆" : pct >= 80 ? "⭐" : pct >= 60 ? "👍" : "📖";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center space-y-6 py-6"
    >
      <div className="text-6xl">{emoji}</div>
      <div>
        <h3 className="text-2xl font-bold mb-1">Review Complete!</h3>
        <p className="text-muted-foreground text-sm">
          {correct}/{total} correct &nbsp;·&nbsp; {pct}% accuracy
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
        {[
          { label: "Correct", value: correct, color: "text-green-600" },
          { label: "Wrong", value: total - correct, color: "text-red-500" },
          { label: "Score", value: `${pct}%`, color: "text-violet-600" },
        ].map(s => (
          <div key={s.label} className="bg-secondary rounded-xl p-3">
            <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Come back tomorrow for your next review session. The spacing effect works!
      </p>

      <Button variant="outline" onClick={onRestart} className="gap-2">
        <RotateCcw className="w-4 h-4" /> Review Again
      </Button>
    </motion.div>
  );
};

// ─────────────────────────────── Main Panel ──────────────────────────────────

export function SRSReviewPanel({ userId }: SRSReviewPanelProps) {
  const { data: dueCards = [], isLoading } = useSRSDueToday(userId);
  const { data: upcoming = [] } = useSRSUpcoming(userId);
  const { data: stats } = useSRSStats(userId);
  const submitAnswer = useSubmitSRSAnswer();
  const removeCard = useRemoveSRSCard();

  const [queue, setQueue] = useState<SRSCard[] | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);

  const activeQueue = queue ?? dueCards;

  const startSession = () => {
    setQueue([...dueCards]);
    setCurrentIdx(0);
    setCorrectCount(0);
    setSessionDone(false);
    setSessionStarted(true);
  };

  const handleAnswer = async (quality: SM2Quality) => {
    const card = activeQueue[currentIdx];
    if (!card) return;

    const isCorrect = quality >= 3;
    if (isCorrect) setCorrectCount(c => c + 1);

    try {
      await submitAnswer.mutateAsync({
        cardId: card.id,
        quality,
        currentRepetitions: card.repetitions,
        currentEF: card.ease_factor,
        currentInterval: card.interval,
      });
    } catch {
      toast.error("Failed to save review");
    }

    if (currentIdx + 1 >= activeQueue.length) {
      setSessionDone(true);
      if (isCorrect && correctCount + 1 === activeQueue.length) {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      }
    } else {
      setCurrentIdx(i => i + 1);
    }
  };

  const handleRestart = () => {
    setQueue([...dueCards]);
    setCurrentIdx(0);
    setCorrectCount(0);
    setSessionDone(false);
  };

  // ── Empty / Loading state ──
  if (isLoading) return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
    </div>
  );

  // ── Stats header ──
  const StatsBar = () => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {[
        { icon: <Brain className="w-4 h-4 text-violet-500" />, label: "Total Cards", value: stats?.total ?? 0 },
        { icon: <Flame className="w-4 h-4 text-orange-500" />, label: "Due Today", value: stats?.dueToday ?? 0 },
        { icon: <Sparkles className="w-4 h-4 text-yellow-500" />, label: "Mature", value: stats?.mature ?? 0 },
        { icon: <CalendarDays className="w-4 h-4 text-blue-500" />, label: "Learning", value: stats?.learning ?? 0 },
      ].map(s => (
        <Card key={s.label} className="border-border/60">
          <CardContent className="p-3 flex items-center gap-2.5">
            {s.icon}
            <div>
              <div className="text-lg font-black leading-none">{s.value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  // ── Session active ──
  if (sessionStarted && !sessionDone) {
    const currentCard = activeQueue[currentIdx];
    if (!currentCard) return null;
    return (
      <div>
        <StatsBar />
        <AnimatePresence mode="wait">
          <ReviewCard
            key={currentCard.id + currentIdx}
            card={currentCard}
            onAnswer={handleAnswer}
            onDismiss={() => removeCard.mutate(currentCard.id)}
            cardIndex={currentIdx}
            totalCards={activeQueue.length}
          />
        </AnimatePresence>
      </div>
    );
  }

  // ── Session complete ──
  if (sessionDone) {
    return (
      <div>
        <StatsBar />
        <Card>
          <CardContent className="p-5">
            <CompletionScreen
              correct={correctCount}
              total={activeQueue.length}
              onRestart={handleRestart}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Lobby (not started) ──
  const todayCount = dueCards.length;

  return (
    <div className="space-y-5">
      <StatsBar />

      {/* Due today CTA */}
      <Card className={todayCount > 0
        ? "border-violet-300 dark:border-violet-700 bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20"
        : "border-green-300 dark:border-green-800"
      }>
        <CardContent className="p-5">
          {todayCount > 0 ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                <Brain className="w-6 h-6 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base mb-0.5">
                  {todayCount} card{todayCount > 1 ? "s" : ""} due for review today
                </h3>
                <p className="text-sm text-muted-foreground">
                  Based on the SM-2 spaced repetition algorithm — reviewing now boosts long-term memory.
                </p>
              </div>
              <Button onClick={startSession} className="gap-2 shrink-0 w-full sm:w-auto">
                <Brain className="w-4 h-4" /> Start Review
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
                <Trophy className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-bold text-base mb-0.5">All caught up! 🎉</h3>
                <p className="text-sm text-muted-foreground">
                  No cards due today. Keep learning and come back tomorrow.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming schedule */}
      {upcoming.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" /> Upcoming Reviews (7 days)
          </h4>
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
            {upcoming.map(({ date, count }) => {
              const d = new Date(date + "T00:00:00");
              const label = d.toLocaleDateString("en", { weekday: "short", day: "numeric" });
              return (
                <div key={date} className="bg-secondary rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                  <div className="text-base font-black text-violet-600 dark:text-violet-400 mt-0.5">{count}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="bg-muted/50 rounded-xl p-4 border border-border text-sm text-muted-foreground">
        <p className="font-semibold text-foreground mb-1 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-yellow-500" /> How Spaced Repetition Works
        </p>
        <p>
          Questions you answered incorrectly in quizzes are automatically added here.
          The system (SM-2 algorithm) schedules each question at increasing intervals:
          1 day → 3 days → 7 days → 14 days… until you master it permanently.
        </p>
      </div>
    </div>
  );
}

export default SRSReviewPanel;
