import * as XLSX from 'xlsx';

export interface FinalScoreImportRow {
  studentName: string;
  score: number;
}

export interface FinalScoreParseResult {
  records: FinalScoreImportRow[];
  errors: string[];
  warnings: string[];
}

const NAME_COLUMNS = ['student name', 'name', 'student', 'full name', 'learner name'];
const FIRST_NAME_COLUMNS = ['first name', 'first', 'firstname', 'given name'];
const LAST_NAME_COLUMNS = ['last name', 'last', 'lastname', 'surname', 'family name'];
const SCORE_COLUMNS = ['score', 'final score', 'grade', 'points', 'result', 'total'];

function normalizeString(value: unknown): string {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function findColumn(headers: string[], possibleNames: string[]): number {
  const normalized = headers.map(h => normalizeString(h));
  for (const name of possibleNames) {
    const exact = normalized.indexOf(name);
    if (exact !== -1) return exact;
  }
  for (const name of possibleNames) {
    const partial = normalized.findIndex(h => h.includes(name));
    if (partial !== -1) return partial;
  }
  return -1;
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value).trim().replace(/,/g, '');
  if (!raw) return null;

  const fractionMatch = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    return Number(fractionMatch[1]);
  }

  const num = Number(raw.replace(/%/g, ''));
  if (!Number.isFinite(num)) return null;
  return num;
}

function pickHeaderRow(data: unknown[][]): {
  rowIndex: number;
  nameCol: number;
  firstNameCol: number;
  lastNameCol: number;
  scoreCol: number;
  scoreHeader: string;
} | null {
  for (let rowIndex = 0; rowIndex < Math.min(data.length, 12); rowIndex++) {
    const headers = (data[rowIndex] || []).map(cell => String(cell || ''));
    if (headers.length === 0) continue;

    const firstNameCol = findColumn(headers, FIRST_NAME_COLUMNS);
    const lastNameCol = findColumn(headers, LAST_NAME_COLUMNS);
    const hasSplitName = firstNameCol !== -1 || lastNameCol !== -1;
    const nameCol = hasSplitName ? -1 : findColumn(headers, NAME_COLUMNS);
    const hasName = nameCol !== -1 || hasSplitName;
    if (!hasName) continue;

    const scoreCol = findColumn(headers, SCORE_COLUMNS);
    if (scoreCol === -1) continue;

    return {
      rowIndex,
      nameCol,
      firstNameCol,
      lastNameCol,
      scoreCol,
      scoreHeader: headers[scoreCol],
    };
  }
  return null;
}

export function parseFinalScoreFile(file: ArrayBuffer): FinalScoreParseResult {
  const result: FinalScoreParseResult = { records: [], errors: [], warnings: [] };

  try {
    const workbook = XLSX.read(file, { type: 'array' });
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (data.length < 2) continue;

      const header = pickHeaderRow(data);
      if (!header) continue;

      result.warnings.push(
        `Sheet "${sheetName}": using row ${header.rowIndex + 1} and score column "${header.scoreHeader}"`,
      );

      for (let rowIndex = header.rowIndex + 1; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex] || [];
        if (row.length === 0) continue;

        let studentName = '';
        if (header.nameCol !== -1) {
          studentName = String(row[header.nameCol] || '').trim();
          if (studentName.includes(',')) {
            const parts = studentName
              .split(',')
              .map(part => part.trim())
              .filter(Boolean);
            if (parts.length >= 2) studentName = `${parts[1]} ${parts[0]}`;
          }
        } else {
          const firstName = header.firstNameCol !== -1 ? String(row[header.firstNameCol] || '').trim() : '';
          const lastName = header.lastNameCol !== -1 ? String(row[header.lastNameCol] || '').trim() : '';
          studentName = [firstName, lastName].filter(Boolean).join(' ').trim();
        }
        if (!studentName) continue;

        const score = parseNumeric(row[header.scoreCol]);
        if (score === null || score < 0) {
          result.warnings.push(`Sheet "${sheetName}" row ${rowIndex + 1}: skipped "${studentName}" (invalid score)`);
          continue;
        }

        result.records.push({
          studentName,
          score: Math.round(score * 100) / 100,
        });
      }
    }

    if (result.records.length === 0) {
      result.errors.push('No valid score rows found. Expected columns for student name and score.');
    }
  } catch (err) {
    result.errors.push(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  return result;
}

export async function parseFinalScoreFileFromInput(file: File): Promise<FinalScoreParseResult> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = event => {
      const data = event.target?.result as ArrayBuffer;
      resolve(parseFinalScoreFile(data));
    };
    reader.onerror = () => {
      resolve({
        records: [],
        errors: ['Failed to read file'],
        warnings: [],
      });
    };
    reader.readAsArrayBuffer(file);
  });
}
