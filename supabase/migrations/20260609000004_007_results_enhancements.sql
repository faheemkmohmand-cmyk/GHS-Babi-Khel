/*
  # Feature 3: Results & Exam Enhancements

  3.1 Subject-Wise Performance Analytics
    - Uses existing subject_marks JSONB column in results table
    - New hooks for computing analytics (client-side from existing data)

  3.3 Report Card Generation
    - Add `teacher_remarks` column to results table for per-student teacher comments

  3.4 Customizable Grading Scheme
    - New `grading_schemes` table with scheme_name, ranges (JSONB), is_default
    - Centralized grading function reads from active scheme
*/

-- ─── 3.3 teacher_remarks in results ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'results' AND column_name = 'teacher_remarks'
  ) THEN
    ALTER TABLE results ADD COLUMN teacher_remarks text;
  END IF;
END $$;

-- ─── 3.4 grading_schemes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grading_schemes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_name  text NOT NULL,
  ranges       jsonb NOT NULL DEFAULT '[]',
  pass_threshold numeric NOT NULL DEFAULT 33,
  is_default   boolean NOT NULL DEFAULT false,
  is_active    boolean NOT NULL DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- Auto-update trigger
DROP TRIGGER IF EXISTS trg_grading_schemes_updated_at ON grading_schemes;
CREATE TRIGGER trg_grading_schemes_updated_at
  BEFORE UPDATE ON grading_schemes
  FOR EACH ROW EXECUTE FUNCTION update_timetable_settings_updated_at();

-- Seed the default grading scheme (matching current hardcoded values)
INSERT INTO grading_schemes (scheme_name, ranges, pass_threshold, is_default, is_active) VALUES
  (
    'Default (GHS Babi Khel)',
    '[
      {"min_percentage":90,"max_percentage":100,"grade":"A+","gpa":4.0},
      {"min_percentage":80,"max_percentage":89,"grade":"A","gpa":3.7},
      {"min_percentage":60,"max_percentage":79,"grade":"B","gpa":3.0},
      {"min_percentage":45,"max_percentage":59,"grade":"C","gpa":2.0},
      {"min_percentage":33,"max_percentage":44,"grade":"D","gpa":1.0},
      {"min_percentage":0,"max_percentage":32,"grade":"Fail","gpa":0.0}
    ]'::jsonb,
    33,
    true,
    true
  ),
  (
    'BISE Peshawar',
    '[
      {"min_percentage":90,"max_percentage":100,"grade":"A+","gpa":4.0},
      {"min_percentage":80,"max_percentage":89,"grade":"A","gpa":3.7},
      {"min_percentage":70,"max_percentage":79,"grade":"B","gpa":3.3},
      {"min_percentage":60,"max_percentage":69,"grade":"C","gpa":2.7},
      {"min_percentage":50,"max_percentage":59,"grade":"D","gpa":2.0},
      {"min_percentage":40,"max_percentage":49,"grade":"E","gpa":1.0},
      {"min_percentage":0,"max_percentage":39,"grade":"Fail","gpa":0.0}
    ]'::jsonb,
    40,
    false,
    false
  )
ON CONFLICT DO NOTHING;

-- ─── RLS Policies ─────────────────────────────────────────────────────────

ALTER TABLE grading_schemes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'grading_schemes' AND policyname = 'Grading schemes readable by all'
  ) THEN
    CREATE POLICY "Grading schemes readable by all"
      ON grading_schemes FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'grading_schemes' AND policyname = 'Admins manage grading schemes'
  ) THEN
    CREATE POLICY "Admins manage grading schemes"
      ON grading_schemes FOR ALL
      TO authenticated
      USING (auth.jwt() ->> 'user_role' = 'admin')
      WITH CHECK (auth.jwt() ->> 'user_role' = 'admin');
  END IF;
END $$;
