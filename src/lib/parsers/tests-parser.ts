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

/**
 * Multi-test import - when file has multiple tests with dates in columns
 */
export interface MultiTestImportRow {
  studentName: string;
  testName: string;
  date: string;  // YYYY-MM-DD format
  score: number;
}

export interface MultiTestParseResult {
  isMultiTest: true;
  records: MultiTestImportRow[];
  tests: { name: string; date: string }[];  // List of tests found
  errors: string[];
  warnings: string[];
}

// Column name variations
const NAME_COLUMNS = ['student name', 'name', 'student', 'full name', 'learner name'];
const FIRST_NAME_COLUMNS = ['first name', 'first', 'firstname', 'given name'];
const LAST_NAME_COLUMNS = ['last name', 'last', 'lastname', 'surname', 'family name'];
const SCORE_COLUMNS = ['score', 'test score', 'grade', 'points', 'result', 'percent', 'percentage', '%'];

function normalizeString(value: unknown): string {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
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

function extractPossiblePoints(...values: unknown[]): number | null {
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;

    const possiblePointsMatch = text.match(/possible points(?:[^0-9]*?)(\d+(?:\.\d+)?)/i);
    if (possiblePointsMatch) {
      return parseFloat(possiblePointsMatch[1]);
    }

    const outOfMatch = text.match(/out of\s*(\d+(?:\.\d+)?)/i);
    if (outOfMatch) {
      return parseFloat(outOfMatch[1]);
    }

    const pointsMatch = text.match(/\b(\d+(?:\.\d+)?)\s*points?\b/i);
    if (pointsMatch) {
      return parseFloat(pointsMatch[1]);
    }
  }

  return null;
}

function parseRawNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;

  const str = String(value).trim().replace(/,/g, '');
  if (!str) return null;

  const fractionMatch = str.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const numerator = parseFloat(fractionMatch[1]);
    const denominator = parseFloat(fractionMatch[2]);
    if (denominator === 0) return null;
    return (numerator / denominator) * 100;
  }

  const num = parseFloat(str.replace(/%/g, ''));
  return Number.isNaN(num) ? null : num;
}

function parseScoreCandidate(value: unknown): number | null {
  const num = parseRawNumericValue(value);
  if (num === null) return null;

  if (num >= 0 && num <= 1) return Math.round(num * 100);
  if (num >= 0 && num <= 100) return Math.round(num);
  return null;
}

/**
 * Parse a score from various formats (handles percentages, decimals, etc.)
 */
function parseScore(value: unknown, possiblePoints?: number | null): number | null {
  const num = parseRawNumericValue(value);
  if (num === null) return null;

  if (possiblePoints && possiblePoints > 0 && num > 1 && num <= possiblePoints) {
    return Math.round((num / possiblePoints) * 100);
  }

  if (num >= 0 && num <= 1) {
    return Math.round(num * 100);
  }

  if (num >= 0 && num <= 100) {
    return Math.round(num);
  }

  return null;
}

function getScoreColumnCandidates(headers: string[]): number[] {
  return headers
    .map((header, index) => ({ header: normalizeString(header), index }))
    .filter(({ header }) => {
      if (!header) return false;
      return SCORE_COLUMNS.some(name => header === name || header.includes(name));
    })
    .map(({ index }) => index);
}

function chooseBestScoreColumn(headers: string[], rows: unknown[][]): { index: number; validCount: number } | null {
  const explicitCandidates = getScoreColumnCandidates(headers);
  const allCandidates = explicitCandidates.length > 0
    ? explicitCandidates
    : headers
        .map((_, index) => index)
        .filter(index => rows.some(row => parseScoreCandidate(row[index]) !== null));

  let best: { index: number; validCount: number; priority: number } | null = null;

  for (const index of allCandidates) {
    const header = normalizeString(headers[index]);
    const validCount = rows.reduce((count, row) => count + (parseScoreCandidate(row[index]) !== null ? 1 : 0), 0);
    if (validCount === 0) continue;

    let priority = 0;
    if (header.includes('total') || header.includes('final') || header.includes('overall')) priority += 3;
    if (header.includes('score') || header.includes('grade') || header.includes('result')) priority += 2;
    if (header.includes('percent') || header.includes('percentage') || header === '%') priority += 1;

    if (
      !best ||
      validCount > best.validCount ||
      (validCount === best.validCount && priority > best.priority) ||
      (validCount === best.validCount && priority === best.priority && index > best.index)
    ) {
      best = { index, validCount, priority };
    }
  }

  return best ? { index: best.index, validCount: best.validCount } : null;
}

