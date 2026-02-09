import * as XLSX from 'xlsx';
import { UnitTestImportRow } from '@/types';

/**
 * Unit Tests File Parser
 * 
 * Parses Excel/CSV files containing unit test scores.
 * All scores are expected to be 0-100.
 * 
 * Expected columns (flexible naming):
 * - Student Name (or "Name", "Student", "Last Name" + "First Name")
 * - Score (or "Test Score", "Grade", "Points", "Result")
 * 
 * The test name (Unit 1, Unit 2, EL Civics, etc.) is specified separately when importing.
 */

export interface TestsParseResult {
  records: UnitTestImportRow[];
  errors: string[];
  warnings: string[];
  summary: {
    totalRecords: number;
    averageScore: number;
    passing: number;    // count >= 60
    excellent: number;  // count >= 80
  };
}

// Column name variations
const NAME_COLUMNS = ['student name', 'name', 'student', 'full name', 'learner name'];
const FIRST_NAME_COLUMNS = ['first name', 'first', 'firstname', 'given name'];
const LAST_NAME_COLUMNS = ['last name', 'last', 'lastname', 'surname', 'family name'];
const SCORE_COLUMNS = ['score', 'test score', 'grade', 'points', 'result', 'percent', 'percentage', '%'];

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
 * Parse a score from various formats (handles percentages, decimals, etc.)
 */
function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  
  if (typeof value === 'number') {
    // If it's a decimal like 0.85, convert to percentage
    if (value >= 0 && value <= 1) {
      return Math.round(value * 100);
    }
    return Math.round(value);
  }
  
  let str = String(value).trim();
  
  // Remove percentage sign if present
  str = str.replace(/%/g, '');
  
  // Handle "85/100" format
  const fractionMatch = str.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+)$/);
  if (fractionMatch) {
    const numerator = parseFloat(fractionMatch[1]);
    const denominator = parseFloat(fractionMatch[2]);
    if (denominator !== 0) {
      return Math.round((numerator / denominator) * 100);
    }
  }
  
  const num = parseFloat(str);
  if (isNaN(num)) return null;
  
  // If it's a decimal like 0.85, convert to percentage
  if (num >= 0 && num <= 1) {
    return Math.round(num * 100);
  }
  
  // Clamp to 0-100 range
  return Math.round(Math.max(0, Math.min(100, num)));
}

/**
 * Parse a unit tests Excel/CSV file
 */
export function parseTestsFile(file: ArrayBuffer): TestsParseResult {
  const result: TestsParseResult = {
    records: [],
    errors: [],
    warnings: [],
    summary: {
      totalRecords: 0,
      averageScore: 0,
      passing: 0,
      excellent: 0,
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
    const scoreCol = findColumn(headers, SCORE_COLUMNS);
    
    // Validate required columns
    const hasName = nameCol !== -1 || (firstNameCol !== -1 || lastNameCol !== -1);
    if (!hasName) {
      result.errors.push('Could not find student name column. Expected: "Student Name", "Name", "Last Name", or "First Name"');
    }
    if (scoreCol === -1) {
      result.errors.push('Could not find score column. Expected: "Score", "Test Score", "Grade", or "Points"');
    }
    
    if (result.errors.length > 0) {
      return result;
    }

    // Process data rows
    let totalScore = 0;
    
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
        studentName = [firstName, lastName].filter(Boolean).join(' ').trim();
      }
      
      if (!studentName) {
        // Skip empty rows silently
        continue;
      }
      
      // Get score
      const score = parseScore(row[scoreCol]);
      
      if (score === null) {
        result.warnings.push(`Row ${i + 1}: Skipped "${studentName}" - invalid or missing score`);
        continue;
      }
      
      // Check for unusual values
      if (score < 0 || score > 100) {
        result.warnings.push(`Row ${i + 1}: "${studentName}" score adjusted to valid range (original: ${row[scoreCol]})`);
      }
      
      const importRow: UnitTestImportRow = {
        studentName,
        score,
      };
      
      result.records.push(importRow);
      
      // Update summary
      totalScore += score;
      if (score >= 60) result.summary.passing++;
      if (score >= 80) result.summary.excellent++;
    }
    
    // Calculate summary
    result.summary.totalRecords = result.records.length;
    result.summary.averageScore = result.records.length > 0 
      ? Math.round((totalScore / result.records.length) * 10) / 10
      : 0;
    
    if (result.records.length === 0) {
      result.errors.push('No valid test records found in file');
    }
    
  } catch (err) {
    result.errors.push(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
  
  return result;
}

/**
 * Parse a file from a File input element
 */
export async function parseTestsFileFromInput(file: File): Promise<TestsParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as ArrayBuffer;
      resolve(parseTestsFile(data));
    };
    reader.onerror = () => {
      resolve({
        records: [],
        errors: ['Failed to read file'],
        warnings: [],
        summary: { totalRecords: 0, averageScore: 0, passing: 0, excellent: 0 },
      });
    };
    reader.readAsArrayBuffer(file);
  });
}
