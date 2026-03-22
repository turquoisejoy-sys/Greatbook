import * as XLSX from 'xlsx';
import { AttendanceImportRow } from '@/types';

/**
 * Attendance File Parser
 * 
 * Parses Excel files containing monthly attendance data.
 * Calculates percentage from Total Hours ÷ Scheduled Hours.
 * 
 * Expected columns (flexible naming):
 * - Last Name + First Name (or combined "Name", "Student Name")
 * - Total Hours (or "Total Hrs_Reg + Bulk in Date Range", "Total Hrs", "Hours Attended")
 * - Scheduled Hours (or "Class Scheduled Hrs in Date Range", "Scheduled Hrs", "Sched Hrs")
 *
 * If the sheet has per-day hour columns before the totals (e.g. CASAS-style exports),
 * possible hours for each student are derived from those days from the student's first
 * attended day through the end of the range. That fixes mid-month enrollments when the
 * file repeats the same monthly "scheduled" total for everyone.
 * 
 * The month is specified separately when importing (not from the file).
 */

export interface AttendanceParseResult {
  records: AttendanceImportRow[];
  errors: string[];
  warnings: string[];
  summary: {
    totalRecords: number;
    averagePercentage: number;
    belowThreshold: number; // count below 60%
  };
}

// Column name variations
const NAME_COLUMNS = ['student name', 'name', 'student', 'full name', 'learner name', 'learner'];
const FIRST_NAME_COLUMNS = ['first name', 'first', 'firstname', 'given name', 'first_name'];
const LAST_NAME_COLUMNS = ['last name', 'last', 'lastname', 'surname', 'family name', 'last_name'];
// Put specific export column names first so we never grab "Total Hrs_Reg/Bulk" (lifetime) instead of in-range totals.
const TOTAL_HOURS_COLUMNS = [
  'total hrs_reg + bulk in date range',
  'total hours',
  'total hrs',
  'hours attended',
  'hrs attended',
  'attended',
  'actual hours',
  'actual hrs',
];
const SCHEDULED_HOURS_COLUMNS = [
  'class scheduled hrs in date range',
  'scheduled hours',
  'scheduled hrs',
  'sched hrs',
  'total scheduled',
  'scheduled',
  'expected hours',
  'expected hrs',
];
const STATUS_COLUMNS = ['status', 'student status', 'enrollment status', 'exit status', 'dropped', 'learner status'];

/**
 * Normalize a string for column matching (handle various whitespace)
 */
function normalizeString(str: string): string {
  return str?.toString().toLowerCase().replace(/\s+/g, ' ').trim() || '';
}

/**
 * Find a column by checking multiple possible names
 */
function findColumn(headers: string[], possibleNames: string[]): number {
  const lowerHeaders = headers.map(h => normalizeString(h));
  for (const name of possibleNames) {
    const index = lowerHeaders.indexOf(name);
    if (index !== -1) return index;
  }
  // Also try partial matches
  for (const name of possibleNames) {
    const index = lowerHeaders.findIndex(h => h.includes(name));
    if (index !== -1) return index;
  }
  return -1;
}

/**
 * Parse a number from various formats
 */
function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  
  if (typeof value === 'number') return value;
  
  const str = String(value).trim().replace(/,/g, '');
  const num = parseFloat(str);
  
  return isNaN(num) ? null : num;
}

/** Hours in a per-day cell (blank / space = not present that day) */
function parseDailyHours(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return null;
    return value;
  }
  const str = String(value).replace(/\u00a0/g, ' ').trim();
  if (str === '' || str === ' ') return null;
  const num = parseFloat(str.replace(/,/g, ''));
  return Number.isNaN(num) ? null : num;
}

function isLikelyDateColumnHeader(header: string): boolean {
  const h = normalizeString(header);
  if (!h) return false;
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(header)) return true;
  // Excel serial day numbers often appear as integers 40000–50000+
  if (/^\d{5}$/.test(h.replace(/\s/g, ''))) return true;
  return false;
}

