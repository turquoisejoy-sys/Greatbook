-- Gradebook: columns the app expects for cloud sync (fixes 400 on classes upsert, etc.)
-- Run in Supabase: SQL Editor → New query → paste → Run
-- Safe to re-run: uses IF NOT EXISTS / IF NOT EXISTS patterns where supported

-- ---------------------------------------------------------------------------
-- 1) classes — Student Gains import timestamp (snake_case: casas_gains_imported_at)
-- ---------------------------------------------------------------------------
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS casas_gains_imported_at text;

-- ---------------------------------------------------------------------------
-- 2) students — promoted + CASAS gains from Student Gains import
-- ---------------------------------------------------------------------------
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_date text,
  ADD COLUMN IF NOT EXISTS casas_reading_gain integer,
  ADD COLUMN IF NOT EXISTS casas_listening_gain integer,
  ADD COLUMN IF NOT EXISTS casas_reading_level_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS casas_listening_level_complete boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 3) Optional: tables that otherwise return 404 on sync (safe if already present)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_notes (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  date text NOT NULL,
  created_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.isst_records (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  month text NOT NULL,
  dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

-- ---------------------------------------------------------------------------
-- 4) RLS — Supabase often enables RLS; without policies, sync fails silently or with 401/403.
--    These policies allow the anon key (browser app) full access, same as typical personal-gradebook setups.
--    Tighten later if you add auth.
-- ---------------------------------------------------------------------------
ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.isst_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gradebook_student_notes_anon_all" ON public.student_notes;
CREATE POLICY "gradebook_student_notes_anon_all"
  ON public.student_notes
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "gradebook_isst_records_anon_all" ON public.isst_records;
CREATE POLICY "gradebook_isst_records_anon_all"
  ON public.isst_records
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
