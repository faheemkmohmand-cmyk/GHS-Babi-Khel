-- ═══════════════════════════════════════════════════════════════════════════════
-- 012 Fix Timetable Save — RLS policy uses wrong auth pattern
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- SYMPTOM (user-facing):
--   Admin clicks "Save" on the Timetables admin tab → toast says "Save failed".
--
-- ROOT CAUSE:
--   Migration 006_timetable_enhancements.sql created three RLS policies using
--   the auth pattern `auth.jwt() ->> 'user_role' IN ('admin','teacher')`.
--   But no migration/trigger in this repo ever sets `user_role` as a JWT
--   claim. So the expression evaluates to `NULL IN ('admin','teacher')` →
--   `false` for every authenticated user, and every INSERT/UPDATE/DELETE
--   on `timetables`, `timetable_settings`, and `rooms` fails with:
--      "new row violates row-level security policy"
--   The Admin UI's old `toast.error("Save failed")` swallowed that message.
--
-- FIX:
--   Replace the broken `auth.jwt() ->> 'user_role'` pattern with the working
--   `profiles.role` pattern — the same one used by migration 008_fee_management.sql
--   for the fee tables (which save correctly). This matches `auth.uid()` against
--   `profiles.id` and checks `profiles.role IN ('admin','teacher')`.
--
--   We DROP the old policies and CREATE new ones with the same names so the
--   semantic intent is preserved (admin+teacher can write timetables/settings;
--   admin-only can write rooms; everyone can read).
--
--   This migration is idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. timetables ──────────────────────────────────────────────────────────
-- Drop the broken policies (if they exist) and recreate with profiles-based check.

DROP POLICY IF EXISTS "Admins manage timetables" ON timetables;
DROP POLICY IF EXISTS "Timetable readable by all" ON timetables;

-- Readable by everyone (including anon) — same as before
CREATE POLICY "Timetable readable by all"
  ON timetables FOR SELECT
  USING (true);

-- Admins and teachers can insert/update/delete — using the WORKING pattern
-- from migration 008_fee_management.sql (profiles.role-based, not JWT-claim).
CREATE POLICY "Admins manage timetables"
  ON timetables FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'teacher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'teacher')
    )
  );

-- ─── 2. timetable_settings ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins manage timetable settings" ON timetable_settings;
DROP POLICY IF EXISTS "Timetable settings readable by all" ON timetable_settings;

CREATE POLICY "Timetable settings readable by all"
  ON timetable_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins manage timetable settings"
  ON timetable_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'teacher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'teacher')
    )
  );

-- ─── 3. rooms ───────────────────────────────────────────────────────────────
-- Admin-only writes (teachers cannot add/edit rooms — matches the original intent).

DROP POLICY IF EXISTS "Admins manage rooms" ON rooms;
DROP POLICY IF EXISTS "Rooms readable by all" ON rooms;

CREATE POLICY "Rooms readable by all"
  ON rooms FOR SELECT
  USING (true);

CREATE POLICY "Admins manage rooms"
  ON rooms FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

-- ─── 4. Ensure timetables has teacher_name column ───────────────────────────
-- The useTimetable.ts hook selects `teacher_name` but no migration in this
-- repo ever adds it. If the column is missing, the SELECT on load throws
-- "column \"teacher_name\" does not exist" — which would also manifest as
-- the timetable grid never loading. Add it defensively if absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetables' AND column_name = 'teacher_name'
  ) THEN
    ALTER TABLE timetables ADD COLUMN teacher_name text;
  END IF;
END $$;

-- Backfill teacher_name from teacher for any existing rows where teacher_name
-- is NULL but teacher is set, so the load query returns consistent data.
UPDATE timetables
SET teacher_name = teacher
WHERE teacher_name IS NULL
  AND teacher IS NOT NULL
  AND teacher <> '';
