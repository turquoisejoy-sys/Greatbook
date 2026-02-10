// ============================================
// ESL Gradebook Types
// ============================================

// CACE Levels with CASAS score ranges
export type CACELevel = 0 | 1 | 2 | 3 | 4 | 5;

export const CACE_LEVELS: Record<CACELevel, {
  name: string;
  readingRange: [number, number];
  listeningRange: [number, number];
}> = {
  0: { name: '0 - Literacy', readingRange: [0, 183], listeningRange: [0, 181] },
  1: { name: '1 - Beginning Low', readingRange: [184, 196], listeningRange: [182, 191] },
  2: { name: '2 - Beginning High', readingRange: [197, 206], listeningRange: [192, 201] },
  3: { name: '3 - Intermediate Low', readingRange: [207, 216], listeningRange: [202, 211] },
  4: { name: '4 - Intermediate High', readingRange: [217, 227], listeningRange: [212, 221] },
  5: { name: '5 - Advanced', readingRange: [228, 238], listeningRange: [222, 231] },
};

// Class (Morning, Evening, etc.)
export interface Class {
  id: string;
  name: string;
  academicYear: string; // e.g., "2025-2026"
  schedule: string; // "Morning" | "Evening"
  level: CACELevel; // CACE Level (0-5)
  // CASAS Level Configuration (auto-set based on level)
  casasReadingLevelStart: number;  // e.g., 207 for Level 3
  casasReadingTarget: number;       // e.g., 217 for Level 4
  casasListeningLevelStart: number; // e.g., 202 for Level 3
  casasListeningTarget: number;     // e.g., 212 for Level 4
  // Ranking Weights (percentages, should sum to 100)
  rankingWeights: RankingWeights;
  // Color Thresholds
  colorThresholds: ColorThresholds;
  createdAt: string;
  updatedAt: string;
}

export interface RankingWeights {
  casasReading: number;   // default 25
  casasListening: number; // default 25
  tests: number;          // default 25
  attendance: number;     // default 25
}

export interface ColorThresholds {
  good: number;    // default 80 (80%+)
  warning: number; // default 60 (60-79%)
  // below warning = poor (red)
}

// Student
export interface Student {
  id: string;
  name: string;
  classId: string;
  enrollmentDate: string; // ISO date string
  notes: string;          // Personal notes (not for report cards)
  isDropped: boolean;
  droppedDate: string | null;
  createdAt: string;
  updatedAt: string;
}

// CASAS Test (Reading or Listening)
export interface CASASTest {
  id: string;
  studentId: string;
  type: 'reading' | 'listening';
  date: string;        // ISO date string
  formNumber: string;  // e.g., "627L", "629R"
  score: number | null; // null if invalid (*)
  createdAt: string;
}

// Unit Test
export interface UnitTest {
  id: string;
  studentId: string;
  testName: string;    // e.g., "Unit 1", "Unit 2", "EL Civics"
  date: string;        // ISO date string
  score: number;       // 0-100
  createdAt: string;
}

// Monthly Attendance
export interface Attendance {
  id: string;
  studentId: string;
  month: string;       // e.g., "2025-08" (YYYY-MM format)
  percentage: number;  // 0-100
  isVacation: boolean; // If true, excluded from average
  createdAt: string;
}

// Report Card
export interface ReportCard {
  id: string;
  studentId: string;
  periodName: string;  // e.g., "Fall 2025", "Fall 2025 #2"
  createdAt: string;
  updatedAt: string;
  // Snapshot of data at time of creation
  casasReadingAvg: number | null;
  casasReadingProgress: number | null;
  casasListeningAvg: number | null;
  casasListeningProgress: number | null;
  testAverage: number | null;
  attendanceAverage: number | null;
  rank: number | null;        // null if "Incomplete"
  totalStudents: number;
  // Teacher comments (new single field)
  teacherComments?: string;
  // Legacy fields (kept for backward compatibility with old saved report cards)
  speakingSkills?: string;
  writingSkills?: string;
  suggestionsForImprovement?: string;
}

// Archived Year
export interface ArchivedYear {
  id: string;
  yearName: string;    // e.g., "2024-2025"
  archivedAt: string;
  data: {
    classes: Class[];
    students: Student[];
    casasTests: CASASTest[];
    unitTests: UnitTest[];
    attendance: Attendance[];
    reportCards: ReportCard[];
  };
}

// ============================================
// Computed/Display Types
// ============================================

export interface StudentWithStats extends Student {
  casasReadingAvg: number | null;
  casasReadingLast: number | null;  // Most recent score
  casasReadingHighest: number | null;  // Highest score (used for progress)
  casasReadingProgress: number | null;
  casasListeningAvg: number | null;
  casasListeningLast: number | null;  // Most recent score
  casasListeningHighest: number | null;  // Highest score (used for progress)
  casasListeningProgress: number | null;
  testAverage: number | null;
  attendanceAverage: number | null;
  overallScore: number | null;
  rank: number | null;
  isComplete: boolean; // Has all required data for ranking
}

export type SortDirection = 'asc' | 'desc';
export type SortField = 'name' | 'rank' | 'casasReading' | 'casasListening' | 'tests' | 'attendance';

// ============================================
// Retention Metrics Types
// ============================================

export interface RetentionResult {
  rate: number | null;      // null if not enough data
  retained: number;         // numerator
  eligible: number;         // denominator
}

export interface RetentionMetrics {
  thirtyDay: RetentionResult;
  midyear: RetentionResult;
  endYear: RetentionResult;
}

export interface ClassMetrics {
  studentCount: number;
  averageAttendance: number | null;
  retention: RetentionMetrics;
}

// ============================================
// Student Notes Types
// ============================================

export interface StudentNote {
  id: string;
  studentId: string;
  content: string;
  date: string;  // YYYY-MM-DD format
  createdAt: string;
}

// ============================================
// ISST (Tutoring) Types
// ============================================

export interface ISSTRecord {
  id: string;
  studentId: string;
  month: string;  // Format: YYYY-MM
  dates: string[];  // Array of dates in YYYY-MM-DD format
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Import Types
// ============================================

export interface CASASImportRow {
  studentName: string;
  date: string;
  formNumber: string;
  score: number | null;
}

export interface AttendanceImportRow {
  studentName: string;
  totalHours: number;
  scheduledHours: number;
}

export interface UnitTestImportRow {
  studentName: string;
  score: number;
}
