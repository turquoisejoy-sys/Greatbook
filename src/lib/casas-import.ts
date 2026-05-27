import { CASASImportRow } from '@/types';
import { CASASParseResult } from './parsers/casas-parser';
import { addCASASTest, findOrCreateStudent, findStudentByName } from './storage';

export interface CasasImportApplyResult {
  readingAdded: number;
  readingSkipped: number;
  listeningAdded: number;
  listeningSkipped: number;
  created: string[];
  addedTestIds: string[];
}

function resolveStudentForImport(
  row: CASASImportRow,
  classId: string,
  created: string[],
): string {
  let student = findStudentByName(row.studentName, classId, true);
  if (!student) {
    student = findOrCreateStudent(row.studentName, classId, row.date);
    if (!created.includes(row.studentName)) created.push(row.studentName);
  }
  return student.id;
}

/** Import reading and listening rows from a Student Test Summary (or similar) parse result. */
export function applyCasasParseResult(
  classId: string,
  result: CASASParseResult,
): CasasImportApplyResult {
  const created: string[] = [];
  const addedTestIds: string[] = [];
  let readingAdded = 0;
  let readingSkipped = 0;
  let listeningAdded = 0;
  let listeningSkipped = 0;

  for (const row of result.reading) {
    const studentId = resolveStudentForImport(row, classId, created);
    const test = addCASASTest(studentId, 'reading', row.date, row.formNumber, row.score);
    if (test) {
      readingAdded++;
      addedTestIds.push(test.id);
    } else {
      readingSkipped++;
    }
  }

  for (const row of result.listening) {
    const studentId = resolveStudentForImport(row, classId, created);
    const test = addCASASTest(studentId, 'listening', row.date, row.formNumber, row.score);
    if (test) {
      listeningAdded++;
      addedTestIds.push(test.id);
    } else {
      listeningSkipped++;
    }
  }

  return {
    readingAdded,
    readingSkipped,
    listeningAdded,
    listeningSkipped,
    created,
    addedTestIds,
  };
}
