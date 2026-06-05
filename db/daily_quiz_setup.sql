-- =====================================================================
-- Daily Quiz feature: one shared quiz per day, one attempt per user/day
-- Run this SQL once in your Supabase SQL editor.
-- =====================================================================

-- Daily quizzes table: stores the auto-generated quiz for each day
create table if not exists public.daily_quizzes (
  quiz_date     date primary key,
  category      text not null,
  category_id   int  not null,
  difficulty    text not null,
  questions     jsonb not null,
  created_at    timestamptz not null default now()
);

-- Grants
grant select, insert on public.daily_quizzes to authenticated;
grant select on public.daily_quizzes to anon;
grant all on public.daily_quizzes to service_role;

-- Enable RLS
alter table public.daily_quizzes enable row level security;

-- Anyone can read daily quizzes (needed for leaderboard display)
drop policy if exists "Anyone can read daily quizzes" on public.daily_quizzes;
create policy "Anyone can read daily quizzes"
  on public.daily_quizzes for select
  to anon, authenticated
  using (true);

-- Authenticated users can seed (insert) the daily quiz
drop policy if exists "Authenticated users can seed daily quiz" on public.daily_quizzes;
create policy "Authenticated users can seed daily quiz"
  on public.daily_quizzes for insert
  to authenticated
  with check (true);

-- Daily quiz attempts: stores each user's attempt for a given day
create table if not exists public.daily_quiz_attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  quiz_date        date not null,
  student_name     text not null,
  student_class    text,
  roll_number      text,
  answers          jsonb not null default '{}'::jsonb,
  score            int  not null,
  total_questions  int  not null,
  percentage       numeric(5,2) not null,
  time_taken       int,
  completed_at     timestamptz not null default now(),
  unique (user_id, quiz_date)
);

-- Grants
grant select, insert on public.daily_quiz_attempts to authenticated;
grant all on public.daily_quiz_attempts to service_role;

-- Enable RLS
alter table public.daily_quiz_attempts enable row level security;

-- Users can read all daily quiz attempts (needed for leaderboard)
drop policy if exists "Users can read all daily quiz attempts" on public.daily_quiz_attempts;
create policy "Users can read all daily quiz attempts"
  on public.daily_quiz_attempts for select
  to authenticated
  using (true);

-- Users can only insert their own attempt (RLS enforced)
drop policy if exists "Users can insert their own daily quiz attempt" on public.daily_quiz_attempts;
create policy "Users can insert their own daily quiz attempt"
  on public.daily_quiz_attempts for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Performance indexes
create index if not exists idx_dqa_date on public.daily_quiz_attempts(quiz_date);
create index if not exists idx_dqa_user on public.daily_quiz_attempts(user_id);
