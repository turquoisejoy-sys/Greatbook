import {
  Class,
  Student,
  CASASTest,
  UnitTest,
  Attendance,
  StudentWithStats,
  RankingWeights,
} from '@/types';
import {
  getCASASTestsByStudent,
  getUnitTestsByStudent,
  getAttendanceByStudent,
} from './storage';

// ============================================
// CASAS Calculations
// ============================================

/**
 * Calculate average of CASAS scores (only valid scores, not null)
 */
export function calculateCASASAverage(tests: CASASTest[]): number | null {
  const validScores = tests.filter(t => t.score !== null).map(t => t.score as number);
  if (validScores.length === 0) return null;
  return validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
}

/**
 * Calculate progress percentage toward Level 4
 * Formula: (Average Score - Level Start) / (Target - Level Start) * 100
 */
export function calculateCASASProgress(
  averageScore: number | null,
  levelStart: number,
  target: number
): number | null {
  if (averageScore === null) return null;
  const range = target - levelStart;
  if (range === 0) return 100;
  return ((averageScore - levelStart) / range) * 100;
}

// ============================================
// Unit Test Calculations
// ============================================

/**
 * Calculate average of unit test scores
 */
export function calculateTestAverage(tests: UnitTest[]): number | null {
  if (tests.length === 0) return null;
  return tests.reduce((sum, t) => sum + t.score, 0) / tests.length;
}

// ============================================
// Attendance Calculations
// ============================================

/**
 * Calculate attendance average (excluding vacation months)
 */
export function calculateAttendanceAverage(attendance: Attendance[]): number | null {
  const nonVacation = attendance.filter(a => !a.isVacation);
  if (nonVacation.length === 0) return null;
  return nonVacation.reduce((sum, a) => sum + a.percentage, 0) / nonVacation.length;
}

// ============================================
// Student Stats
// ============================================

/**
 * Check if student has all required data for ranking
 */
export function hasCompleteData(
  readingTests: CASASTest[],
  listeningTests: CASASTest[],
  unitTests: UnitTest[],
  attendance: Attendance[],
  enrollmentDate: string
): boolean {
  // Must have at least 1 of each category (after enrollment date)
  const hasReading = readingTests.some(t => t.score !== null && t.date >= enrollmentDate);
  const hasListening = listeningTests.some(t => t.score !== null && t.date >= enrollmentDate);
  const hasTests = unitTests.some(t => t.date >= enrollmentDate);
  const hasAttendance = attendance.some(a => !a.isVacation && a.month >= enrollmentDate.substring(0, 7));
  
  return hasReading && hasListening && hasTests && hasAttendance;
}

/**
 * Calculate overall score for ranking (capped at 100% for CASAS progress)
 */
export function calculateOverallScore(
  readingProgress: number | null,
  listeningProgress: number | null,
  testAverage: number | null,
  attendanceAverage: number | null,
  weights: RankingWeights
): number | null {
  // All must be present for a valid score
  if (
    readingProgress === null ||
    listeningProgress === null ||
    testAverage === null ||
    attendanceAverage === null
  ) {
    return null;
  }

  // Cap CASAS progress at 100% for ranking purposes
  const cappedReading = Math.min(readingProgress, 100);
  const cappedListening = Math.min(listeningProgress, 100);

  const score =
    (cappedReading * weights.casasReading / 100) +
    (cappedListening * weights.casasListening / 100) +
    (testAverage * weights.tests / 100) +
    (attendanceAverage * weights.attendance / 100);

  return score;
}

/**
 * Get all stats for a single student
 */
