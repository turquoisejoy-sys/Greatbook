/**
 * Parse Q4 exit worksheet CSV exports (AM/PM) with multiline quoted headers.
 */

export interface ParsedExitWorksheetRow {
  studentId: string;
  lastName: string;
  firstName: string;
  reading: number | null;
  listening: number | null;
  oral: number | null;
  writing: number | null;
}

/** RFC-style CSV parse: commas, quotes, newlines inside quotes. */
export function parseCsvRecords(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  const text = raw.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      cur += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ',') {
      row.push(cur);
      cur = '';
      continue;
    }
    if (c === '\r') continue;
    if (c === '\n') {
      row.push(cur);
      if (row.some(cell => cell.trim().length > 0)) rows.push(row);
      row = [];
      cur = '';
      continue;
    }
    cur += c;
  }
  row.push(cur);
  if (row.some(cell => cell.trim().length > 0)) rows.push(row);
  return rows;
}

export function parseScoreCell(raw: string): number | null {
  const t = raw.trim();
  if (!t || /\(\?\)/i.test(t)) return null;
  const m = t.match(/-?\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0], 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function padRow(row: string[], len: number): string[] {
  const next = [...row];
  while (next.length < len) next.push('');
  return next;
}

export function parseExitWorksheetCsv(raw: string): ParsedExitWorksheetRow[] {
  const records = parseCsvRecords(raw);
  const out: ParsedExitWorksheetRow[] = [];
  for (const rec of records) {
    const r = padRow(rec, 7);
    const id = r[0]?.trim() ?? '';
    if (!/^\d{5,}$/.test(id)) continue;
    const lastName = (r[1] ?? '').trim();
    const firstName = (r[2] ?? '').trim();
    if (!lastName && !firstName) continue;
    out.push({
      studentId: id,
      lastName,
      firstName,
      reading: parseScoreCell(r[3] ?? ''),
      listening: parseScoreCell(r[4] ?? ''),
      oral: parseScoreCell(r[5] ?? ''),
      writing: parseScoreCell(r[6] ?? ''),
    });
  }
  return out;
}

export function worksheetRowsToDisplayName(row: ParsedExitWorksheetRow): string {
  return `${row.firstName} ${row.lastName}`.replace(/\s+/g, ' ').trim();
}

export function inferAmPmFromFilename(name: string): boolean | null {
  const n = name.toLowerCase();
  if (/-\s*am\.csv$/i.test(n.trim()) || /\bam\.csv$/i.test(n.trim())) return true;
  if (/-\s*pm\.csv$/i.test(n.trim()) || /\bpm\.csv$/i.test(n.trim())) return false;
  if (/\bam\b/.test(n)) return true;
  if (/\bpm\b/.test(n)) return false;
  return null;
}
