-- ═══════════════════════════════════════════════════════════════════════════════
-- 009 Fix Fee Management RLS Policies + Enable Realtime
--
-- BUGS FIXED:
--   1. Students could not see class-wide vouchers — fv_student_own only allowed
--      student_id = auth.uid(), but the student dashboard shows all class vouchers.
--      The fv_teacher_read policy was a workaround, but this fix adds an explicit
--      class-based policy so students can always see their class's vouchers.
--   2. fee_structures student read policy required matching class in students table,
--      which could fail if the student record was missing. Now also allows reading
--      through the profiles table (which always exists for authenticated users).
--   3. Realtime was not enabled for fee tables, so changes weren't pushed to clients.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Fix: fee_vouchers RLS — add class-based student read policy ────────────
-- The old fv_student_own only allowed student_id = auth.uid(), which prevented
-- students from seeing their classmates' vouchers. The student dashboard needs
-- class-wide visibility. Add a policy that allows students to read all vouchers
-- in their class (determined via profiles.class or students.class).

DO $$ BEGIN
  -- Drop the old restrictive student policy
  DROP POLICY IF EXISTS fv_student_own ON fee_vouchers;

  -- Create a new policy that allows students to read all vouchers in their class
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fee_vouchers' AND policyname = 'fv_student_class_read') THEN
    CREATE POLICY fv_student_class_read ON fee_vouchers
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id)
        AND (
          -- Match class via profiles table (always exists for authenticated users)
          class = (SELECT class FROM profiles WHERE id = auth.uid())
          OR
          -- Also match via students table (for users who are in students table)
          class = (SELECT class FROM students WHERE id = auth.uid())
        )
      );
  END IF;
END $$;

-- ─── Fix: fee_structures RLS — improve student read policy ──────────────────
-- The old fs_student_read required class = (SELECT class FROM students WHERE id = auth.uid())
-- which fails if the student doesn't exist in the students table.
-- Now also checks the profiles table which always has the class info.

DO $$ BEGIN
  -- Drop the old student read policy
  DROP POLICY IF EXISTS fs_student_read ON fee_structures;

  -- Create improved student read policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fee_structures' AND policyname = 'fs_student_read') THEN
    CREATE POLICY fs_student_read ON fee_structures
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id)
        AND (
          class = (SELECT class FROM profiles WHERE id = auth.uid())
          OR
          class = (SELECT class FROM students WHERE id = auth.uid())
        )
      );
  END IF;
END $$;

-- ─── Fix: fee_payments RLS — allow students to read own payments ────────────
-- The old fp_student_own used student_id = auth.uid(). This is correct but
-- let's make sure it exists and is not overly restrictive.

-- (fp_student_own is already correct — no change needed)

-- ─── Enable Realtime for fee tables ─────────────────────────────────────────
-- Without this, the useFeeVouchersRealtime() subscription won't fire events,
-- and changes made by admin won't be reflected in student dashboard until
-- the next refetchInterval (30-60 seconds).

ALTER PUBLICATION supabase_realtime ADD TABLE fee_structures;
ALTER PUBLICATION supabase_realtime ADD TABLE fee_vouchers;
ALTER PUBLICATION supabase_realtime ADD TABLE fee_payments;
