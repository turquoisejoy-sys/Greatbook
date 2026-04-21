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
  /** Mean of students with a non-null imported reading gain. */
  avgCasasReadingGain: number | null;
  /** Mean of students with a non-null imported listening gain. */
  avgCasasListeningGain: number | null;
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
  const readingGains = students
    .map(s => s.casasReadingGain)
    .filter((g): g is number => g != null && !Number.isNaN(g));
  const listeningGains = students
    .map(s => s.casasListeningGain)
    .filter((g): g is number => g != null && !Number.isNaN(g));
  const avgReadingGain =
    readingGains.length === 0
      ? null
      : readingGains.reduce((a, b) => a + b, 0) / readingGains.length;
  const avgListeningGain =
    listeningGains.length === 0
      ? null
      : listeningGains.reduce((a, b) => a + b, 0) / listeningGains.length;
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
    avgCasasReadingGain: avgReadingGain,
    avgCasasListeningGain: avgListeningGain,
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

/** One finish line (ties share the same rank). */
export interface SuperlativePlace {
  rank: 1 | 2 | 3;
  names: string[];
  valueLabel: string;
}

export interface SuperlativeRow {
  category: string;
  /** Best first, then 2nd / 3rd distinct scores (ties grouped). */
  places: SuperlativePlace[];
}

function distinctValuePlaces(
  pairs: { name: string; v: number }[],
  higherIsBetter: boolean,
  formatValue: (v: number) => string,
  maxRanks = 3,
): SuperlativePlace[] | null {
  if (pairs.length === 0) return null;
  const distinct = [...new Set(pairs.map(p => p.v))].sort((a, b) =>
    higherIsBetter ? b - a : a - b,
  );
  const places: SuperlativePlace[] = [];
  const n = Math.min(maxRanks, distinct.length);
  for (let i = 0; i < n; i++) {
    const value = distinct[i];
    const names = pairs
      .filter(p => p.v === value)
      .map(p => p.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    places.push({
      rank: (i + 1) as 1 | 2 | 3,
      names,
      valueLabel: formatValue(value),
    });
  }
  return places.length ? places : null;
}

function placesFromStats(
  stats: StudentWithStats[],
  getValue: (s: StudentWithStats) => number | null | undefined,
  formatValue: (v: number) => string,
): SuperlativePlace[] | null {
  const pairs: { name: string; v: number }[] = [];
  for (const s of stats) {
    const v = getValue(s);
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    pairs.push({ name: s.name, v });
  }
  return distinctValuePlaces(pairs, true, formatValue);
}

function isstSessionCount(studentId: string): number {
  return getISSTRecordsByStudent(studentId).reduce((sum, r) => sum + r.dates.length, 0);
}

/**
 * Superlatives: top 3 distinct scores per category (active roster). Ties share a rank;
 * next rank uses the next distinct value (competition / "122" ranking).
 */
export function getSuperlatives(classId: string): SuperlativeRow[] {
  const stats = getStudentsWithRanksByClassId(classId);
  if (stats.length === 0) return [];

  const rows: SuperlativeRow[] = [];

  const att = placesFromStats(stats, s => s.attendanceAverage, v => `${v.toFixed(0)}%`);
  if (att) {
    rows.push({ category: 'Best attendance (average %)', places: att });
  }

  const read = placesFromStats(stats, s => s.casasReadingHighest, v => `${v.toFixed(0)}`);
  if (read) {
    rows.push({ category: 'Highest CASAS reading score', places: read });
  }

  const listen = placesFromStats(stats, s => s.casasListeningHighest, v => `${v.toFixed(0)}`);
  if (listen) {
    rows.push({ category: 'Highest CASAS listening score', places: listen });
  }

  const tests = placesFromStats(stats, s => s.testAverage, v => `${v.toFixed(0)}%`);
  if (tests) {
    rows.push({ category: 'Best Unit tests scores (average %)', places: tests });
  }

  const isstPairs = stats.map(s => ({
    name: s.name,
    v: isstSessionCount(s.id),
  }));
  const isstMax = Math.max(0, ...isstPairs.map(p => p.v));
  if (isstMax > 0) {
    const isstPlaces = distinctValuePlaces(
      isstPairs,
      true,
      v => (v === 1 ? '1 session' : `${v} sessions`),
    );
    if (isstPlaces) {
      rows.push({ category: 'Most ISST sessions attended', places: isstPlaces });
    }
  }

  const rg = placesFromStats(
    stats,
    s =>
      s.casasReadingGain === null || s.casasReadingGain === undefined ? null : s.casasReadingGain,
    v => `${v} pts`,
  );
  if (rg) {
    rows.push({ category: 'Biggest CASAS reading gain (imported)', places: rg });
  }

  const lg = placesFromStats(
    stats,
    s =>
      s.casasListeningGain === null || s.casasListeningGain === undefined ? null : s.casasListeningGain,
    v => `${v} pts`,
  );
  if (lg) {
    rows.push({ category: 'Biggest CASAS listening gain (imported)', places: lg });
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
