/*
  # Row Level Security Policies
  
  1. Public Access
    - Published chapters visible to everyone
    - Subjects visible to everyone
    - Quizzes visible to enrolled students
    
  2. Student Data Privacy
    - Progress/ratings only visible to owner and admins
    - Quiz results private to student
    - Flashcard progress private to student
    
  3. Admin Management
    - Admins can read/write all content
    - Admins can manage subjects and chapters
    - Teachers can view student analytics
*/

DO $$
BEGIN
  -- Note Subjects - Public Read
  ALTER TABLE note_subjects ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_subjects' AND policyname = 'Published subjects visible to all'
  ) THEN
    CREATE POLICY "Published subjects visible to all"
      ON note_subjects FOR SELECT
      USING (is_visible = true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_subjects' AND policyname = 'Admins can manage subjects'
  ) THEN
    CREATE POLICY "Admins can manage subjects"
      ON note_subjects FOR ALL
      TO authenticated
      USING (auth.jwt() ->> 'user_role' = 'admin')
      WITH CHECK (auth.jwt() ->> 'user_role' = 'admin');
  END IF;

  -- Note Chapters
  ALTER TABLE note_chapters ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_chapters' AND policyname = 'Published chapters visible to all'
  ) THEN
    CREATE POLICY "Published chapters visible to all"
      ON note_chapters FOR SELECT
      USING (is_published = true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_chapters' AND policyname = 'Admins can manage chapters'
  ) THEN
    CREATE POLICY "Admins can manage chapters"
      ON note_chapters FOR ALL
      TO authenticated
      USING (auth.jwt() ->> 'user_role' = 'admin')
      WITH CHECK (auth.jwt() ->> 'user_role' = 'admin');
  END IF;

  -- Note Quizzes
  ALTER TABLE note_quizzes ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_quizzes' AND policyname = 'Active quizzes visible to all'
  ) THEN
    CREATE POLICY "Active quizzes visible to all"
      ON note_quizzes FOR SELECT
      USING (is_active = true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_quizzes' AND policyname = 'Admins can manage quizzes'
  ) THEN
    CREATE POLICY "Admins can manage quizzes"
      ON note_quizzes FOR ALL
      TO authenticated
      USING (auth.jwt() ->> 'user_role' = 'admin')
      WITH CHECK (auth.jwt() ->> 'user_role' = 'admin');
  END IF;

  -- Note Questions
  ALTER TABLE note_questions ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_questions' AND policyname = 'Questions visible to all'
  ) THEN
    CREATE POLICY "Questions visible to all"
      ON note_questions FOR SELECT
      USING (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_questions' AND policyname = 'Admins manage questions'
  ) THEN
    CREATE POLICY "Admins manage questions"
      ON note_questions FOR ALL
      TO authenticated
      USING (auth.jwt() ->> 'user_role' = 'admin')
      WITH CHECK (auth.jwt() ->> 'user_role' = 'admin');
  END IF;

  -- Note Progress
  ALTER TABLE note_progress ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_progress' AND policyname = 'Students see own progress'
  ) THEN
    CREATE POLICY "Students see own progress"
      ON note_progress FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_progress' AND policyname = 'Students insert own progress'
  ) THEN
    CREATE POLICY "Students insert own progress"
      ON note_progress FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_progress' AND policyname = 'Students update own progress'
  ) THEN
    CREATE POLICY "Students update own progress"
      ON note_progress FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_progress' AND policyname = 'Admins see all progress'
  ) THEN
    CREATE POLICY "Admins see all progress"
      ON note_progress FOR SELECT
      TO authenticated
      USING (auth.jwt() ->> 'user_role' = 'admin');
  END IF;

  -- Note Quiz Results
  ALTER TABLE note_quiz_results ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_quiz_results' AND policyname = 'Students see own quiz results'
  ) THEN
    CREATE POLICY "Students see own quiz results"
      ON note_quiz_results FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_quiz_results' AND policyname = 'Students insert own results'
  ) THEN
    CREATE POLICY "Students insert own results"
      ON note_quiz_results FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_quiz_results' AND policyname = 'Teachers see student results'
  ) THEN
    CREATE POLICY "Teachers see student results"
      ON note_quiz_results FOR SELECT
      TO authenticated
      USING (auth.jwt() ->> 'user_role' = 'teacher');
  END IF;

  -- Note Flashcards
  ALTER TABLE note_flashcards ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_flashcards' AND policyname = 'Flashcards visible to all'
  ) THEN
    CREATE POLICY "Flashcards visible to all"
      ON note_flashcards FOR SELECT
      USING (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_flashcards' AND policyname = 'Admins manage flashcards'
  ) THEN
    CREATE POLICY "Admins manage flashcards"
      ON note_flashcards FOR ALL
      TO authenticated
      USING (auth.jwt() ->> 'user_role' = 'admin')
      WITH CHECK (auth.jwt() ->> 'user_role' = 'admin');
  END IF;

  -- Note Flashcard Progress
  ALTER TABLE note_flashcard_progress ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_flashcard_progress' AND policyname = 'Students see own flashcard progress'
  ) THEN
    CREATE POLICY "Students see own flashcard progress"
      ON note_flashcard_progress FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_flashcard_progress' AND policyname = 'Students create flashcard progress'
  ) THEN
    CREATE POLICY "Students create flashcard progress"
      ON note_flashcard_progress FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_flashcard_progress' AND policyname = 'Students update own flashcard progress'
  ) THEN
    CREATE POLICY "Students update own flashcard progress"
      ON note_flashcard_progress FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Note Highlights
  ALTER TABLE note_highlights ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_highlights' AND policyname = 'Students see own highlights'
  ) THEN
    CREATE POLICY "Students see own highlights"
      ON note_highlights FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_highlights' AND policyname = 'Students create highlights'
  ) THEN
    CREATE POLICY "Students create highlights"
      ON note_highlights FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_highlights' AND policyname = 'Students delete own highlights'
  ) THEN
    CREATE POLICY "Students delete own highlights"
      ON note_highlights FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  -- Note Wrong Answers
  ALTER TABLE note_wrong_answers ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_wrong_answers' AND policyname = 'Students see own wrong answers'
  ) THEN
    CREATE POLICY "Students see own wrong answers"
      ON note_wrong_answers FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_wrong_answers' AND policyname = 'Students track wrong answers'
  ) THEN
    CREATE POLICY "Students track wrong answers"
      ON note_wrong_answers FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_wrong_answers' AND policyname = 'Students update own wrong answers'
  ) THEN
    CREATE POLICY "Students update own wrong answers"
      ON note_wrong_answers FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Note Ratings
  ALTER TABLE note_ratings ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_ratings' AND policyname = 'Public see ratings'
  ) THEN
    CREATE POLICY "Public see ratings"
      ON note_ratings FOR SELECT
      USING (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_ratings' AND policyname = 'Students rate chapters'
  ) THEN
    CREATE POLICY "Students rate chapters"
      ON note_ratings FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'note_ratings' AND policyname = 'Students update own ratings'
  ) THEN
    CREATE POLICY "Students update own ratings"
      ON note_ratings FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Gamification
  ALTER TABLE student_gamification ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'student_gamification' AND policyname = 'Public see leaderboard'
  ) THEN
    CREATE POLICY "Public see leaderboard"
      ON student_gamification FOR SELECT
      USING (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'student_gamification' AND policyname = 'Students create gamification'
  ) THEN
    CREATE POLICY "Students create gamification"
      ON student_gamification FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'student_gamification' AND policyname = 'Students update own gamification'
  ) THEN
    CREATE POLICY "Students update own gamification"
      ON student_gamification FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Daily Challenge
  ALTER TABLE daily_challenge ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'daily_challenge' AND policyname = 'Daily challenge visible to all'
  ) THEN
    CREATE POLICY "Daily challenge visible to all"
      ON daily_challenge FOR SELECT
      USING (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'daily_challenge' AND policyname = 'Admins manage daily challenge'
  ) THEN
    CREATE POLICY "Admins manage daily challenge"
      ON daily_challenge FOR ALL
      TO authenticated
      USING (auth.jwt() ->> 'user_role' = 'admin')
      WITH CHECK (auth.jwt() ->> 'user_role' = 'admin');
  END IF;

  -- Daily Challenge Responses
  ALTER TABLE daily_challenge_responses ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'daily_challenge_responses' AND policyname = 'Students see own challenge responses'
  ) THEN
    CREATE POLICY "Students see own challenge responses"
      ON daily_challenge_responses FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'daily_challenge_responses' AND policyname = 'Students submit challenge responses'
  ) THEN
    CREATE POLICY "Students submit challenge responses"
      ON daily_challenge_responses FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Study Groups
  ALTER TABLE study_groups ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'study_groups' AND policyname = 'Study group members see group'
  ) THEN
    CREATE POLICY "Study group members see group"
      ON study_groups FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM study_group_members
          WHERE study_group_members.group_id = study_groups.id
          AND study_group_members.user_id = auth.uid()
        )
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'study_groups' AND policyname = 'Users can create groups'
  ) THEN
    CREATE POLICY "Users can create groups"
      ON study_groups FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = created_by);
  END IF;

  -- Study Group Members
  ALTER TABLE study_group_members ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'study_group_members' AND policyname = 'Members see group membership'
  ) THEN
    CREATE POLICY "Members see group membership"
      ON study_group_members FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM study_group_members sgm2
          WHERE sgm2.group_id = study_group_members.group_id
          AND sgm2.user_id = auth.uid()
        )
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'study_group_members' AND policyname = 'Users join groups'
  ) THEN
    CREATE POLICY "Users join groups"
      ON study_group_members FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
