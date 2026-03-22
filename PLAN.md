---
name: ESL Gradebook Web App
overview: Build a comprehensive web-based gradebook for ESL classes with CASAS test tracking, attendance management, student analysis/ranking, and report card generation. Uses Next.js with local storage and supports multiple class sections.
todos:
  - id: prereq-node
    content: "SETUP: Install Node.js on your computer (required to run the app)"
    status: completed
  - id: prereq-github
    content: "SETUP: Create GitHub account and repository (optional, for code backup)"
    status: completed
  - id: init-project
    content: Initialize Next.js project with TypeScript, Tailwind CSS
    status: completed
  - id: install-deps
    content: Install all required packages (jsPDF, react-to-print, xlsx parser, etc.)
    status: completed
  - id: data-layer
    content: Create TypeScript types and local storage + Supabase persistence layer
    status: in_progress
  - id: prereq-supabase
    content: "SETUP: Create free Supabase account and project (for cloud storage)"
    status: completed
  - id: file-import
    content: Build Excel/CSV file import with deterministic script parsing
    status: pending
  - id: class-management
    content: Build dashboard and class/student management pages
    status: pending
  - id: casas-tabs
    content: Implement CASAS Reading and Listening tabs with progress calculations
    status: pending
  - id: attendance
    content: Build attendance tab with vacation month exclusion feature
    status: pending
  - id: unit-tests
    content: Create unit tests tab with averages
    status: pending
  - id: analysis
    content: Build student analysis page with custom-weighted ranking
    status: pending
  - id: report-cards
    content: Create report card generator with comments, history, PDF/print export
    status: pending
  - id: settings
    content: Build settings page for thresholds, weights, and data backup
    status: pending
---

# ESL Gradebook Web Application

## Prerequisites (What You Need Before We Start)

### 1. Node.js (Required)

**What is it?** The engine that runs your web app on your computer.

**How to get it:**

- Go to https://nodejs.org
- Download the "LTS" version (the recommended one)
- Install it like any other app
- To verify: open Terminal and type `node --version` — you should see a number like `v20.x.x`

### 2. Supabase Account (For Cloud Storage)

**What is it?** A free cloud database that saves your data online so you can access it from any computer.

**How to get it:**

