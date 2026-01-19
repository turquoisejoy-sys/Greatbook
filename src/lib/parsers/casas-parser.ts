import * as XLSX from 'xlsx';
import { CASASImportRow } from '@/types';

/**
 * CASAS File Parser
 * 
 * Parses Excel/CSV files containing CASAS test results.
 * Automatically separates Reading (forms ending in R) from Listening (forms ending in L).
 * 
 * Expected columns (flexible naming):
 * - Student Name (or "Name", "Student", "Last Name" + "First Name")
 * - Date (or "Test Date")
 * - Form (or "Form Number", "Form #")
 * - Score (or "Scale Score", "Scaled Score")
 * 
 * Handles:
 * - Invalid scores marked with "*" → converted to null
 * - Multiple name formats (First Last, Last First, separate columns)
 * - Various date formats
 */

export interface CASASParseResult {
  reading: CASASImportRow[];
  listening: CASASImportRow[];
  errors: string[];
  warnings: string[];
}

// Column name variations we'll accept
const NAME_COLUMNS = ['student name', 'name', 'student', 'full name', 'learner name'];
const FIRST_NAME_COLUMNS = ['first name', 'first', 'firstname', 'given name'];
const LAST_NAME_COLUMNS = ['last name', 'last', 'lastname', 'surname', 'family name'];
const DATE_COLUMNS = ['date', 'test date', 'testdate', 'exam date'];
const FORM_COLUMNS = ['form', 'form number', 'form #', 'form no', 'formnumber', 'test form'];
const SCORE_COLUMNS = ['score', 'scale score', 'scaled score', 'scalescore', 'test score'];

/**
 * Find a column by checking multiple possible names
 */
function findColumn(headers: string[], possibleNames: string[]): number {
  const lowerHeaders = headers.map(h => h?.toString().toLowerCase().trim() || '');
  for (const name of possibleNames) {
    const index = lowerHeaders.indexOf(name);
    if (index !== -1) return index;
  }
  return -1;
}

/**
 * Parse a date string into ISO format (YYYY-MM-DD)
 */
function parseDate(value: unknown): string | null {
  if (!value) return null;
  
  // Handle Excel serial date numbers
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const year = date.y;
      const month = String(date.m).padStart(2, '0');
      const day = String(date.d).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  
  const str = String(value).trim();
  if (!str) return null;
  
  // Try various date formats
  // MM/DD/YYYY or MM-DD-YYYY
  const usFormat = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (usFormat) {
    let year = parseInt(usFormat[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const month = String(usFormat[1]).padStart(2, '0');
    const day = String(usFormat[2]).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // YYYY-MM-DD (already ISO)
  const isoFormat = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoFormat) {
    return `${isoFormat[1]}-${isoFormat[2]}-${isoFormat[3]}`;
  }
  
  // Try native Date parsing as fallback
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }
  
  return null;
}

/**
 * Parse a score value, handling invalid scores marked with "*"
 */
function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  
  const str = String(value).trim();
  
  // Invalid score marker
  if (str === '*' || str.toLowerCase() === 'invalid' || str.toLowerCase() === 'n/a') {
    return null;
  }
  
  const num = parseInt(str);
  if (isNaN(num)) return null;
  
  // CASAS scores are typically 150-260 range
  if (num < 100 || num > 300) {
    // Might be invalid, but we'll still accept it with a warning
    return num;
  }
  
  return num;
}

/**
 * Determine if a form is Reading or Listening based on form number
 * Forms ending in R = Reading, forms ending in L = Listening
 * Forms ending in C = Civics (skip these)
 */
function getTestType(formNumber: string): 'reading' | 'listening' | 'skip' | null {
  const form = formNumber.toUpperCase().trim();
  
  // Forms ending in C are Civics tests - skip silently
  if (form.endsWith('C') || /C\d*$/.test(form)) return 'skip';
  
  // Check last character
  if (form.endsWith('R')) return 'reading';
  if (form.endsWith('L')) return 'listening';
  
  // Some forms might have numbers after the letter (e.g., "627R1")
  // Check for R or L followed by optional numbers
  if (/R\d*$/.test(form)) return 'reading';
  if (/L\d*$/.test(form)) return 'listening';
  
  // Check if R or L appears anywhere (less reliable)
  if (form.includes('R') && !form.includes('L')) return 'reading';
  if (form.includes('L') && !form.includes('R')) return 'listening';
  
  return null;
}

/**
 * Find the header row in the data (may not be the first row due to metadata)
 * Returns the row index and the headers array
 */
