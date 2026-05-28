-- Student first / last name columns (for attendance import + correct sorting)
-- Run in Supabase: SQL Editor → New query → paste → Run

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