- Go to https://supabase.com
- Create a free account
- Create a new project (we'll do this together)
- **Cost:** FREE for our use case (generous free tier)

### 3. GitHub Account (Optional but Recommended)

**What is it?** A place to save your code online, like Google Drive for code. If your computer dies, your code is safe.

**How to get it:**

- Go to https://github.com
- Create a free account
- We'll create a "repository" (folder) for this project

### 4. Code Editor (You Already Have This!)

You're using **Cursor** right now — that's your code editor. You're all set here.

---

## Tech Stack

- **Next.js 14** with React and TypeScript
- **Tailwind CSS** for styling with custom color-coded themes
- **Local Storage** + **Supabase** for data persistence:
  - Local storage = Fast, works offline, instant saves
  - Supabase = Cloud backup, access from any computer, data syncs across devices
  - **`students` table (cloud):** must include columns aligned with the app, including **`is_promoted`** (boolean, default `false`) and **`promoted_date`** (text or date, nullable); plus CASAS gains fields **`casas_reading_gain`**, **`casas_listening_gain`** (numeric, nullable), **`casas_reading_level_complete`**, **`casas_listening_level_complete`** (boolean). Add via SQL migration if missing.
  - **`classes` table (cloud):** **`casas_gains_imported_at`** (text/date, nullable) — last successful Student Gains import date for that class.
- **xlsx / SheetJS** for parsing Excel files (deterministic, no AI)
- **react-to-print** + **jsPDF** for report card export

## Data Structure

```mermaid
erDiagram
    Class ||--o{ Student : contains
    Student ||--o{ CASASReading : has
    Student ||--o{ CASASListening : has
    Student ||--o{ UnitTest : has
    Student ||--o{ Attendance : has
    Student ||--o{ ReportCard : has
    Class {
        string id
        string name
        string period
        number casasReadingTarget
        number casasListeningTarget
        object rankingWeights
        object colorThresholds
        string casasGainsImportedAt
    }
    Student {
        string id
        string name
        string classId
        date enrollmentDate
        string notes
        boolean isDropped
        string droppedDate
        boolean isPromoted
        string promotedDate
        number casasReadingGain
        number casasListeningGain
        boolean casasReadingLevelComplete
        boolean casasListeningLevelComplete
    }
    Attendance {
        string month
        number percentage
        boolean isVacation
    }
```

## Pages/Features

### 1. Dashboard/Class Selection

- Switch between morning/night sections (and **academic year** filter for which classes appear)
- **Quick stats at a glance:**
  - 🏆 **Top 10 students** (by overall rank)
  - ⚠️ **Bottom 10 students** (by overall rank)
- **Quick link to Student Notes** — review notes before class
- Add/edit/delete classes
- **Search bar** — find any student quickly by name (searches names only, not notes)
- **Click any student name** → goes to their notes
- **Per-class cards** (for the selected year) show **KPIs** for that section:
  - **Students** — count on the **active roster** (not dropped, not promoted)
  - **Avg attendance** — class average across active students with attendance data
  - **30-Day Retention** / **YTD Retention** — see retention bullets below
  - **Promoted** — count of students marked **Promoted** who are still tied to this `classId` (inactive but listed under Promoted Students)
  - **Students w/ gain** — `R xx% · L yy%`: among **active** students, percent with an imported **CASAS reading gain** / **listening gain** (non-null from **Import Student Gains**; `0` counts as having a gain)
  - **Students w/ level comp.** — `R xx% · L yy%`: among **active** students, percent with **reading** / **listening level complete** flags from that same import
  - If there are **no** active students, the gain and level-comp. lines show **—**
- **Retention (used in 30-day / YTD on the card):** **30-day** (entry month + follow-up attendance windows), **YTD** (enrollment from Aug 1 through today vs active/drop), plus **midyear** and **end-year** where implemented in code.
  - **Promoted students:** not counted in any retention numerator or denominator.
  - **Dropped students:** included when evaluating retention; if they have attendance again after the drop month (“came back”), they count as retained where that logic applies.
- **Tools** (section at the **bottom** of the dashboard, below class cards):
  - **Partner matching** → `/tools/partner-matching`
    - Choose a class (dropdown; link from dashboard can include `?classId=` when a class is selected).
    - Uses the same **overall score / rank** as the **Analysis** tab (**complete** students only — same completeness rules as ranking).
    - **Pairing:** sort by rank (1 = strongest). Pair rank **1** with **last**, **2** with **second-to-last**, and so on (middle meets middle).
    - Table shows pair #, **higher-rank (stronger)** and **lower-rank (partner)** with rank # and overall score %.
    - If there is an **odd** number of ranked students, the **middle** student is called out as unpaired (suggestion to use a trio or rotation).

### 2. Student Management

- Add/edit students
- **One student, one class** — a student can only be in one class at a time
- **Enrollment date** — tracks when student joined the class
  - Auto-set when student is created or first imported
  - Editable if you need to adjust
  - Used for fair calculations (only counts data from enrollment forward)
- Move students between classes
  - **Data moves with them** — all scores, attendance transfer to new class
- **Remove from class (trash icon)** → choose **Dropped** or **Promoted** (not permanently deleted)
  - **Dropped** — stopped attending; listed on **Dropped Students**; counts in **retention** metrics (with “came back” rules below). Clears promoted flags.
  - **Promoted** — successful exit (e.g. next level); listed on **Promoted Students**; **excluded entirely from retention** (not in numerator or denominator). Clears dropped flags.
  - Either way, the student **immediately disappears from the active roster** (rankings, attendance grid, etc. only show active students).
- **Dropped Students page** (sidebar) → view dropped students, restore to any class
- **Promoted Students page** (sidebar) → same restore flow for promoted students
- Students auto-created when importing CASAS/Attendance files (if not already in system)
- **Click any student name** (from any page) → goes to their notes on the Notes page

### 2b. Student Notes Page

- Accessible from **Dashboard** and **Sidebar**
- **Click any student name anywhere** → jumps to their notes on this page
- Shows all students with their personal notes
- Add/edit notes per student (not for report cards, just for you):
  - "Works night shift, sometimes tired"
  - "Needs extra help with pronunciation"  
  - "Very motivated, wants to go to college"
- Useful for reviewing notes before class

### 3. CASAS Reading Tab

- Multiple test entries per student (date, form number, score)
- **Progress uses AVERAGE of all scores** (not latest or highest)
- **Progress to Level 4 calculation:**
  - Level 3 start: 207, Target: 217
  - Formula: `(Average Score - 207) ÷ (217 - 207) × 100`
  - Example: Avg 228 → (228-207)÷10×100 = **210%** (displays as 210%, but capped at 100% for ranking)
  - Shows "GOAL ACHIEVED!" when ≥100%
- **Color coding based on progress %:** Green 80%+, Yellow 60-79%, Red below 60%
- **File import**: Upload Excel/CSV file → script parses automatically
  - **Skips duplicates** — if same date + form + score exists, ignores
  - **Auto-adds unknown students** — with import date as enrollment date
- **Student Gains import** (separate button, **Import Student Gains**): CASAS “Student Gains” export (multi-row per student). Updates stored **reading** gain/level-complete (and listening fields in the same pass). See **File Import → CASAS Student Gains** below.
- **Extra columns** (after Avg / Progress): **Gain (R)** and **Level Comp. (R)** — from the last successful Student Gains import; not edited in the grid.
- **“Student gains last updated in app”** (under the page title): date when **Import Student Gains** last succeeded for **this class** (stored on the class).

### 4. CASAS Listening Tab

- Same structure and rules as Reading (including **Import Student Gains** — same file updates both modalities)
- **Progress to Level 4 calculation:**
  - Level 3 start: 202, Target: 212
  - Formula: `(Average Score - 202) ÷ (212 - 202) × 100`
- **Color coding based on progress %:** Green 80%+, Yellow 60-79%, Red below 60%
- **Extra columns:** **Gain (L)** and **Level Comp. (L)** — from Student Gains import

### 5. Unit Tests Tab

- Up to 10+ tests with dates
- **All tests scored out of 100** (entered as 0-100, displayed as percentage)
- Scores and averages
- Color coding
- **File import**: Upload Excel/CSV file with test scores → script parses automatically
- Manual entry also supported

### 6. Attendance Tab

- Monthly attendance percentages (Aug - Jun)
- **Toggle button** per student per month to mark as "Vacation/Out" 
  - When toggled ON: that month shows "OUT" and is excluded from average
  - Visual indicator so you can see at a glance who's on vacation
  - **Can only toggle if no data exists** — must delete attendance data first to mark as vacation
- Color coding (green 80%+, yellow 60-79%, red below 60%)
- Average calculation ignores vacation months
- **File import**: Upload monthly Excel file → script calculates % from hours attended ÷ possible hours for that student in the period
  - Recognizes common export columns, e.g. **Total Hrs_Reg + Bulk in Date Range** (hours in the file’s date range) and **Class Scheduled Hrs in Date Range** (fallback denominator)
  - Avoids **Total Hrs_Reg/Bulk** (lifetime total) when an in-range total column exists
  - **Mid-month enrollments:** If the sheet has **per-day hour columns** before the totals (e.g. one column per class session), possible hours for each student are derived from those days **from their first day with any hours in the grid through the last date column** (each day’s “capacity” is the max hours anyone had that day). That fixes reports where every row shows the same full-month scheduled total (e.g. 36) even for students who joined late.
  - **Auto-adds unknown students** — enrollment date defaults to **first day with hours in the file** when per-day columns exist; otherwise today (editable in the import review step)
- **Print page** — print the full attendance view

### 7. Student Analysis Tab

- All metrics combined in one view
- CASAS progress percentages
  - **IMPORTANT:** Use the class's level-based CASAS targets for "% to next level" calculation
  - Targets are auto-set when class is created based on CACE Level (0-5)
  - Formula: `(Average Score - Level Start) ÷ (Target - Level Start) × 100`
- Overall score calculation with **custom weights** (adjustable in settings)
  - Default weights: CASAS Reading 25%, CASAS Listening 25%, Tests 30%, Attendance 20%
- Student ranking (1st, 2nd, etc.)
- **Easy Top/Bottom view:**
  - 🏆 Top 10 highlighted (trophy icon)
  - ⚠️ Bottom 10 highlighted (warning icon)
  - One-click filter to show only Top 10 or Bottom 10
- **Sort by rank** (default) or any other column
- Sortable alphabetically by name (A-Z / Z-A)
- **Print page** — print the full analysis view

**Handling Missing Data & Ranking:**

- Missing scores show as `—` in tables
- **Enrollment date respected** — only counts tests/attendance from when student enrolled
- Students joining mid-year aren't penalized for missing early data
- **To be ranked, must have ALL categories:**
  - At least 1 CASAS Reading score
  - At least 1 CASAS Listening score
  - At least 1 test score
  - At least 1 month attendance
- Students without all categories show "Incomplete" instead of a rank
- **CASAS progress capped at 100% for ranking** — exceeding goal doesn't give bonus points

## Sorting (All Tables)

- **Alphabetical**: Sort students A-Z or Z-A by name
- **By Score**: Sort by any numeric column (highest to lowest or vice versa)
- **By Rank**: Sort by overall ranking
- Click column headers to toggle sort direction
- **Missing data goes to bottom** (whether ascending or descending)

## Data Editing

- **All data is editable** — CASAS scores, test scores, attendance, dates, names
- Fix mistakes anytime without restrictions
- Click on any cell/value to edit it

### 8. Report Cards Tab

- Generate report card for each student
- **Fits on one page** (8.5x11" letter size)
- **CACE branding** — logo at top, school colors, tagline at bottom

**Report Card Sections:**

1. **Header** — CACE logo, "Student Progress Report Card", period name (e.g., "Fall 2025")
2. **Student Info** — Name, class, report date, rank (with Top 10 badge if applicable)
3. **Overall Performance** — Visual progress bars for:

   - CASAS Reading progress (% to target, "GOAL ACHIEVED" if met)
   - CASAS Listening progress
   - Test Average (with status: Excellent/Good/Satisfactory/Needs Improvement)
   - Attendance Average

4. **Detailed Scores** — Two-column layout:

   - CASAS Reading tests (date, form, score)
   - CASAS Listening tests (date, form, score)
   - Class tests with scores
   - Monthly attendance breakdown

5. **Teacher Comments** — Three fields:

   - Speaking Skills
   - Writing Skills
   - Suggestions for Improvement

**Features:**

- **Save report cards** — snapshot of scores + your comments
- **Can create for "Incomplete" students** — shows data they have, rank shows "Not Ranked"
- **Multiple per period allowed** — "Fall 2025 #1", "Fall 2025 #2" saved separately
- **View past report cards** — see history per student
- **Edit saved report cards** — update comments or period name
- **Delete old report cards** — remove ones you no longer need
- **Print / Download PDF** — works for current or past report cards

### 9. Settings

- Adjust color coding thresholds per test type
- Set ranking weights (CASAS %, Tests %, Attendance %)
- **CASAS targets are per-class** — each class can have different Level start/Target settings
  - Example: Level 3 class → Reading 207-217, Listening 202-212
  - Example: Level 2 class → Reading 197-207, Listening 192-202
- Export/import all data as JSON backup
- **Archive Year** — saves all current data to an archive, then starts completely fresh
  - Archived years can be viewed (read-only) later
  - **Everything archived:** classes, students, dropped and promoted lists (inactive students go with the archive snapshot)
  - Useful for end of school year cleanup

## File Import (No AI — Deterministic Script Parsing)

**Supported formats:** Excel (.xls, .xlsx) and CSV

### CASAS Import

- Upload Excel or CSV file
- Script reads columns: Student Name, Date, Form, Score
- Automatically separates Reading (forms ending in R) from Listening (forms ending in L)
- Handles invalid scores (`*` → skipped)
- **100% deterministic** — no hallucination risk

### CASAS Student Gains import

- Used from **CASAS Reading** or **CASAS Listening** via **Import Student Gains** (Excel `.xlsx` / `.xls` / CSV).
- Expected layout: CASAS-style export with metadata rows, then a header row containing **Student Name**, **Form**, **Gain**, and **Complete** (or similar “comp. level” header). Typical columns also include **Test/Obs. Date**, **Score**, **Level**, etc.
- **Multiple rows per student** (one per test). **Form** ending in **R** → reading; **L** → listening.
- **Gain (stored per student, per modality):** from the **newest test date** backward, the first row that has a numeric **Gain** (so an empty gain on the latest row does not erase an older gain).
- **Level Comp.:** **Yes** if **any** row for that modality has **Complete** set to yes (case-insensitive).
- **Roster matching:** normalized name (lowercase, trim, collapsed spaces) against students in **this class**, including inactive (dropped/promoted) still tied to the class. Names in the file with no match are skipped (warning).
- **Does not** auto-create students (unlike score import).
- On success, sets **`casasGainsImportedAt`** on the **class** (YYYY-MM-DD) — shown as “Student gains last updated in app.” The banner may also show the file’s **Date/Time:** metadata when present.
- **100% deterministic** — no hallucination risk

### Attendance Import

- Upload monthly attendance Excel file (`.xls`, `.xlsx`, or CSV)
- You specify which month the file is for when uploading (month is not read from the file)
- **Student name columns:** Last Name + First Name, and/or combined name columns (flexible header matching)
- **Hours columns (flexible names):**
  - **Attended (numerator):** Prefers **Total Hrs_Reg + Bulk in Date Range** (or similar “in date range” totals) over generic **Total Hrs** so lifetime columns like **Total Hrs_Reg/Bulk** are not used for the monthly percentage.
  - **Possible / scheduled (denominator):** Uses **Class Scheduled Hrs in Date Range** or other “scheduled hours” style headers when no per-day grid is used.
- **Per-day grid (e.g. one column per session date):** When those columns exist before the in-range total column, the parser detects them and sets each student’s **possible hours** to the sum of per-day class capacity from **that student’s first day with any hours in the grid** through the end of the date range (capacity per day = max hours any student had that day). This corrects percentages for students who enrolled mid-month when the export repeats the same full-period scheduled total for every row.
- **Percentage:** `Attended hours ÷ Possible hours × 100` (with the above rules)
- Import may add a short notice when per-day columns are detected
- **New student review:** default enrollment date is the first session column with hours for that row (YYYY-MM-DD from the column header), when the grid is present
- **100% deterministic** — no hallucination risk

### Unit Tests Import

- Upload Excel or CSV file with test scores
- Script reads: Student Name, Test scores (out of 100)
- You specify which test (Unit 1, Unit 2, etc.) when uploading
- **100% deterministic** — no hallucination risk

**Benefits of no AI:**

- ✅ No API key needed
- ✅ No cost per import
- ✅ Works offline
- ✅ Instant processing
- ✅ Zero hallucination risk

## Design & Branding

**School:** Campbell Adult And Community Education (CACE)

**Tagline:** "A World of Opportunity"

### Color Palette (Matching CACE Logo)

| Color | Hex | Use |

|-------|-----|-----|

| Navy Blue | `#1B3A6D` | Primary (headers, sidebar, buttons) |

| Teal/Cyan | `#00B5D8` | Accent (links, highlights, active states) |

| White | `#FFFFFF` | Main background |

| Light Gray | `#F5F7FA` | Cards, table rows, secondary backgrounds |

### Score Color Coding (Adjustable Defaults)

| Level | Default Range | Color |

|-------|---------------|-------|

| Good | 80%+ | Green (`#22C55E`) |

| Warning | 60-79% | Yellow/Amber (`#F59E0B`) |

| Poor | Below 60% | Red (`#EF4444`) |

### UI Style

- Clean, professional, teacher-friendly
- Desktop-optimized (laptop/computer)
- Sidebar navigation
- Sortable tables with clear headers
- CACE logo on report cards (optional)
- Light mode (primary)

## File Structure

```
/app
  /page.tsx                 # Dashboard (includes Tools → Partner matching link)
  /tools/partner-matching/page.tsx  # Partner pairs by Analysis rank
  /classes/[id]/
    /students/page.tsx      # Student management
    /casas-reading/page.tsx
    /casas-listening/page.tsx
    /tests/page.tsx
    /attendance/page.tsx
    /analysis/page.tsx
    /report-cards/page.tsx
    /notes/page.tsx         # Student notes page
  /dropped-students/page.tsx  # Dropped students (restore to class)
  /promoted-students/page.tsx # Promoted students (restore to class)
  /settings/page.tsx
/components
  /StudentTable.tsx
  /FileImporter.tsx         # Excel/CSV file upload component
  /ReportCardGenerator.tsx
  /ColorCodedCell.tsx
/lib
  /storage.ts               # Local storage helpers
  /supabase.ts              # Supabase client
  /calculations.ts          # Rankings, averages, progress
  /parsers/
    /casas-parser.ts         # Deterministic CASAS score file parser
    /student-gains-parser.ts # CASAS Student Gains export (gain + level complete)
    /attendance-parser.ts   # Deterministic attendance file parser
    /tests-parser.ts        # Deterministic unit tests file parser
/types
  /index.ts                 # TypeScript interfaces
```

## Implementation Order

### Phase 0: Setup (One-Time)

0a. Install Node.js on your computer

0b. (Optional) Create GitHub account and repository

### Phase 1: Project Foundation

1. Initialize Next.js project with TypeScript and Tailwind CSS
2. Install all required packages
3. Create TypeScript types for all data
4. Set up local storage persistence

### Phase 2: File Import (Deterministic)

5. Build Excel/CSV file parser for CASAS data
5b. Build parser for CASAS Student Gains export (gain / level complete)
6. Build Excel file parser for Attendance data
7. Build Excel/CSV file parser for Unit Tests data
8. Test all parsers with your real files

### Phase 3: Core Features

9. Build dashboard and class/student management
10. Implement CASAS Reading tab (integrate file import)
11. Implement CASAS Listening tab (integrate file import)
12. Build attendance tab with vacation toggle (integrate file import)
13. Create unit tests tab

### Phase 4: Cloud Storage

14. Create Supabase account and connect cloud storage
15. Sync local data with Supabase

### Phase 5: Analysis & Reports

16. Create student analysis page with ranking
17. Build report card generator with comments and history

### Phase 6: Polish

18. Build settings page
19. Polish UI, color coding, and sorting
20. Final testing and bug fixes