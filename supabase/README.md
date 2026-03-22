# Supabase schema (cloud sync)

When the app adds new fields, your **remote** database must have matching columns or sync returns **400** / errors on `classes` or `students`.

## Apply migrations

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. Open `migrations/20250321120000_gradebook_sync_columns_and_tables.sql` from this repo, copy the full file, paste, **Run**.

If a statement fails (e.g. “column already exists”), remove that line and run again.

## `classes` / `students` RLS

If sync still fails with **permission denied**, your existing tables may need **INSERT/UPDATE/SELECT** policies for the **`anon`** role on `classes` and `students` (same idea as the policies created here for `student_notes` / `isst_records`). Check **Authentication → Policies** in the dashboard.
