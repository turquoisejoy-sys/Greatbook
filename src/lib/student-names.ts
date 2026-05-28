import { normalizeNameForMatching, importNamesMatch } from './calculations';
import type { AttendanceImportRow, Student } from '@/types';

/** Display name: "First Last" (first name may include middle names). */
export function buildStudentDisplayName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
}

export function getStudentDisplayName(student: Pick<Student, 'name' | 'firstName' | 'lastName'>): string {
  if (student.firstName?.trim() || student.lastName?.trim()) {
    return buildStudentDisplayName(student.firstName ?? '', student.lastName ?? '');
  }
  return student.name;
}

export function studentNameFieldsFromRecord(record: AttendanceImportRow): {
  firstName: string;
  lastName: string;
  name: string;
} | null {
  const firstName = record.firstName?.trim() ?? '';
  const lastName = record.lastName?.trim() ?? '';
  if (!firstName || !lastName) return null;
  return {
    firstName,
    lastName,
    name: buildStudentDisplayName(firstName, lastName),
  };
}

/** Match import / file name to roster student (handles reversed or legacy single name field). */
export function importNamesMatchStudent(
  importName: string,
  student: Pick<Student, 'name' | 'firstName' | 'lastName'>,
): boolean {
  if (importNamesMatch(importName, student.name)) return true;
  if (student.firstName?.trim() && student.lastName?.trim()) {
    const canonical = buildStudentDisplayName(student.firstName, student.lastName);
    const reversed = buildStudentDisplayName(student.lastName, student.firstName);
    if (importNamesMatch(importName, canonical)) return true;
    if (importNamesMatch(importName, reversed)) return true;
  }
  return false;
}

export function matchAttendanceRecordToStudent(
  record: AttendanceImportRow,
  student: Student,
): boolean {
  if (importNamesMatchStudent(record.studentName, student)) return true;

  const fields = studentNameFieldsFromRecord(record);
  if (!fields) return false;

  const fileCanonical = normalizeNameForMatching(fields.name);
  const fileReversed = normalizeNameForMatching(
    buildStudentDisplayName(fields.lastName, fields.firstName),
  );
  const studentNorm = normalizeNameForMatching(student.name);

  if (studentNorm === fileCanonical || studentNorm === fileReversed) return true;

  const studentLast = student.lastName?.trim()
    ? normalizeNameForMatching(student.lastName)
    : '';
  const fileLast = normalizeNameForMatching(fields.lastName);
  if (studentLast && studentLast === fileLast) {
    const fileFirst = normalizeNameForMatching(fields.firstName);
    const studentFirstBlob = normalizeNameForMatching(
      student.firstName?.trim() || student.name,
    );
    if (
      studentFirstBlob === fileFirst ||
      studentFirstBlob.includes(fileFirst) ||
      fileFirst.includes(studentFirstBlob)
    ) {
      return true;
    }
  }

  return false;
}
