import {
  Class,
  Student,
  CASASTest,
  UnitTest,
  Attendance,
  ReportCard,
  ArchivedYear,
  RankingWeights,
  ColorThresholds,
} from '@/types';

// ============================================
// Local Storage Keys
// ============================================

const STORAGE_KEYS = {
  classes: 'gradebook_classes',
  students: 'gradebook_students',
  casasTests: 'gradebook_casas_tests',
  unitTests: 'gradebook_unit_tests',
  attendance: 'gradebook_attendance',
  reportCards: 'gradebook_report_cards',
  archivedYears: 'gradebook_archived_years',
  currentClassId: 'gradebook_current_class_id',
} as const;

// ============================================
// Helper Functions
// ============================================

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function getFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  if (!stored) return defaultValue;
  try {
    return JSON.parse(stored) as T;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
}

// ============================================
// Default Values
// ============================================

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  casasReading: 25,
  casasListening: 25,
  tests: 30,
  attendance: 20,
};

export const DEFAULT_COLOR_THRESHOLDS: ColorThresholds = {
  good: 80,
  warning: 60,
};

// ============================================
// Classes
// ============================================

export function getClasses(): Class[] {
  return getFromStorage<Class[]>(STORAGE_KEYS.classes, []);
}

export function saveClasses(classes: Class[]): void {
  saveToStorage(STORAGE_KEYS.classes, classes);
}

