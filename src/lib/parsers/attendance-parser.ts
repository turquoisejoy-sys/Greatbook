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
 * - Total Hours (or "Total Hrs", "Hrs Attended", "Hours Attended")
 * - Scheduled Hours (or "Scheduled Hrs", "Sched Hrs", "Total Scheduled")
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
const NAME_COLUMNS = ['student name', 'name', 'student', 'full name', 'learner name'];
const FIRST_NAME_COLUMNS = ['first name', 'first', 'firstname', 'given name'];
const LAST_NAME_COLUMNS = ['last name', 'last', 'lastname', 'surname', 'family name'];
const TOTAL_HOURS_COLUMNS = ['total hours', 'total hrs', 'hours attended', 'hrs attended', 'attended', 'actual hours', 'actual hrs'];
const SCHEDULED_HOURS_COLUMNS = ['scheduled hours', 'scheduled hrs', 'sched hrs', 'total scheduled', 'scheduled', 'expected hours', 'expected hrs'];

/**
 * Find a column by checking multiple possible names
 */
function findColumn(headers: string[], possibleNames: string[]): number {
  const lowerHeaders = headers.map(h => h?.toString().toLowerCase().trim() || '');
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
    
    // Find column indices
    const nameCol = findColumn(headers, NAME_COLUMNS);
    const firstNameCol = findColumn(headers, FIRST_NAME_COLUMNS);
    const lastNameCol = findColumn(headers, LAST_NAME_COLUMNS);
    const totalHoursCol = findColumn(headers, TOTAL_HOURS_COLUMNS);
    const scheduledHoursCol = findColumn(headers, SCHEDULED_HOURS_COLUMNS);
    
    // Validate required columns
    const hasName = nameCol !== -1 || (firstNameCol !== -1 || lastNameCol !== -1);
    if (!hasName) {
      result.errors.push('Could not find student name column. Expected: "Student Name", "Name", "Last Name", or "First Name"');
    }
    if (totalHoursCol === -1) {
      result.errors.push('Could not find total hours column. Expected: "Total Hours", "Total Hrs", or "Hours Attended"');
    }
    if (scheduledHoursCol === -1) {
      result.errors.push('Could not find scheduled hours column. Expected: "Scheduled Hours", "Scheduled Hrs", or "Sched Hrs"');
    }
    
    if (result.errors.length > 0) {
      return result;
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
      } else {
        const firstName = firstNameCol !== -1 ? String(row[firstNameCol] || '').trim() : '';
        const lastName = lastNameCol !== -1 ? String(row[lastNameCol] || '').trim() : '';
        // Combine as "First Last" or just use what we have
        studentName = [firstName, lastName].filter(Boolean).join(' ').trim();
      }
      
      if (!studentName) {
        // Skip empty rows silently (common in attendance files)
        continue;
      }
      
      // Get hours
      const totalHours = parseNumber(row[totalHoursCol]);
      const scheduledHours = parseNumber(row[scheduledHoursCol]);
      
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
      
      const importRow: AttendanceImportRow = {
        studentName,
        totalHours,
        scheduledHours,
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
