# Gradebook

Web-based gradebook for ESL classes (Next.js, local storage, optional cloud sync).

**Documentation:** See **`PLAN.md`** for features, data model, file import behavior (CASAS scores, **CASAS Student Gains** export for gain/level-complete columns, attendance—including per-day exports and enrollment-date defaults, unit tests), and implementation notes.

**Students leaving a class:** Removing a student (trash icon) asks **Dropped** vs **Promoted**. Dropped → **Dropped Students** list and retention; promoted → **Promoted Students** list and **excluded from retention** entirely. Details in `PLAN.md`.

**CASAS Student Gains:** On Reading/Listening tabs, **Import Student Gains** loads the CASAS “Student Gains” spreadsheet; extra columns **Gain** and **Level Comp.** (per modality) and **Student gains last updated in app** (per class) are described in `PLAN.md`.