function findHeaderRow(data: unknown[][]): {
  rowIndex: number;
  headers: string[];
  nameCol: number;
  firstNameCol: number;
  lastNameCol: number;
  scoreCol: number;
} | null {
  let best:
    | {
        rowIndex: number;
        headers: string[];
        nameCol: number;
        firstNameCol: number;
        lastNameCol: number;
        scoreCol: number;
        scoreCount: number;
      }
    | null = null;

  for (let rowIndex = 0; rowIndex < Math.min(data.length, 10); rowIndex++) {
    const headers = (data[rowIndex] || []).map(cell => String(cell || ''));
    if (headers.length === 0) continue;

    const firstNameCol = findColumn(headers, FIRST_NAME_COLUMNS);
    const lastNameCol = findColumn(headers, LAST_NAME_COLUMNS);
    const hasSeparateNameCols = firstNameCol !== -1 || lastNameCol !== -1;
    const nameCol = hasSeparateNameCols ? -1 : findColumn(headers, NAME_COLUMNS);
    const hasName = nameCol !== -1 || hasSeparateNameCols;
    if (!hasName) continue;

    const previewRows = data.slice(rowIndex + 1, rowIndex + 26);
    const scoreCol = chooseBestScoreColumn(headers, previewRows);
    if (!scoreCol) continue;

    if (!best || scoreCol.validCount > best.scoreCount) {
      best = {
        rowIndex,
        headers,
        nameCol,
        firstNameCol,
        lastNameCol,
        scoreCol: scoreCol.index,
        scoreCount: scoreCol.validCount,
      };
    }
  }

  if (!best) return null;

  return {
    rowIndex: best.rowIndex,
    headers: best.headers,
    nameCol: best.nameCol,
    firstNameCol: best.firstNameCol,
    lastNameCol: best.lastNameCol,
    scoreCol: best.scoreCol,
  };
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
    let totalScore = 0;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (data.length < 2) continue;

      const headerRow = findHeaderRow(data);
      if (!headerRow) continue;

      const {
        rowIndex: headerRowIndex,
        headers,
        nameCol,
        firstNameCol,
        lastNameCol,
        scoreCol,
      } = headerRow;

      const possiblePoints = extractPossiblePoints(
        headers[scoreCol],
        data[headerRowIndex - 1]?.[scoreCol],
        data[headerRowIndex - 2]?.[scoreCol],
        data[headerRowIndex - 1]?.join(' '),
      );

      result.warnings.push(
        `Sheet "${sheetName}": using row ${headerRowIndex + 1} as headers and "${headers[scoreCol]}" as the score column`,
      );

      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i] as unknown[];
        if (!row || row.length === 0) continue;

        let studentName: string;
        if (nameCol !== -1) {
          studentName = String(row[nameCol] || '').trim();
          if (studentName.includes(',')) {
            const parts = studentName.split(',').map(part => part.trim()).filter(Boolean);
            if (parts.length >= 2) {
              studentName = `${parts[1]} ${parts[0]}`;
            }
          }
        } else {
          const firstName = firstNameCol !== -1 ? String(row[firstNameCol] || '').trim() : '';
          const lastName = lastNameCol !== -1 ? String(row[lastNameCol] || '').trim() : '';
          studentName = [firstName, lastName].filter(Boolean).join(' ').trim();
        }

        if (!studentName) {
          continue;
        }

        const score = parseScore(row[scoreCol], possiblePoints);
        if (score === null) {
          result.warnings.push(`Sheet "${sheetName}" row ${i + 1}: Skipped "${studentName}" - invalid or missing score`);
          continue;
        }

        const importRow: UnitTestImportRow = {
          studentName,
          score,
        };

        result.records.push(importRow);
        totalScore += score;
        if (score >= 60) result.summary.passing++;
        if (score >= 80) result.summary.excellent++;
      }
    }

    // Calculate summary
    result.summary.totalRecords = result.records.length;
    result.summary.averageScore = result.records.length > 0 
      ? Math.round((totalScore / result.records.length) * 10) / 10
      : 0;
    
    if (result.records.length === 0) {
      result.errors.push('No valid test records found in file. The file needs at least one sheet with student names and a score column.');
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

/**
 * Parse a date from "Date: MM/DD/YY" or "Date: M/D/YY" format
 */
function parseDateFromCell(value: string): string | null {
  if (!value || typeof value !== 'string') return null;
  
  // Match "Date: MM/DD/YY" or similar
  const match = value.match(/Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (!match) return null;
  
  const month = parseInt(match[1]);
  const day = parseInt(match[2]);
  let year = parseInt(match[3]);
  
  // Handle 2-digit years
  if (year < 100) {
    year = year < 50 ? 2000 + year : 1900 + year;
  }
  
  // Return YYYY-MM-DD format
  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

/**
 * Parse score value from cell - handles numbers, dashes, empty values
 */
function parseMultiTestScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  
  if (typeof value === 'number') {
    // If it's a decimal like 0.85, convert to percentage
    if (value >= 0 && value <= 1) {
      return Math.round(value * 100);
    }
    return Math.round(value);
  }
  
  const str = String(value).trim();
  if (str === '-' || str === '') return null;
  
  const num = parseFloat(str);
  if (isNaN(num)) return null;
  
  // If it's a decimal like 0.85, convert to percentage
  if (num >= 0 && num <= 1) {
    return Math.round(num * 100);
  }
  
  return Math.round(Math.max(0, Math.min(100, num)));
}

/**
 * Check if a file is in multi-test "Progress Tracker" format
 * Format: Row 0 has test names, Row 1 has dates, Row 2+ has student data
 */
export function isMultiTestFormat(file: ArrayBuffer): boolean {
  try {
    const workbook = XLSX.read(file, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (data.length < 3) return false;
    
    // Check if row 1 has "Date:" entries starting from column 2
    const dateRow = data[1] as string[];
    if (!dateRow) return false;
    
    let dateCount = 0;
    for (let i = 2; i < dateRow.length; i++) {
      const cell = String(dateRow[i] || '').trim();
      if (cell.toLowerCase().startsWith('date:')) {
        dateCount++;
      }
    }
    
    // If we found at least 2 date columns, it's likely a multi-test format
    return dateCount >= 2;
  } catch {
    return false;
  }
}

/**
 * Parse a "Progress Tracker" style multi-test file
 * 
 * Expected format:
 * Row 0: [Sort Order?, Student Name, Test 1: Name, Test 2: Name, ...]
 * Row 1: [empty, empty, Date: MM/DD/YY, Date: MM/DD/YY, ...]
 * Row 2+: [sort?, Name, score, score, ...]
 */
export function parseMultiTestFile(file: ArrayBuffer): MultiTestParseResult {
  const result: MultiTestParseResult = {
    isMultiTest: true,
    records: [],
    tests: [],
    errors: [],
    warnings: [],
  };
  
  try {
    const workbook = XLSX.read(file, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (data.length < 3) {
      result.errors.push('File needs at least 3 rows (headers, dates, and data)');
      return result;
    }
    
    const headerRow = data[0] as string[];
    const dateRow = data[1] as string[];
    
    // Find the student name column (usually column 1, index 1)
    let nameColIdx = -1;
    for (let i = 0; i < Math.min(3, headerRow.length); i++) {
      const header = String(headerRow[i] || '').toLowerCase();
      if (header.includes('name') || header.includes('student')) {
        nameColIdx = i;
        break;
      }
    }
    if (nameColIdx === -1) nameColIdx = 1; // Default to column B
    
    // Find test columns - columns that have "Date:" in row 1
    const testColumns: { colIdx: number; testName: string; date: string }[] = [];
    
    for (let i = nameColIdx + 1; i < headerRow.length; i++) {
      const testName = String(headerRow[i] || '').trim();
      const dateStr = String(dateRow[i] || '').trim();
      
      // Skip "Average" or similar summary columns
      if (testName.toLowerCase().includes('average') || testName.toLowerCase().includes('avg')) {
        continue;
      }
      
      // Parse the date
      const date = parseDateFromCell(dateStr);
      
      if (testName && dateStr.toLowerCase().startsWith('date:')) {
        if (date) {
          testColumns.push({ colIdx: i, testName, date });
          result.tests.push({ name: testName, date });
        } else if (dateStr !== 'Date:') {
          result.warnings.push(`Could not parse date for "${testName}": ${dateStr}`);
        }
      }
    }
    
    if (testColumns.length === 0) {
      result.errors.push('No test columns found. Expected "Test Name" in row 1 and "Date: MM/DD/YY" in row 2');
      return result;
    }
    
    // Process student rows (starting from row 2, index 2)
    for (let rowIdx = 2; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx] as unknown[];
      if (!row || row.length === 0) continue;
      
      const studentName = String(row[nameColIdx] || '').trim();
      if (!studentName) continue;
      
      // Get scores for each test
      for (const testCol of testColumns) {
        const scoreValue = row[testCol.colIdx];
        const score = parseMultiTestScore(scoreValue);
        
        if (score !== null) {
          result.records.push({
            studentName,
            testName: testCol.testName,
            date: testCol.date,
            score,
          });
        }
      }
    }
    
    if (result.records.length === 0) {
      result.errors.push('No valid test scores found in file');
    }
    
  } catch (err) {
    result.errors.push(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
  
  return result;
}

/**
 * Parse a multi-test file from a File input element
 */
export async function parseMultiTestFileFromInput(file: File): Promise<MultiTestParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as ArrayBuffer;
      resolve(parseMultiTestFile(data));
    };
    reader.onerror = () => {
      resolve({
        isMultiTest: true,
        records: [],
        tests: [],
        errors: ['Failed to read file'],
        warnings: [],
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Check if file is multi-test format from File input
 */
export async function checkIsMultiTestFormat(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as ArrayBuffer;
      resolve(isMultiTestFormat(data));
    };
    reader.onerror = () => resolve(false);
    reader.readAsArrayBuffer(file);
  });
}
