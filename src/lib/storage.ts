import {
  Class,
  Student,
  CASASTest,
  UnitTest,
  SpeakingTest,
  SpeakingTestResult,
  WritingTest,
  WritingTestResult,
  Attendance,
  ReportCard,
  ArchivedYear,
  RankingWeights,
  ColorThresholds,
  CACELevel,
  CACE_LEVELS,
  ISSTRecord,
  StudentNote,
} from '@/types';
import { getTeacherName, setTeacherName } from './teacher-settings';
import {
  queueSync,
  downloadAllFromCloud,
  isSupabaseConfigured,
  deleteFromCloud,
  forceSyncNow,
  type CloudSyncPayload,
} from './sync';

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
  isstRecords: 'gradebook_isst_records',
  studentNotes: 'gradebook_student_notes',
  speakingTests: 'gradebook_speaking_tests',
  speakingTestResults: 'gradebook_speaking_test_results',
  writingTests: 'gradebook_writing_tests',
  writingTestResults: 'gradebook_writing_test_results',
  /** IDs of classes/user-deleted so cloud sync does not re-add them */
  deletedClassIds: 'gradebook_deleted_class_ids',
  deletedStudentIds: 'gradebook_deleted_student_ids',
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

function getDeletedClassIdSet(): Set<string> {
  return new Set(getFromStorage<string[]>(STORAGE_KEYS.deletedClassIds, []));
}

function getDeletedStudentIdSet(): Set<string> {
  return new Set(getFromStorage<string[]>(STORAGE_KEYS.deletedStudentIds, []));
}

function withoutDeletedClasses<T extends { id: string }>(rows: T[]): T[] {
  const deleted = getDeletedClassIdSet();
  if (deleted.size === 0) return rows;
  return rows.filter(row => !deleted.has(row.id));
}

function withoutDeletedStudents<T extends { id: string }>(rows: T[]): T[] {
  const deleted = getDeletedStudentIdSet();
  if (deleted.size === 0) return rows;
  return rows.filter(row => !deleted.has(row.id));
}

// ============================================
// Cloud Sync
// ============================================

/** Snapshot of all gradebook data for cloud upload (same shape as automatic sync). */
export function getCloudSyncPayload(): CloudSyncPayload {
  return {
    classes: getFromStorage<Class[]>(STORAGE_KEYS.classes, []),
    students: getFromStorage<Student[]>(STORAGE_KEYS.students, []),
    casasTests: getFromStorage<CASASTest[]>(STORAGE_KEYS.casasTests, []),
    unitTests: getFromStorage<UnitTest[]>(STORAGE_KEYS.unitTests, []),
    attendance: getFromStorage<Attendance[]>(STORAGE_KEYS.attendance, []),
    reportCards: getFromStorage<ReportCard[]>(STORAGE_KEYS.reportCards, []),
    studentNotes: getFromStorage<StudentNote[]>(STORAGE_KEYS.studentNotes, []),
    isstRecords: getFromStorage<ISSTRecord[]>(STORAGE_KEYS.isstRecords, []),
    speakingTests: getFromStorage<SpeakingTest[]>(STORAGE_KEYS.speakingTests, []),
    speakingTestResults: getFromStorage<SpeakingTestResult[]>(STORAGE_KEYS.speakingTestResults, []),
    writingTests: getFromStorage<WritingTest[]>(STORAGE_KEYS.writingTests, []),
    writingTestResults: getFromStorage<WritingTestResult[]>(STORAGE_KEYS.writingTestResults, []),
  };
}

/** Push everything in this browser to Supabase immediately (use after bulk entry or on another device). */
export async function pushLocalDataToCloud(): Promise<void> {
  await forceSyncNow(getCloudSyncPayload());
}

/**
 * Trigger a sync to Supabase (debounced)
 */
function triggerSync(): void {
  if (typeof window === 'undefined') return;
  queueSync(getCloudSyncPayload());
}

/**
 * Load data from Supabase cloud (called once on app startup)
 * Merges cloud data with local data, preferring newer records
 */
