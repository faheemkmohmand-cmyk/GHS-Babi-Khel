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

export const BADGES = [
  { id: "first_chapter",  emoji: "📖", label: "First Chapter Complete", desc: "Complete your first chapter" },
  { id: "seven_streak",   emoji: "🔥", label: "7-Day Streak",           desc: "Study for 7 consecutive days" },
  { id: "perfect_quiz",   emoji: "🎯", label: "Perfect Quiz Score",     desc: "Score 100% on any quiz" },
  { id: "speed_reader",   emoji: "⚡", label: "Speed Reader",          desc: "Complete 5 chapters in one day" },
  { id: "helpful_peer",   emoji: "🤝", label: "Helpful Peer",          desc: "Receive 10 upvotes on shared annotations" },
  { id: "subject_master", emoji: "🏆", label: "Subject Master",        desc: "Complete all chapters in a subject" },
  { id: "first_step",     emoji: "🌟", label: "First Step",             desc: "Read your first chapter" },
  { id: "bookworm",       emoji: "📚", label: "Bookworm",               desc: "Read 10 chapters" },
  { id: "quiz_master",    emoji: "🏅", label: "Quiz Master",            desc: "Perfect score on any quiz" },
  { id: "subject_done",   emoji: "💯", label: "Subject Complete",       desc: "Finish all chapters in a subject" },
  { id: "on_fire",        emoji: "🔥", label: "On Fire",                desc: "7-day streak" },
  { id: "legend",         emoji: "👑", label: "Legend",                 desc: "30-day streak" },
  { id: "top_student",    emoji: "⭐", label: "Top Student",            desc: "Reach 1000 points" },
  { id: "sharp_shooter",  emoji: "🎯", label: "Sharp Shooter",          desc: "5 perfect quiz scores" },
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
      const { data } = await supabase
        .from("student_gamification")
        .select("*, profiles(full_name)")
        .order("total_points", { ascending: false })
        .limit(20);
      return (data ?? []).map((d: any) => ({ ...d, full_name: d.profiles?.full_name || "Anonymous" }));
    },
    staleTime: 60 * 1000,
  });
}

export function useWeeklyLeaderboard() {
  return useQuery<(Gamification & { full_name: string })[]>({
    queryKey: ["weekly-leaderboard"],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_gamification")
        .select("*, profiles(full_name)")
        .gt("weekly_points", 0)
        .order("weekly_points", { ascending: false })
        .limit(20);
      return (data ?? []).map((d: any) => ({ ...d, full_name: d.profiles?.full_name || "Anonymous" }));
    },
    staleTime: 60 * 1000,
  });
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
  if (streakDays >= 7 && !currentBadges.includes("on_fire")) currentBadges.push("on_fire");
  if (streakDays >= 7 && !currentBadges.includes("seven_streak")) currentBadges.push("seven_streak");
  if (streakDays >= 30 && !currentBadges.includes("legend")) currentBadges.push("legend");
  const newPoints = (current?.total_points || 0) + points;
  if (newPoints >= 1000 && !currentBadges.includes("top_student")) currentBadges.push("top_student");

  // Weekly points tracking - reset on new week
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const lastReset = current?.weekly_reset_date;
  const weeklyPts = (lastReset && lastReset >= weekStartStr) ? (current?.weekly_points || 0) + points : points;

  // House points contribution
  const housePts = (current?.house_points || 0) + points;

  await supabase.from("student_gamification").upsert(
    { user_id: userId, total_points: newPoints, weekly_points: weeklyPts, weekly_reset_date: weekStartStr, house_points: housePts, streak_days: streakDays, last_activity_date: today, badges: currentBadges, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  // Update house total points if user is in a house
  try {
    const { data: hm } = await supabase.from("house_members").select("house_id").eq("user_id", userId).maybeSingle();
    if (hm) {
      const { data: allMembers } = await supabase.from("house_members").select("user_id").eq("house_id", hm.house_id);
      if (allMembers && allMembers.length > 0) {
        const memberIds = allMembers.map(m => m.user_id);
        const { data: gData } = await supabase.from("student_gamification").select("house_points").in("user_id", memberIds);
        const total = (gData || []).reduce((sum: number, g: any) => sum + (g.house_points || 0), 0);
        await supabase.from("houses").update({ total_points: total }).eq("id", hm.house_id);
      }
    }
  } catch {}
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
      if (error) throw error;
      // Get member counts
      const houses = (data ?? []) as House[];
      for (const h of houses) {
        const { count } = await supabase.from("house_members").select("*", { count: "exact", head: true }).eq("house_id", h.id);
        h.member_count = count || 0;
      }
      return houses;
    },
    staleTime: 60 * 1000,
  });
}

export function useMyHouse(userId?: string) {
  return useQuery<HouseMember & { houses: House } | null>({
    queryKey: ["my-house", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from("house_members")
        .select("*, houses(*)").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
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
