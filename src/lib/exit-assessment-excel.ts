import * as XLSX from 'xlsx-js-style';

/** Green / red fills aligned with Exit Assessments table (green-50 / red-50). */
const PASS_STYLE = {
  fill: { patternType: 'solid', fgColor: { rgb: 'ECFDF5' } },
  font: { color: { rgb: '166534' }, bold: true },
  alignment: { horizontal: 'center', vertical: 'center' },
} as const;

const FAIL_STYLE = {
  fill: { patternType: 'solid', fgColor: { rgb: 'FEF2F2' } },
  font: { color: { rgb: '991B1B' }, bold: true },
  alignment: { horizontal: 'center', vertical: 'center' },
} as const;

/** Yellow highlight for L4 P/NP flagged for follow-up (yellow-100 / yellow-800). */
const FLAG_STYLE = {
  fill: { patternType: 'solid', fgColor: { rgb: 'FEF9C3' } },
  font: { color: { rgb: '854D0E' }, bold: true },
  alignment: { horizontal: 'center', vertical: 'center' },
} as const;

type StyledCell = { pass: boolean; flagged?: boolean };

export type ExitAssessmentExportRow = {
  studentName: string;
  readingFormScore: string;
  readingPass: boolean;
  listeningFormScore: string;
  listeningPass: boolean;
  speakingMidtermScore: number | null;
  speakingMidtermPass: boolean;
  writingMidtermScore: number | null;
  writingMidtermPass: boolean;
  midtermPass: boolean;
  midtermL4Flagged?: boolean;
  speakingFinalScore: number | null;
  speakingFinalPass: boolean;
  writingFinalScore: number | null;
  writingFinalPass: boolean;
  finalPass: boolean;
  finalL4Flagged?: boolean;
};

function scoreWithPass(
  score: number | null,
  pass: boolean,
  formattedScore?: string,
): string {
  const scorePart =
    formattedScore !== undefined && formattedScore !== ''
      ? formattedScore
      : score !== null
        ? String(score)
        : '—';
  return `${scorePart} ${pass ? 'P' : 'NP'}`;
}

function passOnly(pass: boolean): string {
  return pass ? 'P' : 'NP';
}

function styleForCell(cell: StyledCell) {
  if (cell.flagged) return FLAG_STYLE;
  return cell.pass ? PASS_STYLE : FAIL_STYLE;
}

/**
 * Export exit assessment grid to Excel with score + P/NP in one cell and pass/fail colors.
 */
export function downloadExitAssessmentsExcel(
  className: string,
  rows: ExitAssessmentExportRow[],
  options: { showMidtermColumns: boolean; showFinalColumns: boolean },
): void {
  const header = ['Student', 'CASAS Reading (Highest)', 'CASAS Listening (Highest)'];
  if (options.showMidtermColumns) {
    header.push('Speaking Midterm', 'Writing Midterm', 'Midterm L4 P/NP');
  }
  if (options.showFinalColumns) {
    header.push('Speaking Final', 'Writing Final', 'Final L4 P/NP');
  }

  /** Per data row: styling per column (null = student name, no fill). */
  const rowStyles: Array<Array<StyledCell | null>> = [];

  const body = rows.map(row => {
    const styles: Array<StyledCell | null> = [null];
    const line: string[] = [row.studentName];

    const push = (value: string, pass: boolean, flagged = false) => {
      line.push(value);
      styles.push({ pass, flagged });
    };

    push(scoreWithPass(null, row.readingPass, row.readingFormScore), row.readingPass);
    push(scoreWithPass(null, row.listeningPass, row.listeningFormScore), row.listeningPass);

    if (options.showMidtermColumns) {
      push(scoreWithPass(row.speakingMidtermScore, row.speakingMidtermPass), row.speakingMidtermPass);
      push(scoreWithPass(row.writingMidtermScore, row.writingMidtermPass), row.writingMidtermPass);
      push(passOnly(row.midtermPass), row.midtermPass, !!row.midtermL4Flagged);
    }
    if (options.showFinalColumns) {
      push(scoreWithPass(row.speakingFinalScore, row.speakingFinalPass), row.speakingFinalPass);
      push(scoreWithPass(row.writingFinalScore, row.writingFinalPass), row.writingFinalPass);
      push(passOnly(row.finalPass), row.finalPass, !!row.finalL4Flagged);
    }

    rowStyles.push(styles);
    return line;
  });

  const data = [header, ...body];
  const ws = XLSX.utils.aoa_to_sheet(data);

  rowStyles.forEach((styles, bodyIdx) => {
    const r = bodyIdx + 1;
    styles.forEach((styled, c) => {
      if (styled === null) return;
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) return;
      cell.s = styleForCell(styled);
    });
  });

  const colWidths = header.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...body.map(line => String(line[i] ?? '').length),
    );
    return { wch: Math.min(28, Math.max(10, maxLen + 2)) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Exit Assessments');
  const safeName = className.replace(/\s+/g, '-');
  XLSX.writeFile(wb, `exit-assessments-${safeName}.xlsx`, { cellStyles: true });
}
