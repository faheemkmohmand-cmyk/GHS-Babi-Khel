import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface NoteSubject {
  id: string; name: string; slug: string; emoji: string; color: string;
  description: string | null; class_level: string; display_order: number;
  is_visible: boolean; chapter_count?: number; podcast_mode_enabled: boolean;
}
export interface NoteChapter {
  id: string; subject_id: string; title: string; slug: string;
  description: string | null; content: string | null; animation_code: string | null;
  graph_config: any | null; pdf_url: string | null; read_time_mins: number;
  difficulty: "easy" | "medium" | "hard"; chapter_number: number;
  is_published: boolean; view_count: number; audio_enabled: boolean;
  audio_url: string | null; audio_duration: number; created_at: string;
}
export interface NoteQuiz {
  id: string; chapter_id: string; title: string; pass_score: number;
  time_limit_secs: number; is_active: boolean;
}
export interface NoteQuestion {
  id: string; quiz_id: string; question: string;
  option_a: string; option_b: string; option_c: string; option_d: string;
  correct: "a"|"b"|"c"|"d"; explanation: string | null; display_order: number;
  difficulty: "easy"|"medium"|"hard";
}
export interface NoteProgress {
  chapter_id: string; started: boolean; completed: boolean; bookmarked: boolean;
}
export interface Flashcard {
  id: string; chapter_id: string; front: string; back: string; display_order: number;
}
export interface Highlight {
  id: string; chapter_id: string; selected_text: string; color: string; personal_note: string | null;
}
export interface Gamification {
  user_id: string; total_points: number; weekly_points: number; streak_days: number;
  last_activity_date: string | null; badges: string[]; completed_subjects: string[];
  weekly_reset_date: string | null; house_points: number;
}

export interface NoteAnnotation {
  id: string; user_id: string; chapter_id: string;
  highlighted_text: string; comment: string | null;
  position_data: Record<string, any>; visibility: 'private' | 'shared' | 'public';
  color: string; upvotes: number;
  created_at: string; updated_at: string;
  profiles?: { full_name: string; role: string } | null;
}

export interface House {
  id: string; name: string; emoji: string; color: string;
  description: string | null; total_points: number; created_at: string;
  member_count?: number;
}

export interface HouseMember {
  id: string; house_id: string; user_id: string; joined_at: string;
  houses?: House;
}

export type BadgeTier = "easy" | "normal" | "hard";

