import * as XLSX from 'xlsx';
import { UnitTestImportRow } from '@/types';

/**
 * Unit Tests File Parser
 * 
 * Parses Excel/CSV files containing unit test scores.
 * Supports TWO formats:
 * 
 * FORMAT 1 - Multi-Test (Preferred):
 * Row 1: Student Name | Test 1: Unit 1 | Test 2: Unit 2 | Test 3: EL Civics | ...
 * Row 2: (optional)   | Date: 9/24/25  | Date: 10/16/25 | Date: 12/11/25    | ...
 * Row 3+: Student data with scores
 * 
 * FORMAT 2 - Single Test (Legacy):
 * Student Name | Score
 * (Test name specified separately when importing)
 */

export interface MultiTestRecord {
  studentName: string;
  testName: string;
  date: string;
  score: number;
}

export interface TestsParseResult {
  records: UnitTestImportRow[];  // Legacy single-test format
  multiTestRecords: MultiTestRecord[];  // New multi-test format
  testColumns: { name: string; date: string }[];  // Detected test columns
  isMultiTest: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    totalRecords: number;
    averageScore: number;
    passing: number;
    excellent: number;
    testsDetected: number;
  };
}

// Column name variations for student name
const NAME_COLUMNS = ['student name', 'name', 'student', 'full name', 'learner name'];
const FIRST_NAME_COLUMNS = ['first name', 'first', 'firstname', 'given name'];
const LAST_NAME_COLUMNS = ['last name', 'last', 'lastname', 'surname', 'family name'];
const SCORE_COLUMNS = ['score', 'test score', 'grade', 'points', 'result', 'percent', 'percentage', '%'];

// Columns to skip when detecting test columns
const SKIP_COLUMNS = ['sort order', 'order', '#', 'id', 'student id', 'email', 'notes', 'average', 'avg'];

/**
 * Find a column by checking multiple possible names
 */
function findColumn(headers: string[], possibleNames: string[]): number {
  const lowerHeaders = headers.map(h => h?.toString().toLowerCase().trim() || '');
  for (const name of possibleNames) {
    const index = lowerHeaders.indexOf(name);
    if (index !== -1) return index;
  }
  for (const name of possibleNames) {
    const index = lowerHeaders.findIndex(h => h.includes(name));
    if (index !== -1) return index;
  }
  return -1;
}

/**
 * Parse a score from various formats
 */
function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  
  if (typeof value === 'number') {
    if (value >= 0 && value <= 1) {
      return Math.round(value * 100);
    }
    return Math.round(value);
  }
  
  let str = String(value).trim();
  if (str === '-' || str === '') return null;
  
  str = str.replace(/%/g, '');
  
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
  
  if (num >= 0 && num <= 1) {
    return Math.round(num * 100);
  }
  
  return Math.round(Math.max(0, Math.min(100, num)));
}

/**
 * Parse a date from various formats
 */
function parseDate(value: unknown): string {
  if (!value) return new Date().toISOString().split('T')[0];
  
  let str = String(value).trim();
  
  // Handle "Date: 9/24/25" format
  const dateMatch = str.match(/date:\s*(.+)/i);
  if (dateMatch) {
    str = dateMatch[1].trim();
  }
  
  if (!str || str === '-') return new Date().toISOString().split('T')[0];
  
  // Try parsing various date formats
  // Handle M/D/YY or MM/DD/YY format
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    let [, month, day, year] = slashMatch;
    // Convert 2-digit year to 4-digit
    if (year.length === 2) {
      const yearNum = parseInt(year);
      year = yearNum > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Try standard Date parsing
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }
  
  return new Date().toISOString().split('T')[0];
}

/**
 * Extract test name from a header like "Test 1: Unit 1" or just "Unit 1"
 */
function extractTestName(header: string): string {
  const str = header.trim();
  
  // Handle "Test N: Name" format
  const colonMatch = str.match(/^test\s*\d*\s*:\s*(.+)$/i);
  if (colonMatch) {
    return colonMatch[1].trim();
  }
  
  // Handle "Test N - Name" format
  const dashMatch = str.match(/^test\s*\d*\s*-\s*(.+)$/i);
  if (dashMatch) {
    return dashMatch[1].trim();
  }
  
  // Return as-is if no pattern matches
  return str;
}

/**
 * Check if a header looks like a test column
 */
function isTestColumn(header: string): boolean {
  const lower = header.toLowerCase().trim();
  
  // Skip known non-test columns
  if (SKIP_COLUMNS.some(skip => lower.includes(skip))) return false;
  if (NAME_COLUMNS.some(name => lower.includes(name))) return false;
  if (FIRST_NAME_COLUMNS.some(name => lower === name)) return false;
  if (LAST_NAME_COLUMNS.some(name => lower === name)) return false;
  
  // Accept columns that look like tests
  if (lower.startsWith('test')) return true;
  if (lower.includes('unit')) return true;
  if (lower.includes('civics')) return true;
  if (lower.includes('midterm')) return true;
  if (lower.includes('final')) return true;
  if (lower.includes('quiz')) return true;
  if (lower.includes('exam')) return true;
  
  return false;
}

