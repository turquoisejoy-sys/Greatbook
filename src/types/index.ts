// ============================================
// ESL Gradebook Types
// ============================================

// Class (Morning, Night, etc.)
export interface Class {
  id: string;
  name: string;
  period: string; // "Morning" | "Night" | etc.
  // CASAS Level Configuration (per class)
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
  tests: number;          // default 30
  attendance: number;     // default 20
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
  // Teacher comments
  speakingSkills: string;
  writingSkills: string;
  suggestionsForImprovement: string;
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
  casasReadingProgress: number | null;
  casasListeningAvg: number | null;
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