export const BADGES: { id: string; emoji: string; label: string; desc: string; tier: BadgeTier }[] = [
  // ── Easy ──
  { id: "first_step",     emoji: "🌟", label: "First Step",             desc: "Read your first chapter",              tier: "easy" },
  { id: "first_chapter",  emoji: "📖", label: "First Chapter Complete", desc: "Complete your first chapter",          tier: "easy" },
  { id: "three_streak",   emoji: "✨", label: "Getting Started",        desc: "Study for 3 consecutive days",         tier: "easy" },
  { id: "early_bird",     emoji: "🐦", label: "Early Bird",             desc: "Study before 8 AM",                    tier: "easy" },
  { id: "century",        emoji: "💯", label: "Century",                desc: "Reach 100 points",                     tier: "easy" },
  { id: "curious_mind",   emoji: "🔎", label: "Curious Mind",           desc: "Read chapters in 3 different subjects",tier: "easy" },
  // ── Normal ──
  { id: "seven_streak",   emoji: "🔥", label: "7-Day Streak",           desc: "Study for 7 consecutive days",         tier: "normal" },
  { id: "on_fire",        emoji: "🔥", label: "On Fire",                desc: "7-day streak",                         tier: "normal" },
  { id: "bookworm",       emoji: "📚", label: "Bookworm",               desc: "Read 10 chapters",                     tier: "normal" },
  { id: "perfect_quiz",   emoji: "🎯", label: "Perfect Quiz Score",     desc: "Score 100% on any quiz",               tier: "normal" },
  { id: "quiz_master",    emoji: "🏅", label: "Quiz Master",            desc: "Perfect score on any quiz",            tier: "normal" },
  { id: "speed_reader",   emoji: "⚡", label: "Speed Reader",           desc: "Complete 5 chapters in one day",       tier: "normal" },
  { id: "half_k",         emoji: "🚀", label: "Rising Star",            desc: "Reach 500 points",                     tier: "normal" },
  { id: "helpful_peer",   emoji: "🤝", label: "Helpful Peer",           desc: "Receive 10 upvotes on shared annotations", tier: "normal" },
  { id: "house_hero",     emoji: "🛡️", label: "House Hero",            desc: "Contribute 200 points to your house",  tier: "normal" },
  // ── Hard ──
  { id: "subject_master", emoji: "🏆", label: "Subject Master",         desc: "Complete all chapters in a subject",   tier: "hard" },
  { id: "subject_done",   emoji: "🎓", label: "Subject Complete",       desc: "Finish all chapters in a subject",     tier: "hard" },
  { id: "legend",         emoji: "👑", label: "Legend",                 desc: "30-day streak",                        tier: "hard" },
  { id: "top_student",    emoji: "⭐", label: "Top Student",            desc: "Reach 1000 points",                    tier: "hard" },
  { id: "sharp_shooter",  emoji: "🎯", label: "Sharp Shooter",          desc: "5 perfect quiz scores",                tier: "hard" },
  { id: "unstoppable",    emoji: "💎", label: "Unstoppable",            desc: "60-day streak",                        tier: "hard" },
  { id: "grand_master",   emoji: "🌌", label: "Grand Master",           desc: "Reach 2500 points",                    tier: "hard" },
];

