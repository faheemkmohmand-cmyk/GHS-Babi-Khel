import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Sparkles, Calendar, Trophy, Clock, CheckCircle2, XCircle,
  Download, Brain, Award, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import {
  useTodayQuiz, useMyTodayAttempt, useTodayLeaderboard,
  useAllTimeLeaderboard, useSubmitDailyAttempt,
  DailyQuiz, DailyAttempt, DailyQuestion,
} from "@/hooks/useDailyQuiz";
import jsPDF from "jspdf";

const TIME_PER_Q = 20;

const DailyQuizTab = () => {
  const [view, setView] = useState<"home" | "form" | "quiz" | "result">("home");
  const [studentInfo, setStudentInfo] = useState<{ name: string; klass: string; roll: string } | null>(null);
  const [attemptResult, setAttemptResult] = useState<DailyAttempt | null>(null);

  const { data: quiz, isLoading: loadingQuiz, error: quizError, refetch } = useTodayQuiz();
  const { data: myAttempt, isLoading: loadingAttempt } = useMyTodayAttempt();

  if (loadingQuiz || loadingAttempt) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (quizError || !quiz) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <Brain className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-foreground">Could not load today's quiz right now.</p>
          <Button size="sm" onClick={() => refetch()}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  if (view === "form" && !myAttempt) {
    return (
      <StudentInfoForm
        quiz={quiz}
        onCancel={() => setView("home")}
        onStart={(info) => { setStudentInfo(info); setView("quiz"); }}
      />
    );
  }

  if (view === "quiz" && studentInfo && !myAttempt) {
    return (
      <QuizScreen
        quiz={quiz}
        student={studentInfo}
        onComplete={(a) => { setAttemptResult(a); setView("result"); }}
      />
    );
  }

  if ((view === "result" && attemptResult) || myAttempt) {
    const a = attemptResult || myAttempt!;
    return <ResultScreen quiz={quiz} attempt={a} onBack={() => { setAttemptResult(null); setView("home"); }} />;
  }

  return <HomeScreen quiz={quiz} onStart={() => setView("form")} />;
};

export default DailyQuizTab;

