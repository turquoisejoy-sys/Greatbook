import { getStudentsWithRanks } from '@/lib/calculations';
import type { Class, Student } from '@/types';

const TOP_BOTTOM_COUNT = 10;

/** Same top/bottom 10 rules as the Student Analysis page. */
export function getAnalysisTopBottomStudentIds(
  classData: Class,
  students: Student[],
): { top10: Set<string>; bottom10: Set<string>; totalRanked: number } {
  const ranked = getStudentsWithRanks(students, classData);
  const totalRanked = ranked.filter(s => s.isComplete && s.rank !== null).length;
  const top10 = new Set<string>();
  const bottom10 = new Set<string>();

  for (const student of ranked) {
    if (!student.isComplete || student.rank === null) continue;
    if (student.rank <= TOP_BOTTOM_COUNT) top10.add(student.id);
    if (totalRanked > TOP_BOTTOM_COUNT && student.rank > totalRanked - TOP_BOTTOM_COUNT) {
      bottom10.add(student.id);
    }
  }

  return { top10, bottom10, totalRanked };
}

/** Score is within 1 point of the pass cutoff (above or below). */
export function isScoreOnPassingCusp(score: number | null, passMin: number): boolean {
  if (score === null || Number.isNaN(score)) return false;
  return Math.abs(score - passMin) <= 1;
}

export type ExitAssessmentScoreRow = {
  studentId: string;
  readingScore: number | null;
  listeningScore: number | null;
  speakingMidtermScore: number | null;
  writingMidtermScore: number | null;
  speakingFinalScore: number | null;
  writingFinalScore: number | null;
};

export type ExitAssessmentPassThresholds = {
  reading: number;
  listening: number;
  speakingMidterm: number | null;
  writingMidterm: number | null;
  speakingFinal: number | null;
  writingFinal: number | null;
};

/** Any exit score (CASAS, speaking, writing) within 1 point of its pass threshold. */
export function getCuspExitScoreStudentIds(
  rows: ExitAssessmentScoreRow[],
  thresholds: ExitAssessmentPassThresholds,
): string[] {
  const flagged = new Set<string>();

  for (const row of rows) {
    if (isScoreOnPassingCusp(row.readingScore, thresholds.reading)) flagged.add(row.studentId);
    if (isScoreOnPassingCusp(row.listeningScore, thresholds.listening)) flagged.add(row.studentId);
    if (
      thresholds.speakingMidterm !== null &&
      isScoreOnPassingCusp(row.speakingMidtermScore, thresholds.speakingMidterm)
    ) {
      flagged.add(row.studentId);
    }
    if (
      thresholds.writingMidterm !== null &&
      isScoreOnPassingCusp(row.writingMidtermScore, thresholds.writingMidterm)
    ) {
      flagged.add(row.studentId);
    }
    if (
      thresholds.speakingFinal !== null &&
      isScoreOnPassingCusp(row.speakingFinalScore, thresholds.speakingFinal)
    ) {
      flagged.add(row.studentId);
    }
    if (
      thresholds.writingFinal !== null &&
      isScoreOnPassingCusp(row.writingFinalScore, thresholds.writingFinal)
    ) {
      flagged.add(row.studentId);
    }
  }

  return [...flagged];
}

/**
 * Auto-flag Final L4 when analysis rank and exit result are inconsistent:
 * - Top 10 overall but Final L4 NP
 * - Bottom 10 overall but Final L4 P
 */
export function getFinalL4RankMismatchAutoFlagStudentIds(
  classData: Class,
  students: Student[],
  finalPassByStudentId: Map<string, boolean>,
): string[] {
  const { top10, bottom10 } = getAnalysisTopBottomStudentIds(classData, students);
  const flagged: string[] = [];

  for (const studentId of top10) {
    if (finalPassByStudentId.get(studentId) === false) flagged.push(studentId);
  }
  for (const studentId of bottom10) {
    if (finalPassByStudentId.get(studentId) === true) flagged.push(studentId);
  }

  return flagged;
}

/** Union of rank-mismatch and cusp-score auto-flag rules for Final L4 follow-up. */
export function getFinalL4AutoFlagStudentIds(
  classData: Class,
  students: Student[],
  finalPassByStudentId: Map<string, boolean>,
  rows: ExitAssessmentScoreRow[],
  thresholds: ExitAssessmentPassThresholds,
): string[] {
  const mismatch = getFinalL4RankMismatchAutoFlagStudentIds(
    classData,
    students,
    finalPassByStudentId,
  );
  const cusp = getCuspExitScoreStudentIds(rows, thresholds);
  return [...new Set([...mismatch, ...cusp])];
}
