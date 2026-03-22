import * as XLSX from 'xlsx';

/**
 * CASAS "Student Gains" export (e.g. StudentGains.xlsx)
 * — multiple rows per student (one per test); Form ends with R (reading) or L (listening).
 * Gain / Complete columns are read per row and rolled up per student per modality.
 */

export interface StudentGainsAggregated {
  readingGain: number | null;
  listeningGain: number | null;
  readingLevelComplete: boolean;
  listeningLevelComplete: boolean;
}

export interface StudentGainsParseResult {
  /** Key: normalized student name (lowercase, trimmed, collapsed spaces) */
  byNormalizedName: Record<string, StudentGainsAggregated>;
  errors: string[];
  warnings: string[];
  /** Report export "Date/Time:" from sheet metadata, if found */
  sourceReportDateTime: string | null;
}

/** Match roster names to Student Gains export rows */
export function normalizeStudentNameKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function parseTestDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return null;
  }
  const str = String(value).trim();
  if (!str) return null;
  const us = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (us) {
    let year = parseInt(us[3], 10);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const month = String(us[1]).padStart(2, '0');
    const day = String(us[2]).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function parseGain(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const s = String(value).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

function parseComplete(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  const s = String(value).trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1';
}

function modalityFromForm(form: string): 'reading' | 'listening' | null {
  const f = form.trim().toUpperCase();
  if (f.endsWith('R')) return 'reading';
  if (f.endsWith('L')) return 'listening';
  return null;
}

function findHeaderRow(matrix: unknown[][]): { rowIndex: number; headers: string[] } | null {
  for (let r = 0; r < Math.min(matrix.length, 40); r++) {
    const row = matrix[r];
    if (!row || row.length < 8) continue;
    const texts = row.map(c => (c === undefined || c === null ? '' : String(c)).toLowerCase().trim());
    const joined = texts.join('|');
    if (
      joined.includes('student name') &&
      (joined.includes('gain') || texts.some(t => t === 'gain')) &&
      texts.some(t => t === 'form' || t.includes('form'))
    ) {
      return {
        rowIndex: r,
        headers: row.map(c => (c === undefined || c === null ? '' : String(c)).trim()),
      };
    }
  }
  return null;
}

function findCol(headers: string[], candidates: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const want of candidates) {
    const w = want.toLowerCase();
    const exact = lower.indexOf(w);
    if (exact !== -1) return exact;
  }
  for (const want of candidates) {
    const w = want.toLowerCase();
    const idx = lower.findIndex(h => h.includes(w));
    if (idx !== -1) return idx;
  }
  return -1;
}

interface RawGainRow {
  studentName: string;
  testDate: string | null;
  form: string;
  gain: number | null;
  complete: boolean;
}

function pickLatestNonNullGain(rows: RawGainRow[]): number | null {
  const sorted = [...rows].sort((a, b) => {
    const ta = a.testDate ? new Date(a.testDate + 'T12:00:00').getTime() : -Infinity;
    const tb = b.testDate ? new Date(b.testDate + 'T12:00:00').getTime() : -Infinity;
    return tb - ta;
  });
  for (const r of sorted) {
    if (r.gain !== null) return r.gain;
  }
  return null;
}

function aggregateRows(raw: RawGainRow[]): Record<string, StudentGainsAggregated> {
  const byStudent = new Map<string, RawGainRow[]>();
  for (const row of raw) {
    const key = normalizeStudentNameKey(row.studentName);
    if (!key) continue;
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key)!.push(row);
  }

  const out: Record<string, StudentGainsAggregated> = {};
  for (const [key, rows] of byStudent) {
    const reading = rows.filter(r => modalityFromForm(r.form) === 'reading');
    const listening = rows.filter(r => modalityFromForm(r.form) === 'listening');

    out[key] = {
      readingGain: pickLatestNonNullGain(reading),
      listeningGain: pickLatestNonNullGain(listening),
      readingLevelComplete: reading.some(r => r.complete),
      listeningLevelComplete: listening.some(r => r.complete),
    };
  }
  return out;
}

function parseSourceDateTime(matrix: unknown[][]): string | null {
  for (let r = 0; r < Math.min(8, matrix.length); r++) {
    const row = matrix[r];
    if (!row?.length) continue;
    const a = String(row[0] ?? '').toLowerCase().trim();
    if (a.includes('date/time') || a.includes('date time')) {
      const b = row[1];
      if (b !== undefined && b !== null && String(b).trim()) {
        return String(b).trim();
      }
    }
  }
  return null;
}

export function parseStudentGainsWorkbook(wb: XLSX.WorkBook): StudentGainsParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { byNormalizedName: {}, errors: ['No sheets in workbook'], warnings: [], sourceReportDateTime: null };
  }

  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
  const sourceReportDateTime = parseSourceDateTime(matrix);

  const found = findHeaderRow(matrix);
  if (!found) {
    return {
      byNormalizedName: {},
      errors: [
        'Could not find a header row with Student Name, Form, and Gain (expected CASAS Student Gains export).',
      ],
      warnings: [],
      sourceReportDateTime,
    };
  }

  const { rowIndex, headers } = found;
  const nameCol = findCol(headers, ['student name']);
  const formCol = findCol(headers, ['form']);
  const dateCol = findCol(headers, [
    'test/obs. date',
    'test/obs date',
    'test date',
    'obs. date',
    'obs date',
  ]);
  const gainCol = findCol(headers, ['gain']);
  let completeCol = headers.findIndex(
    h => h.trim().toLowerCase() === 'complete'
  );
  if (completeCol < 0) {
    completeCol = findCol(headers, ['comp. level', 'level comp', 'level complete']);
  }

  if (nameCol < 0 || formCol < 0 || gainCol < 0) {
    errors.push('Missing required columns (need Student Name, Form, Gain).');
    return { byNormalizedName: {}, errors, warnings, sourceReportDateTime };
  }

  const raw: RawGainRow[] = [];
  for (let r = rowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;
    const studentName = String(row[nameCol] ?? '').trim();
    if (!studentName) continue;

    const form = String(row[formCol] ?? '').trim();
    if (!form || modalityFromForm(form) === null) continue;

    const testDate =
      dateCol >= 0 ? parseTestDate(row[dateCol]) : null;
    const gain = parseGain(row[gainCol]);
    const complete = completeCol >= 0 ? parseComplete(row[completeCol]) : false;

    raw.push({ studentName, testDate, form, gain, complete });
  }

  if (raw.length === 0) {
    warnings.push('No data rows with student names and R/L forms were found.');
  }

  return {
    byNormalizedName: aggregateRows(raw),
    errors,
    warnings,
    sourceReportDateTime,
  };
}

export function parseStudentGainsFile(data: ArrayBuffer): StudentGainsParseResult {
  const wb = XLSX.read(data, { type: 'array' });
  return parseStudentGainsWorkbook(wb);
}

export async function parseStudentGainsFileFromInput(file: File): Promise<StudentGainsParseResult> {
  const buf = await file.arrayBuffer();
  return parseStudentGainsFile(buf);
}
