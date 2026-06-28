/**
 * useSRS.ts — Spaced Repetition System based on SM-2 algorithm
 *
 * Requires the following Supabase table (see db/srs_setup.sql):
 *   srs_reviews (
 *     id uuid PRIMARY KEY,
 *     user_id uuid REFERENCES auth.users,
 *     question_id uuid REFERENCES note_questions,
 *     ease_factor numeric DEFAULT 2.5,   -- SM-2 EF, min 1.3
 *     interval integer DEFAULT 1,        -- days until next review
 *     repetitions integer DEFAULT 0,     -- consecutive correct answers
 *     next_review_date date NOT NULL,    -- when this card is due
 *     last_reviewed_at timestamptz,
 *     created_at timestamptz DEFAULT now(),
 *     UNIQUE(user_id, question_id)
 *   )
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────── Types ───────────────────────────────────────

export interface SRSCard {
  id: string;
  user_id: string;
  question_id: string;
  ease_factor: number;
  interval: number;
  repetitions: number;
  next_review_date: string; // ISO date "YYYY-MM-DD"
  last_reviewed_at: string | null;
  created_at: string;
  // Joined from note_questions
  question?: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct?: "a" | "b" | "c" | "d";
  explanation?: string | null;
  difficulty?: "easy" | "medium" | "hard";
  // Joined subject/chapter info
  chapter_title?: string;
  subject_name?: string;
  subject_emoji?: string;
}

/** Quality values for SM-2: 0–5 scale */
export type SM2Quality = 0 | 1 | 2 | 3 | 4 | 5;

// ─────────────────────────────── SM-2 Algorithm ──────────────────────────────

/**
 * Pure SM-2 next-review calculator.
 * quality 0-2 = incorrect/hard, 3 = correct with difficulty, 4 = correct, 5 = perfect
 */
export function sm2(
  quality: SM2Quality,
  repetitions: number,
  easeFactor: number,
  interval: number
): { newInterval: number; newRepetitions: number; newEaseFactor: number; nextDate: string } {
  let newRepetitions = repetitions;
  let newEaseFactor = easeFactor;
  let newInterval: number;

  if (quality >= 3) {
    // Correct response
    if (repetitions === 0) newInterval = 1;
    else if (repetitions === 1) newInterval = 3;
    else newInterval = Math.round(interval * easeFactor);

    newRepetitions = repetitions + 1;
  } else {
    // Incorrect — reset interval, keep EF penalty
    newRepetitions = 0;
    newInterval = 1;
  }

  // Update EF (clamped at 1.3 minimum)
  newEaseFactor = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  // Cap interval at 365 days
  newInterval = Math.min(newInterval, 365);

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + newInterval);
  const iso = nextDate.toISOString().split("T")[0];

  return {
    newInterval,
    newRepetitions,
    newEaseFactor: Math.round(newEaseFactor * 100) / 100,
    nextDate: iso,
  };
}

/** Map a correct/incorrect answer to an SM-2 quality score */
export function answerToQuality(correct: boolean, difficulty: "easy" | "medium" | "hard" = "medium"): SM2Quality {
  if (!correct) return difficulty === "hard" ? 1 : 2;
  return difficulty === "easy" ? 5 : difficulty === "medium" ? 4 : 3;
}

// ─────────────────────────────── Today helper ────────────────────────────────

function today(): string {
  return new Date().toISOString().split("T")[0];
}

// ─────────────────────────────── Queries ─────────────────────────────────────