export function createClass(name: string, period: string): Class {
  const newClass: Class = {
    id: generateId(),
    name,
    period,
    // Default Level 3 → Level 4 targets
    casasReadingLevelStart: 207,
    casasReadingTarget: 217,
    casasListeningLevelStart: 202,
    casasListeningTarget: 212,
    rankingWeights: { ...DEFAULT_RANKING_WEIGHTS },
    colorThresholds: { ...DEFAULT_COLOR_THRESHOLDS },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const classes = getClasses();
  classes.push(newClass);
  saveClasses(classes);
  return newClass;
}

export function updateClass(classId: string, updates: Partial<Class>): Class | null {
  const classes = getClasses();
  const index = classes.findIndex(c => c.id === classId);
  if (index === -1) return null;
  classes[index] = { ...classes[index], ...updates, updatedAt: new Date().toISOString() };
  saveClasses(classes);
  return classes[index];
}

export function deleteClass(classId: string): void {
  const classes = getClasses().filter(c => c.id !== classId);
  saveClasses(classes);
  // Also delete all students in this class
  const students = getStudents().filter(s => s.classId !== classId);
  saveStudents(students);
}

export function getCurrentClassId(): string | null {
  return getFromStorage<string | null>(STORAGE_KEYS.currentClassId, null);
}

export function setCurrentClassId(classId: string | null): void {
  saveToStorage(STORAGE_KEYS.currentClassId, classId);
}

// ============================================
// Students
// ============================================

export function getStudents(): Student[] {
  return getFromStorage<Student[]>(STORAGE_KEYS.students, []);
}

export function saveStudents(students: Student[]): void {
  saveToStorage(STORAGE_KEYS.students, students);
}

export function getStudentsByClass(classId: string, includeDropped = false): Student[] {
  return getStudents().filter(s => 
    s.classId === classId && (includeDropped || !s.isDropped)
  );
}

export function getDroppedStudents(): Student[] {
  return getStudents().filter(s => s.isDropped);
}

export function createStudent(name: string, classId: string, enrollmentDate?: string): Student {
  const newStudent: Student = {
    id: generateId(),
    name,
    classId,
    enrollmentDate: enrollmentDate || new Date().toISOString().split('T')[0],
    notes: '',
    isDropped: false,
    droppedDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const students = getStudents();
  students.push(newStudent);
  saveStudents(students);
  return newStudent;
}

export function updateStudent(studentId: string, updates: Partial<Student>): Student | null {
  const students = getStudents();
  const index = students.findIndex(s => s.id === studentId);
  if (index === -1) return null;
  students[index] = { ...students[index], ...updates, updatedAt: new Date().toISOString() };
  saveStudents(students);
  return students[index];
}

export function dropStudent(studentId: string): void {
  updateStudent(studentId, {
    isDropped: true,
    droppedDate: new Date().toISOString().split('T')[0],
  });
}

export function restoreStudent(studentId: string, newClassId: string): void {
  updateStudent(studentId, {
    isDropped: false,
    droppedDate: null,
    classId: newClassId,
  });
}

export function moveStudent(studentId: string, newClassId: string): void {
  updateStudent(studentId, { classId: newClassId });
}

export function findStudentByName(name: string, classId: string): Student | undefined {
  const normalizedName = name.trim().toLowerCase();
  return getStudentsByClass(classId).find(
    s => s.name.trim().toLowerCase() === normalizedName
  );
}

export function findOrCreateStudent(name: string, classId: string): Student {
  const existing = findStudentByName(name, classId);
  if (existing) return existing;
  return createStudent(name, classId);
}

// ============================================
// CASAS Tests
// ============================================

export function getCASASTests(): CASASTest[] {
  return getFromStorage<CASASTest[]>(STORAGE_KEYS.casasTests, []);
}

export function saveCASASTests(tests: CASASTest[]): void {
  saveToStorage(STORAGE_KEYS.casasTests, tests);
}

export function getCASASTestsByStudent(studentId: string, type?: 'reading' | 'listening'): CASASTest[] {
  return getCASASTests().filter(t => 
    t.studentId === studentId && (!type || t.type === type)
  );
}

export function addCASASTest(
  studentId: string,
  type: 'reading' | 'listening',
  date: string,
  formNumber: string,
  score: number | null
): CASASTest | null {
  // Check for duplicate (same date + form + score)
  const tests = getCASASTests();
  const isDuplicate = tests.some(
    t => t.studentId === studentId && 
         t.date === date && 
         t.formNumber === formNumber && 
         t.score === score
  );
  if (isDuplicate) return null;

  const newTest: CASASTest = {
    id: generateId(),
    studentId,
    type,
    date,
    formNumber,
    score,
    createdAt: new Date().toISOString(),
  };
  tests.push(newTest);
  saveCASASTests(tests);
  return newTest;
}

export function updateCASASTest(testId: string, updates: Partial<CASASTest>): void {
  const tests = getCASASTests();
  const index = tests.findIndex(t => t.id === testId);
  if (index !== -1) {
    tests[index] = { ...tests[index], ...updates };
    saveCASASTests(tests);
  }
}

export function deleteCASASTest(testId: string): void {
  const tests = getCASASTests().filter(t => t.id !== testId);
  saveCASASTests(tests);
}

// ============================================
// Unit Tests
// ============================================

export function getUnitTests(): UnitTest[] {
  return getFromStorage<UnitTest[]>(STORAGE_KEYS.unitTests, []);
}

export function saveUnitTests(tests: UnitTest[]): void {
  saveToStorage(STORAGE_KEYS.unitTests, tests);
}

export function getUnitTestsByStudent(studentId: string): UnitTest[] {
  return getUnitTests().filter(t => t.studentId === studentId);
}

export function addUnitTest(studentId: string, testName: string, date: string, score: number): UnitTest {
  const newTest: UnitTest = {
    id: generateId(),
    studentId,
    testName,
    date,
    score,
    createdAt: new Date().toISOString(),
  };
  const tests = getUnitTests();
  tests.push(newTest);
  saveUnitTests(tests);
  return newTest;
}

export function updateUnitTest(testId: string, updates: Partial<UnitTest>): void {
  const tests = getUnitTests();
  const index = tests.findIndex(t => t.id === testId);
  if (index !== -1) {
    tests[index] = { ...tests[index], ...updates };
    saveUnitTests(tests);
  }
}

export function deleteUnitTest(testId: string): void {
  const tests = getUnitTests().filter(t => t.id !== testId);
  saveUnitTests(tests);
}

// ============================================
// Attendance
// ============================================

export function getAttendance(): Attendance[] {
  return getFromStorage<Attendance[]>(STORAGE_KEYS.attendance, []);
}

export function saveAttendance(attendance: Attendance[]): void {
  saveToStorage(STORAGE_KEYS.attendance, attendance);
}

export function getAttendanceByStudent(studentId: string): Attendance[] {
  return getAttendance().filter(a => a.studentId === studentId);
}

export function setAttendance(
  studentId: string,
  month: string,
  percentage: number,
  isVacation = false
): Attendance {
  const allAttendance = getAttendance();
  const existingIndex = allAttendance.findIndex(
    a => a.studentId === studentId && a.month === month
  );

  if (existingIndex !== -1) {
    allAttendance[existingIndex] = {
      ...allAttendance[existingIndex],
      percentage,
      isVacation,
    };
    saveAttendance(allAttendance);
    return allAttendance[existingIndex];
  }

  const newAttendance: Attendance = {
    id: generateId(),
    studentId,
    month,
    percentage,
    isVacation,
    createdAt: new Date().toISOString(),
  };
  allAttendance.push(newAttendance);
  saveAttendance(allAttendance);
  return newAttendance;
}

export function toggleVacation(studentId: string, month: string): boolean {
  const allAttendance = getAttendance();
  const existing = allAttendance.find(
    a => a.studentId === studentId && a.month === month
  );
  
  // Can only toggle if no data exists (or already vacation)
  if (existing && !existing.isVacation && existing.percentage > 0) {
    return false; // Can't toggle - has data
  }

  if (existing) {
    existing.isVacation = !existing.isVacation;
    saveAttendance(allAttendance);
  } else {
    setAttendance(studentId, month, 0, true);
  }
  return true;
}

export function deleteAttendance(studentId: string, month: string): void {
  const attendance = getAttendance().filter(
    a => !(a.studentId === studentId && a.month === month)
  );
  saveAttendance(attendance);
}

// ============================================
// Report Cards
// ============================================

export function getReportCards(): ReportCard[] {
  return getFromStorage<ReportCard[]>(STORAGE_KEYS.reportCards, []);
}

export function saveReportCards(reportCards: ReportCard[]): void {
  saveToStorage(STORAGE_KEYS.reportCards, reportCards);
}

export function getReportCardsByStudent(studentId: string): ReportCard[] {
  return getReportCards()
    .filter(r => r.studentId === studentId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function createReportCard(reportCard: Omit<ReportCard, 'id' | 'createdAt' | 'updatedAt'>): ReportCard {
  const newReportCard: ReportCard = {
    ...reportCard,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const reportCards = getReportCards();
  reportCards.push(newReportCard);
  saveReportCards(reportCards);
  return newReportCard;
}

export function updateReportCard(reportCardId: string, updates: Partial<ReportCard>): void {
  const reportCards = getReportCards();
  const index = reportCards.findIndex(r => r.id === reportCardId);
  if (index !== -1) {
    reportCards[index] = { 
      ...reportCards[index], 
      ...updates, 
      updatedAt: new Date().toISOString() 
    };
    saveReportCards(reportCards);
  }
}

export function deleteReportCard(reportCardId: string): void {
  const reportCards = getReportCards().filter(r => r.id !== reportCardId);
  saveReportCards(reportCards);
}

// ============================================
// Archive
// ============================================

export function getArchivedYears(): ArchivedYear[] {
  return getFromStorage<ArchivedYear[]>(STORAGE_KEYS.archivedYears, []);
}

export function saveArchivedYears(years: ArchivedYear[]): void {
  saveToStorage(STORAGE_KEYS.archivedYears, years);
}

export function archiveCurrentYear(yearName: string): ArchivedYear {
  const archive: ArchivedYear = {
    id: generateId(),
    yearName,
    archivedAt: new Date().toISOString(),
    data: {
      classes: getClasses(),
      students: getStudents(),
      casasTests: getCASASTests(),
      unitTests: getUnitTests(),
      attendance: getAttendance(),
      reportCards: getReportCards(),
    },
  };

  const archives = getArchivedYears();
  archives.push(archive);
  saveArchivedYears(archives);

  // Clear all current data
  saveClasses([]);
  saveStudents([]);
  saveCASASTests([]);
  saveUnitTests([]);
  saveAttendance([]);
  saveReportCards([]);
  setCurrentClassId(null);

  return archive;
}

// ============================================
// Export/Import
// ============================================

export function exportAllData(): string {
  const data = {
    classes: getClasses(),
    students: getStudents(),
    casasTests: getCASASTests(),
    unitTests: getUnitTests(),
    attendance: getAttendance(),
    reportCards: getReportCards(),
    archivedYears: getArchivedYears(),
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(data, null, 2);
}

export function importAllData(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString);
    if (data.classes) saveClasses(data.classes);
    if (data.students) saveStudents(data.students);
    if (data.casasTests) saveCASASTests(data.casasTests);
    if (data.unitTests) saveUnitTests(data.unitTests);
    if (data.attendance) saveAttendance(data.attendance);
    if (data.reportCards) saveReportCards(data.reportCards);
    if (data.archivedYears) saveArchivedYears(data.archivedYears);
    return true;
  } catch {
    return false;
  }
}