/**
 * Per-day columns (between fixed fields and the "total in range" column).
 * Used to compute possible hours for students who joined mid-period when the
 * file repeats the same "scheduled hrs in date range" for everyone.
 */
function detectDateColumnRange(
  headers: string[],
  totalHoursCol: number,
  statusCol: number,
  lastNameCol: number,
  firstNameCol: number,
): { start: number; end: number } | null {
  if (totalHoursCol <= 0) return null;

  let dateStart = -1;
  if (statusCol !== -1) {
    dateStart = statusCol + 1;
  } else {
    const afterNames = Math.max(lastNameCol, firstNameCol);
    dateStart = afterNames !== -1 ? afterNames + 1 : -1;
  }

  if (dateStart < 0 || dateStart >= totalHoursCol) {
    // Infer: first column that looks like dates
    for (let c = 0; c < totalHoursCol; c++) {
      if (isLikelyDateColumnHeader(String(headers[c] || ''))) {
        dateStart = c;
        break;
      }
    }
  }

  const dateEnd = totalHoursCol - 1;
  if (dateStart < 0 || dateStart > dateEnd) return null;
  return { start: dateStart, end: dateEnd };
}

/** Max hours any student had on that day — treat as class capacity for that session */
function computeDayCapacities(
  data: unknown[][],
  dateStart: number,
  dateEnd: number,
): number[] {
  const len = dateEnd - dateStart + 1;
  const caps = new Array(len).fill(0);
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    for (let j = dateStart; j <= dateEnd; j++) {
      const v = parseDailyHours(row[j]);
      if (v !== null && v > caps[j - dateStart]) {
        caps[j - dateStart] = v;
      }
    }
  }
  return caps;
}

/**
 * Possible hours from the student's first day with any attendance in the grid
 * through the end of the date range (sums per-day class capacity).
 */
function scheduledHoursFromDailyGrid(
  row: unknown[],
  dateStart: number,
  dateEnd: number,
  dayCaps: number[],
): number | null {
  let firstJ = -1;
  for (let j = dateStart; j <= dateEnd; j++) {
    if (parseDailyHours(row[j]) !== null) {
      firstJ = j;
      break;
    }
  }
  if (firstJ === -1) return null;

  let sum = 0;
  for (let j = firstJ; j <= dateEnd; j++) {
    sum += dayCaps[j - dateStart] ?? 0;
  }
  return sum > 0 ? sum : null;
}

function sumDailyHours(row: unknown[], dateStart: number, dateEnd: number): number {
  let sum = 0;
  for (let j = dateStart; j <= dateEnd; j++) {
    const v = parseDailyHours(row[j]);
    if (v !== null) sum += v;
  }
  return sum;
}