export async function syncFromCloud(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!isSupabaseConfigured()) return false;
  
  try {
    const cloudData = await downloadAllFromCloud();
    if (!cloudData) return false;
    
    // Get local data
    const localClasses = getFromStorage<Class[]>(STORAGE_KEYS.classes, []);
    const localStudents = getFromStorage<Student[]>(STORAGE_KEYS.students, []);
    const localCasasTests = getFromStorage<CASASTest[]>(STORAGE_KEYS.casasTests, []);
    const localUnitTests = getFromStorage<UnitTest[]>(STORAGE_KEYS.unitTests, []);
    const localAttendance = getFromStorage<Attendance[]>(STORAGE_KEYS.attendance, []);
    const localReportCards = getFromStorage<ReportCard[]>(STORAGE_KEYS.reportCards, []);
    const localStudentNotes = getFromStorage<StudentNote[]>(STORAGE_KEYS.studentNotes, []);
    const localISSTRecords = getFromStorage<ISSTRecord[]>(STORAGE_KEYS.isstRecords, []);
    const localSpeakingTests = getFromStorage<SpeakingTest[]>(STORAGE_KEYS.speakingTests, []);
    const localSpeakingTestResults = getFromStorage<SpeakingTestResult[]>(STORAGE_KEYS.speakingTestResults, []);
    const localWritingTests = getFromStorage<WritingTest[]>(STORAGE_KEYS.writingTests, []);
    const localWritingTestResults = getFromStorage<WritingTestResult[]>(STORAGE_KEYS.writingTestResults, []);

    // Don't re-add classes/students the user deleted (cloud may still have them if delete failed)
    const deletedClassIds = getDeletedClassIdSet();
    const deletedStudentIds = getDeletedStudentIdSet();
    const cloudClassesFiltered = cloudData.classes.filter(c => !deletedClassIds.has(c.id));
    const cloudStudentsFiltered = cloudData.students.filter(s => !deletedStudentIds.has(s.id));
    const cloudCasasFiltered = cloudData.casasTests.filter(t => !deletedStudentIds.has(t.studentId));
    const cloudUnitTestsFiltered = cloudData.unitTests.filter(t => !deletedStudentIds.has(t.studentId));
    const cloudAttendanceFiltered = cloudData.attendance.filter(a => !deletedStudentIds.has(a.studentId));
    const cloudReportCardsFiltered = cloudData.reportCards.filter(r => !deletedStudentIds.has(r.studentId));
    const cloudStudentNotesFiltered = cloudData.studentNotes.filter(n => !deletedStudentIds.has(n.studentId));
    const cloudISSTFiltered = cloudData.isstRecords.filter(r => !deletedStudentIds.has(r.studentId));
    const cloudSpeakingTestsFiltered = cloudData.speakingTests.filter(
      t => !deletedClassIds.has(t.classId),
    );
    const cloudSpeakingTestIds = new Set(cloudSpeakingTestsFiltered.map(t => t.id));
    const cloudSpeakingResultsFiltered = cloudData.speakingTestResults.filter(
      r => !deletedStudentIds.has(r.studentId) && cloudSpeakingTestIds.has(r.testId),
    );
    const cloudWritingTestsFiltered = cloudData.writingTests.filter(
      t => !deletedClassIds.has(t.classId),
    );
    const cloudWritingTestIds = new Set(cloudWritingTestsFiltered.map(t => t.id));
    const cloudWritingResultsFiltered = cloudData.writingTestResults.filter(
      r => !deletedStudentIds.has(r.studentId) && cloudWritingTestIds.has(r.testId),
    );

    // Merge function: combine local and cloud, prefer newer by updatedAt/createdAt
    function mergeArrays<T extends { id: string; updatedAt?: string; createdAt?: string }>(
      local: T[],
      cloud: T[]
    ): T[] {
      const merged = new Map<string, T>();
      
      // Add all local items
      local.forEach(item => merged.set(item.id, item));
      
      // Add/replace with cloud items if newer
      cloud.forEach(cloudItem => {
        const localItem = merged.get(cloudItem.id);
        if (!localItem) {
          merged.set(cloudItem.id, cloudItem);
        } else {
          // Compare timestamps
          const localTime = new Date(localItem.updatedAt || localItem.createdAt || 0).getTime();
          const cloudTime = new Date(cloudItem.updatedAt || cloudItem.createdAt || 0).getTime();
          if (cloudTime > localTime) {
            merged.set(cloudItem.id, cloudItem);
          }
        }
      });
      
      return Array.from(merged.values());
    }
    
    // Merge all data (use filtered cloud so deleted classes/students don't come back)
    const mergedClasses = withoutDeletedClasses(mergeArrays(localClasses, cloudClassesFiltered));
    const mergedStudents = withoutDeletedStudents(mergeArrays(localStudents, cloudStudentsFiltered));
    const mergedCasasTests = mergeArrays(localCasasTests, cloudCasasFiltered);
    const mergedUnitTests = mergeArrays(localUnitTests, cloudUnitTestsFiltered);
    const mergedAttendance = mergeArrays(localAttendance, cloudAttendanceFiltered);
    const mergedReportCards = mergeArrays(localReportCards, cloudReportCardsFiltered);
    const mergedStudentNotes = mergeArrays(localStudentNotes, cloudStudentNotesFiltered);
    const mergedISSTRecords = mergeArrays(localISSTRecords, cloudISSTFiltered);
    const mergedSpeakingTests = mergeArrays(localSpeakingTests, cloudSpeakingTestsFiltered);
    const mergedSpeakingTestResults = mergeArrays(
      localSpeakingTestResults,
      cloudSpeakingResultsFiltered,
    );
    const mergedWritingTests = mergeArrays(localWritingTests, cloudWritingTestsFiltered);
    const mergedWritingTestResults = mergeArrays(
      localWritingTestResults,
      cloudWritingResultsFiltered,
    );
    
    // Save merged data to local storage
    saveToStorage(STORAGE_KEYS.classes, mergedClasses);
    saveToStorage(STORAGE_KEYS.students, mergedStudents);
    saveToStorage(STORAGE_KEYS.casasTests, mergedCasasTests);
    saveToStorage(STORAGE_KEYS.unitTests, mergedUnitTests);
    saveToStorage(STORAGE_KEYS.attendance, mergedAttendance);
    saveToStorage(STORAGE_KEYS.reportCards, mergedReportCards);
    saveToStorage(STORAGE_KEYS.studentNotes, mergedStudentNotes);
    saveToStorage(STORAGE_KEYS.isstRecords, mergedISSTRecords);
    saveToStorage(STORAGE_KEYS.speakingTests, mergedSpeakingTests);
    saveToStorage(STORAGE_KEYS.speakingTestResults, mergedSpeakingTestResults);
    saveToStorage(STORAGE_KEYS.writingTests, mergedWritingTests);
    saveToStorage(STORAGE_KEYS.writingTestResults, mergedWritingTestResults);

    // Retry cloud deletes for classes removed locally (e.g. prior delete failed due to RLS)
    if (deletedClassIds.size > 0) {
      await Promise.all(
        Array.from(deletedClassIds).map(classId =>
          deleteFromCloud('classes', classId).catch(err =>
            console.error('Failed to purge deleted class from cloud:', classId, err),
          ),
        ),
      );
    }
    
    // Upload merged data back to cloud (in case local had newer items)
    triggerSync();
    
    return true;
  } catch (error) {
    console.error('Failed to sync from cloud:', error);
    return false;
  }
}

