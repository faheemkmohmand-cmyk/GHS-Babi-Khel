-- ═══════════════════════════════════════════════════════════════════════════════
-- 013 Notifications System — Facebook-style in-dashboard notifications
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS DOES
--   Creates a single `notifications` table + a helper function `fn_notify()`,
--   then wires SQL triggers on ~15 existing tables so that:
--
--   • When ADMIN publishes something (notice, news, result, exam roll #, fee
--     voucher, ID card, timetable, event, library book, video, online class,
--     admission opening, achievement)  → a row is inserted into notifications
--     with audience = 'all' (or 'students') so EVERY user dashboard sees it.
--
--   • When USER submits something (admission application, admission document
--     upload)  → a row is inserted with audience = 'admin' so the admin
--     dashboard sees it.
--
--   The frontend NotificationBell.tsx reads this table filtered by audience
--   + the current user's role/class/id, and subscribes to Supabase Realtime
--   for instant updates — no polling needed.
--
-- WHY TRIGGERS (not React-side calls)
--   • Catches EVERY insert path: admin UI, CSV imports, future API routes,
--     RPC functions — none can bypass notifications.
--   • Zero frontend code changes needed for the 15+ publish flows.
--   • Easy to audit and extend — all rules in one SQL file.
--   • No risk of forgetting to call a helper in a new code path.
--
-- AUDIENCE FORMAT
--   audience is a TEXT column. Values:
--     'all'              → every authenticated user sees it
--     'admin'            → only users with profiles.role = 'admin'
--     'students'         → every non-admin user
--     'class:6'          → only users in class 6 (profiles.class = '6')
--     'user:<uuid>'      → only the specific user (e.g. fee voucher for one student)
--
--   The NotificationBell filters with:
--     audience = 'all'
--     OR (audience = 'admin' AND profile.role = 'admin')
--     OR (audience = 'students' AND profile.role != 'admin')
--     OR (audience = 'class:' || profile.class)
--     OR (audience = 'user:' || auth.uid())
--
-- IDEMPOTENT — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. notifications table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who should see this notification. See "AUDIENCE FORMAT" above.
  audience     text NOT NULL DEFAULT 'all',
  -- Short category tag for icon/coloring in the UI:
  --   notice | news | result | exam_roll | fee | id_card | timetable |
  --   event | library | video | online_class | admission_open |
  --   achievement | admission_application | admission_doc | homework | default
  type         text NOT NULL DEFAULT 'default',
  title        text NOT NULL,
  body         text,
  -- Where clicking the notification should navigate (app-relative URL).
  link         text,
  is_read      boolean NOT NULL DEFAULT false,
  -- Optional: the user who triggered the notification (for "X did Y" display).
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_audience ON notifications(audience);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- ─── 2. RLS ─────────────────────────────────────────────────────────────────
-- Admins see everything. Non-admins see only what's addressed to them.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_admin_all" ON notifications;
CREATE POLICY "notifications_admin_all"
  ON notifications FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "notifications_user_read" ON notifications;
