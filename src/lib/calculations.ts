import {
  Class,
  Student,
  CASASTest,
  UnitTest,
  Attendance,
  StudentWithStats,
  RankingWeights,
  RetentionResult,
  RetentionMetrics,
  ClassMetrics,
} from '@/types';
import {
  getCASASTestsByStudent,
  getUnitTestsByStudent,
  getAttendanceByStudent,
  getStudentsByClass,
  getAttendance,
  getClasses,
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
 * Get most recent CASAS score (by date, only valid scores)
 */
export function getMostRecentCASASScore(tests: CASASTest[]): number | null {
  const validTests = tests.filter(t => t.score !== null);
  if (validTests.length === 0) return null;
  
  // Sort by date descending (most recent first)
  const sorted = [...validTests].sort((a, b) => b.date.localeCompare(a.date));
  return sorted[0].score;
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
  const casasReadingLast = getMostRecentCASASScore(enrolledReading);
  const casasListeningAvg = calculateCASASAverage(enrolledListening);
  const casasListeningLast = getMostRecentCASASScore(enrolledListening);
  const testAverage = calculateTestAverage(enrolledTests);
  const attendanceAverage = calculateAttendanceAverage(enrolledAttendance);

  // Use most recent score for progress calculation (determines level readiness)
  const casasReadingProgress = calculateCASASProgress(
    casasReadingLast,
    classData.casasReadingLevelStart,
    classData.casasReadingTarget
  );
  const casasListeningProgress = calculateCASASProgress(
    casasListeningLast,
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
    casasReadingLast,
    casasReadingProgress,
    casasListeningAvg,
    casasListeningLast,
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

// ============================================
// Name Sorting
// ============================================

/**
 * Extract last name from a full name (assumes "First Last" or "First Middle Last" format)
 */
export function getLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
}

/**
 * Extract first name from a full name
 */
export function getFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || fullName;
}

/**
 * Compare two names for sorting by last name, then first name
 */
export function compareByLastName(a: string, b: string): number {
  const lastA = getLastName(a).toLowerCase();
  const lastB = getLastName(b).toLowerCase();
  
  if (lastA !== lastB) {
    return lastA.localeCompare(lastB);
  }
  
  // If last names are equal, sort by first name
  const firstA = getFirstName(a).toLowerCase();
  const firstB = getFirstName(b).toLowerCase();
  return firstA.localeCompare(firstB);
}

/**
 * Sort students by last name, then first name
 */
export function sortStudentsByLastName<T extends { name: string }>(students: T[]): T[] {
  return [...students].sort((a, b) => compareByLastName(a.name, b.name));
}

// ============================================
// Retention Calculations
// ============================================

/**
 * Add months to a YYYY-MM string
 */
function addMonths(monthStr: string, numMonths: number): string {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1 + numMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get a student's entry month (first month with attendance > 0, non-vacation)
 */
export function getStudentEntryMonth(studentId: string): string | null {
  const attendance = getAttendanceByStudent(studentId);
  const activeMonths = attendance
    .filter(a => !a.isVacation && a.percentage > 0)
    .map(a => a.month)
    .sort();
  
  return activeMonths.length > 0 ? activeMonths[0] : null;
}

/**
 * Check if student was active in a specific month (attendance > 0, non-vacation)
 */
export function isStudentActiveInMonth(studentId: string, month: string): boolean {
  const attendance = getAttendanceByStudent(studentId);
  const record = attendance.find(a => a.month === month);
  return record ? (!record.isVacation && record.percentage > 0) : false;
}

/**
 * Check if a dropped student came back (has attendance after their drop date)
 * Used for generous retention calculation - students who return count as retained
 */
export function studentCameBack(student: Student): boolean {
  if (!student.isDropped || !student.droppedDate) return false;
  
  // Check for any attendance AFTER their drop date
  const attendance = getAttendanceByStudent(student.id);
  const dropMonth = student.droppedDate.substring(0, 7);
  
  return attendance.some(a => 
    a.month > dropMonth && a.percentage > 0 && !a.isVacation
  );
}

/**
 * Get all months that have attendance data for a class
 */
function getClassAttendanceMonths(classId: string): string[] {
  // Include dropped students to get all months with data
  const students = getStudentsByClass(classId, true);
  const studentIds = new Set(students.map(s => s.id));
  const allAttendance = getAttendance().filter(a => studentIds.has(a.studentId));
  const months = new Set(allAttendance.map(a => a.month));
  return Array.from(months).sort();
}

/**
 * Calculate 30-Day Buffered Retention
 * retained = active in (entryMonth+1) OR (entryMonth+2)
 * Eligible = students with entryMonth AND at least 2 months of data after
 * 
 * Generous retention logic:
 * - Dropped students who came back = RETAINED (as if they never left)
 * - Dropped students who never came back = NOT RETAINED
 */
export function calculate30DayRetention(classId: string): RetentionResult {
  // Include dropped students for accurate retention calculation
  const students = getStudentsByClass(classId, true);
  const availableMonths = new Set(getClassAttendanceMonths(classId));
  
  let eligible = 0;
  let retained = 0;
  
  for (const student of students) {
    const entryMonth = getStudentEntryMonth(student.id);
    if (!entryMonth) continue; // No active months, not eligible
    
    const month1 = addMonths(entryMonth, 1);
    const month2 = addMonths(entryMonth, 2);
    
    // Check if we have enough data (at least month1 or month2 exists)
    const hasMonth1Data = availableMonths.has(month1);
    const hasMonth2Data = availableMonths.has(month2);
    
    if (!hasMonth1Data && !hasMonth2Data) {
      // Not enough data yet - student is "not yet eligible"
      continue;
    }
    
    eligible++;
    
    // Check if retained (active in month1 OR month2)
    const activeMonth1 = isStudentActiveInMonth(student.id, month1);
    const activeMonth2 = isStudentActiveInMonth(student.id, month2);
    
    if (activeMonth1 || activeMonth2) {
      // Active at checkpoint = retained
      retained++;
    } else if (student.isDropped && studentCameBack(student)) {
      // Dropped but came back later = count as retained (generous)
      retained++;
    }
    // Otherwise: dropped and never came back = not retained
  }
  
  return {
    rate: eligible > 0 ? (retained / eligible) * 100 : null,
    retained,
    eligible,
  };
}

/**
 * Calculate Midyear Retention (Fall → January)
 * For students who entered Aug-Dec, check if active in January
 * 
 * Generous retention logic:
 * - Dropped students who came back = RETAINED (as if they never left)
 * - Dropped students who never came back = NOT RETAINED
 */
export function calculateMidyearRetention(classId: string, schoolYear: string): RetentionResult {
  // Include dropped students for accurate retention calculation
  const students = getStudentsByClass(classId, true);
  const [startYear] = schoolYear.split('-').map(Number);
  
  // Fall months: Aug-Dec of start year
  const fallMonths = ['08', '09', '10', '11', '12'].map(m => `${startYear}-${m}`);
  // Midyear month: January of next year
  const januaryMonth = `${startYear + 1}-01`;
  
  // Check if January data exists
  const availableMonths = new Set(getClassAttendanceMonths(classId));
  if (!availableMonths.has(januaryMonth)) {
    return { rate: null, retained: 0, eligible: 0 };
  }
  
  let eligible = 0;
  let retained = 0;
  
  for (const student of students) {
    const entryMonth = getStudentEntryMonth(student.id);
    if (!entryMonth) continue;
    
    // Check if entry month is in fall
    if (!fallMonths.includes(entryMonth)) continue;
    
    eligible++;
    
    if (isStudentActiveInMonth(student.id, januaryMonth)) {
      // Active in January = retained
      retained++;
    } else if (student.isDropped && studentCameBack(student)) {
      // Dropped but came back later = count as retained (generous)
      retained++;
    }
    // Otherwise: dropped and never came back = not retained
  }
  
  return {
    rate: eligible > 0 ? (retained / eligible) * 100 : null,
    retained,
    eligible,
  };
}

/**
 * Calculate End-of-Year Retention
 * For students who entered by March, check if active in May OR June
 * 
 * Generous retention logic:
 * - Dropped students who came back = RETAINED (as if they never left)
 * - Dropped students who never came back = NOT RETAINED
 */
export function calculateEndYearRetention(classId: string, schoolYear: string): RetentionResult {
  // Include dropped students for accurate retention calculation
  const students = getStudentsByClass(classId, true);
  const [startYear] = schoolYear.split('-').map(Number);
  const endYear = startYear + 1;
  
  // Cutoff: students must have entered by March
  const cutoffMonth = `${endYear}-03`;
  // End months: May or June
  const mayMonth = `${endYear}-05`;
  const juneMonth = `${endYear}-06`;
  
  // Check if May or June data exists
  const availableMonths = new Set(getClassAttendanceMonths(classId));
  const hasMay = availableMonths.has(mayMonth);
  const hasJune = availableMonths.has(juneMonth);
  
  if (!hasMay && !hasJune) {
    return { rate: null, retained: 0, eligible: 0 };
  }
  
  let eligible = 0;
  let retained = 0;
  
  for (const student of students) {
    const entryMonth = getStudentEntryMonth(student.id);
    if (!entryMonth) continue;
    
    // Check if entry month is before or equal to cutoff
    if (entryMonth > cutoffMonth) continue;
    
    eligible++;
    
    const activeMay = isStudentActiveInMonth(student.id, mayMonth);
    const activeJune = isStudentActiveInMonth(student.id, juneMonth);
    
    if (activeMay || activeJune) {
      // Active in May/June = retained
      retained++;
    } else if (student.isDropped && studentCameBack(student)) {
      // Dropped but came back later = count as retained (generous)
      retained++;
    }
    // Otherwise: dropped and never came back = not retained
  }
  
  return {
    rate: eligible > 0 ? (retained / eligible) * 100 : null,
    retained,
    eligible,
  };
}

/**
 * Calculate class average attendance (across all students)
 */
export function getClassAttendanceAverage(classId: string): number | null {
  const students = getStudentsByClass(classId);
  if (students.length === 0) return null;
  
  const averages: number[] = [];
  
  for (const student of students) {
    const attendance = getAttendanceByStudent(student.id);
    const avg = calculateAttendanceAverage(attendance);
    if (avg !== null) {
      averages.push(avg);
    }
  }
  
  if (averages.length === 0) return null;
  return averages.reduce((sum, a) => sum + a, 0) / averages.length;
}

/**
 * Get all metrics for a class
 */
export function getClassMetrics(classId: string, schoolYear: string): ClassMetrics {
  const students = getStudentsByClass(classId);
  
  return {
    studentCount: students.length,
    averageAttendance: getClassAttendanceAverage(classId),
    retention: {
      thirtyDay: calculate30DayRetention(classId),
      midyear: calculateMidyearRetention(classId, schoolYear),
      endYear: calculateEndYearRetention(classId, schoolYear),
    },
  };
}

/**
 * Get ranked students for a class by ID
 */
export function getStudentsWithRanksByClassId(classId: string): StudentWithStats[] {
  const classes = getClasses();
  const classData = classes.find(c => c.id === classId);
  if (!classData) return [];
  
  const students = getStudentsByClass(classId);
  return getStudentsWithRanks(students, classData);
}

/**
 * Get top N performers (highest overall scores)
 */
export function getTopPerformers(classId: string, count: number = 5): StudentWithStats[] {
  const rankedStudents = getStudentsWithRanksByClassId(classId);
  
  return rankedStudents
    .filter(s => s.isComplete && s.rank !== null)
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)) // Lowest rank number = highest performer
    .slice(0, count);
}

