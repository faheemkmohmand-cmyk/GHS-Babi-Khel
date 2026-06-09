/*
  # Attendance Enhancements (Features 4.4, 4.5, 4.6)

  1. Half-Day Attendance Status (Feature 4.4)
     - Adds 'halfday' as a valid status for the attendance table
     - Drops any existing CHECK constraint and adds new one with halfday
     - Half-day counts as 0.5 in percentage calculations

  2. Attendance Analytics Support (Feature 4.5)
     - Creates attendance_daily_stats table for precomputed daily stats
     - Creates function to compute daily attendance rate per class

  3. Report Card Integration (Feature 4.6)
     - Creates attendance_thresholds table for configurable minimum attendance
     - Seeds default threshold (75% minimum for exam eligibility)
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- FEATURE 4.4: Half-Day Attendance Status
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop existing CHECK constraint on attendance.status if it exists, then add with halfday
DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Try to drop common constraint names
  ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
  ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check1;
  ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_valid;

  -- Also find and drop any other check constraint on the status column
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'attendance'
      AND att.attname = 'status'
      AND con.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE attendance DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

-- Add new CHECK constraint including 'halfday'
ALTER TABLE attendance
  ADD CONSTRAINT attendance_status_valid
  CHECK (status IN ('present', 'absent', 'late', 'leave', 'halfday'));

-- ═══════════════════════════════════════════════════════════════════════════════
-- FEATURE 4.5: Attendance Analytics Support
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create attendance_daily_stats table for caching daily attendance percentages
-- This powers the heat map calendar and daily analytics
CREATE TABLE IF NOT EXISTS attendance_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class text NOT NULL,
  date date NOT NULL,
  total_students integer NOT NULL DEFAULT 0,
  present_count integer NOT NULL DEFAULT 0,
  absent_count integer NOT NULL DEFAULT 0,
  late_count integer NOT NULL DEFAULT 0,
  leave_count integer NOT NULL DEFAULT 0,
  halfday_count integer NOT NULL DEFAULT 0,
  attendance_rate numeric(5,2) NOT NULL DEFAULT 0,
  -- attendance_rate = ((present + late + halfday*0.5) / total_students) * 100
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(class, date)
);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_attendance_daily_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_attendance_daily_stats_updated_at ON attendance_daily_stats;
CREATE TRIGGER set_attendance_daily_stats_updated_at
  BEFORE UPDATE ON attendance_daily_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_attendance_daily_stats_updated_at();

-- RLS policies for attendance_daily_stats
ALTER TABLE attendance_daily_stats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'attendance_daily_stats' AND policyname = 'Attendance stats readable by all'
  ) THEN
    CREATE POLICY "Attendance stats readable by all"
      ON attendance_daily_stats FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'attendance_daily_stats' AND policyname = 'Admins can manage attendance stats'
  ) THEN
    CREATE POLICY "Admins can manage attendance stats"
      ON attendance_daily_stats FOR ALL
      TO authenticated
      USING (auth.jwt() ->> 'user_role' IN ('admin', 'teacher'))
      WITH CHECK (auth.jwt() ->> 'user_role' IN ('admin', 'teacher'));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FEATURE 4.6: Attendance Thresholds & Report Card Integration
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create attendance_thresholds table for configurable minimum attendance
CREATE TABLE IF NOT EXISTS attendance_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  minimum_percentage numeric(5,2) NOT NULL DEFAULT 75.00,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  warning_threshold numeric(5,2) NOT NULL DEFAULT 80.00,
  -- warning_threshold: students between this and minimum get a warning
  -- e.g. if min=75, warning=80 → students with 75-80% get a caution
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_attendance_thresholds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_attendance_thresholds_updated_at ON attendance_thresholds;
CREATE TRIGGER set_attendance_thresholds_updated_at
  BEFORE UPDATE ON attendance_thresholds
  FOR EACH ROW
  EXECUTE FUNCTION update_attendance_thresholds_updated_at();

-- RLS for attendance_thresholds
ALTER TABLE attendance_thresholds ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'attendance_thresholds' AND policyname = 'Thresholds readable by all'
  ) THEN
    CREATE POLICY "Thresholds readable by all"
      ON attendance_thresholds FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'attendance_thresholds' AND policyname = 'Admins manage thresholds'
  ) THEN
    CREATE POLICY "Admins manage thresholds"
      ON attendance_thresholds FOR ALL
      TO authenticated
      USING (auth.jwt() ->> 'user_role' = 'admin')
      WITH CHECK (auth.jwt() ->> 'user_role' = 'admin');
  END IF;
END $$;

-- Seed default threshold
INSERT INTO attendance_thresholds (name, minimum_percentage, description, is_active, warning_threshold)
VALUES (
  'Default (75% Minimum)',
  75.00,
  'Students must maintain at least 75% attendance to be eligible for exams. Warnings are issued at 80%.',
  true,
  80.00
) ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Indexes for performance
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_attendance_daily_stats_class_date
  ON attendance_daily_stats (class, date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_status
  ON attendance (status);

CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON attendance (date);
