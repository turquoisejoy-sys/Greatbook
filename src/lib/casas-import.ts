import { CASASImportRow } from '@/types';
import { importNamesMatch } from './calculations';
import { CASASParseResult } from './parsers/casas-parser';
import { addCASASTest, getStudentsByClass } from './storage';
import { Student } from '@/types';

export interface CasasStudentImportSummary {
  studentName: string;
  readingAdded: number;
  listeningAdded: number;
}

export interface CasasImportApplyResult {
  readingAdded: number;
  readingSkipped: number;
  listeningAdded: number;
  listeningSkipped: number;
  /** Rows in file for names not on this class roster (not imported). */
  rosterSkipped: number;
  rosterNotFoundNames: string[];
  studentsUpdated: CasasStudentImportSummary[];
  addedTestIds: string[];
  warnings: string[];
}

function findStudentForCasasImport(
  name: string,
  classId: string,
  warnings: string[],
): Student | null {
  const trimmed = name.trim();
  const matches = getStudentsByClass(classId, true).filter(s =>
    importNamesMatch(trimmed, s.name),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    warnings.push(
      `Multiple roster matches for "${trimmed}" — scores applied to ${matches[0].name}.`,
    );
    return matches[0];
  }
  return null;
}

function normalizeFormNumber(form: string): string {
  return form.trim().toUpperCase();
}

function recordStudentUpdate(
  map: Map<string, CasasStudentImportSummary>,
  student: Student,
  kind: 'reading' | 'listening',
): void {
  const key = student.id;
  let entry = map.get(key);
  if (!entry) {
    entry = { studentName: student.name, readingAdded: 0, listeningAdded: 0 };
    map.set(key, entry);
  }
  if (kind === 'reading') entry.readingAdded++;
  else entry.listeningAdded++;
}

/**
 * Import reading and listening rows for students on this class roster only.
 * Skips rows for students in the file who are not on the roster (typical for program-wide exports).
 */
export function applyCasasParseResult(
  classId: string,
  result: CASASParseResult,
): CasasImportApplyResult {
  const warnings: string[] = [...result.warnings];
  const rosterNotFoundSet = new Set<string>();
  const studentsUpdatedMap = new Map<string, CasasStudentImportSummary>();
  const addedTestIds: string[] = [];
  let readingAdded = 0;
  let readingSkipped = 0;
  let listeningAdded = 0;
  let listeningSkipped = 0;
  let rosterSkipped = 0;

  const applyRow = (row: CASASImportRow, kind: 'reading' | 'listening') => {
    const student = findStudentForCasasImport(row.studentName, classId, warnings);

    if (!student) {
      rosterSkipped++;
      rosterNotFoundSet.add(row.studentName.trim());
      return;
    }

    const formNumber = normalizeFormNumber(row.formNumber);
    const test = addCASASTest(student.id, kind, row.date, formNumber, row.score);
    if (test) {
      addedTestIds.push(test.id);
      recordStudentUpdate(studentsUpdatedMap, student, kind);
      if (kind === 'reading') readingAdded++;
      else listeningAdded++;
    } else if (kind === 'reading') readingSkipped++;
    else listeningSkipped++;
  };

  for (const row of result.reading) applyRow(row, 'reading');
  for (const row of result.listening) applyRow(row, 'listening');

  const studentsUpdated = [...studentsUpdatedMap.values()].sort((a, b) =>
    a.studentName.localeCompare(b.studentName),
  );

  return {
    readingAdded,
    readingSkipped,
    listeningAdded,
    listeningSkipped,
    rosterSkipped,
    rosterNotFoundNames: [...rosterNotFoundSet].sort((a, b) => a.localeCompare(b)),
    studentsUpdated,
    addedTestIds,
    warnings,
  };
}