/**
 * Get bottom N students (at-risk, lowest overall scores)
 */
export function getAtRiskStudents(classId: string, count: number = 5): StudentWithStats[] {
  const rankedStudents = getStudentsWithRanksByClassId(classId);
  
  const ranked = rankedStudents
    .filter(s => s.isComplete && s.rank !== null)
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0)); // Highest rank number = lowest performer
  
  return ranked.slice(0, count);
}

/**
 * Calculate Year-to-Date Retention
 * Students who enrolled from August to now and are still active (not dropped)
 */
/**
 * Calculate Year-to-Date Retention
 * Students who enrolled from August to now and are still active (not dropped)
 * 
 * Generous retention logic:
 * - Dropped students who came back = RETAINED (as if they never left)
 * - Dropped students who never came back = NOT RETAINED
 */
export function calculateYTDRetention(classId: string, schoolYear: string): RetentionResult {
  // Include dropped students for accurate retention calculation
  const students = getStudentsByClass(classId, true);
  const [startYear] = schoolYear.split('-').map(Number);
  
  // Year start: August of school year
  const yearStart = `${startYear}-08-01`;
  const now = new Date().toISOString().split('T')[0];
  
  // Students who enrolled from August to now
  const eligibleStudents = students.filter(s => 
    s.enrollmentDate >= yearStart && s.enrollmentDate <= now
  );
  
  // Count retained: active OR came back after dropping
  const retainedStudents = eligibleStudents.filter(s => 
    !s.isDropped || studentCameBack(s)
  );
  
  const rate = eligibleStudents.length > 0 
    ? (retainedStudents.length / eligibleStudents.length) * 100 
    : null;
  
  return { rate, retained: retainedStudents.length, eligible: eligibleStudents.length };
}