// ============================================
// Default Values
// ============================================

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  casasReading: 18,
  casasListening: 18,
  speaking: 18,
  writing: 18,
  tests: 14,
  attendance: 14,
};

export const DEFAULT_COLOR_THRESHOLDS: ColorThresholds = {
  good: 80,
  warning: 60,
};

// ============================================
// Academic Year Helpers
// ============================================

export function getCurrentAcademicYear(): string {
  const now = new Date();
  // If we're in Aug-Dec (month >= 7), use current year as start
  // If Jan-Jul (month < 7), use previous year as start
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
}

export function getAcademicYearOptions(): string[] {
  const classes = getClasses();
  const yearsSet = new Set<string>();
  
  // Add current year (always available)
  yearsSet.add(getCurrentAcademicYear());
  
  // Add years from existing classes
  classes.forEach(cls => {
    if (cls.academicYear) {
      yearsSet.add(cls.academicYear);
    }
  });
  
  // Convert to array and sort descending (newest first)
  return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
}

// ============================================
// Classes
// ============================================

export function getClasses(): Class[] {
  const deletedClassIds = getDeletedClassIdSet();
  let classes = getFromStorage<Class[]>(STORAGE_KEYS.classes, []);
  const hadDeletedInStorage = deletedClassIds.size > 0 && classes.some(c => deletedClassIds.has(c.id));
  if (hadDeletedInStorage) {
    classes = classes.filter(c => !deletedClassIds.has(c.id));
    saveToStorage(STORAGE_KEYS.classes, classes);
  }
  
  // Migration: assign academicYear to classes that don't have one
  let needsSave = false;
  classes.forEach(cls => {
    if (cls.casasGainsImportedAt === undefined) {
      cls.casasGainsImportedAt = null;
      needsSave = true;
    }
    if (!cls.academicYear) {
      cls.academicYear = getCurrentAcademicYear();
      needsSave = true;
    }
    // Migration: update old legacy weights to defaults
    if (cls.rankingWeights && (cls.rankingWeights.tests === 30 || cls.rankingWeights.attendance === 20)) {
      cls.rankingWeights = { ...DEFAULT_RANKING_WEIGHTS };
      needsSave = true;
    }
    // Migration: add speaking/writing weights to existing classes
    if (cls.rankingWeights && (cls.rankingWeights.speaking === undefined || cls.rankingWeights.writing === undefined)) {
      cls.rankingWeights = { ...DEFAULT_RANKING_WEIGHTS };
      needsSave = true;
    }
    // Migration: previous default bundles -> latest default bundle
    if (
      cls.rankingWeights &&
      ((cls.rankingWeights.casasReading === 16 &&
        cls.rankingWeights.casasListening === 16 &&
        cls.rankingWeights.tests === 16 &&
        cls.rankingWeights.attendance === 16 &&
        cls.rankingWeights.speaking === 18 &&
        cls.rankingWeights.writing === 18) ||
        (cls.rankingWeights.casasReading === 18 &&
          cls.rankingWeights.casasListening === 18 &&
          cls.rankingWeights.tests === 16 &&
          cls.rankingWeights.attendance === 14 &&
          cls.rankingWeights.speaking === 14 &&
          cls.rankingWeights.writing === 18))
    ) {
      cls.rankingWeights = { ...DEFAULT_RANKING_WEIGHTS };
      needsSave = true;
    }
  });
  if (needsSave) {
    saveToStorage(STORAGE_KEYS.classes, classes);
  }
  
  return classes;
}

export function getClassesByYear(academicYear: string): Class[] {
  return getClasses().filter(cls => cls.academicYear === academicYear);
}

export function saveClasses(classes: Class[]): void {
  saveToStorage(STORAGE_KEYS.classes, classes);
  triggerSync();
}