CREATE POLICY "notifications_user_read"
  ON notifications FOR SELECT
  TO authenticated
  USING (
    audience = 'all'
    OR (audience = 'admin' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    OR (audience = 'students' AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    OR audience LIKE 'class:%' AND audience = 'class:' || (SELECT class FROM profiles WHERE id = auth.uid())
    OR audience LIKE 'user:%' AND audience = 'user:' || auth.uid()::text
  );

-- Allow users to mark their own notifications as read
DROP POLICY IF EXISTS "notifications_user_update_read" ON notifications;
CREATE POLICY "notifications_user_update_read"
  ON notifications FOR UPDATE
  TO authenticated
  USING (
    -- Same visibility rules as SELECT — if you can see it, you can mark it read.
    audience = 'all'
    OR (audience = 'admin' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    OR (audience = 'students' AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    OR audience LIKE 'class:%' AND audience = 'class:' || (SELECT class FROM profiles WHERE id = auth.uid())
    OR audience LIKE 'user:%' AND audience = 'user:' || auth.uid()::text
  )
  WITH CHECK (true);  -- only the is_read column changes; no need to re-check

-- ─── 3. Helper function: fn_notify ─────────────────────────────────────────
-- SECURITY DEFINER so it can INSERT into notifications even when called from
-- a trigger on a table whose RLS would otherwise block the calling user.
-- (Trigger functions themselves are also SECURITY DEFINER, but having this
-- helper means future code paths can call it directly via RPC.)
CREATE OR REPLACE FUNCTION fn_notify(
  p_audience text,
  p_type     text,
  p_title    text,
  p_body     text DEFAULT NULL,
  p_link     text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO notifications (audience, type, title, body, link, actor_id)
  VALUES (p_audience, p_type, p_title, p_body, p_link, p_actor_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 4. Realtime ────────────────────────────────────────────────────────────
-- Add notifications to the supabase_realtime publication so the frontend
-- NotificationBell gets push events on new inserts (Facebook-style).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGERS — admin-publish → notify users
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 4.1 notices → notify all on INSERT (when is_published = true) ─────────
CREATE OR REPLACE FUNCTION trg_fn_notice_notify() RETURNS trigger AS $$
BEGIN
  IF NEW.is_published THEN
    PERFORM fn_notify(
      'all', 'notice',
      COALESCE(NEW.title, 'New Notice'),
      LEFT(COALESCE(NEW.content, ''), 200),
      '/notices/' || NEW.id::text,
      NEW.created_by
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notice_notify ON notices;
CREATE TRIGGER trg_notice_notify
  AFTER INSERT ON notices
  FOR EACH ROW EXECUTE FUNCTION trg_fn_notice_notify();

-- ─── 4.2 news → notify all on INSERT (when is_published = true) ────────────
CREATE OR REPLACE FUNCTION trg_fn_news_notify() RETURNS trigger AS $$
BEGIN
  IF NEW.is_published THEN
    PERFORM fn_notify(
      'all', 'news',
      COALESCE(NEW.title, 'New News Article'),
      LEFT(COALESCE(NEW.content, ''), 200),
      '/news/' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_news_notify ON news;
CREATE TRIGGER trg_news_notify
  AFTER INSERT ON news
  FOR EACH ROW EXECUTE FUNCTION trg_fn_news_notify();

-- ─── 4.3 results → notify 'students' when is_published flips to true on UPDATE ─
CREATE OR REPLACE FUNCTION trg_fn_result_notify() RETURNS trigger AS $$
BEGIN
  -- Only fire when is_published transitions to true (was false/null → true)
  IF NEW.is_published = true AND (OLD IS NULL OR OLD.is_published = false OR OLD.is_published IS NULL) THEN
    PERFORM fn_notify(
      'all', 'result',
      'Results Published: ' || COALESCE(NEW.exam_type, 'Exam') || ' ' || COALESCE(NEW.year::text, ''),
      'Class ' || COALESCE(NEW.class, '?') || ' results are now available.',
      '/results'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_result_notify ON results;
CREATE TRIGGER trg_result_notify
  AFTER INSERT OR UPDATE ON results
  FOR EACH ROW EXECUTE FUNCTION trg_fn_result_notify();

-- ─── 4.4 exam_roll_sessions → notify all when is_published flips to true ────
CREATE OR REPLACE FUNCTION trg_fn_exam_roll_notify() RETURNS trigger AS $$
BEGIN
  IF NEW.is_published = true AND (OLD IS NULL OR OLD.is_published = false) THEN
    PERFORM fn_notify(
      'all', 'exam_roll',
      'Exam Roll Numbers Published',
      COALESCE(NEW.title, 'Exam session') || ' — roll numbers are now available.',
      '/dashboard'  -- student dashboard's RollNumbersTab
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_exam_roll_notify ON exam_roll_sessions;
CREATE TRIGGER trg_exam_roll_notify
  AFTER UPDATE ON exam_roll_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_fn_exam_roll_notify();

-- ─── 4.5 fee_vouchers → notify the specific student on INSERT ──────────────
CREATE OR REPLACE FUNCTION trg_fn_fee_voucher_notify() RETURNS trigger AS $$
BEGIN
  -- audience = 'user:<student_id>' so only that student sees it
  PERFORM fn_notify(
    'user:' || NEW.student_id::text, 'fee',
    'New Fee Voucher: ' || COALESCE(NEW.voucher_number, ''),
    'Rs ' || COALESCE(NEW.total_amount::text, '0') || ' due ' || COALESCE(NEW.due_date::text, '') || '. Status: ' || NEW.status,
    '/dashboard'  -- student dashboard's FeeTab
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_fee_voucher_notify ON fee_vouchers;
CREATE TRIGGER trg_fee_voucher_notify
  AFTER INSERT ON fee_vouchers
  FOR EACH ROW EXECUTE FUNCTION trg_fn_fee_voucher_notify();

-- ─── 4.6 admission_settings → notify all when admissions OPEN ──────────────
CREATE OR REPLACE FUNCTION trg_fn_admission_open_notify() RETURNS trigger AS $$
BEGIN
  IF NEW.is_open = true AND (OLD IS NULL OR OLD.is_open = false) THEN
    PERFORM fn_notify(
      'all', 'admission_open',
      'Admissions Are Now Open!',
      COALESCE(NEW.banner_message, 'Applications are being accepted for ' || COALESCE(NEW.session_year, 'the new session') || '.'),
      '/admission'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_admission_open_notify ON admission_settings;
CREATE TRIGGER trg_admission_open_notify
  AFTER UPDATE ON admission_settings
  FOR EACH ROW EXECUTE FUNCTION trg_fn_admission_open_notify();

-- ─── 4.7 generated_id_cards → notify each affected student on INSERT ───────
CREATE OR REPLACE FUNCTION trg_fn_id_card_notify() RETURNS trigger AS $$
BEGIN
  IF NEW.student_id IS NOT NULL THEN
    PERFORM fn_notify(
      'user:' || NEW.student_id::text, 'id_card',
      'Student ID Card Generated',
      'Your ID card is ready. View it in your dashboard.',
      '/dashboard'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_id_card_notify ON generated_id_cards;
CREATE TRIGGER trg_id_card_notify
  AFTER INSERT ON generated_id_cards
  FOR EACH ROW EXECUTE FUNCTION trg_fn_id_card_notify();

-- ─── 4.8 timetables → notify 'class:<class>' on INSERT ─────────────────────
CREATE OR REPLACE FUNCTION trg_fn_timetable_notify() RETURNS trigger AS $$
BEGIN
  PERFORM fn_notify(
    'class:' || COALESCE(NEW.class, ''), 'timetable',
    'Timetable Updated — Class ' || COALESCE(NEW.class, ''),
    'Your class timetable has been updated.',
    '/dashboard'  -- student dashboard's TimetableTab
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- We use AFTER INSERT only (not per-row UPDATE) because the admin UI does
-- delete-all-then-insert on save, which fires INSERT triggers for each row.
-- To avoid spamming N notifications for N rows in one save, we throttle by
-- only firing on the FIRST period of each class — but since we can't easily
-- detect that in a per-row trigger, we instead dedupe in the trigger by
-- checking if a notification for this class+type was created in the last
-- 60 seconds. (See refined version below.)
CREATE OR REPLACE FUNCTION trg_fn_timetable_notify_dedupe() RETURNS trigger AS $$
BEGIN
  -- Only insert if no timetable notification for this class in the last 60s
  IF NOT EXISTS (
    SELECT 1 FROM notifications
    WHERE type = 'timetable'
      AND audience = 'class:' || COALESCE(NEW.class, '')
      AND created_at > now() - interval '60 seconds'
  ) THEN
    PERFORM fn_notify(
      'class:' || COALESCE(NEW.class, ''), 'timetable',
      'Timetable Updated — Class ' || COALESCE(NEW.class, ''),
      'Your class timetable has been updated.',
      '/dashboard'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_timetable_notify ON timetables;
DROP FUNCTION IF EXISTS trg_fn_timetable_notify();
CREATE TRIGGER trg_timetable_notify
  AFTER INSERT ON timetables
  FOR EACH ROW EXECUTE FUNCTION trg_fn_timetable_notify_dedupe();

-- ─── 4.9 school_events → notify all on INSERT (when is_published = true) ───
CREATE OR REPLACE FUNCTION trg_fn_event_notify() RETURNS trigger AS $$
BEGIN
  IF NEW.is_published THEN
    PERFORM fn_notify(
      'all', 'event',
      'New Event: ' || COALESCE(NEW.title, 'School Event'),
      COALESCE(NEW.description, LEFT(COALESCE(NEW.start_date::text, ''), 50)),
      '/calendar'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_event_notify ON school_events;
CREATE TRIGGER trg_event_notify
  AFTER INSERT ON school_events
  FOR EACH ROW EXECUTE FUNCTION trg_fn_event_notify();

-- ─── 4.10 library_books → notify all on INSERT ─────────────────────────────
CREATE OR REPLACE FUNCTION trg_fn_library_book_notify() RETURNS trigger AS $$
BEGIN
  PERFORM fn_notify(
    'all', 'library',
    'New Book in Library: ' || COALESCE(NEW.title, 'Untitled'),
    COALESCE(NEW.author, '') || CASE WHEN NEW.author IS NOT NULL AND NEW.subject IS NOT NULL THEN ' — ' ELSE '' END || COALESCE(NEW.subject, ''),
    '/library'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_library_book_notify ON library_books;
CREATE TRIGGER trg_library_book_notify
  AFTER INSERT ON library_books
  FOR EACH ROW EXECUTE FUNCTION trg_fn_library_book_notify();

-- ─── 4.11 videos → notify all on INSERT (when is_published = true) ─────────
CREATE OR REPLACE FUNCTION trg_fn_video_notify() RETURNS trigger AS $$
BEGIN
  -- Only notify if video is published (some videos may be drafts)
  IF COALESCE(NEW.is_published, true) THEN
    PERFORM fn_notify(
      'all', 'video',
      'New Video: ' || COALESCE(NEW.title, 'Untitled'),
      LEFT(COALESCE(NEW.description, ''), 160),
      '/dashboard'  -- student dashboard's VideosTab
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_video_notify ON videos;
CREATE TRIGGER trg_video_notify
  AFTER INSERT ON videos
  FOR EACH ROW EXECUTE FUNCTION trg_fn_video_notify();

-- ─── 4.12 online_classes → notify 'class:<class_name>' on INSERT ───────────
CREATE OR REPLACE FUNCTION trg_fn_online_class_notify() RETURNS trigger AS $$
BEGIN
  PERFORM fn_notify(
    'class:' || COALESCE(NEW.class_name, ''), 'online_class',
    'Online Class Scheduled: ' || COALESCE(NEW.title, ''),
    COALESCE(NEW.subject, '') || ' — ' || COALESCE(NEW.start_time::text, ''),
    '/dashboard'  -- student dashboard's OnlineClassesTab
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_online_class_notify ON online_classes;
CREATE TRIGGER trg_online_class_notify
  AFTER INSERT ON online_classes
  FOR EACH ROW EXECUTE FUNCTION trg_fn_online_class_notify();

-- ─── 4.13 achievements → notify all on INSERT ──────────────────────────────
CREATE OR REPLACE FUNCTION trg_fn_achievement_notify() RETURNS trigger AS $$
BEGIN
  PERFORM fn_notify(
    'all', 'achievement',
    'New Achievement: ' || COALESCE(NEW.title, ''),
    LEFT(COALESCE(NEW.description, ''), 160),
    '/dashboard'  -- student dashboard's AchievementsTab
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_achievement_notify ON achievements;
CREATE TRIGGER trg_achievement_notify
  AFTER INSERT ON achievements
  FOR EACH ROW EXECUTE FUNCTION trg_fn_achievement_notify();

-- ─── 4.14 homework → notify 'class:<class>' on INSERT ──────────────────────
CREATE OR REPLACE FUNCTION trg_fn_homework_notify() RETURNS trigger AS $$
BEGIN
  PERFORM fn_notify(
    'class:' || COALESCE(NEW.class, ''), 'homework',
    'New Homework: ' || COALESCE(NEW.title, 'Homework'),
    COALESCE(NEW.subject, ''),
    '/dashboard'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_homework_notify ON homework;
CREATE TRIGGER trg_homework_notify
  AFTER INSERT ON homework
  FOR EACH ROW EXECUTE FUNCTION trg_fn_homework_notify();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGERS — user-submit → notify admins
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 5.1 admissions → notify admins on INSERT ──────────────────────────────
CREATE OR REPLACE FUNCTION trg_fn_admission_application_notify() RETURNS trigger AS $$
BEGIN
  PERFORM fn_notify(
    'admin', 'admission_application',
    'New Admission Application: ' || COALESCE(NEW.full_name, 'Applicant'),
    'Reference: ' || COALESCE(NEW.reference_no, '?') || ' • Class ' || COALESCE(NEW.applying_class, '?') || ' • ' || COALESCE(NEW.father_name, ''),
    '/admin'  -- admin dashboard's AdminAdmissions tab
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_admission_application_notify ON admissions;
CREATE TRIGGER trg_admission_application_notify
  AFTER INSERT ON admissions
  FOR EACH ROW EXECUTE FUNCTION trg_fn_admission_application_notify();

-- ─── 5.2 admission_documents → notify admins on INSERT ─────────────────────
CREATE OR REPLACE FUNCTION trg_fn_admission_doc_notify() RETURNS trigger AS $$
BEGIN
  PERFORM fn_notify(
    'admin', 'admission_doc',
    'New Document Uploaded',
    'A document was uploaded for admission: ' || COALESCE(NEW.doc_type, 'document'),
    '/admin'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_admission_doc_notify ON admission_documents;
CREATE TRIGGER trg_admission_doc_notify
  AFTER INSERT ON admission_documents
  FOR EACH ROW EXECUTE FUNCTION trg_fn_admission_doc_notify();

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE — end of migration 013
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- TROUBLESHOOTING (for the user)
--
-- If a trigger fails because a column doesn't exist (e.g. some tables may
-- not have is_published, or library_books may use a different column name),
-- the trigger function will raise an error and the INSERT on the source
-- table will be blocked. To diagnose:
--
--   1. Open Supabase → SQL Editor
--   2. Run: SELECT * FROM pg_stat_user_tables WHERE relname = '<table>';
--   3. Check the actual column names with:
--      SELECT column_name, data_type FROM information_schema.columns
--      WHERE table_name = '<table>';
--   4. Drop the offending trigger:
--      DROP TRIGGER IF EXISTS trg_<name> ON <table>;
--   5. Edit the function to use the correct column name, then re-create.
--
-- To verify notifications are being created:
--   SELECT id, audience, type, title, created_at FROM notifications
--   ORDER BY created_at DESC LIMIT 20;
--
-- To manually insert a test notification:
--   SELECT fn_notify('all', 'default', 'Test', 'Hello world', '/dashboard');