export function getStudentStats(
  student: Student,
  classData: Class
): StudentWithStats {
  const readingTests = getCASASTestsByStudent(student.id, 'reading');
  const listeningTests = getCASASTestsByStudent(student.id, 'listening');
  const unitTests = getUnitTestsByStudent(student.id);
  const attendance = getAttendanceByStudent(student.id);

  // Filter by enrollment date
  const enrolledReading = readingTests.filter(t => t.date >= student.enrollmentDate);
  const enrolledListening = listeningTests.filter(t => t.date >= student.enrollmentDate);
  const enrolledTests = unitTests.filter(t => t.date >= student.enrollmentDate);
  const enrolledAttendance = attendance.filter(
    a => a.month >= student.enrollmentDate.substring(0, 7)
  );

  const casasReadingAvg = calculateCASASAverage(enrolledReading);
  const casasListeningAvg = calculateCASASAverage(enrolledListening);
  const testAverage = calculateTestAverage(enrolledTests);
  const attendanceAverage = calculateAttendanceAverage(enrolledAttendance);

  const casasReadingProgress = calculateCASASProgress(
    casasReadingAvg,
    classData.casasReadingLevelStart,
    classData.casasReadingTarget
  );
  const casasListeningProgress = calculateCASASProgress(
    casasListeningAvg,
    classData.casasListeningLevelStart,
    classData.casasListeningTarget
  );

  const isComplete = hasCompleteData(
    enrolledReading,
    enrolledListening,
    enrolledTests,
    enrolledAttendance,
    student.enrollmentDate
  );

  const overallScore = isComplete
    ? calculateOverallScore(
        casasReadingProgress,
        casasListeningProgress,
        testAverage,
        attendanceAverage,
        classData.rankingWeights
      )
    : null;

  return {
    ...student,
    casasReadingAvg,
    casasReadingProgress,
    casasListeningAvg,
    casasListeningProgress,
    testAverage,
    attendanceAverage,
    overallScore,
    rank: null, // Will be set by rankStudents
    isComplete,
  };
}

/**
 * Get stats for all students in a class and assign ranks
 */
export function getStudentsWithRanks(
  students: Student[],
  classData: Class
): StudentWithStats[] {
  // Get stats for all students
  const studentsWithStats = students.map(s => getStudentStats(s, classData));

  // Sort by overall score (descending), incomplete students go to bottom
  const sorted = [...studentsWithStats].sort((a, b) => {
    // Incomplete students go to bottom
    if (!a.isComplete && !b.isComplete) return 0;
    if (!a.isComplete) return 1;
    if (!b.isComplete) return -1;
    
    // Sort by overall score (higher is better)
    return (b.overallScore ?? 0) - (a.overallScore ?? 0);
  });

  // Assign ranks (only to complete students)
  let rank = 1;
  sorted.forEach((student, index) => {
    if (student.isComplete) {
      student.rank = rank;
      rank++;
    }
  });

  return sorted;
}

/**
 * Get top N students by rank
 */
export function getTopStudents(studentsWithStats: StudentWithStats[], n: number): StudentWithStats[] {
  return studentsWithStats
    .filter(s => s.isComplete && s.rank !== null)
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .slice(0, n);
}

/**
 * Get bottom N students by rank
 */
export function getBottomStudents(studentsWithStats: StudentWithStats[], n: number): StudentWithStats[] {
  const ranked = studentsWithStats
    .filter(s => s.isComplete && s.rank !== null)
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  return ranked.slice(0, n).reverse();
}

// ============================================
// Color Coding
// ============================================

export type ColorLevel = 'good' | 'warning' | 'poor';

/**
 * Get color level based on percentage and thresholds
 */
export function getColorLevel(
  percentage: number | null,
  thresholds: { good: number; warning: number }
): ColorLevel | null {
  if (percentage === null) return null;
  if (percentage >= thresholds.good) return 'good';
  if (percentage >= thresholds.warning) return 'warning';
  return 'poor';
}

/**
 * Get Tailwind CSS class for color level
 */
export function getColorClass(level: ColorLevel | null): string {
  switch (level) {
    case 'good':
      return 'bg-green-100 text-green-800';
    case 'warning':
      return 'bg-yellow-100 text-yellow-800';
    case 'poor':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}