export function createClass(name: string, schedule: string, level: CACELevel = 3): Class {
  // Calculate CASAS targets based on level
  // Target is to reach the NEXT level
  const currentLevel = CACE_LEVELS[level];
  const nextLevel = level < 5 ? CACE_LEVELS[(level + 1) as CACELevel] : currentLevel;
  
  const newClass: Class = {
    id: generateId(),
    name,
    academicYear: getCurrentAcademicYear(),
    schedule,
    level,
    // Level start is bottom of current range, target is bottom of next range
    casasReadingLevelStart: currentLevel.readingRange[0],
    casasReadingTarget: level < 5 ? nextLevel.readingRange[0] : currentLevel.readingRange[1],
    casasListeningLevelStart: currentLevel.listeningRange[0],
    casasListeningTarget: level < 5 ? nextLevel.listeningRange[0] : currentLevel.listeningRange[1],
    rankingWeights: { ...DEFAULT_RANKING_WEIGHTS },
    colorThresholds: { ...DEFAULT_COLOR_THRESHOLDS },
    casasGainsImportedAt: null,
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
  // Get students in this class before deleting (need their IDs for cloud cleanup)
  const studentsToDelete = getStudents().filter(s => s.classId === classId);
  const studentIdsToDelete = new Set(studentsToDelete.map(s => s.id));

  // Record deleted IDs so cloud sync won't re-add them (e.g. if cloud delete fails or RLS blocks it)
  const deletedClassIds = new Set(getFromStorage<string[]>(STORAGE_KEYS.deletedClassIds, []));
  const deletedStudentIds = new Set(getFromStorage<string[]>(STORAGE_KEYS.deletedStudentIds, []));
  deletedClassIds.add(classId);
  studentsToDelete.forEach(s => deletedStudentIds.add(s.id));
  saveToStorage(STORAGE_KEYS.deletedClassIds, Array.from(deletedClassIds));
  saveToStorage(STORAGE_KEYS.deletedStudentIds, Array.from(deletedStudentIds));

  // Delete from local storage
  const classes = getClasses().filter(c => c.id !== classId);
  saveClasses(classes);

  // Also delete all students in this class
  const students = getStudents().filter(s => s.classId !== classId);
  saveStudents(students);

  // Delete all related data for these students
  const casasTests = getCASASTests().filter(t => !studentIdsToDelete.has(t.studentId));
  saveCASASTests(casasTests);

  const unitTests = getUnitTests().filter(t => !studentIdsToDelete.has(t.studentId));
  saveUnitTests(unitTests);

  const attendance = getAttendance().filter(a => !studentIdsToDelete.has(a.studentId));
  saveAttendance(attendance);

  const reportCards = getReportCards().filter(r => !studentIdsToDelete.has(r.studentId));
  saveReportCards(reportCards);

  const isstRecords = getISSTRecords().filter(r => !studentIdsToDelete.has(r.studentId));
  saveISSTRecords(isstRecords);

  const studentNotes = getStudentNotes().filter(n => !studentIdsToDelete.has(n.studentId));
  saveStudentNotes(studentNotes);

  const speakingTestIdsToRemove = getSpeakingTests()
    .filter(t => t.classId === classId)
    .map(t => t.id);
  saveSpeakingTests(getSpeakingTests().filter(t => t.classId !== classId));
  saveSpeakingTestResults(
    getSpeakingTestResults().filter(r => !speakingTestIdsToRemove.includes(r.testId)),
  );

  const writingTestIdsToRemove = getWritingTests()
    .filter(t => t.classId === classId)
    .map(t => t.id);
  saveWritingTests(getWritingTests().filter(t => t.classId !== classId));
  saveWritingTestResults(
    getWritingTestResults().filter(r => !writingTestIdsToRemove.includes(r.testId)),
  );

  // Delete from cloud (async, fire and forget)
  deleteFromCloud('classes', classId).catch(err => console.error('Failed to delete class from cloud:', err));

  // Delete students and their data from cloud
  for (const student of studentsToDelete) {
    deleteFromCloud('students', student.id).catch(err => console.error('Failed to delete student from cloud:', err));
  }
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
  const students = getFromStorage<Student[]>(STORAGE_KEYS.students, []);
  let needsSave = false;
  for (const s of students) {
    if (s.isPromoted === undefined) {
      (s as Student).isPromoted = false;
      (s as Student).promotedDate = null;
      needsSave = true;
    }
    if (s.casasReadingGain === undefined) {
      (s as Student).casasReadingGain = null;
      (s as Student).casasListeningGain = null;
      (s as Student).casasReadingLevelComplete = false;
      (s as Student).casasListeningLevelComplete = false;
      needsSave = true;
    }
  }
  if (needsSave) {
    saveToStorage(STORAGE_KEYS.students, students);
  }
  return students;
}

export function saveStudents(students: Student[]): void {
  saveToStorage(STORAGE_KEYS.students, students);
  triggerSync();
}

/** Active = not dropped and not promoted. `includeInactive` includes dropped and promoted (same classId). */
export function getStudentsByClass(classId: string, includeInactive = false): Student[] {
  return getStudents().filter(s => {
    if (s.classId !== classId) return false;
    const onActiveRoster = !s.isDropped && !s.isPromoted;
    return includeInactive || onActiveRoster;
  });
}

export function getDroppedStudents(): Student[] {
  return getStudents().filter(s => s.isDropped && !s.isPromoted);
}

export function getPromotedStudents(): Student[] {
  return getStudents().filter(s => s.isPromoted);
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
    isPromoted: false,
    promotedDate: null,
    casasReadingGain: null,
    casasListeningGain: null,
    casasReadingLevelComplete: false,
    casasListeningLevelComplete: false,
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
    isPromoted: false,
    promotedDate: null,
  });
}

