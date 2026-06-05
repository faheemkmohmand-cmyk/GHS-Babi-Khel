import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

// ───────────────────────────────────────────────────────────────────
// Daily Quiz: powered by Open Trivia DB (https://opentdb.com)
// One shared quiz per day. One attempt per user per day.
// ───────────────────────────────────────────────────────────────────

export interface DailyQuestion {
  question: string;
  options: string[];   // shuffled
  correct: string;     // text of correct option
  category: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface DailyQuiz {
  quiz_date: string;
  category: string;
  category_id: number;
  difficulty: string;
  questions: DailyQuestion[];
  created_at: string;
}

export interface DailyAttempt {
  id: string;
  user_id: string;
  quiz_date: string;
  student_name: string;
  student_class: string | null;
  roll_number: string | null;
  answers: Record<string, string>;
  score: number;
  total_questions: number;
  percentage: number;
  time_taken: number | null;
  completed_at: string;
}

// Rotating categories (Open Trivia DB IDs)
const CATEGORIES = [
  { id: 9,  name: "General Knowledge" },
  { id: 17, name: "Science & Nature" },
  { id: 22, name: "Geography" },
  { id: 23, name: "History" },
  { id: 18, name: "Computers" },
  { id: 21, name: "Sports" },
  { id: 20, name: "Mythology" },
];
const DIFFICULTIES: ("easy" | "medium" | "hard")[] = ["easy", "medium", "hard"];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayIndex(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

function decodeHtml(s: string): string {
  const t = document.createElement("textarea");
  t.innerHTML = s;
  return t.value;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchTriviaQuestions(categoryId: number, difficulty: string): Promise<DailyQuestion[]> {
  const url = `https://opentdb.com/api.php?amount=10&category=${categoryId}&difficulty=${difficulty}&type=multiple`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch quiz questions");
  const json = await res.json();
  if (json.response_code !== 0 || !Array.isArray(json.results)) {
    throw new Error("Quiz source returned no questions, please retry in a moment");
  }
  return json.results.map((r: any) => {
    const correct = decodeHtml(r.correct_answer);
    const options = shuffle([correct, ...r.incorrect_answers.map(decodeHtml)]);
    return {
      question: decodeHtml(r.question),
      options,
      correct,
      category: decodeHtml(r.category),
      difficulty: r.difficulty,
    } as DailyQuestion;
  });
}

export function useTodayQuiz() {
  const qc = useQueryClient();
  return useQuery<DailyQuiz>({
    queryKey: ["daily-quiz", todayISO()],
    queryFn: async () => {
      const date = todayISO();
      // 1. Read existing
      const { data: existing } = await supabase
        .from("daily_quizzes")
        .select("*")
        .eq("quiz_date", date)
        .maybeSingle();
      if (existing) return existing as DailyQuiz;

      // 2. Generate
      const idx = dayIndex();
      const cat = CATEGORIES[idx % CATEGORIES.length];
      const diff = DIFFICULTIES[idx % DIFFICULTIES.length];
      let questions: DailyQuestion[] = [];
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          questions = await fetchTriviaQuestions(cat.id, diff);
          if (questions.length > 0) break;
        } catch (e) {
          lastErr = e;
          await new Promise((r) => setTimeout(r, 800));
        }
      }
      if (questions.length === 0) throw lastErr || new Error("Could not load today's quiz");

      // 3. Insert (race-safe: ignore conflict)
      const { error: insertErr } = await supabase
        .from("daily_quizzes")
        .insert({
          quiz_date: date,
          category: cat.name,
          category_id: cat.id,
          difficulty: diff,
          questions,
        });
      if (insertErr && !String(insertErr.message).toLowerCase().includes("duplicate")) {
        // another client may have inserted — fall through to re-read
      }
      // Re-read to get canonical row
      const { data: row } = await supabase
        .from("daily_quizzes")
        .select("*")
        .eq("quiz_date", date)
        .maybeSingle();
      qc.invalidateQueries({ queryKey: ["daily-quiz-attempts", date] });
      return (row || {
        quiz_date: date,
        category: cat.name,
        category_id: cat.id,
        difficulty: diff,
        questions,
        created_at: new Date().toISOString(),
      }) as DailyQuiz;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useMyTodayAttempt() {
  const { user } = useAuth();
  const date = todayISO();
  return useQuery<DailyAttempt | null>({
    queryKey: ["my-daily-attempt", user?.id, date],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("daily_quiz_attempts")
        .select("*")
        .eq("user_id", user.id)
        .eq("quiz_date", date)
        .maybeSingle();
      if (error) throw error;
      return (data as DailyAttempt) || null;
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });
}

export function useTodayLeaderboard() {
  const date = todayISO();
  return useQuery<DailyAttempt[]>({
    queryKey: ["daily-quiz-attempts", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_quiz_attempts")
        .select("*")
        .eq("quiz_date", date)
        .order("score", { ascending: false })
        .order("time_taken", { ascending: true });
      if (error) throw error;
      return (data || []) as DailyAttempt[];
    },
    staleTime: 60 * 1000,
  });
}

export function useAllTimeLeaderboard() {
  return useQuery<DailyAttempt[]>({
    queryKey: ["daily-quiz-all-attempts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_quiz_attempts")
        .select("user_id, student_name, student_class, score, total_questions, percentage, quiz_date");
      if (error) throw error;
      return (data || []) as DailyAttempt[];
    },
    staleTime: 60 * 1000,
  });
}

export function useSubmitDailyAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: Omit<DailyAttempt, "id" | "completed_at">) => {
      const { data, error } = await supabase.from("daily_quiz_attempts").insert(a).select().single();
      if (error) throw error;
      return data as DailyAttempt;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-daily-attempt"] });
      qc.invalidateQueries({ queryKey: ["daily-quiz-attempts"] });
      qc.invalidateQueries({ queryKey: ["daily-quiz-all-attempts"] });
    },
  });
}
