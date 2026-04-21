import type { ProductionRubricField, ProductionRubricScore } from '@/types';

const VALID = (n: number | null | undefined): n is number =>
  n != null && !Number.isNaN(n) && n >= 1 && n <= 4;

/** Mean of entered speaking cells (1–4); null if none. */
export function speakingMean(s: ProductionRubricScore | null | undefined): number | null {
  if (!s) return null;
  const vals = [s.speakFluency, s.speakAccuracy, s.speakPronunciation, s.speakCommunication].filter(VALID);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Mean of entered writing cells (1–4); null if none. */
export function writingMean(s: ProductionRubricScore | null | undefined): number | null {
  if (!s) return null;
  const vals = [
    s.writeContent,
    s.writeOrganization,
    s.writeAccuracy,
    s.writeVocabulary,
    s.writeMechanics,
  ].filter(VALID);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Arithmetic mean of numbers; null if empty. */
export function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function parseRubricCell(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1 || n > 4) return null;
  return n;
}

/** Class mean for one rubric column (only students with a valid 1–4 in that cell). */
export function columnClassMean(
  studentIds: string[],
  rows: Map<string, ProductionRubricScore>,
  field: ProductionRubricField,
): number | null {
  const vals: number[] = [];
  for (const id of studentIds) {
    const v = rows.get(id)?.[field];
    if (VALID(v)) vals.push(v);
  }
  return mean(vals);
}