/**
 * Parse a unit tests Excel/CSV file
 */
export function parseTestsFile(file: ArrayBuffer): TestsParseResult {
  const result: TestsParseResult = {
    records: [],
    multiTestRecords: [],
    testColumns: [],
    isMultiTest: false,
    errors: [],
    warnings: [],
    summary: {
      totalRecords: 0,
      averageScore: 0,
      passing: 0,
      excellent: 0,
      testsDetected: 0,
    },
  };

  try {
    const workbook = XLSX.read(file, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (data.length < 2) {
      result.errors.push('File appears to be empty or has no data rows');
      return result;
    }

    const headers = (data[0] as string[]).map(h => String(h || ''));
    
    // Find student name column
    const nameCol = findColumn(headers, NAME_COLUMNS);
    const firstNameCol = findColumn(headers, FIRST_NAME_COLUMNS);
    const lastNameCol = findColumn(headers, LAST_NAME_COLUMNS);
    
    const hasName = nameCol !== -1 || (firstNameCol !== -1 || lastNameCol !== -1);
    if (!hasName) {
      result.errors.push('Could not find student name column. Expected: "Student Name", "Name", etc.');
      return result;
    }

    // Detect test columns
    const testColumnIndices: number[] = [];
    for (let i = 0; i < headers.length; i++) {
      if (i === nameCol || i === firstNameCol || i === lastNameCol) continue;
      if (headers[i] && isTestColumn(headers[i])) {
        testColumnIndices.push(i);
      }
    }

    // Check if this is multi-test format or single-test format
    if (testColumnIndices.length > 0) {
      // Multi-test format detected
      result.isMultiTest = true;
      
      // Check for date row (row 2)
      const possibleDateRow = data[1] as unknown[];
      const hasDateRow = possibleDateRow && testColumnIndices.some(idx => {
        const val = String(possibleDateRow[idx] || '').toLowerCase();
        return val.includes('date') || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(val);
      });
      
      const dataStartRow = hasDateRow ? 2 : 1;
      
      // Build test columns info
      for (const idx of testColumnIndices) {
        const testName = extractTestName(headers[idx]);
        const date = hasDateRow ? parseDate(possibleDateRow[idx]) : new Date().toISOString().split('T')[0];
        result.testColumns.push({ name: testName, date });
      }
      
      result.summary.testsDetected = testColumnIndices.length;
      
      // Process data rows
      let totalScore = 0;
      let scoreCount = 0;
      
      for (let i = dataStartRow; i < data.length; i++) {
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
        
        if (!studentName) continue;
        
        // Get scores for each test
        for (let j = 0; j < testColumnIndices.length; j++) {
          const idx = testColumnIndices[j];
          const score = parseScore(row[idx]);
          
          if (score !== null) {
            result.multiTestRecords.push({
              studentName,
              testName: result.testColumns[j].name,
              date: result.testColumns[j].date,
              score,
            });
            
            totalScore += score;
            scoreCount++;
            if (score >= 60) result.summary.passing++;
            if (score >= 80) result.summary.excellent++;
          }
        }
      }
      
      result.summary.totalRecords = scoreCount;
      result.summary.averageScore = scoreCount > 0 
        ? Math.round((totalScore / scoreCount) * 10) / 10
        : 0;
        
    } else {
      // Single-test format (legacy)
      const scoreCol = findColumn(headers, SCORE_COLUMNS);
      
      if (scoreCol === -1) {
        result.errors.push('Could not find test columns or score column. Expected test columns like "Unit 1", "Test 1: Unit 2" or a "Score" column.');
        return result;
      }
      
      let totalScore = 0;
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i] as unknown[];
        if (!row || row.length === 0) continue;
        
        let studentName: string;
        if (nameCol !== -1) {
          studentName = String(row[nameCol] || '').trim();
        } else {
          const firstName = firstNameCol !== -1 ? String(row[firstNameCol] || '').trim() : '';
          const lastName = lastNameCol !== -1 ? String(row[lastNameCol] || '').trim() : '';
          studentName = [firstName, lastName].filter(Boolean).join(' ').trim();
        }
        
        if (!studentName) continue;
        
        const score = parseScore(row[scoreCol]);
        
        if (score === null) {
          result.warnings.push(`Row ${i + 1}: Skipped "${studentName}" - invalid or missing score`);
          continue;
        }
        
        result.records.push({ studentName, score });
        
        totalScore += score;
        if (score >= 60) result.summary.passing++;
        if (score >= 80) result.summary.excellent++;
      }
      
      result.summary.totalRecords = result.records.length;
      result.summary.averageScore = result.records.length > 0 
        ? Math.round((totalScore / result.records.length) * 10) / 10
        : 0;
    }
    
    if (result.summary.totalRecords === 0) {
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
        multiTestRecords: [],
        testColumns: [],
        isMultiTest: false,
        errors: ['Failed to read file'],
        warnings: [],
        summary: { totalRecords: 0, averageScore: 0, passing: 0, excellent: 0, testsDetected: 0 },
      });
    };
    reader.readAsArrayBuffer(file);
  });
}
