-- Speaking / writing tests and scores for cross-device cloud sync
-- Run in Supabase SQL Editor for the project matching NEXT_PUBLIC_SUPABASE_URL

CREATE TABLE IF NOT EXISTS public.speaking_tests (
  id text PRIMARY KEY,
  class_id text NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  exit_assessment_type text NOT NULL DEFAULT 'none',
  date text NOT NULL,
  total_points double precision NOT NULL,
  passing_score double precision NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.speaking_test_results (
  id text PRIMARY KEY,
  test_id text NOT NULL REFERENCES public.speaking_tests (id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  score double precision,
  comment text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.writing_tests (
  id text PRIMARY KEY,
  class_id text NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  exit_assessment_type text NOT NULL DEFAULT 'none',
  date text NOT NULL,
  total_points double precision NOT NULL,
  passing_score double precision NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.writing_test_results (
  id text PRIMARY KEY,
  test_id text NOT NULL REFERENCES public.writing_tests (id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  score double precision,
  comment text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

ALTER TABLE public.speaking_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speaking_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writing_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writing_test_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gradebook_speaking_tests_anon_all" ON public.speaking_tests;
CREATE POLICY "gradebook_speaking_tests_anon_all"
  ON public.speaking_tests FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gradebook_speaking_test_results_anon_all" ON public.speaking_test_results;
CREATE POLICY "gradebook_speaking_test_results_anon_all"
  ON public.speaking_test_results FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gradebook_writing_tests_anon_all" ON public.writing_tests;
CREATE POLICY "gradebook_writing_tests_anon_all"
  ON public.writing_tests FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gradebook_writing_test_results_anon_all" ON public.writing_test_results;
CREATE POLICY "gradebook_writing_test_results_anon_all"
  ON public.writing_test_results FOR ALL TO anon USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