// ─── Home ─────────────────────────────────────────────────────────────
function HomeScreen({ quiz, onStart }: { quiz: DailyQuiz; onStart: () => void }) {
  const dateLabel = new Date(quiz.quiz_date).toLocaleDateString("en-PK", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-4 h-4" /> Today's Daily Quiz
          </div>
          <div>
            <h2 className="text-2xl font-heading font-bold text-foreground">{quiz.category}</h2>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> {dateLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{quiz.questions.length} questions</Badge>
            <Badge variant="secondary" className="capitalize">{quiz.difficulty}</Badge>
            <Badge variant="secondary">{TIME_PER_Q}s per question</Badge>
          </div>
          <div className="bg-card/60 border border-border rounded-xl p-3 text-xs text-muted-foreground space-y-1">
            <p>• Fresh quiz auto-generated every day</p>
            <p>• You can attempt it <strong className="text-foreground">once per day</strong></p>
            <p>• Compete on today's & all-time leaderboards</p>
          </div>
          <Button size="lg" className="w-full" onClick={onStart}>
            Start Today's Quiz <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </CardContent>
      </Card>

      <Leaderboards />
    </div>
  );
}

// ─── Student info form ────────────────────────────────────────────────
function StudentInfoForm({
  quiz, onStart, onCancel,
}: { quiz: DailyQuiz; onStart: (i: { name: string; klass: string; roll: string }) => void; onCancel: () => void }) {
  const { profile } = useAuth();
  const [name, setName] = useState(profile?.full_name || "");
  const [klass, setKlass] = useState(profile?.class || "");
  const [roll, setRoll] = useState(profile?.roll_number || "");

  const submit = () => {
    if (!name.trim()) { toast.error("Please enter your name"); return; }
    onStart({ name: name.trim(), klass: klass.trim(), roll: roll.trim() });
  };

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Details</CardTitle>
          <p className="text-xs text-muted-foreground">
            Confirm your info — it will appear on the leaderboard and your result.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dq-name">Full name *</Label>
            <Input id="dq-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={80} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dq-class">Class</Label>
              <Input id="dq-class" value={klass} onChange={(e) => setKlass(e.target.value)} placeholder="e.g. 9" maxLength={20} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dq-roll">Roll #</Label>
              <Input id="dq-roll" value={roll} onChange={(e) => setRoll(e.target.value)} placeholder="Optional" maxLength={20} />
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
            Quiz: <strong className="text-foreground">{quiz.category}</strong> · <span className="capitalize">{quiz.difficulty}</span> · {quiz.questions.length} questions
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
            <Button onClick={submit} className="flex-1">Start Quiz</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Quiz Screen ──────────────────────────────────────────────────────
function QuizScreen({
  quiz, student, onComplete,
}: { quiz: DailyQuiz; student: { name: string; klass: string; roll: string }; onComplete: (a: DailyAttempt) => void }) {
  const { user } = useAuth();
  const submit = useSubmitDailyAttempt();

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_Q);
  const [startTime] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = quiz.questions.length;
  const current = quiz.questions[idx];

  const advance = useCallback(() => {
    const qKey = String(idx);
    const finalAnswers = { ...answers };
    if (selected) finalAnswers[qKey] = selected;

    setSelected(null);
    setTimeLeft(TIME_PER_Q);

    if (idx >= total - 1) {
      if (timerRef.current) clearInterval(timerRef.current);
      let score = 0;
      quiz.questions.forEach((q, i) => { if (finalAnswers[String(i)] === q.correct) score++; });
      const pct = total > 0 ? Math.round((score / total) * 10000) / 100 : 0;
      const timeTaken = Math.round((Date.now() - startTime) / 1000);

      submit.mutate(
        {
          user_id: user?.id || "",
          quiz_date: quiz.quiz_date,
          student_name: student.name,
          student_class: student.klass || null,
          roll_number: student.roll || null,
          answers: finalAnswers,
          score,
          total_questions: total,
          percentage: pct,
          time_taken: timeTaken,
        },
        {
          onSuccess: (data) => onComplete(data),
          onError: (err) => {
            if (String(err).toLowerCase().includes("duplicate") || String(err).toLowerCase().includes("unique")) {
              toast.error("You already attempted today's quiz");
            } else {
              toast.error("Failed to submit — please try again");
            }
          },
        }
      );
    } else {
      setAnswers(finalAnswers);
      setIdx((i) => i + 1);
    }
  }, [idx, selected, answers, quiz, total, startTime, submit, user, student, onComplete]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { advance(); return TIME_PER_Q; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (!current) return null;
  const progressPct = (idx / total) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      <div className="bg-card border-b border-border p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <h3 className="font-heading font-semibold text-sm text-foreground truncate">Daily Quiz · {quiz.category}</h3>
          <span className="text-xs text-muted-foreground whitespace-nowrap">Q {idx + 1}/{total}</span>
          <div className={`w-11 h-11 rounded-full border-4 flex items-center justify-center font-bold ${timeLeft <= 5 ? "border-destructive text-destructive animate-pulse" : "border-primary text-primary"}`}>
            {timeLeft}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-6 md:p-8 space-y-6">
            <p className="text-base md:text-lg font-medium text-foreground">
              <span className="text-primary font-bold mr-2">Q{idx + 1}.</span>{current.question}
            </p>
            <div className="grid grid-cols-1 gap-3">
              {current.options.map((opt, i) => {
                const isSel = selected === opt;
                return (
                  <button
                    key={i}
                    onClick={() => setSelected(opt)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${isSel ? "border-primary bg-primary/10 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/50"}`}
                  >
                    <span className={`inline-flex w-7 h-7 rounded-full items-center justify-center font-bold text-xs mr-3 ${isSel ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-foreground">{opt}</span>
                  </button>
                );
              })}
            </div>
            <Button onClick={advance} className="w-full" size="lg" disabled={submit.isPending}>
              {submit.isPending ? "Submitting..." : idx === total - 1 ? "Finish Quiz" : "Next Question"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="bg-card border-t border-border p-3">
        <div className="max-w-2xl mx-auto">
          <Progress value={progressPct} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1 text-center">{Math.round(progressPct)}% complete</p>
        </div>
      </div>
    </div>
  );
}

// ─── Result ───────────────────────────────────────────────────────────
function ResultScreen({ quiz, attempt, onBack }: { quiz: DailyQuiz; attempt: DailyAttempt; onBack: () => void }) {
  const passed = attempt.percentage >= 50;

  const downloadPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Daily Quiz — Result", 14, 18);
    doc.setFontSize(11);
    doc.text(`Date: ${quiz.quiz_date}`, 14, 28);
    doc.text(`Category: ${quiz.category}  ·  Difficulty: ${quiz.difficulty}`, 14, 34);
    doc.text(`Student: ${attempt.student_name}${attempt.student_class ? ` (Class ${attempt.student_class})` : ""}`, 14, 40);
    if (attempt.roll_number) doc.text(`Roll #: ${attempt.roll_number}`, 14, 46);
    doc.setFontSize(14);
    doc.text(`Score: ${attempt.score}/${attempt.total_questions}  (${attempt.percentage}%)`, 14, 56);

    let y = 68;
    doc.setFontSize(10);
    quiz.questions.forEach((q, i) => {
      if (y > 270) { doc.addPage(); y = 18; }
      const given = (attempt.answers as Record<string, string>)[String(i)] || "—";
      const isOk = given === q.correct;
      const lines = doc.splitTextToSize(`Q${i + 1}. ${q.question}`, 180);
      doc.setFont(undefined, "bold"); doc.text(lines, 14, y); y += lines.length * 5;
      doc.setFont(undefined, "normal");
      doc.text(`Your answer: ${given}  ${isOk ? "✓" : "✗"}`, 14, y); y += 5;
      if (!isOk) { doc.text(`Correct: ${q.correct}`, 14, y); y += 5; }
      y += 3;
    });
    doc.save(`daily-quiz-${quiz.quiz_date}.pdf`);
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-primary/10 to-background border-primary/20">
        <CardContent className="p-6 text-center space-y-4">
          <div className={`inline-flex w-20 h-20 rounded-full items-center justify-center ${passed ? "bg-green-500/15 text-green-600" : "bg-destructive/15 text-destructive"}`}>
            <Award className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-3xl font-heading font-bold text-foreground">{attempt.percentage}%</h2>
            <p className="text-muted-foreground mt-1">
              {attempt.score} of {attempt.total_questions} correct
              {attempt.time_taken ? ` · ${Math.floor(attempt.time_taken / 60)}m ${attempt.time_taken % 60}s` : ""}
            </p>
          </div>
          <p className="text-sm text-foreground">
            {passed ? "Great job!" : "Better luck tomorrow!"} Come back tomorrow for a new quiz.
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <Button variant="outline" onClick={onBack}>Back</Button>
            <Button onClick={downloadPdf}><Download className="w-4 h-4 mr-1" /> Download PDF</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Question Review</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {quiz.questions.map((q, i) => {
            const given = (attempt.answers as Record<string, string>)[String(i)];
            const ok = given === q.correct;
            return (
              <div key={i} className={`p-3 rounded-lg border ${ok ? "border-green-500/30 bg-green-500/5" : "border-destructive/30 bg-destructive/5"}`}>
                <div className="flex items-start gap-2">
                  {ok ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />}
                  <div className="flex-1 text-sm">
                    <p className="font-medium text-foreground">Q{i + 1}. {q.question}</p>
                    <p className="text-xs text-muted-foreground mt-1">Your answer: <span className={ok ? "text-green-600" : "text-destructive"}>{given || "—"}</span></p>
                    {!ok && <p className="text-xs text-muted-foreground">Correct: <span className="text-green-600">{q.correct}</span></p>}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Leaderboards />
    </div>
  );
}

// ─── Leaderboards ─────────────────────────────────────────────────────
function Leaderboards() {
  const { data: today } = useTodayLeaderboard();
  const { data: all } = useAllTimeLeaderboard();

  const allTime = (() => {
    if (!all || all.length === 0) return [];
    const m = new Map<string, { name: string; klass: string | null; attempts: number; totalScore: number; totalQ: number; bestPct: number }>();
    all.forEach((a) => {
      const e = m.get(a.user_id);
      if (e) {
        e.attempts++; e.totalScore += a.score; e.totalQ += a.total_questions;
        e.bestPct = Math.max(e.bestPct, Number(a.percentage));
      } else {
        m.set(a.user_id, { name: a.student_name, klass: a.student_class, attempts: 1, totalScore: a.score, totalQ: a.total_questions, bestPct: Number(a.percentage) });
      }
    });
    return Array.from(m.entries())
      .map(([uid, d]) => ({
        userId: uid, name: d.name, klass: d.klass, attempts: d.attempts,
        totalScore: d.totalScore,
        avgPct: d.totalQ > 0 ? Math.round((d.totalScore / d.totalQ) * 100) : 0,
        bestPct: Math.round(d.bestPct),
      }))
      .sort((a, b) => b.totalScore - a.totalScore || b.avgPct - a.avgPct)
      .slice(0, 20);
  })();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="w-4 h-4 text-primary" /> Today's Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(!today || today.length === 0) ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No attempts yet today — be the first!</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/50">
                  <th className="p-2.5 text-left font-medium">#</th>
                  <th className="p-2.5 text-left font-medium">Name</th>
                  <th className="p-2.5 text-center font-medium">Score</th>
                  <th className="p-2.5 text-center font-medium">Time</th>
                </tr></thead>
                <tbody>
                  {today.slice(0, 20).map((a, i) => (
                    <tr key={a.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-2.5 font-bold">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                      <td className="p-2.5">
                        <div className="font-medium text-foreground">{a.student_name}</div>
                        {a.student_class && <div className="text-xs text-muted-foreground">Class {a.student_class}</div>}
                      </td>
                      <td className="p-2.5 text-center font-semibold">{a.score}/{a.total_questions}</td>
                      <td className="p-2.5 text-center text-xs text-muted-foreground">
                        <Clock className="w-3 h-3 inline mr-0.5" />
                        {a.time_taken ? `${Math.floor(a.time_taken / 60)}:${String(a.time_taken % 60).padStart(2, "0")}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="w-4 h-4 text-primary" /> Overall Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {allTime.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No attempts yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/50">
                  <th className="p-2.5 text-left font-medium">#</th>
                  <th className="p-2.5 text-left font-medium">Name</th>
                  <th className="p-2.5 text-center font-medium">Quizzes</th>
                  <th className="p-2.5 text-center font-medium">Total</th>
                  <th className="p-2.5 text-center font-medium">Avg %</th>
                </tr></thead>
                <tbody>
                  {allTime.map((r, i) => (
                    <tr key={r.userId} className="border-b border-border hover:bg-muted/30">
                      <td className="p-2.5 font-bold">{i === 0 ? "👑" : i + 1}</td>
                      <td className="p-2.5">
                        <div className="font-medium text-foreground">{r.name}</div>
                        {r.klass && <div className="text-xs text-muted-foreground">Class {r.klass}</div>}
                      </td>
                      <td className="p-2.5 text-center">{r.attempts}</td>
                      <td className="p-2.5 text-center font-semibold">{r.totalScore}</td>
                      <td className="p-2.5 text-center">{r.avgPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