/** All SRS cards due today for a user */
export function useSRSDueToday(userId?: string) {
  return useQuery<SRSCard[]>({
    queryKey: ["srs-due-today", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("srs_reviews")
        .select(`
          *,
          note_questions (
            question, option_a, option_b, option_c, option_d,
            correct, explanation, difficulty,
            note_quizzes ( note_chapters ( title, note_subjects ( name, emoji ) ) )
          )
        `)
        .eq("user_id", userId!)
        .lte("next_review_date", today())
        .order("next_review_date", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        ...row,
        question:       row.note_questions?.question,
        option_a:       row.note_questions?.option_a,
        option_b:       row.note_questions?.option_b,
        option_c:       row.note_questions?.option_c,
        option_d:       row.note_questions?.option_d,
        correct:        row.note_questions?.correct,
        explanation:    row.note_questions?.explanation,
        difficulty:     row.note_questions?.difficulty,
        chapter_title:  row.note_questions?.note_quizzes?.note_chapters?.title,
        subject_name:   row.note_questions?.note_quizzes?.note_chapters?.note_subjects?.name,
        subject_emoji:  row.note_questions?.note_quizzes?.note_chapters?.note_subjects?.emoji,
      }));
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}

/** Total upcoming review counts (next 7 days) for dashboard widget */
export function useSRSUpcoming(userId?: string) {
  return useQuery<{ date: string; count: number }[]>({
    queryKey: ["srs-upcoming", userId],
    queryFn: async () => {
      const end = new Date();
      end.setDate(end.getDate() + 7);
      const { data, error } = await supabase
        .from("srs_reviews")
        .select("next_review_date")
        .eq("user_id", userId!)
        .lte("next_review_date", end.toISOString().split("T")[0])
        .gte("next_review_date", today());

      if (error) throw error;

      // Group by date
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        map[row.next_review_date] = (map[row.next_review_date] ?? 0) + 1;
      }
      return Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

/** All enrolled cards (for admin stats panel) */
export function useSRSStats(userId?: string) {
  return useQuery({
    queryKey: ["srs-stats", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("srs_reviews")
        .select("next_review_date, repetitions, interval, ease_factor")
        .eq("user_id", userId!);

      if (error) throw error;
      const rows = data ?? [];
      const dueToday = rows.filter(r => r.next_review_date <= today()).length;
      const mature   = rows.filter(r => r.interval >= 21).length;
      const learning = rows.filter(r => r.repetitions === 0).length;
      return { total: rows.length, dueToday, mature, learning };
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}

// ─────────────────────────────── Mutations ───────────────────────────────────

/**
 * Enrol a question into SRS for a user (called when they get it wrong in a quiz).
 * If already enrolled, does nothing (idempotent).
 */
export async function enrollSRSCard(userId: string, questionId: string) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextDate = tomorrow.toISOString().split("T")[0];

  await supabase.from("srs_reviews").upsert(
    {
      user_id: userId,
      question_id: questionId,
      ease_factor: 2.5,
      interval: 1,
      repetitions: 0,
      next_review_date: nextDate,
    },
    { onConflict: "user_id,question_id", ignoreDuplicates: true }
  );
}

/** Update a card after a review session answer */
export function useSubmitSRSAnswer() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cardId,
      quality,
      currentRepetitions,
      currentEF,
      currentInterval,
    }: {
      cardId: string;
      quality: SM2Quality;
      currentRepetitions: number;
      currentEF: number;
      currentInterval: number;
    }) => {
      const { newInterval, newRepetitions, newEaseFactor, nextDate } = sm2(
        quality,
        currentRepetitions,
        currentEF,
        currentInterval
      );

      const { error } = await supabase
        .from("srs_reviews")
        .update({
          ease_factor: newEaseFactor,
          interval: newInterval,
          repetitions: newRepetitions,
          next_review_date: nextDate,
          last_reviewed_at: new Date().toISOString(),
        })
        .eq("id", cardId);

      if (error) throw error;
      return { newInterval, nextDate };
    },
    onSuccess: (_data, vars) => {
      // Optimistic: remove from today's queue immediately
      qc.invalidateQueries({ queryKey: ["srs-due-today"] });
      qc.invalidateQueries({ queryKey: ["srs-upcoming"] });
      qc.invalidateQueries({ queryKey: ["srs-stats"] });
    },
  });
}

/** Remove a card from SRS (e.g. user mastered it and wants to dismiss) */
export function useRemoveSRSCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase.from("srs_reviews").delete().eq("id", cardId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["srs-due-today"] });
      qc.invalidateQueries({ queryKey: ["srs-stats"] });
    },
  });
}
