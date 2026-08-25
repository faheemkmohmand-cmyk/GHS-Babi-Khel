/*
  # Feature 2: Timetable Enhancements

  2.1 Move Period Names to Supabase
    - New `timetable_settings` table stores period names per class in JSONB
    - Replaces localStorage, syncs across all devices

  2.5 Room/Location Management
    - New `rooms` table with name, capacity, type, availability
    - Room field in timetable entries references this table via dropdown

  Also:
    - Ensure `timetables` table has `room` and `teacher` columns
    - Add RLS policies for all new tables
*/

-- ─── 2.1 timetable_settings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timetable_settings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_level  text NOT NULL UNIQUE,            -- "6", "7", "8", "9", "10"
  period_names jsonb NOT NULL DEFAULT '{}',     -- {"1":"Period 1","2":"Morning",...}
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- Auto-update updated_at on change
CREATE OR REPLACE FUNCTION update_timetable_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_timetable_settings_updated_at ON timetable_settings;
CREATE TRIGGER trg_timetable_settings_updated_at
  BEFORE UPDATE ON timetable_settings
  FOR EACH ROW EXECUTE FUNCTION update_timetable_settings_updated_at();

-- Seed default period names for each class
INSERT INTO timetable_settings (class_level, period_names)
VALUES
  ('6',  '{"1":"Period 1","2":"Period 2","3":"Period 3","4":"Period 4","5":"Period 5","6":"Period 6","7":"Period 7","8":"Period 8","9":"Period 9"}'),
  ('7',  '{"1":"Period 1","2":"Period 2","3":"Period 3","4":"Period 4","5":"Period 5","6":"Period 6","7":"Period 7","8":"Period 8","9":"Period 9"}'),
  ('8',  '{"1":"Period 1","2":"Period 2","3":"Period 3","4":"Period 4","5":"Period 5","6":"Period 6","7":"Period 7","8":"Period 8","9":"Period 9"}'),
  ('9',  '{"1":"Period 1","2":"Period 2","3":"Period 3","4":"Period 4","5":"Period 5","6":"Period 6","7":"Period 7","8":"Period 8","9":"Period 9"}'),
  ('10', '{"1":"Period 1","2":"Period 2","3":"Period 3","4":"Period 4","5":"Period 5","6":"Period 6","7":"Period 7","8":"Period 8","9":"Period 9"}')
ON CONFLICT (class_level) DO NOTHING;

-- ─── 2.5 rooms ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,                   -- "Room 101", "Science Lab", etc.
  capacity     integer DEFAULT 40,
  room_type    text NOT NULL DEFAULT 'classroom', -- classroom / lab / library / hall
  is_available boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_rooms_updated_at ON rooms;
CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_timetable_settings_updated_at();

-- Seed some common rooms
INSERT INTO rooms (name, capacity, room_type) VALUES
  ('Room 101', 40, 'classroom'),
  ('Room 102', 40, 'classroom'),
  ('Room 103', 40, 'classroom'),
  ('Room 104', 40, 'classroom'),
  ('Room 105', 40, 'classroom'),
  ('Science Lab', 30, 'lab'),
  ('Computer Lab', 30, 'lab'),
  ('Library', 50, 'library'),
  ('Hall', 200, 'hall')
ON CONFLICT DO NOTHING;

-- ─── Ensure timetables has room column ─────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetables' AND column_name = 'room'
  ) THEN
    ALTER TABLE timetables ADD COLUMN room text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetables' AND column_name = 'teacher'
  ) THEN
    ALTER TABLE timetables ADD COLUMN teacher text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetables' AND column_name = 'meet_link'
  ) THEN
    ALTER TABLE timetables ADD COLUMN meet_link text;
  END IF;
END $$;

-- ─── RLS Policies ─────────────────────────────────────────────────────────

-- timetable_settings: readable by all authenticated, writable by admin/teacher
ALTER TABLE timetable_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timetable_settings' AND policyname = 'Timetable settings readable by all'
  ) THEN
    CREATE POLICY "Timetable settings readable by all"
      ON timetable_settings FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timetable_settings' AND policyname = 'Admins manage timetable settings'
  ) THEN
    CREATE POLICY "Admins manage timetable settings"
      ON timetable_settings FOR ALL
      TO authenticated
      USING (auth.jwt() ->> 'user_role' IN ('admin', 'teacher'))
      WITH CHECK (auth.jwt() ->> 'user_role' IN ('admin', 'teacher'));
  END IF;
END $$;

-- rooms: readable by all, writable by admin
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rooms' AND policyname = 'Rooms readable by all'
  ) THEN
    CREATE POLICY "Rooms readable by all"
      ON rooms FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rooms' AND policyname = 'Admins manage rooms'
  ) THEN
    CREATE POLICY "Admins manage rooms"
      ON rooms FOR ALL
      TO authenticated
      USING (auth.jwt() ->> 'user_role' = 'admin')
      WITH CHECK (auth.jwt() ->> 'user_role' = 'admin');
  END IF;
END $$;

-- timetables: readable by all, writable by admin/teacher
ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timetables' AND policyname = 'Timetable readable by all'
  ) THEN
    CREATE POLICY "Timetable readable by all"
      ON timetables FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timetables' AND policyname = 'Admins manage timetables'
  ) THEN
    CREATE POLICY "Admins manage timetables"
      ON timetables FOR ALL
      TO authenticated
      USING (auth.jwt() ->> 'user_role' IN ('admin', 'teacher'))
      WITH CHECK (auth.jwt() ->> 'user_role' IN ('admin', 'teacher'));
  END IF;
END $$;