export function promoteStudent(studentId: string): void {
  updateStudent(studentId, {
    isPromoted: true,
    promotedDate: new Date().toISOString().split('T')[0],
    isDropped: false,
    droppedDate: null,
  });
}

export function restoreStudent(studentId: string, newClassId: string): void {
  updateStudent(studentId, {
    isDropped: false,
    droppedDate: null,
    isPromoted: false,
    promotedDate: null,
    classId: newClassId,
  });
}

/**
 * Move student to another class with all linked data (same student id).
 * Clears drop/promote so they start active in the new class.
 * They disappear from the old class roster, so old-class retention is unchanged (not counted as a drop).
 */
export function transferStudent(studentId: string, newClassId: string): void {
  const student = getStudents().find(s => s.id === studentId);
  const oldClassId = student?.classId;
  updateStudent(studentId, {
    classId: newClassId,
    isDropped: false,
    droppedDate: null,
    isPromoted: false,
    promotedDate: null,
  });
}

/** @deprecated Prefer transferStudent (same behavior). */
export function moveStudent(studentId: string, newClassId: string): void {
  transferStudent(studentId, newClassId);
}

export function findStudentByName(name: string, classId: string, includeInactive = false): Student | undefined {
  const normalizedName = name.trim().toLowerCase();
  return getStudentsByClass(classId, includeInactive).find(
    s => s.name.trim().toLowerCase() === normalizedName
  );
}

/** Finds a student by name in the class (including dropped). If none, creates a new active student. Used by CASAS import so scores attach to dropped students instead of creating duplicates. */
export function findOrCreateStudent(name: string, classId: string): Student {
  const existing = findStudentByName(name, classId, true);
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
  triggerSync();
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
  // Delete from cloud
  deleteFromCloud('casas_tests', testId).catch(err => console.error('Failed to delete CASAS test from cloud:', err));
}

// ============================================
// Unit Tests
// ============================================

export function getUnitTests(): UnitTest[] {
  return getFromStorage<UnitTest[]>(STORAGE_KEYS.unitTests, []);
}

export function saveUnitTests(tests: UnitTest[]): void {
  saveToStorage(STORAGE_KEYS.unitTests, tests);
  triggerSync();
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
  // Delete from cloud
  deleteFromCloud('unit_tests', testId).catch(err => console.error('Failed to delete unit test from cloud:', err));
}

// ============================================
// Speaking tests
// ============================================

export function getSpeakingTests(): SpeakingTest[] {
  const tests = getFromStorage<SpeakingTest[]>(STORAGE_KEYS.speakingTests, []);
  let needsSave = false;
  for (const test of tests) {
    if (test.exitAssessmentType === undefined) {
      test.exitAssessmentType = 'none';
      needsSave = true;
    }
  }
  if (needsSave) {
    saveSpeakingTests(tests);
  }
  return tests;
}

export function saveSpeakingTests(rows: SpeakingTest[]): void {
  saveToStorage(STORAGE_KEYS.speakingTests, rows);
  triggerSync();
}