function findHeaderRow(data: unknown[][]): { headerIndex: number; headers: string[] } | null {
  // Check first 20 rows for a row that looks like headers
  const maxRowsToCheck = Math.min(20, data.length);
  
  for (let i = 0; i < maxRowsToCheck; i++) {
    const row = data[i] as string[];
    if (!row || row.length < 4) continue;
    
    const rowLower = row.map(cell => String(cell || '').toLowerCase().trim());
    
    // Check if this row contains the expected header columns
    const hasName = rowLower.some(cell => 
      NAME_COLUMNS.includes(cell) || 
      FIRST_NAME_COLUMNS.includes(cell) || 
      LAST_NAME_COLUMNS.includes(cell)
    );
    const hasDate = rowLower.some(cell => DATE_COLUMNS.includes(cell));
    const hasForm = rowLower.some(cell => FORM_COLUMNS.includes(cell));
    const hasScore = rowLower.some(cell => SCORE_COLUMNS.includes(cell));
    
    // If we find at least 3 of 4 expected columns, this is likely the header row
    const matches = [hasName, hasDate, hasForm, hasScore].filter(Boolean).length;
    if (matches >= 3) {
      return {
        headerIndex: i,
        headers: row.map(h => String(h || '')),
      };
    }
  }
  
  return null;
}

/**
 * Parse a CASAS Excel/CSV file
 */
export function parseCASASFile(file: ArrayBuffer): CASASParseResult {
  const result: CASASParseResult = {
    reading: [],
    listening: [],
    errors: [],
    warnings: [],
  };

  try {
    const workbook = XLSX.read(file, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convert to array of arrays
    const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (data.length < 2) {
      result.errors.push('File appears to be empty or has no data rows');
      return result;
    }

    // Find headers (may not be first row - some files have metadata at top)
    const headerResult = findHeaderRow(data);
    if (!headerResult) {
      result.errors.push('Could not find header row. Looking for columns: Student Name, Date, Form, Score');
      return result;
    }
    
    const { headerIndex, headers } = headerResult;
    
    // Find column indices
    const nameCol = findColumn(headers, NAME_COLUMNS);
    const firstNameCol = findColumn(headers, FIRST_NAME_COLUMNS);
    const lastNameCol = findColumn(headers, LAST_NAME_COLUMNS);
    const dateCol = findColumn(headers, DATE_COLUMNS);
    const formCol = findColumn(headers, FORM_COLUMNS);
    const scoreCol = findColumn(headers, SCORE_COLUMNS);
    
    // Validate required columns
    const hasName = nameCol !== -1 || (firstNameCol !== -1 && lastNameCol !== -1);
    if (!hasName) {
      result.errors.push('Could not find student name column. Expected: "Student Name", "Name", or "First Name" + "Last Name"');
    }
    if (dateCol === -1) {
      result.errors.push('Could not find date column. Expected: "Date" or "Test Date"');
    }
    if (formCol === -1) {
      result.errors.push('Could not find form column. Expected: "Form", "Form Number", or "Form #"');
    }
    if (scoreCol === -1) {
      result.errors.push('Could not find score column. Expected: "Score", "Scale Score", or "Scaled Score"');
    }
    
    if (result.errors.length > 0) {
      return result;
    }

    // Process data rows (start after header row)
    for (let i = headerIndex + 1; i < data.length; i++) {
      const row = data[i] as unknown[];
      if (!row || row.length === 0) continue;
      
      // Get student name
      let studentName: string;
      if (nameCol !== -1) {
        studentName = String(row[nameCol] || '').trim();
      } else {
        const firstName = String(row[firstNameCol] || '').trim();
        const lastName = String(row[lastNameCol] || '').trim();
        studentName = `${firstName} ${lastName}`.trim();
      }
      
      if (!studentName) {
        result.warnings.push(`Row ${i + 1}: Skipped - no student name`);
        continue;
      }
      
      // Get date
      const dateValue = parseDate(row[dateCol]);
      if (!dateValue) {
        result.warnings.push(`Row ${i + 1}: Skipped "${studentName}" - invalid date`);
        continue;
      }
      
      // Get form number
      const formNumber = String(row[formCol] || '').trim();
      if (!formNumber) {
        result.warnings.push(`Row ${i + 1}: Skipped "${studentName}" - no form number`);
        continue;
      }
      
      // Determine test type (only Reading 'R' and Listening 'L' - skip all others silently)
      const testType = getTestType(formNumber);
      if (testType === 'skip' || !testType) {
        // Silently skip non-Reading/Listening forms (Civics, Math, etc.)
        continue;
      }
      
      // Get score
      const score = parseScore(row[scoreCol]);
      
      // Check for unusual scores
      if (score !== null && (score < 150 || score > 260)) {
        result.warnings.push(`Row ${i + 1}: "${studentName}" has unusual score ${score} (typical range: 150-260)`);
      }
      
      const importRow: CASASImportRow = {
        studentName,
        date: dateValue,
        formNumber,
        score,
      };
      
      if (testType === 'reading') {
        result.reading.push(importRow);
      } else {
        result.listening.push(importRow);
      }
    }
    
    // Summary
    if (result.reading.length === 0 && result.listening.length === 0) {
      result.errors.push('No valid CASAS records found in file');
    }
    
  } catch (err) {
    result.errors.push(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
  
  return result;
}

/**
 * Parse a file from a File input element
 */
export async function parseCASASFileFromInput(file: File): Promise<CASASParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as ArrayBuffer;
      resolve(parseCASASFile(data));
    };
    reader.onerror = () => {
      resolve({
        reading: [],
        listening: [],
        errors: ['Failed to read file'],
        warnings: [],
      });
    };
    reader.readAsArrayBuffer(file);
  });
}