// Subjects
export function useNoteSubjects(adminMode = false) {
  return useQuery<NoteSubject[]>({
    queryKey: ["note-subjects", adminMode],
    queryFn: async () => {
      let q = supabase.from("note_subjects").select("*").order("display_order");
      if (!adminMode) q = q.eq("is_visible", true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useMutateSubject() {
  const qc = useQueryClient();
  const upsert = useMutation({
    mutationFn: async (s: Partial<NoteSubject> & { id?: string }) => {
      if (s.id) { const { error } = await supabase.from("note_subjects").update(s).eq("id", s.id); if (error) throw error; }
      else { const { error } = await supabase.from("note_subjects").insert(s); if (error) throw error; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["note-subjects"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("note_subjects").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["note-subjects"] }),
  });
  return { upsert, remove };
}

// Chapters
export function useNoteChapters(subjectId?: string, adminMode = false) {
  return useQuery<NoteChapter[]>({
    queryKey: ["note-chapters", subjectId, adminMode],
    queryFn: async () => {
      let q = supabase.from("note_chapters").select("*").order("chapter_number");
      if (subjectId) q = q.eq("subject_id", subjectId);
      if (!adminMode) q = q.eq("is_published", true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!subjectId || adminMode,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMutateChapter() {
  const qc = useQueryClient();
  const upsert = useMutation({
    mutationFn: async (c: Partial<NoteChapter> & { id?: string }) => {
      if (c.id) { const { id, ...rest } = c; const { error } = await supabase.from("note_chapters").update(rest).eq("id", id); if (error) throw error; }
      else { const { error } = await supabase.from("note_chapters").insert(c); if (error) throw error; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["note-chapters"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("note_chapters").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["note-chapters"] }),
  });
  return { upsert, remove };
}

// Quiz
export function useNoteQuiz(chapterId?: string) {
  return useQuery<NoteQuiz | null>({
    queryKey: ["note-quiz", chapterId],
    queryFn: async () => {
      const { data, error } = await supabase.from("note_quizzes").select("*").eq("chapter_id", chapterId!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!chapterId,
  });
}

export function useNoteQuestions(quizId?: string) {
  return useQuery<NoteQuestion[]>({
    queryKey: ["note-questions", quizId],
    queryFn: async () => {
      const { data, error } = await supabase.from("note_questions").select("*").eq("quiz_id", quizId!).order("display_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!quizId,
  });
}

export function useMutateQuestion() {
  const qc = useQueryClient();
  const upsert = useMutation({
    mutationFn: async (q: Partial<NoteQuestion> & { id?: string }) => {
      if (q.id) { const { id, ...rest } = q; const { error } = await supabase.from("note_questions").update(rest).eq("id", id); if (error) throw error; }
      else { const { error } = await supabase.from("note_questions").insert(q); if (error) throw error; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["note-questions"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from("note_questions").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["note-questions"] }),
  });
  return { upsert, remove };
}

// Progress
export function useNoteProgress(userId?: string) {
  return useQuery<NoteProgress[]>({
    queryKey: ["note-progress", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("note_progress").select("*").eq("user_id", userId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });
}

export async function saveProgress(userId: string, chapterId: string, update: Partial<NoteProgress>) {
  await supabase.from("note_progress").upsert(
    { user_id: userId, chapter_id: chapterId, ...update, updated_at: new Date().toISOString() },
    { onConflict: "user_id,chapter_id" }
  );
}

export async function saveQuizResult(userId: string, quizId: string, score: number, total: number, passed: boolean) {
  await supabase.from("note_quiz_results").insert({ user_id: userId, quiz_id: quizId, score, total, passed });
}

// Gamification
export function useGamification(userId?: string) {
  return useQuery<Gamification | null>({
    queryKey: ["gamification", userId],
    queryFn: async () => {
      const { data } = await supabase.from("student_gamification").select("*").eq("user_id", userId!).maybeSingle();
      return data;
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
  });
}

export function useLeaderboard() {
  return useQuery<(Gamification & { full_name: string })[]>({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      // Fetch gamification data WITHOUT the profiles join — PostgREST can't
      // resolve the embedding because student_gamification.user_id references
      // auth.users(id), not profiles(id). We fetch names separately.
      const { data: gamData, error: gamError } = await supabase
        .from("student_gamification")
        .select("*")
        .order("total_points", { ascending: false })
        .limit(100);
      if (gamError) {
        console.warn("[useLeaderboard] Gamification query failed:", gamError.message);
        return [];
      }
      // Fetch profile names for all user_ids in a single batch
      const userIds = (gamData ?? []).map((d: any) => d.user_id);
      const profileMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        (profiles ?? []).forEach((p: any) => profileMap.set(p.id, p.full_name || "Anonymous"));
      }
      return (gamData ?? []).map((d: any) => ({
        ...d,
        full_name: profileMap.get(d.user_id) || "Anonymous",
        profiles: undefined, // remove failed join artefact
      }));
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useWeeklyLeaderboard() {
  return useQuery<(Gamification & { full_name: string })[]>({
    queryKey: ["weekly-leaderboard"],
    queryFn: async () => {
      // Fetch gamification data WITHOUT the profiles join — same reason as
      // useLeaderboard: no direct FK to profiles table.
      // Do NOT filter on weekly_points > 0 — a brand-new student who just
      // earned their first point should appear immediately.
      const { data: gamData, error: gamError } = await supabase
        .from("student_gamification")
        .select("*")
        .order("weekly_points", { ascending: false })
        .limit(100);
      if (gamError) {
        console.warn("[useWeeklyLeaderboard] Gamification query failed:", gamError.message);
        return [];
      }
      // Fetch profile names for all user_ids in a single batch
      const userIds = (gamData ?? []).map((d: any) => d.user_id);
      const profileMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        (profiles ?? []).forEach((p: any) => profileMap.set(p.id, p.full_name || "Anonymous"));
      }
      return (gamData ?? []).map((d: any) => ({
        ...d,
        full_name: profileMap.get(d.user_id) || "Anonymous",
        profiles: undefined,
      }));
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Returns the 1-indexed rank of `userId` within `data`, or null if not found/no id given. */
export function getRankOf(data: { user_id: string }[] | undefined, userId?: string): number | null {
  if (!data || !userId) return null;
  const idx = data.findIndex((d) => d.user_id === userId);
  return idx === -1 ? null : idx + 1;
}

export async function awardPoints(userId: string, points: number, badgeId?: string) {
  const { data: current } = await supabase.from("student_gamification").select("*").eq("user_id", userId).maybeSingle();
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  let streakDays = current?.streak_days || 0;
  const lastDate = current?.last_activity_date;
  if (lastDate === yesterday) streakDays++;
  else if (lastDate !== today) streakDays = 1;
  const currentBadges: string[] = current?.badges || [];
  if (badgeId && !currentBadges.includes(badgeId)) currentBadges.push(badgeId);

  // ── Auto-award badges based on streak ──────────────────────────────────────
  if (streakDays >= 3 && !currentBadges.includes("three_streak")) currentBadges.push("three_streak");
  if (streakDays >= 7 && !currentBadges.includes("on_fire")) currentBadges.push("on_fire");
  if (streakDays >= 7 && !currentBadges.includes("seven_streak")) currentBadges.push("seven_streak");
  if (streakDays >= 30 && !currentBadges.includes("legend")) currentBadges.push("legend");
  if (streakDays >= 60 && !currentBadges.includes("unstoppable")) currentBadges.push("unstoppable");

  // ── Auto-award badges based on points ──────────────────────────────────────
  const newPoints = (current?.total_points || 0) + points;
  if (newPoints >= 100 && !currentBadges.includes("century")) currentBadges.push("century");
  if (newPoints >= 500 && !currentBadges.includes("half_k")) currentBadges.push("half_k");
  if (newPoints >= 1000 && !currentBadges.includes("top_student")) currentBadges.push("top_student");
  if (newPoints >= 2500 && !currentBadges.includes("grand_master")) currentBadges.push("grand_master");

  // ── Auto-award first_step badge on first ever points ───────────────────────
  if (!current || (current.total_points || 0) === 0) {
    if (!currentBadges.includes("first_step")) currentBadges.push("first_step");
  }

  // ── Early bird badge — study before 8 AM local time ───────────────────────
  const hour = new Date().getHours();
  if (hour < 8 && !currentBadges.includes("early_bird")) currentBadges.push("early_bird");

  // Weekly points tracking - reset on new week (Sunday, local time, UTC-normalized
  // so the comparison is stable regardless of time-of-day the award happens).
  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const lastReset = (current as any)?.weekly_reset_date;
  // Same week as last recorded reset -> keep accumulating. Otherwise this is the
  // first award of a new week, so weekly_points restarts from this award.
  const currentWeekly = (current as any)?.weekly_points || 0;
  const weeklyPts = (lastReset === weekStartStr) ? currentWeekly + points : points;

  // House points contribution
  const currentHousePts = (current as any)?.house_points || 0;
  const housePts = currentHousePts + points;

  // ── Attempt upsert with full columns (weekly_points, house_points, etc.) ───
  // These columns may not exist in older DB schemas. If the full upsert fails,
  // fall back to a basic upsert with only the columns that always exist.
  let upsertError: any = null;

  // Try full upsert first (includes weekly_points, house_points, weekly_reset_date)
  const fullResult = await supabase.from("student_gamification").upsert(
    { user_id: userId, total_points: newPoints, weekly_points: weeklyPts, weekly_reset_date: weekStartStr, house_points: housePts, streak_days: streakDays, last_activity_date: today, badges: currentBadges, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  upsertError = fullResult.error;

  // If full upsert failed (likely missing columns), try basic upsert
  if (upsertError) {
    console.warn("[awardPoints] Full upsert failed (missing columns?), trying basic upsert:", upsertError.message);
    const basicResult = await supabase.from("student_gamification").upsert(
      { user_id: userId, total_points: newPoints, streak_days: streakDays, last_activity_date: today, badges: currentBadges, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    upsertError = basicResult.error;
  }

  // ── CRITICAL FIX: Invalidate React Query cache ─────────────────────────────
  // Always dispatch the event, even if upsert partially failed, so the UI
  // at least refetches and shows whatever IS in the database. Previously this
  // was placed AFTER the throw, so a failed upsert meant the cache was never
  // invalidated and the UI showed stale data forever.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ghs:gamification-updated", {
      detail: { userId, points: newPoints }
    }));
  }

  if (upsertError) {
    // Surface this loudly. Previously every call site wrapped awardPoints in
    // .catch(() => {}), which meant a schema mismatch (missing column, RLS
    // denial, etc.) would silently discard points forever with zero trace.
    console.error("[awardPoints] failed to save gamification points:", upsertError);
    throw upsertError;
  }

  // ── Update house total points if user is in a house ────────────────────────
  // NOTE: The houses RLS policy only allows admins to UPDATE. Students can't
  // directly update houses.total_points. We try anyway (in case the policy
  // was relaxed), and if it fails the useHouses hook computes points
  // dynamically from student_gamification as a fallback.
  try {
    const { data: hm } = await supabase.from("house_members").select("house_id").eq("user_id", userId).maybeSingle();
    if (hm) {
      const { data: allMembers } = await supabase.from("house_members").select("user_id").eq("house_id", hm.house_id);
      if (allMembers && allMembers.length > 0) {
        const memberIds = allMembers.map((m: any) => m.user_id);
        // Use total_points (always exists) as the source of truth for house
        // contribution, falling back to house_points if the column exists.
        const { data: gData } = await supabase.from("student_gamification").select("total_points, house_points").in("user_id", memberIds);
        const total = (gData || []).reduce((sum: number, g: any) => {
          // house_points is the preferred column (tracks points earned while
          // in this house), but total_points is the always-available fallback.
          const contribution = g.house_points != null ? g.house_points : (g.total_points || 0);
          return sum + contribution;
        }, 0);
        const { error: houseUpdateError } = await supabase.from("houses").update({ total_points: total }).eq("id", hm.house_id);
        if (houseUpdateError) {
          // RLS likely blocked the update (students can't update houses).
          // This is expected — useHouses computes points dynamically as fallback.
          console.warn("[awardPoints] Could not update house total_points (RLS?):", houseUpdateError.message);
        }
      }
    }
  } catch (e) {
    console.warn("[awardPoints] House points update failed:", e);
  }
}

export async function saveWrongAnswer(userId: string, questionId: string, givenAnswer: string) {
  await supabase.from("note_wrong_answers").upsert(
    { user_id: userId, question_id: questionId, given_answer: givenAnswer },
    { onConflict: "user_id,question_id" }
  );
}
export async function removeWrongAnswer(userId: string, questionId: string) {
  await supabase.from("note_wrong_answers").delete().eq("user_id", userId).eq("question_id", questionId);
}

// Flashcards
export function useFlashcards(chapterId?: string) {
  return useQuery<Flashcard[]>({
    queryKey: ["flashcards", chapterId],
    queryFn: async () => {
      const { data, error } = await supabase.from("note_flashcards").select("*").eq("chapter_id", chapterId!).order("display_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!chapterId,
  });
}

export function useMutateFlashcard() {
  const qc = useQueryClient();
  const upsert = useMutation({
    mutationFn: async (f: Partial<Flashcard> & { id?: string }) => {
      if (f.id) { const { id, ...rest } = f; await supabase.from("note_flashcards").update(rest).eq("id", id); }
      else { await supabase.from("note_flashcards").insert(f); }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flashcards"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from("note_flashcards").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flashcards"] }),
  });
  return { upsert, remove };
}

// Highlights
export function useHighlights(userId?: string, chapterId?: string) {
  return useQuery<Highlight[]>({
    queryKey: ["highlights", userId, chapterId],
    queryFn: async () => {
      const { data, error } = await supabase.from("note_highlights").select("*").eq("user_id", userId!).eq("chapter_id", chapterId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId && !!chapterId,
  });
}

// ─── Student search (for admin SRS picker) ──────────────────────────────────
export interface StudentLite {
  id: string;
  full_name: string | null;
  class: string | null;
  roll_number: string | null;
}

/** Search students by name/roll number — used by admin's SRS student picker */
export function useStudentSearch(query: string) {
  return useQuery<StudentLite[]>({
    queryKey: ["student-search", query],
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("id, full_name, class, roll_number")
        .eq("role", "student")
        .order("full_name")
        .limit(20);

      if (query.trim()) {
        q = q.or(`full_name.ilike.%${query}%,roll_number.ilike.%${query}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });
}

// Wrong Answers
export function useWrongAnswers(userId?: string) {
  return useQuery({
    queryKey: ["wrong-answers", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("note_wrong_answers")
        .select("*, note_questions(*)").eq("user_id", userId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });
}

export async function incrementViewCount(chapterId: string) {
  const { error } = await supabase.rpc("increment_chapter_views", { chapter_id: chapterId });
  if (error) {
    const { data } = await supabase.from("note_chapters").select("view_count").eq("id", chapterId).maybeSingle();
    await supabase.from("note_chapters").update({ view_count: (data?.view_count ?? 0) + 1 }).eq("id", chapterId);
  }
}

// ─── Annotations ────────────────────────────────────────────────────────────────
export function useAnnotations(chapterId?: string, userId?: string) {
  return useQuery<NoteAnnotation[]>({
    queryKey: ["annotations", chapterId, userId],
    queryFn: async () => {
      if (!chapterId) return [];
      const { data, error } = await supabase
        .from("note_annotations")
        .select("*, profiles(full_name, role)")
        .eq("chapter_id", chapterId)
        .order("created_at", { ascending: true });
      if (error) {
        // Surface the real Postgres/PostgREST error message (e.g. a broken
        // embed relationship or RLS denial) instead of letting it disappear
        // behind the `data: annotations = []` default in the component,
        // which made every failure look identical to "just no annotations".
        console.error("useAnnotations query failed:", error);
        throw error;
      }
      return (data ?? []) as NoteAnnotation[];
    },
    enabled: !!chapterId,
    staleTime: 30 * 1000,
    retry: 1,
  });
}

export function useCreateAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: Omit<NoteAnnotation, 'id' | 'created_at' | 'updated_at' | 'upvotes' | 'profiles'>) => {
      const { data, error } = await supabase.from("note_annotations").insert(a).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["annotations", vars.chapter_id] }),
  });
}

export function useUpdateAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<NoteAnnotation> & { id: string }) => {
      const { data, error } = await supabase.from("note_annotations").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ["annotations", d.chapter_id] }),
  });
}

export function useDeleteAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, chapterId }: { id: string; chapterId: string }) => {
      const { error } = await supabase.from("note_annotations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["annotations", vars.chapterId] }),
  });
}

export function useUpvoteAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ annotationId, userId, chapterId }: { annotationId: string; userId: string; chapterId: string }) => {
      // Check existing upvote
      const { data: existing } = await supabase.from("annotation_upvotes")
        .select("id").eq("annotation_id", annotationId).eq("user_id", userId).maybeSingle();
      if (existing) {
        // Remove upvote
        await supabase.from("annotation_upvotes").delete().eq("id", existing.id);
        const { data: ann } = await supabase.from("note_annotations").select("upvotes").eq("id", annotationId).maybeSingle();
        if (ann) await supabase.from("note_annotations").update({ upvotes: Math.max(0, ann.upvotes - 1) }).eq("id", annotationId);
      } else {
        // Add upvote
        await supabase.from("annotation_upvotes").insert({ annotation_id: annotationId, user_id: userId });
        const { data: ann } = await supabase.from("note_annotations").select("upvotes").eq("id", annotationId).maybeSingle();
        if (ann) await supabase.from("note_annotations").update({ upvotes: ann.upvotes + 1 }).eq("id", annotationId);
        // Check helpful_peer badge
        if (ann && ann.upvotes + 1 >= 10) {
          const { data: allAnnotations } = await supabase.from("note_annotations")
            .select("upvotes").eq("user_id", (await supabase.from("note_annotations").select("user_id").eq("id", annotationId).maybeSingle()).data?.user_id || "")
            .in("visibility", ["shared", "public"]);
          const totalUpvotes = (allAnnotations || []).reduce((s: number, a: any) => s + (a.upvotes || 0), 0);
          if (totalUpvotes >= 10) {
            const { data: g } = await supabase.from("student_gamification").select("badges").eq("user_id", (await supabase.from("note_annotations").select("user_id").eq("id", annotationId).maybeSingle()).data?.user_id || "").maybeSingle();
            if (g && !g.badges.includes("helpful_peer")) {
              await supabase.from("student_gamification").update({ badges: [...g.badges, "helpful_peer"] }).eq("user_id", (await supabase.from("note_annotations").select("user_id").eq("id", annotationId).maybeSingle()).data?.user_id || "");
            }
          }
        }
      }
      return chapterId;
    },
    onSuccess: (chapterId) => qc.invalidateQueries({ queryKey: ["annotations", chapterId] }),
  });
}

// ─── Houses ─────────────────────────────────────────────────────────────────────
export function useHouses() {
  return useQuery<House[]>({
    queryKey: ["houses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("houses").select("*").order("total_points", { ascending: false });
      if (error) {
        // Table might not exist yet (migration not run) — return empty instead of throwing
        console.warn("[useHouses] Failed to fetch houses (table may not exist):", error.message);
        return [];
      }
      const houses = (data ?? []) as House[];

      // ── Compute house points dynamically from student_gamification ──────────
      // The houses.total_points column is NOT reliably updated because:
      //   1. RLS policy only allows admins to UPDATE houses
      //   2. awardPoints runs as the student → RLS blocks the update
      //   3. The migration adding house_points may not be applied yet
      // So we recompute the real totals here for accurate display.
      for (const h of houses) {
        // Get member list and count
        const { data: members, count } = await supabase
          .from("house_members")
          .select("user_id", { count: "exact" })
          .eq("house_id", h.id);
        h.member_count = count || 0;

        // Sum up points from all members' gamification data
        if (members && members.length > 0) {
          const memberIds = members.map((m: any) => m.user_id);
          const { data: gData } = await supabase
            .from("student_gamification")
            .select("total_points, house_points")
            .in("user_id", memberIds);
          const computedTotal = (gData || []).reduce((sum: number, g: any) => {
            // Prefer house_points (tracks contribution while in house),
            // fallback to total_points if house_points column doesn't exist.
            const contribution = g.house_points != null ? g.house_points : (g.total_points || 0);
            return sum + contribution;
          }, 0);
          // Override the stored total_points with the computed value
          h.total_points = computedTotal;
        }
      }

      // Re-sort by computed points (highest first)
      houses.sort((a, b) => b.total_points - a.total_points);
      return houses;
    },
    staleTime: 60 * 1000,
    retry: 1,  // Don't retry aggressively if table doesn't exist
  });
}

export function useMyHouse(userId?: string) {
  return useQuery<HouseMember & { houses: House } | null>({
    queryKey: ["my-house", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from("house_members")
        .select("*, houses(*)").eq("user_id", userId).maybeSingle();
      if (error) {
        // Table might not exist yet — return null instead of throwing
        console.warn("[useMyHouse] Failed to fetch house membership:", error.message);
        return null;
      }
      return data as any;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useJoinHouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ houseId, userId }: { houseId: string; userId: string }) => {
      // Remove from existing house first
      await supabase.from("house_members").delete().eq("user_id", userId);
      // Join new house
      const { error } = await supabase.from("house_members").insert({ house_id: houseId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-house"] });
      qc.invalidateQueries({ queryKey: ["houses"] });
    },
  });
}