/** Excel serial date → UTC calendar date string */
function excelSerialToYmd(serial: number): string {
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const msPerDay = 24 * 60 * 60 * 1000;
  const d = new Date(excelEpoch.getTime() + serial * msPerDay);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Column header (date string or Excel serial as string) → YYYY-MM-DD */
function headerToIsoDate(headerCell: string): string | undefined {
  const s = headerCell.trim();
  if (!s) return undefined;
  if (/^\d{5,6}$/.test(s)) {
    const serial = parseInt(s, 10);
    if (serial > 20000 && serial < 80000) return excelSerialToYmd(serial);
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return undefined;
}

/** First class session date for this row (from per-day grid headers). */
function firstAttendanceDateFromGrid(
  row: unknown[],
  dateRange: { start: number; end: number },
  headers: string[],
): string | undefined {
  for (let j = dateRange.start; j <= dateRange.end; j++) {
    if (parseDailyHours(row[j]) === null) continue;
    return headerToIsoDate(String(headers[j] ?? ''));
  }
  return undefined;
}

/**
 * Parse an attendance Excel file
 */
export function parseAttendanceFile(file: ArrayBuffer): AttendanceParseResult {
  const result: AttendanceParseResult = {
    records: [],
    errors: [],
    warnings: [],
    summary: {
      totalRecords: 0,
      averagePercentage: 0,
      belowThreshold: 0,
    },
  };

  try {
    const workbook = XLSX.read(file, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convert to array of arrays
    const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (data.length < 2) {
      result.errors.push('File appears to be empty or has no data rows');
      return result;
    }

    // Find headers (first row)
    const headers = (data[0] as string[]).map(h => String(h || ''));
    
    // Find column indices - FIRST check for separate first/last name columns
    const firstNameCol = findColumn(headers, FIRST_NAME_COLUMNS);
    const lastNameCol = findColumn(headers, LAST_NAME_COLUMNS);
    const totalHoursCol = findColumn(headers, TOTAL_HOURS_COLUMNS);
    const scheduledHoursCol = findColumn(headers, SCHEDULED_HOURS_COLUMNS);
    const statusCol = findColumn(headers, STATUS_COLUMNS);
    
    // Only look for combined name column if we don't have separate first/last columns
    // This prevents "name" from partially matching "Last Name" or "First Name"
    const hasSeparateNameCols = firstNameCol !== -1 || lastNameCol !== -1;
    const nameCol = hasSeparateNameCols ? -1 : findColumn(headers, NAME_COLUMNS);
    
    // Validate required columns
    const hasName = nameCol !== -1 || hasSeparateNameCols;
    if (!hasName) {
      result.errors.push('Could not find student name column. Expected: "Student Name", "Name", "Last Name", or "First Name"');
      result.errors.push(`Found columns: ${headers.join(', ')}`);
    }
    if (totalHoursCol === -1) {
      result.errors.push('Could not find total hours column. Expected: "Total Hours", "Total Hrs", or "Hours Attended"');
    }
    if (scheduledHoursCol === -1) {
      result.errors.push('Could not find scheduled hours column. Expected: "Scheduled Hours", "Scheduled Hrs", or "Sched Hrs"');
    }
    
    // Add info about which name columns were found
    if (hasName) {
      if (nameCol !== -1) {
        result.warnings.push(`Using combined name column: "${headers[nameCol]}"`);
      } else {
        if (firstNameCol !== -1 && lastNameCol !== -1) {
          result.warnings.push(`Using separate name columns: "${headers[firstNameCol]}" + "${headers[lastNameCol]}"`);
        } else if (lastNameCol !== -1) {
          result.warnings.push(`Only found last name column: "${headers[lastNameCol]}" - first names may be missing`);
        } else if (firstNameCol !== -1) {
          result.warnings.push(`Only found first name column: "${headers[firstNameCol]}" - last names may be missing`);
        }
      }
    }
    
    if (result.errors.length > 0) {
      return result;
    }

    const dateRange = detectDateColumnRange(
      headers,
      totalHoursCol,
      statusCol,
      lastNameCol,
      firstNameCol,
    );
    const dayCaps =
      dateRange && dateRange.end >= dateRange.start
        ? computeDayCapacities(data, dateRange.start, dateRange.end)
        : null;

    if (dateRange && dayCaps) {
      result.warnings.push(
        `Detected per-day hour columns (${headers[dateRange.start]} … ${headers[dateRange.end]}); possible hours for each student use class days from their first attended day onward.`,
      );
    }

    // Process data rows
    let totalPercentage = 0;
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i] as unknown[];
      if (!row || row.length === 0) continue;
      
      // Get student name
      let studentName: string;
      if (nameCol !== -1) {
        studentName = String(row[nameCol] || '').trim();
        // Handle "Last, First" format
        if (studentName.includes(',')) {
          const parts = studentName.split(',').map(p => p.trim());
          if (parts.length >= 2) {
            studentName = `${parts[1]} ${parts[0]}`; // Convert to "First Last"
          }
        }
      } else {
        const firstName = firstNameCol !== -1 ? String(row[firstNameCol] || '').trim() : '';
        const lastName = lastNameCol !== -1 ? String(row[lastNameCol] || '').trim() : '';
        // Combine as "First Last" or just use what we have
        if (firstName && lastName) {
          studentName = `${firstName} ${lastName}`;
        } else if (lastName && !firstName) {
          // Only have last name - check if it contains comma (Last, First format)
          if (lastName.includes(',')) {
            const parts = lastName.split(',').map(p => p.trim());
            if (parts.length >= 2) {
              studentName = `${parts[1]} ${parts[0]}`; // Convert to "First Last"
            } else {
              studentName = lastName;
            }
          } else {
            studentName = lastName;
            // Don't warn - this is expected if file only has last names
          }
        } else {
          studentName = firstName || lastName || '';
        }
      }
      
      if (!studentName) {
        // Skip empty rows silently (common in attendance files)
        continue;
      }
      
      // Get hours — prefer report "in date range" total; fall back to sum of daily cells
      let totalHours = parseNumber(row[totalHoursCol]);
      if (totalHours === null && dateRange && dayCaps) {
        totalHours = sumDailyHours(row, dateRange.start, dateRange.end);
      }

      let scheduledHours = parseNumber(row[scheduledHoursCol]);

      if (dateRange && dayCaps) {
        const derivedScheduled = scheduledHoursFromDailyGrid(
          row,
          dateRange.start,
          dateRange.end,
          dayCaps,
        );
        if (derivedScheduled !== null && derivedScheduled > 0) {
          scheduledHours = derivedScheduled;
        }
      }

      if (totalHours === null) {
        result.warnings.push(`Row ${i + 1}: Skipped "${studentName}" - invalid total hours`);
        continue;
      }
      
      if (scheduledHours === null || scheduledHours === 0) {
        result.warnings.push(`Row ${i + 1}: Skipped "${studentName}" - invalid scheduled hours`);
        continue;
      }
      
      // Check for unusual values
      if (totalHours < 0) {
        result.warnings.push(`Row ${i + 1}: "${studentName}" has negative total hours (${totalHours})`);
      }
      
      if (totalHours > scheduledHours) {
        result.warnings.push(`Row ${i + 1}: "${studentName}" has more hours than scheduled (${totalHours}/${scheduledHours}) - attendance will be over 100%`);
      }
      
      const status = statusCol !== -1 ? String(row[statusCol] ?? '').trim() : undefined;
      const suggestedEnrollmentDate =
        dateRange && dayCaps
          ? firstAttendanceDateFromGrid(row, dateRange, headers)
          : undefined;

      const importRow: AttendanceImportRow = {
        studentName,
        totalHours,
        scheduledHours,
        ...(status ? { status } : {}),
        ...(suggestedEnrollmentDate ? { suggestedEnrollmentDate } : {}),
      };
      
      result.records.push(importRow);
      
      // Calculate percentage for summary
      const percentage = (totalHours / scheduledHours) * 100;
      totalPercentage += percentage;
      
      if (percentage < 60) {
        result.summary.belowThreshold++;
      }
    }
    
    // Calculate summary
    result.summary.totalRecords = result.records.length;
    result.summary.averagePercentage = result.records.length > 0 
      ? totalPercentage / result.records.length 
      : 0;
    
    if (result.records.length === 0) {
      result.errors.push('No valid attendance records found in file');
    }
    
  } catch (err) {
    result.errors.push(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
  
  return result;
}

/**
 * Calculate attendance percentage from hours
 */
export function calculateAttendancePercentage(totalHours: number, scheduledHours: number): number {
  if (scheduledHours === 0) return 0;
  return Math.round((totalHours / scheduledHours) * 100 * 10) / 10; // Round to 1 decimal
}

/**
 * Parse a file from a File input element
 */
export async function parseAttendanceFileFromInput(file: File): Promise<AttendanceParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as ArrayBuffer;
      resolve(parseAttendanceFile(data));
    };
    reader.onerror = () => {
      resolve({
        records: [],
        errors: ['Failed to read file'],
        warnings: [],
        summary: { totalRecords: 0, averagePercentage: 0, belowThreshold: 0 },
      });
    };
    reader.readAsArrayBuffer(file);
  });
}
