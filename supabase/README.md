# Supabase schema (cloud sync)

When the app adds new fields, your **remote** database must have matching columns or sync returns **400** / **404** / **PGRST204**.

**Merging this SQL into Git does nothing to your database.** You still have to run the migration in the Supabase project that matches `NEXT_PUBLIC_SUPABASE_URL` in your deployed env (localhost `.env.local` is a different place than Vercel env vars — use the **same** dashboard project for each).

## Apply migrations

1. Supabase Dashboard → **the correct project** → **SQL Editor** → New query.
2. Paste the **entire** file `migrations/20250321120000_gradebook_sync_columns_and_tables.sql` → **Run**.
3. Check the **Results** panel for errors (red). If anything failed, fix that before refreshing the app. A failed `CREATE TABLE` often means nothing after it ran (e.g. missing `public.students` or `students.id` type mismatch).

The migration ends with `NOTIFY pgrst, 'reload schema';` so PostgREST picks up new columns/tables. If you still see **PGRST204** after a successful run, wait a minute, hard-refresh the app, or run that `NOTIFY` line once more in SQL Editor.

## Verify

Run `verify_schema.sql` in SQL Editor. You want `classes_has_casas_gains_imported_at`, `student_notes_exists`, and `isst_records_exists` to be `true`, and all six `students` columns listed.

If a statement fails (e.g. “column already exists”), remove that line and run again.

## `classes` / `students` RLS

If sync still fails with **permission denied**, your existing tables may need **INSERT/UPDATE/SELECT** policies for the **`anon`** role on `classes` and `students` (same idea as the policies created here for `student_notes` / `isst_records`). Check **Authentication → Policies** in the dashboard.
