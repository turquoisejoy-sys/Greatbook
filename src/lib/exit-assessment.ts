/** Level exit sheet rules (aligned with CASAS / oral / writing cut scores for intermediate exit). */

export const DEFAULT_ORAL_PASS = 12;
export const DEFAULT_ORAL_MAX = 16;
export const DEFAULT_WRITING_PASS = 24;
export const DEFAULT_WRITING_MAX = 36;
export const PROMO_TESTS_NEEDED = 3;
export const PROMO_TESTS_TOTAL = 4;

export function isPass(score: number | null, minInclusive: number): boolean {
  return score !== null && !Number.isNaN(score) && score >= minInclusive;
}

export function countExitPasses(
  reading: number | null,
  listening: number | null,
  oral: number | null,
  writing: number | null,
  readingMin: number,
  listeningMin: number,
  oralMin = DEFAULT_ORAL_PASS,
  writingMin = DEFAULT_WRITING_PASS,
): number {
  let n = 0;
  if (isPass(reading, readingMin)) n += 1;
  if (isPass(listening, listeningMin)) n += 1;
  if (isPass(oral, oralMin)) n += 1;
  if (isPass(writing, writingMin)) n += 1;
  return n;
}

export function isPromoted(
  passCount: number,
  needed: number = PROMO_TESTS_NEEDED,
): boolean {
  return passCount >= needed;
}

export function formatLongDate(isoYmd: string): string {
  const d = new Date(`${isoYmd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoYmd;
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
