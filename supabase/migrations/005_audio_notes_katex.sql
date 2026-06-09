/*
  # Feature 1.7: Audio Notes & Podcast Mode

  1. Add `audio_url` column to note_chapters
     - Stores the pre-recorded audio file URL (Cloudinary / Supabase Storage)
     - Admins upload audio explanations per chapter

  2. Add `audio_duration` column to note_chapters
     - Duration in seconds for display in the player UI

  3. Add `podcast_mode_enabled` column to note_subjects
     - Allows admins to enable/disable podcast mode per subject
*/

-- ─── Add audio_url to note_chapters ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'note_chapters' AND column_name = 'audio_url'
  ) THEN
    ALTER TABLE note_chapters ADD COLUMN audio_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'note_chapters' AND column_name = 'audio_duration'
  ) THEN
    ALTER TABLE note_chapters ADD COLUMN audio_duration integer DEFAULT 0;
  END IF;
END $$;

-- ─── Add podcast_mode_enabled to note_subjects ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'note_subjects' AND column_name = 'podcast_mode_enabled'
  ) THEN
    ALTER TABLE note_subjects ADD COLUMN podcast_mode_enabled boolean DEFAULT false;
  END IF;
END $$;

-- ─── RLS: audio_url is readable by all authenticated users ──────────────────
-- (Already covered by existing note_chapters RLS policies)
