-- Run in Supabase SQL Editor after migrations. Read the results — all should be truthy / non-empty where noted.

-- 1) Column that fixes Classes upload (PGRST204 on casas_gains_imported_at)
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'classes'
    AND column_name = 'casas_gains_imported_at'
) AS classes_has_casas_gains_imported_at;

-- 2) Optional tables (404 on REST if missing)
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'student_notes'
) AS student_notes_exists;

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'isst_records'
) AS isst_records_exists;

-- 3) students columns (sync may 400 if missing)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'students'
  AND column_name IN (
    'is_promoted',
    'promoted_date',
    'casas_reading_gain',
    'casas_listening_gain',
    'casas_reading_level_complete',
    'casas_listening_level_complete'
)
ORDER BY column_name;
