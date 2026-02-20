import * as XLSX from 'xlsx';

export interface ISSTImportRow {
  studentName: string;
  dates: { month: string; date: string }[]; // month: "YYYY-MM", date: "YYYY-MM-DD"
}

export interface ISSTParseResult {
  records: ISSTImportRow[];
  errors: string[];
  sheetName: string;
}

// Month header mapping
const MONTH_MAP: Record<string, string> = {
  'august': '08',
  'september': '09',
  'october': '10',
  'november': '11',
  'december': '12',
  'january': '01',
  'february': '02',
  'march': '03',
  'april': '04',
  'may': '05',
  'june': '06',
  'july': '07',
  'aug': '08',
  'sep': '09',
  'oct': '10',
  'nov': '11',
  'dec': '12',
  'jan': '01',
  'feb': '02',
  'mar': '03',
  'apr': '04',
};

function excelSerialToDate(serial: number): Date {
  // Excel epoch is Dec 30, 1899 (accounting for the leap year bug)
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(excelEpoch.getTime() + serial * msPerDay);
}

function formatDateToISO(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function parseTextDates(text: string, monthKey: string, schoolYearStart: number): { month: string; date: string }[] {
  const results: { month: string; date: string }[] = [];
  
  // Split by comma, space, or slash-based patterns
  const parts = text.split(/[,\s]+/).filter(p => p.trim());
  
  for (const part of parts) {
    // Try to parse "M/D" or "MM/DD" format
    const match = part.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (match) {
      const monthNum = parseInt(match[1], 10);
      const dayNum = parseInt(match[2], 10);
      
      if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
        // Determine year based on school year
        const year = monthNum >= 8 ? schoolYearStart : schoolYearStart + 1;
        const month = String(monthNum).padStart(2, '0');
        const day = String(dayNum).padStart(2, '0');
        results.push({
          month: `${year}-${month}`,
          date: `${year}-${month}-${day}`,
        });
      }
    }
  }
  
  return results;
}

function determineSchoolYear(): number {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  // If we're in Aug-Dec, school year starts this year; otherwise it started last year
  return currentMonth >= 8 ? currentYear : currentYear - 1;
}

export function parseISSTFile(file: ArrayBuffer): ISSTParseResult[] {
  const workbook = XLSX.read(file, { type: 'array' });
  const results: ISSTParseResult[] = [];
  const schoolYearStart = determineSchoolYear();
  
  for (const sheetName of workbook.SheetNames) {
    // Skip sheets that don't look like class data
    if (sheetName.toLowerCase().includes('sheet') && !sheetName.toLowerCase().match(/^(am|pm)/i)) {
      continue;
    }
    
    const sheet = workbook.Sheets[sheetName];
    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    const records: ISSTImportRow[] = [];
    const errors: string[] = [];
    
    // Find the header row with months (usually row 1, index 1)
    // And the column headers row (usually row 2, index 2)
    let monthRow: (string | number | null)[] = [];
    let headerRowIndex = -1;
    let lastNameCol = -1;
    let firstNameCol = -1;
    
    // Find rows
    for (let i = 0; i < Math.min(data.length, 5); i++) {
      const row = data[i] || [];
      
      // Check if this row has month names
      const hasMonths = row.some(cell => {
        if (typeof cell === 'string') {
          return MONTH_MAP[cell.toLowerCase().trim()] !== undefined;
        }
        return false;
      });
      if (hasMonths) {
        monthRow = row;
      }
      
      // Check if this row has "Last Name" or "First Name"
      for (let j = 0; j < row.length; j++) {
        const cell = row[j];
        if (typeof cell === 'string') {
          const lower = cell.toLowerCase().trim();
          if (lower === 'last name' || lower === 'lastname') {
            lastNameCol = j;
            headerRowIndex = i;
          }
          if (lower === 'first name' || lower === 'firstname') {
            firstNameCol = j;
          }
        }
      }
    }
    
    if (headerRowIndex === -1 || lastNameCol === -1 || firstNameCol === -1) {
      errors.push(`Could not find header row with "Last Name" and "First Name" columns in sheet "${sheetName}"`);
      results.push({ records, errors, sheetName });
      continue;
    }
    
    // Build month column mapping
    // monthRow has month names, data columns start after first name
    const monthColumns: { colIndex: number; monthKey: string }[] = [];
    const monthNames = Object.keys(MONTH_MAP);
    
    for (let colIdx = Math.max(lastNameCol, firstNameCol) + 1; colIdx < (monthRow.length || 20); colIdx++) {
      const cellValue = monthRow[colIdx];
      if (typeof cellValue === 'string') {
        const monthKey = MONTH_MAP[cellValue.toLowerCase().trim()];
        if (monthKey) {
          const year = parseInt(monthKey, 10) >= 8 ? schoolYearStart : schoolYearStart + 1;
          monthColumns.push({
            colIndex: colIdx,
            monthKey: `${year}-${monthKey}`,
          });
        }
      }
    }
    
    if (monthColumns.length === 0) {
      errors.push(`No month columns found in sheet "${sheetName}"`);
      results.push({ records, errors, sheetName });
      continue;
    }
    
    // Parse student rows (start after header row)
    for (let rowIdx = headerRowIndex + 1; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];
      if (!row) continue;
      
      const lastName = row[lastNameCol];
      const firstName = row[firstNameCol];
      
      // Skip empty rows
      if (!lastName && !firstName) continue;
      
      // Build student name
      const lastNameStr = typeof lastName === 'string' ? lastName.trim() : '';
      const firstNameStr = typeof firstName === 'string' ? firstName.trim() : '';
      
      if (!lastNameStr && !firstNameStr) continue;
      
      const studentName = `${firstNameStr} ${lastNameStr}`.trim();
      const dates: { month: string; date: string }[] = [];
      
      // Parse dates for each month column
      for (const { colIndex, monthKey } of monthColumns) {
        const cellValue = row[colIndex];
        
        if (cellValue === null || cellValue === undefined || cellValue === '' || cellValue === '-') {
          continue;
        }
        
        if (typeof cellValue === 'number') {
          // Excel serial date
          try {
            const date = excelSerialToDate(cellValue);
            dates.push({
              month: getMonthFromDate(date),
              date: formatDateToISO(date),
            });
          } catch {
            errors.push(`Invalid date value ${cellValue} for ${studentName}`);
          }
        } else if (typeof cellValue === 'string') {
          // Text format: could be "9/10, 9/15" or similar
          const parsed = parseTextDates(cellValue, monthKey, schoolYearStart);
          if (parsed.length > 0) {
            dates.push(...parsed);
          } else if (cellValue.trim() !== '-') {
            errors.push(`Could not parse date "${cellValue}" for ${studentName}`);
          }
        }
      }
      
      records.push({ studentName, dates });
    }
    
    results.push({ records, errors, sheetName });
  }
  
  return results;
}

export async function parseISSTFileFromInput(file: File): Promise<ISSTParseResult[]> {
  const buffer = await file.arrayBuffer();
  return parseISSTFile(buffer);
}
