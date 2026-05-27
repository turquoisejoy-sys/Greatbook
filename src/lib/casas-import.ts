import { CASASImportRow } from '@/types';
import { importNamesMatch, normalizeNameForMatching } from './calculations';
import { CASASParseResult } from './parsers/casas-parser';
import {
  addCASASTest,
  getClasses,
  getCASASTestsByStudent,
  getStudents,
  getStudentsByClass,
  reconcileDuplicateStudentCasasForClass,
} from './storage';
import { Student } from '@/types';

export interface CasasStudentImportSummary {
  studentName: string;
  readingAdded: number;
  listeningAdded: number;
  /** CASAS tests on roster after import (helps spot duplicate-record issues). */
  readingTotal: number;
  listeningTotal: number;
}

export interface CasasImportApplyResult {
  readingAdded: number;
  readingSkipped: number;
  listeningAdded: number;
  listeningSkipped: number;
  rosterSkipped: number;
  rosterNotFoundNames: string[];
  /** Name in file but student lives in a different class in the gradebook. */
  rosterWrongClassHints: string[];
  studentsUpdated: CasasStudentImportSummary[];
  addedTestIds: string[];
  warnings: string[];
}

function pickStudentForImportName(
  name: string,
  classId: string,
  warnings: string[],
): Student | null {
  const trimmed = name.trim();
  const matches = getStudentsByClass(classId, true).filter(s =>
    importNamesMatch(trimmed, s.name),
  );
  if (matches.length === 0) return null;

  const active = matches.filter(s => !s.isDropped && !s.isPromoted);
  const normalizedImport = normalizeNameForMatching(trimmed);

  const exactActive = active.filter(
    s => normalizeNameForMatching(s.name) === normalizedImport,
  );
  if (exactActive.length === 1) return exactActive[0];
  if (exactActive.length > 1) {
    warnings.push(
      `Multiple active roster entries for "${trimmed}" — scores applied to ${exactActive[0].name}.`,
    );
    return exactActive[0];
  }
  if (active.length === 1) return active[0];
  if (active.length > 1) {
    warnings.push(
      `Multiple active roster entries for "${trimmed}" — scores applied to ${active[0].name}.`,
    );
    return active[0];
  }

  if (matches.length === 1) {
    warnings.push(
      `"${trimmed}" matched only a dropped/promoted duplicate — scores saved on that old entry, not the active roster.`,
    );
    return matches[0];
  }

  warnings.push(
    `"${trimmed}" matched multiple dropped/promoted entries — scores applied to ${matches[0].name}.`,
  );
  return matches[0];
}

function wrongClassHintsForName(name: string, classId: string): string[] {
  const trimmed = name.trim();
  const hints: string[] = [];
  const classes = getClasses();
  for (const student of getStudents()) {
    if (student.classId === classId) continue;
    if (!importNamesMatch(trimmed, student.name)) continue;
    const cls = classes.find(c => c.id === student.classId);
    const status = student.isPromoted ? 'promoted' : student.isDropped ? 'dropped' : 'active';
    hints.push(`${student.name} is in "${cls?.name ?? 'another class'}" (${status})`);
  }
  return hints;
}

function namesInParseResult(result: CASASParseResult): Set<string> {
  const names = new Set<string>();
  for (const row of [...result.reading, ...result.listening]) {
    if (row.studentName.trim()) names.add(row.studentName.trim());
  }
  return names;
}

function recordStudentUpdate(
  map: Map<string, CasasStudentImportSummary>,
  student: Student,
  kind: 'reading' | 'listening',
): void {
  const key = student.id;
  let entry = map.get(key);
  if (!entry) {
    entry = {
      studentName: student.name,
      readingAdded: 0,
      listeningAdded: 0,
      readingTotal: getCASASTestsByStudent(student.id, 'reading').length,
      listeningTotal: getCASASTestsByStudent(student.id, 'listening').length,
    };
    map.set(key, entry);
  }
  if (kind === 'reading') entry.readingAdded++;
  else entry.listeningAdded++;
}

function finalizeStudentTotals(map: Map<string, CasasStudentImportSummary>): void {
  for (const [studentId, entry] of map) {
    entry.readingTotal = getCASASTestsByStudent(studentId, 'reading').length;
    entry.listeningTotal = getCASASTestsByStudent(studentId, 'listening').length;
    const student = getStudents().find(s => s.id === studentId);
    if (student) entry.studentName = student.name;
  }
}

/** Import reading and listening rows for students on this class roster only. */
export function applyCasasParseResult(
  classId: string,
  result: CASASParseResult,
): CasasImportApplyResult {
  const warnings: string[] = [...result.warnings];
  warnings.push(...reconcileDuplicateStudentCasasForClass(classId));

  const rosterNotFoundSet = new Set<string>();
  const rosterWrongClassHints: string[] = [];
  const studentsUpdatedMap = new Map<string, CasasStudentImportSummary>();
  const addedTestIds: string[] = [];
  let readingAdded = 0;
  let readingSkipped = 0;
  let listeningAdded = 0;
  let listeningSkipped = 0;
  let rosterSkipped = 0;

  const applyRow = (row: CASASImportRow, kind: 'reading' | 'listening') => {
    const student = pickStudentForImportName(row.studentName, classId, warnings);

    if (!student) {
      rosterSkipped++;
      const trimmed = row.studentName.trim();
      rosterNotFoundSet.add(trimmed);
      for (const hint of wrongClassHintsForName(trimmed, classId)) {
        if (!rosterWrongClassHints.includes(hint)) rosterWrongClassHints.push(hint);
      }
      return;
    }

    const formNumber = row.formNumber.trim().toUpperCase();
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

  warnings.push(...reconcileDuplicateStudentCasasForClass(classId));

  finalizeStudentTotals(studentsUpdatedMap);

  for (const name of namesInParseResult(result)) {
    const activeOnRoster = getStudentsByClass(classId).filter(s =>
      importNamesMatch(name, s.name),
    );
    if (activeOnRoster.length !== 1) continue;
    const student = activeOnRoster[0];
    const reading = getCASASTestsByStudent(student.id, 'reading').length;
    const listening = getCASASTestsByStudent(student.id, 'listening').length;
    const fileReading = result.reading.filter(r => importNamesMatch(name, r.studentName)).length;
    const fileListening = result.listening.filter(r => importNamesMatch(name, r.studentName)).length;
    if (fileReading > 0 && reading === 0) {
      warnings.push(
        `"${student.name}" has ${fileReading} reading row(s) in the file but 0 reading scores on the active roster — check Dropped Students for a duplicate entry.`,
      );
    }
    if (fileListening > 0 && listening === 0) {
      warnings.push(
        `"${student.name}" has ${fileListening} listening row(s) in the file but 0 listening scores on the active roster — check Dropped Students for a duplicate entry.`,
      );
    }
  }

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
    rosterWrongClassHints,
    studentsUpdated,
    addedTestIds,
    warnings,
  };
}
