/**
 * KPI snapshot + superlatives for the class KPI print tool.
 */

import {
  getStudentsByClass,
  getISSTRecordsByStudent,
} from '@/lib/storage';
import {
  calculate30DayRetention,
  calculateYTDRetention,
  getClassAttendanceAverage,
  getStudentsWithRanksByClassId,
} from '@/lib/calculations';
import type { StudentWithStats } from '@/types';

export interface KpiSnapshot {
  studentCount: number;
  promotedCount: number;
  pctWithReadingGain: number | null;
  pctWithListeningGain: number | null;
  pctReadingLevelComplete: number | null;
  pctListeningLevelComplete: number | null;
  avgAttendance: number | null;
  thirtyDayRetention: number | null;
  thirtyDayEligible: number;
  thirtyDayRetained: number;
  ytdRetention: number | null;
  ytdEligible: number;
  ytdRetained: number;
}

export function getKpiSnapshot(classId: string, academicYear: string): KpiSnapshot {
  const students = getStudentsByClass(classId);
  const n = students.length;
  const promotedCount = getStudentsByClass(classId, true).filter(s => s.isPromoted).length;
  const withReadingGain = students.filter(s => s.casasReadingGain != null).length;
  const withListeningGain = students.filter(s => s.casasListeningGain != null).length;
  const readingLevelDone = students.filter(s => s.casasReadingLevelComplete).length;
  const listeningLevelDone = students.filter(s => s.casasListeningLevelComplete).length;
  const pct = (count: number) => (n === 0 ? null : (count / n) * 100);

  const thirty = calculate30DayRetention(classId);
  const ytd = calculateYTDRetention(classId, academicYear);

  return {
    studentCount: n,
    promotedCount,
    pctWithReadingGain: pct(withReadingGain),
    pctWithListeningGain: pct(withListeningGain),
    pctReadingLevelComplete: pct(readingLevelDone),
    pctListeningLevelComplete: pct(listeningLevelDone),
    avgAttendance: getClassAttendanceAverage(classId),
    thirtyDayRetention: thirty.rate,
    thirtyDayEligible: thirty.eligible,
    thirtyDayRetained: thirty.retained,
    ytdRetention: ytd.rate,
    ytdEligible: ytd.eligible,
    ytdRetained: ytd.retained,
  };
}

export interface SuperlativeRow {
  category: string;
  names: string[];
  /** Human-readable winning value */
  valueLabel: string;
}

function topTiesByMetric(
  stats: StudentWithStats[],
  getValue: (s: StudentWithStats) => number | null | undefined,
): { names: string[]; value: number } | null {
  const pairs: { s: StudentWithStats; v: number }[] = [];
  for (const s of stats) {
    const v = getValue(s);
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    pairs.push({ s, v });
  }
  if (pairs.length === 0) return null;
  const max = Math.max(...pairs.map(p => p.v));
  const names = pairs.filter(p => p.v === max).map(p => p.s.name);
  return { names, value: max };
}

function isstSessionCount(studentId: string): number {
  return getISSTRecordsByStudent(studentId).reduce((sum, r) => sum + r.dates.length, 0);
}

/**
 * Superlatives = everyone tied for best in each category (active roster only).
 */
export function getSuperlatives(classId: string): SuperlativeRow[] {
  const stats = getStudentsWithRanksByClassId(classId);
  if (stats.length === 0) return [];

  const rows: SuperlativeRow[] = [];

  const att = topTiesByMetric(stats, s => s.attendanceAverage);
  if (att) {
    rows.push({
      category: 'Best attendance (average %)',
      names: att.names,
      valueLabel: `${att.value.toFixed(0)}%`,
    });
  }

  const read = topTiesByMetric(stats, s => s.casasReadingHighest);
  if (read) {
    rows.push({
      category: 'Highest CASAS reading score',
      names: read.names,
      valueLabel: `${read.value.toFixed(0)}`,
    });
  }

  const listen = topTiesByMetric(stats, s => s.casasListeningHighest);
  if (listen) {
    rows.push({
      category: 'Highest CASAS listening score',
      names: listen.names,
      valueLabel: `${listen.value.toFixed(0)}`,
    });
  }

  const tests = topTiesByMetric(stats, s => s.testAverage);
  if (tests) {
    rows.push({
      category: 'Best Unit tests scores (average %)',
      names: tests.names,
      valueLabel: `${tests.value.toFixed(0)}%`,
    });
  }

  const isstPairs: { s: StudentWithStats; v: number }[] = stats.map(s => ({
    s,
    v: isstSessionCount(s.id),
  }));
  const isstMax = Math.max(0, ...isstPairs.map(p => p.v));
  if (isstMax > 0) {
    const isstNames = isstPairs.filter(p => p.v === isstMax).map(p => p.s.name);
    rows.push({
      category: 'Most ISST sessions attended',
      names: isstNames,
      valueLabel: isstMax === 1 ? '1 session' : `${isstMax} sessions`,
    });
  }

  const rg = topTiesByMetric(stats, s =>
    s.casasReadingGain === null || s.casasReadingGain === undefined ? null : s.casasReadingGain,
  );
  if (rg) {
    rows.push({
      category: 'Biggest CASAS reading gain (imported)',
      names: rg.names,
      valueLabel: `${rg.value} pts`,
    });
  }

  const lg = topTiesByMetric(stats, s =>
    s.casasListeningGain === null || s.casasListeningGain === undefined ? null : s.casasListeningGain,
  );
  if (lg) {
    rows.push({
      category: 'Biggest CASAS listening gain (imported)',
      names: lg.names,
      valueLabel: `${lg.value} pts`,
    });
  }

  return rows;
}

export const RETENTION_NOTES = {
  thirtyDay: {
    title: '30-day retention',
    body:
      'Promoted students are not included. For everyone else, we use their first month with real attendance as a starting point. If the class has attendance entered for the next two months after that, they count as eligible. Someone counts as kept if they had attendance (not vacation) in either of those two months—or if they were marked dropped but later had attendance again (came back). The percentage is kept ÷ eligible.',
  },
  ytd: {
    title: 'YTD retention',
    body:
      'Uses this school year starting in August. We include students who enrolled from August through today (promoted students excluded). Someone counts as kept if they are not dropped—or if they dropped but came back (attendance after the drop). The percentage is kept ÷ everyone in that group.',
  },
} as const;
