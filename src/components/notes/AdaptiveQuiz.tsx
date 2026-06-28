import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CircleCheck as CheckCircle, Circle as XCircle, ChevronRight, RotateCcw, BookOpen, Zap } from "lucide-react";
import { useNoteQuestions, saveQuizResult, awardPoints, removeWrongAnswer } from "@/hooks/useNotes";
import { enrollSRSCard } from "@/hooks/useSRS";
import { supabase } from "@/lib/supabase";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";

interface AdaptiveQuizProps {
  quizId: string;
  chapterId: string;
  userId: string;
}

interface Answer {
  [key: number]: string;
}

const AdaptiveQuiz = ({ quizId, chapterId, userId }: AdaptiveQuizProps) => {
  const { data: questions = [] } = useNoteQuestions(quizId);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Answer>({});
  const [submitted, setSubmitted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [savedAnswers, setSavedAnswers] = useState<Answer>({});

  useEffect(() => {
    const saved = localStorage.getItem(`quiz_${quizId}_answers`);
    if (saved) {
      setSavedAnswers(JSON.parse(saved));
      setAnswers(JSON.parse(saved));
    }
  }, [quizId]);

  useEffect(() => {
    localStorage.setItem(`quiz_${quizId}_answers`, JSON.stringify(answers));
  }, [answers, quizId]);

  useEffect(() => {
    if (!submitted) {
      const timer = setInterval(() => setTimerSeconds(s => s + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [submitted]);

  if (!questions.length) {
    return <div className="mt-8 p-6 text-center text-muted-foreground">Loading quiz...</div>;
  }

  const currentQuestion = questions[currentQuestionIdx];
  const currentAnswer = answers[currentQuestionIdx] || "";
  const isAnswered = currentAnswer !== "";
  const isCorrect = currentAnswer === currentQuestion.correct;

  const handleAnswer = (value: string) => {
    setAnswers(prev => ({ ...prev, [currentQuestionIdx]: value }));
  };

  const handleNext = () => {
    if (currentQuestionIdx < questions.length - 1) {
      setCurrentQuestionIdx(currentQuestionIdx + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setSubmitted(true);
    const score = questions.filter((q, idx) => answers[idx] === q.correct).length;
    const total = questions.length;
    const percentage = (score / total) * 100;
    const passed = percentage >= 70;

    await saveQuizResult(userId, quizId, score, total, passed);

    if (passed) {
      await awardPoints(userId, 50, "quiz_master");
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } else {
      await awardPoints(userId, 10);
    }

    const { data: chapter } = await supabase
      .from("note_chapters")
      .select("id")
      .eq("id", chapterId)
      .maybeSingle();

    if (chapter && passed) {
      await supabase.from("note_progress").upsert(
        { user_id: userId, chapter_id: chapterId, quiz_score_70_percent: true },
        { onConflict: "user_id,chapter_id" }
      );
    }

    for (let i = 0; i < questions.length; i++) {
      if (answers[i] !== questions[i].correct) {
        await supabase.from("note_wrong_answers").upsert(
          { user_id: userId, question_id: questions[i].id, given_answer: answers[i] },
          { onConflict: "user_id,question_id" }
        );
        // Add this question to the student's spaced-repetition queue so it
        // resurfaces tomorrow, then at growing intervals, until mastered.
        await enrollSRSCard(userId, questions[i].id);
      } else {
        await removeWrongAnswer(userId, questions[i].id);
      }
    }

    setShowResults(true);
    localStorage.removeItem(`quiz_${quizId}_answers`);
  };

  const handleRestart = () => {
    setAnswers({});
    setCurrentQuestionIdx(0);
    setSubmitted(false);
    setShowResults(false);
    setTimerSeconds(0);
    localStorage.removeItem(`quiz_${quizId}_answers`);
  };

  if (showResults) {
    const score = questions.filter((q, idx) => answers[idx] === q.correct).length;
    const total = questions.length;
    const percentage = Math.round((score / total) * 100);
    const passed = percentage >= 70;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mt-10 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-3xl p-8 text-center"
      >
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${passed ? "bg-green-100" : "bg-orange-100"}`}>
          {passed ? (
            <CheckCircle className="w-10 h-10 text-green-600" />
          ) : (
            <BookOpen className="w-10 h-10 text-orange-600" />
          )}
        </div>

        <h2 className="text-3xl font-black text-foreground mb-2">
          {passed ? "Excellent!" : "Good Effort!"}
        </h2>
        <p className="text-muted-foreground mb-6">
          You scored {score} out of {total} ({percentage}%)
        </p>

        <div className="bg-card rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-muted-foreground">Time Spent</p>
              <p className="text-2xl font-bold text-foreground">{Math.floor(timerSeconds / 60)}m {timerSeconds % 60}s</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Correct Answers</p>
              <p className="text-2xl font-bold text-green-600">{score}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Points Earned</p>
              <p className="text-2xl font-bold text-blue-700">{passed ? "50" : "10"}</p>
            </div>
          </div>
        </div>

        {!passed && (
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-2xl p-4 mb-6 text-left">
            <p className="text-sm font-semibold text-blue-950 dark:text-blue-200 mb-2">Questions you got wrong:</p>
            {questions.map((q, idx) => {
              if (answers[idx] !== q.correct) {
                return (
                  <div key={q.id} className="text-xs text-blue-900 dark:text-blue-300 mb-2">
                    <p className="font-semibold">Q{idx + 1}: {q.question}</p>
                    <p>Your answer: <span className="text-red-600">Option {answers[idx]?.toUpperCase()}</span></p>
                    <p>Correct: <span className="text-green-600">Option {q.correct.toUpperCase()}</span></p>
                    {q.explanation && <p className="italic mt-1">{q.explanation}</p>}
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={handleRestart} variant="outline" className="flex-1 gap-2">
            <RotateCcw className="w-4 h-4" /> Retake Quiz
          </Button>
          <Button onClick={() => window.location.href = "/notes"} className="flex-1 gap-2">
            <BookOpen className="w-4 h-4" /> Back to Notes
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mt-10 bg-card border border-border rounded-3xl overflow-hidden"
    >
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-4 text-white flex items-center justify-between">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Zap className="w-5 h-5" /> Quiz Time
          </h3>
          <p className="text-sm text-white/80">Question {currentQuestionIdx + 1} of {questions.length}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-white/80">Answered: {Object.keys(answers).length}</p>
        </div>
      </div>

      <div className="p-6">
        <div className="flex gap-1 mb-6">
          {questions.map((_, idx) => (
            <div
              key={idx}
              className={`h-2 flex-1 rounded-full transition-colors ${
                answers[idx]
                  ? submitted && answers[idx] === questions[idx].correct
                    ? "bg-green-500"
                    : submitted
                    ? "bg-red-500"
                    : "bg-primary"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>

        <h4 className="text-lg font-bold text-foreground mb-4">{currentQuestion.question}</h4>

        {(currentQuestion as any).question_type === "mcq" && (
          <div className="space-y-2 mb-6">
            {[
              { key: "a", text: currentQuestion.option_a },
              { key: "b", text: currentQuestion.option_b },
              { key: "c", text: currentQuestion.option_c },
              { key: "d", text: currentQuestion.option_d },
            ].map(({ key, text }) => (
              <button
                key={key}
                onClick={() => handleAnswer(key)}
                disabled={submitted}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all font-medium ${
                  currentAnswer === key
                    ? submitted
                      ? answers[currentQuestionIdx] === currentQuestion.correct
                        ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                        : "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                      : "border-primary bg-primary/10"
                    : submitted && key === currentQuestion.correct
                    ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <span className="font-bold text-sm">{key.toUpperCase()}.</span> {text}
              </button>
            ))}
          </div>
        )}

        {(currentQuestion as any).question_type === "fill" && (
          <div className="mb-6">
            <input
              type="text"
              value={currentAnswer}
              onChange={e => handleAnswer(e.target.value)}
              disabled={submitted}
              placeholder="Enter your answer..."
              className="w-full px-4 py-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary font-medium"
            />
          </div>
        )}

        {submitted && currentQuestion.explanation && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6"
          >
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">Explanation</p>
            <p className="text-sm text-blue-800 dark:text-blue-300">{currentQuestion.explanation}</p>
          </motion.div>
        )}

        {submitted && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2 mb-4">
            {isCorrect ? (
              <div className="flex-1 flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold">
                <CheckCircle className="w-5 h-5" /> Correct!
              </div>
            ) : (
              <div className="flex-1 flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold">
                <XCircle className="w-5 h-5" /> Incorrect
              </div>
            )}
          </motion.div>
        )}

        <div className="flex gap-3">
          {!submitted && isAnswered && (
            <Button onClick={handleNext} className="flex-1 gap-2">
              {currentQuestionIdx === questions.length - 1 ? (
                <>
                  <CheckCircle className="w-4 h-4" /> Submit Quiz
                </>
              ) : (
                <>
                  Next <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          )}
          {submitted && (
            <Button onClick={handleNext} className="flex-1 gap-2">
              {currentQuestionIdx === questions.length - 1 ? (
                <>
                  <CheckCircle className="w-4 h-4" /> See Results
                </>
              ) : (
                <>
                  Next <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default AdaptiveQuiz;
                      