export function getSpeakingTestsByClass(classId: string): SpeakingTest[] {
  return getSpeakingTests()
    .filter(t => t.classId === classId)
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

export function addSpeakingTest(
  classId: string,
  title: string,
  date: string,
  totalPoints: number,
  passingScore: number,
  exitAssessmentType: 'none' | 'midterm' | 'final' = 'none',
): SpeakingTest {
  const now = new Date().toISOString();
  const row: SpeakingTest = {
    id: generateId(),
    classId,
    title: title.trim() || 'Untitled',
    exitAssessmentType,
    date,
    totalPoints,
    passingScore,
    createdAt: now,
    updatedAt: now,
  };
  const all = getSpeakingTests();
  saveSpeakingTests([...all, row]);
  return row;
}

export function updateSpeakingTest(
  testId: string,
  updates: Partial<Pick<SpeakingTest, 'title' | 'date' | 'totalPoints' | 'passingScore' | 'exitAssessmentType'>>,
): SpeakingTest | null {
  const all = getSpeakingTests();
  const index = all.findIndex(t => t.id === testId);
  if (index === -1) return null;
  const next = {
    ...all[index],
    ...updates,
    title: typeof updates.title === 'string' ? updates.title.trim() || 'Untitled' : all[index].title,
    updatedAt: new Date().toISOString(),
  };
  const updated = [...all.slice(0, index), next, ...all.slice(index + 1)];
  saveSpeakingTests(updated);
  return next;
}

export function deleteSpeakingTest(testId: string): void {
  saveSpeakingTests(getSpeakingTests().filter(t => t.id !== testId));
  saveSpeakingTestResults(getSpeakingTestResults().filter(r => r.testId !== testId));
  deleteFromCloud('speaking_tests', testId).catch(err =>
    console.error('Failed to delete speaking test from cloud:', err),
  );
}

export function getSpeakingTestResults(): SpeakingTestResult[] {
  return getFromStorage<SpeakingTestResult[]>(STORAGE_KEYS.speakingTestResults, []);
}

export function saveSpeakingTestResults(rows: SpeakingTestResult[]): void {
  saveToStorage(STORAGE_KEYS.speakingTestResults, rows);
  triggerSync();
}

export function getSpeakingResultsByTest(testId: string): SpeakingTestResult[] {
  return getSpeakingTestResults().filter(r => r.testId === testId);
}

export function upsertSpeakingResultScore(testId: string, studentId: string, score: number | null): SpeakingTestResult {
  const all = getSpeakingTestResults();
  const index = all.findIndex(r => r.testId === testId && r.studentId === studentId);
  const now = new Date().toISOString();
  if (index === -1) {
    const row: SpeakingTestResult = {
      id: generateId(),
      testId,
      studentId,
      score,
      comment: '',
      createdAt: now,
      updatedAt: now,
    };
    all.push(row);
    saveSpeakingTestResults(all);
    return row;
  }
  all[index] = { ...all[index], score, updatedAt: now };
  saveSpeakingTestResults(all);
  return all[index];
}

export function upsertSpeakingResultComment(testId: string, studentId: string, comment: string): SpeakingTestResult {
  const all = getSpeakingTestResults();
  const index = all.findIndex(r => r.testId === testId && r.studentId === studentId);
  const now = new Date().toISOString();
  if (index === -1) {
    const row: SpeakingTestResult = {
      id: generateId(),
      testId,
      studentId,
      score: null,
      comment,
      createdAt: now,
      updatedAt: now,
    };
    all.push(row);
    saveSpeakingTestResults(all);
    return row;
  }
  all[index] = { ...all[index], comment, updatedAt: now };
  saveSpeakingTestResults(all);
  return all[index];
}

// ============================================
// Writing tests
// ============================================

export function getWritingTests(): WritingTest[] {
  const tests = getFromStorage<WritingTest[]>(STORAGE_KEYS.writingTests, []);
  let needsSave = false;
  for (const test of tests) {
    if (test.exitAssessmentType === undefined) {
      test.exitAssessmentType = 'none';
      needsSave = true;
    }
  }
  if (needsSave) {
    saveWritingTests(tests);
  }
  return tests;
}

export function saveWritingTests(rows: WritingTest[]): void {
  saveToStorage(STORAGE_KEYS.writingTests, rows);
  triggerSync();
}

export function getWritingTestsByClass(classId: string): WritingTest[] {
  return getWritingTests()
    .filter(t => t.classId === classId)
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

export function addWritingTest(
  classId: string,
  title: string,
  date: string,
  totalPoints: number,
  passingScore: number,
  exitAssessmentType: 'none' | 'midterm' | 'final' = 'none',
): WritingTest {
  const now = new Date().toISOString();
  const row: WritingTest = {
    id: generateId(),
    classId,
    title: title.trim() || 'Untitled',
    exitAssessmentType,
    date,
    totalPoints,
    passingScore,
    createdAt: now,
    updatedAt: now,
  };
  const all = getWritingTests();
  saveWritingTests([...all, row]);
  return row;
}

export function updateWritingTest(
  testId: string,
  updates: Partial<Pick<WritingTest, 'title' | 'date' | 'totalPoints' | 'passingScore' | 'exitAssessmentType'>>,
): WritingTest | null {
  const all = getWritingTests();
  const index = all.findIndex(t => t.id === testId);
  if (index === -1) return null;
  const next = {
    ...all[index],
    ...updates,
    title: typeof updates.title === 'string' ? updates.title.trim() || 'Untitled' : all[index].title,
    updatedAt: new Date().toISOString(),
  };
  const updated = [...all.slice(0, index), next, ...all.slice(index + 1)];
  saveWritingTests(updated);
  return next;
}

export function deleteWritingTest(testId: string): void {
  saveWritingTests(getWritingTests().filter(t => t.id !== testId));
  saveWritingTestResults(getWritingTestResults().filter(r => r.testId !== testId));
  deleteFromCloud('writing_tests', testId).catch(err =>
    console.error('Failed to delete writing test from cloud:', err),
  );
}

export function getWritingTestResults(): WritingTestResult[] {
  return getFromStorage<WritingTestResult[]>(STORAGE_KEYS.writingTestResults, []);
}

export function saveWritingTestResults(rows: WritingTestResult[]): void {
  saveToStorage(STORAGE_KEYS.writingTestResults, rows);
  triggerSync();
}

export function getWritingResultsByTest(testId: string): WritingTestResult[] {
  return getWritingTestResults().filter(r => r.testId === testId);
}

export function upsertWritingResultScore(testId: string, studentId: string, score: number | null): WritingTestResult {
  const all = getWritingTestResults();
  const index = all.findIndex(r => r.testId === testId && r.studentId === studentId);
  const now = new Date().toISOString();
  if (index === -1) {
    const row: WritingTestResult = {
      id: generateId(),
      testId,
      studentId,
      score,
      comment: '',
      createdAt: now,
      updatedAt: now,
    };
    all.push(row);
    saveWritingTestResults(all);
    return row;
  }
  all[index] = { ...all[index], score, updatedAt: now };
  saveWritingTestResults(all);
  return all[index];
}

export function upsertWritingResultComment(testId: string, studentId: string, comment: string): WritingTestResult {
  const all = getWritingTestResults();
  const index = all.findIndex(r => r.testId === testId && r.studentId === studentId);
  const now = new Date().toISOString();
  if (index === -1) {
    const row: WritingTestResult = {
      id: generateId(),
      testId,
      studentId,
      score: null,
      comment,
      createdAt: now,
      updatedAt: now,
    };
    all.push(row);
    saveWritingTestResults(all);
    return row;
  }
  all[index] = { ...all[index], comment, updatedAt: now };
  saveWritingTestResults(all);
  return all[index];
}

// ============================================
// Attendance
// ============================================

export function getAttendance(): Attendance[] {
  return getFromStorage<Attendance[]>(STORAGE_KEYS.attendance, []);
}

export function saveAttendance(attendance: Attendance[]): void {
  saveToStorage(STORAGE_KEYS.attendance, attendance);
  triggerSync();
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
  const allAttendance = getAttendance();
  const toDelete = allAttendance.find(a => a.studentId === studentId && a.month === month);
  const attendance = allAttendance.filter(
    a => !(a.studentId === studentId && a.month === month)
  );
  saveAttendance(attendance);
  // Delete from cloud
  if (toDelete) {
    deleteFromCloud('attendance', toDelete.id).catch(err => console.error('Failed to delete attendance from cloud:', err));
  }
}

// ============================================
// Report Cards
// ============================================

export function getReportCards(): ReportCard[] {
  return getFromStorage<ReportCard[]>(STORAGE_KEYS.reportCards, []);
}

export function saveReportCards(reportCards: ReportCard[]): void {
  saveToStorage(STORAGE_KEYS.reportCards, reportCards);
  triggerSync();
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
  // Delete from cloud
  deleteFromCloud('report_cards', reportCardId).catch(err => console.error('Failed to delete report card from cloud:', err));
}

// ============================================
// Archive
// ============================================

export function getArchivedYears(): ArchivedYear[] {
  return getFromStorage<ArchivedYear[]>(STORAGE_KEYS.archivedYears, []);
}

export function saveArchivedYears(years: ArchivedYear[]): void {
  saveToStorage(STORAGE_KEYS.archivedYears, years);
  // Note: Archived years are stored locally only (too large for cloud sync)
  // Consider manual export/backup for archived data
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
      speakingTests: getSpeakingTests(),
      speakingTestResults: getSpeakingTestResults(),
      writingTests: getWritingTests(),
      writingTestResults: getWritingTestResults(),
      studentNotes: getStudentNotes(),
      isstRecords: getISSTRecords(),
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
  saveSpeakingTests([]);
  saveSpeakingTestResults([]);
  saveWritingTests([]);
  saveWritingTestResults([]);
  saveStudentNotes([]);
  saveISSTRecords([]);
  setCurrentClassId(null);

  return archive;
}

// ============================================
// Student Notes CRUD
// ============================================

function getStudentNotes(): StudentNote[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.studentNotes);
  return data ? JSON.parse(data) : [];
}

function saveStudentNotes(notes: StudentNote[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.studentNotes, JSON.stringify(notes));
  triggerSync();
}

export function getNotesByStudent(studentId: string): StudentNote[] {
  return getStudentNotes()
    .filter(n => n.studentId === studentId)
    .sort((a, b) => b.date.localeCompare(a.date)); // Most recent first
}

export function getNotesByClass(classId: string): StudentNote[] {
  const students = getStudentsByClass(classId);
  const studentIds = new Set(students.map(s => s.id));
  return getStudentNotes().filter(n => studentIds.has(n.studentId));
}

export function addStudentNote(studentId: string, content: string, date: string): StudentNote {
  const notes = getStudentNotes();
  const newNote: StudentNote = {
    id: generateId(),
    studentId,
    content,
    date,
    createdAt: new Date().toISOString(),
  };
  notes.push(newNote);
  saveStudentNotes(notes);
  return newNote;
}

export function deleteStudentNote(noteId: string): void {
  const notes = getStudentNotes();
  const filtered = notes.filter(n => n.id !== noteId);
  saveStudentNotes(filtered);
  // Delete from cloud
  deleteFromCloud('student_notes', noteId).catch(err => console.error('Failed to delete student note from cloud:', err));
}

export function updateStudentNote(noteId: string, content: string, date: string): void {
  const notes = getStudentNotes();
  const index = notes.findIndex(n => n.id === noteId);
  if (index >= 0) {
    notes[index].content = content;
    notes[index].date = date;
    saveStudentNotes(notes);
  }
}

export function migrateOldNotesToNewSystem(classId: string): void {
  const students = getStudentsByClass(classId);
  const existingNotes = getStudentNotes();
  const existingStudentIds = new Set(existingNotes.map(n => n.studentId));
  
  // Migrate students with old-style notes that haven't been migrated yet
  for (const student of students) {
    if (student.notes && student.notes.trim() && !existingStudentIds.has(student.id)) {
      // Create a note from the old notes field
      addStudentNote(student.id, student.notes, new Date().toISOString().split('T')[0]);
    }
  }
}

// ============================================
// ISST Records CRUD
// ============================================

/** Supabase/text columns sometimes return dates as a JSON string instead of an array */
function normalizeISSTDatesField(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return normalizeISSTDatesField(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeISSTRecord(record: ISSTRecord): ISSTRecord {
  return {
    ...record,
    dates: normalizeISSTDatesField((record as { dates?: unknown }).dates),
  };
}

function getISSTRecords(): ISSTRecord[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.isstRecords);
  if (!data) return [];
  try {
    const raw = JSON.parse(data) as ISSTRecord[];
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeISSTRecord);
  } catch {
    return [];
  }
}

function saveISSTRecords(records: ISSTRecord[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.isstRecords, JSON.stringify(records));
  triggerSync();
}

export function getISSTRecordsByStudent(studentId: string): ISSTRecord[] {
  return getISSTRecords().filter(r => r.studentId === studentId);
}

export function getISSTRecordsByClass(classId: string): ISSTRecord[] {
  const students = getStudentsByClass(classId);
  const studentIds = new Set(students.map(s => s.id));
  return getISSTRecords().filter(r => studentIds.has(r.studentId));
}

export function getISSTRecord(studentId: string, month: string): ISSTRecord | undefined {
  return getISSTRecords().find(r => r.studentId === studentId && r.month === month);
}

export function addISSTDate(studentId: string, month: string, date: string): ISSTRecord {
  const records = getISSTRecords();
  const existingIndex = records.findIndex(r => r.studentId === studentId && r.month === month);
  
  if (existingIndex >= 0) {
    // Add date to existing record if not already present
    if (!records[existingIndex].dates.includes(date)) {
      records[existingIndex].dates.push(date);
      records[existingIndex].dates.sort();
      records[existingIndex].updatedAt = new Date().toISOString();
    }
    saveISSTRecords(records);
    return records[existingIndex];
  } else {
    // Create new record
    const newRecord: ISSTRecord = {
      id: generateId(),
      studentId,
      month,
      dates: [date],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    records.push(newRecord);
    saveISSTRecords(records);
    return newRecord;
  }
}

export function removeISSTDate(studentId: string, month: string, date: string): void {
  const records = getISSTRecords();
  const existingIndex = records.findIndex(r => r.studentId === studentId && r.month === month);
  
  if (existingIndex >= 0) {
    const recordId = records[existingIndex].id;
    records[existingIndex].dates = records[existingIndex].dates.filter(d => d !== date);
    records[existingIndex].updatedAt = new Date().toISOString();
    
    // Remove record entirely if no dates left
    if (records[existingIndex].dates.length === 0) {
      records.splice(existingIndex, 1);
      // Delete from cloud since record is removed
      deleteFromCloud('isst_records', recordId).catch(err => console.error('Failed to delete ISST record from cloud:', err));
    }
    
    saveISSTRecords(records);
  }
}

export function updateISSTDates(studentId: string, month: string, dates: string[]): ISSTRecord | null {
  const records = getISSTRecords();
  const existingIndex = records.findIndex(r => r.studentId === studentId && r.month === month);
  
  if (dates.length === 0) {
    // Remove record if no dates
    if (existingIndex >= 0) {
      records.splice(existingIndex, 1);
      saveISSTRecords(records);
    }
    return null;
  }
  
  if (existingIndex >= 0) {
    records[existingIndex].dates = [...dates].sort();
    records[existingIndex].updatedAt = new Date().toISOString();
    saveISSTRecords(records);
    return records[existingIndex];
  } else {
    const newRecord: ISSTRecord = {
      id: generateId(),
      studentId,
      month,
      dates: [...dates].sort(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    records.push(newRecord);
    saveISSTRecords(records);
    return newRecord;
  }
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
    studentNotes: getStudentNotes(),
    isstRecords: getISSTRecords(),
    speakingTests: getSpeakingTests(),
    speakingTestResults: getSpeakingTestResults(),
    writingTests: getWritingTests(),
    writingTestResults: getWritingTestResults(),
    archivedYears: getArchivedYears(),
    deletedClassIds: Array.from(getDeletedClassIdSet()),
    deletedStudentIds: Array.from(getDeletedStudentIdSet()),
    teacherName: getTeacherName(),
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
    if (data.studentNotes) saveStudentNotes(data.studentNotes);
    if (data.isstRecords) saveISSTRecords(data.isstRecords);
    if (data.speakingTests) saveSpeakingTests(data.speakingTests);
    if (data.speakingTestResults) saveSpeakingTestResults(data.speakingTestResults);
    if (data.writingTests) saveWritingTests(data.writingTests);
    if (data.writingTestResults) saveWritingTestResults(data.writingTestResults);
    if (data.archivedYears) saveArchivedYears(data.archivedYears);
    if (Array.isArray(data.deletedClassIds)) {
      saveToStorage(STORAGE_KEYS.deletedClassIds, data.deletedClassIds);
    }
    if (Array.isArray(data.deletedStudentIds)) {
      saveToStorage(STORAGE_KEYS.deletedStudentIds, data.deletedStudentIds);
    }
    if (typeof data.teacherName === 'string') {
      setTeacherName(data.teacherName);
    }
    triggerSync();
    return true;
  } catch {
    return false;
  }
}
