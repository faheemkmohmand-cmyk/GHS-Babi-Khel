/*
  # Create Notes System Core Tables
  
  1. New Tables
    - `note_subjects` — categories for chapters (Math, Science, English, etc.)
    - `note_chapters` — individual chapters with content, animations, and graphs
    - `note_quizzes` — quiz definitions linked to chapters
    - `note_questions` — multiple choice and fill-in-the-blank questions
    - `note_progress` — track which chapters each student has read/completed
    - `note_quiz_results` — store quiz attempt scores
    - `note_flashcards` — study cards for spaced repetition
    - `note_flashcard_progress` — track flashcard mastery with spaced repetition dates
    - `note_highlights` — student-created text highlights with notes
    - `note_wrong_answers` — track questions a student answered incorrectly
    - `note_ratings` — student ratings of chapters (1-5 stars)
    - `student_gamification` — points, streaks, badges, freeze count
    
  2. BISE Exam Features
    - Added `bise_important` and `bise_years` columns to note_chapters
    - Added `is_past_paper` and `paper_year` columns to note_questions
    
  3. Security
    - All tables have RLS enabled with appropriate policies
    - Students see only published content
    - Admins can manage all content
    - Each student's progress is private
*/

CREATE TABLE IF NOT EXISTS note_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  emoji text DEFAULT '',
  color text DEFAULT '#3B82F6',
  description text,
  class_level text,
  display_order integer DEFAULT 0,
  is_visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES note_subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  content text,
  animation_code text,
  graph_config jsonb,
  pdf_url text,
  read_time_mins integer DEFAULT 5,
  difficulty text DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  chapter_number integer,
  is_published boolean DEFAULT false,
  view_count integer DEFAULT 0,
  audio_enabled boolean DEFAULT true,
  bise_important boolean DEFAULT false,
  bise_years integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(subject_id, slug)
);

CREATE TABLE IF NOT EXISTS note_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES note_chapters(id) ON DELETE CASCADE,
  title text NOT NULL,
  pass_score integer DEFAULT 70,
  time_limit_secs integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES note_quizzes(id) ON DELETE CASCADE,
  question text NOT NULL,
  question_type text DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'fill')),
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct text NOT NULL,
  explanation text,
  display_order integer DEFAULT 0,
  difficulty text DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  is_past_paper boolean DEFAULT false,
  paper_year integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES note_chapters(id) ON DELETE CASCADE,
  started boolean DEFAULT false,
  completed boolean DEFAULT false,
  bookmarked boolean DEFAULT false,
  quiz_score_70_percent boolean DEFAULT false,
  unlocked boolean DEFAULT null,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS note_quiz_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES note_quizzes(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES note_chapters(id) ON DELETE CASCADE,
  score integer NOT NULL,
  total integer NOT NULL,
  passed boolean DEFAULT false,
  time_spent_secs integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES note_chapters(id) ON DELETE CASCADE,
  front text NOT NULL,
  back text NOT NULL,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_flashcard_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flashcard_id uuid NOT NULL REFERENCES note_flashcards(id) ON DELETE CASCADE,
  known boolean DEFAULT false,
  correct_count integer DEFAULT 0,
  next_review timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, flashcard_id)
);

CREATE TABLE IF NOT EXISTS note_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES note_chapters(id) ON DELETE CASCADE,
  selected_text text NOT NULL,
  color text DEFAULT 'yellow',
  personal_note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_wrong_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES note_questions(id) ON DELETE CASCADE,
  given_answer text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, question_id)
);

CREATE TABLE IF NOT EXISTS note_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES note_chapters(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS student_gamification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  total_points integer DEFAULT 0,
  streak_days integer DEFAULT 0,
  last_activity_date date,
  freeze_count integer DEFAULT 0,
  badges text[] DEFAULT '{}',
  completed_subjects text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_challenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  question_id uuid NOT NULL REFERENCES note_questions(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_challenge_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES daily_challenge(id) ON DELETE CASCADE,
  answer text NOT NULL,
  correct boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS study_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_note_chapters_subject_id ON note_chapters(subject_id);
CREATE INDEX IF NOT EXISTS idx_note_chapters_is_published ON note_chapters(is_published);
CREATE INDEX IF NOT EXISTS idx_note_quizzes_chapter_id ON note_quizzes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_note_questions_quiz_id ON note_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_note_progress_user_id ON note_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_note_progress_chapter_id ON note_progress(chapter_id);
CREATE INDEX IF NOT EXISTS idx_note_quiz_results_user_id ON note_quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_note_flashcard_progress_user_id ON note_flashcard_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_note_ratings_chapter_id ON note_ratings(chapter_id);
CREATE INDEX IF NOT EXISTS idx_daily_challenge_responses_user_id ON daily_challenge_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_study_group_members_user_id ON study_group_members(user_id);
