'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import * as XLSX from 'xlsx';
import { DocumentArrowDownIcon, PrinterIcon } from '@heroicons/react/24/outline';
import { useApp } from '@/components/AppShell';
import {
  getClasses,
  getStudentsByClass,
  getCASASTestsByStudent,
  getSpeakingTestsByClass,
  getSpeakingResultsByTest,
  getWritingTestsByClass,
  getWritingResultsByTest,
} from '@/lib/storage';
import {
  compareByLastName,
  formatCasasFormScore,
  getHighestCASASTest,
  getHighestCASASScore,
} from '@/lib/calculations';
import { isPromoted } from '@/lib/exit-assessment';
import {
  ExitAssessmentPrintDocument,
  type ExitStudentRow,
} from '@/components/exit-assessment/ExitAssessmentPrintDocument';
import { formatLongDate } from '@/lib/exit-assessment';
import { useTeacherName } from '@/hooks/useTeacherName';
import type { SpeakingTest, WritingTest } from '@/types';

type AssessmentType = 'midterm' | 'final';

type ColumnVisibility = {
  showMidterm: boolean;
  showFinal: boolean;
};

const COLUMN_VISIBILITY_KEY = 'gradebook_exit_assessment_column_visibility';

function loadColumnVisibility(classId: string): ColumnVisibility {
  if (typeof window === 'undefined') {
    return { showMidterm: true, showFinal: true };
  }
  try {
    const raw = window.localStorage.getItem(COLUMN_VISIBILITY_KEY);
    if (!raw) return { showMidterm: true, showFinal: true };
    const all = JSON.parse(raw) as Record<string, ColumnVisibility>;
    return all[classId] ?? { showMidterm: true, showFinal: true };
  } catch {
    return { showMidterm: true, showFinal: true };
  }
}

function saveColumnVisibility(classId: string, visibility: ColumnVisibility) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(COLUMN_VISIBILITY_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, ColumnVisibility>) : {};
    all[classId] = visibility;
    window.localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(all));
  } catch {
    // ignore quota / private mode
  }
}

type Row = {
  studentId: string;
  studentName: string;
  readingScore: number | null;
  readingFormScore: string;
  readingPass: boolean;
  listeningScore: number | null;
  listeningFormScore: string;
  listeningPass: boolean;
  speakingMidtermScore: number | null;
  speakingMidtermPass: boolean;
  writingMidtermScore: number | null;
  writingMidtermPass: boolean;
  midtermPass: boolean;
  speakingFinalScore: number | null;
  speakingFinalPass: boolean;
  writingFinalScore: number | null;
  writingFinalPass: boolean;
  finalPass: boolean;
};

function matchesAssessmentType(
  test: Pick<SpeakingTest | WritingTest, 'title' | 'exitAssessmentType'>,
  type: AssessmentType,
): boolean {
  if (test.exitAssessmentType && test.exitAssessmentType !== 'none') {
    return test.exitAssessmentType === type;
  }
  const lowerTitle = test.title.toLowerCase();
  return lowerTitle.includes(type) && lowerTitle.includes('exit');
}

function scoreForStudent(
  rows: Array<{ studentId: string; score: number | null }>,
  studentId: string,
): number | null {
  const match = rows.find(row => row.studentId === studentId);
  return match?.score ?? null;
}

function PassCell({
  score,
  pass,
  detail,
}: {
  score: number | null;
  pass: boolean;
  detail?: string;
}) {
  const color = pass ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200';
  const subline = detail ?? (score === null ? '—' : String(score));
  return (
    <div className={`rounded-md border px-2 py-1 text-center ${color}`}>
      <div className="text-xs font-semibold">{pass ? 'P' : 'NP'}</div>
      <div className="text-xs font-bold tabular-nums mt-0.5">{subline}</div>
    </div>
  );
}

function StatusCell({ pass }: { pass: boolean }) {
  const color = pass ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200';
  return (
    <div className={`rounded-md border px-2 py-2 text-center ${color}`}>
      <div className="text-sm font-semibold">{pass ? 'P' : 'NP'}</div>
    </div>
  );
}

export default function ExitAssessmentsPage() {
  const params = useParams();
  const classId = params.classId as string;
  const { mounted, setCurrentClassId } = useApp();
  const [teacherName] = useTeacherName();
  const [exitDate, setExitDate] = useState(new Date().toISOString().split('T')[0]);
  const [printTerm, setPrintTerm] = useState<AssessmentType>('final');
  const [showMidtermColumns, setShowMidtermColumns] = useState(true);
  const [showFinalColumns, setShowFinalColumns] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);
  const columnPrefsLoadedRef = useRef(false);

  useEffect(() => {
    if (!mounted || !classId) return;
    const saved = loadColumnVisibility(classId);
    setShowMidtermColumns(saved.showMidterm);
    setShowFinalColumns(saved.showFinal);
    columnPrefsLoadedRef.current = true;
  }, [mounted, classId]);

  useEffect(() => {
    if (!mounted || !classId || !columnPrefsLoadedRef.current) return;
    saveColumnVisibility(classId, {
      showMidterm: showMidtermColumns,
      showFinal: showFinalColumns,
    });
  }, [mounted, classId, showMidtermColumns, showFinalColumns]);

  const currentClass = useMemo(() => {
    if (!mounted) return null;
    return getClasses().find(c => c.id === classId) || null;
  }, [mounted, classId]);

  useEffect(() => {
    if (currentClass) setCurrentClassId(currentClass.id);
  }, [currentClass, setCurrentClassId]);

  const students = useMemo(() => {
    if (!mounted) return [];
    return getStudentsByClass(classId).sort((a, b) => compareByLastName(a.name, b.name));
  }, [mounted, classId]);

  const speakingTests = useMemo(() => getSpeakingTestsByClass(classId), [classId, mounted]);
  const writingTests = useMemo(() => getWritingTestsByClass(classId), [classId, mounted]);

  const speakingMidterm = speakingTests.find(test => matchesAssessmentType(test, 'midterm')) || null;
  const speakingFinal = speakingTests.find(test => matchesAssessmentType(test, 'final')) || null;
  const writingMidterm = writingTests.find(test => matchesAssessmentType(test, 'midterm')) || null;
  const writingFinal = writingTests.find(test => matchesAssessmentType(test, 'final')) || null;

  const speakingMidtermResults = useMemo(
    () => (speakingMidterm ? getSpeakingResultsByTest(speakingMidterm.id) : []),
    [speakingMidterm],
  );
  const speakingFinalResults = useMemo(
    () => (speakingFinal ? getSpeakingResultsByTest(speakingFinal.id) : []),
    [speakingFinal],
  );
  const writingMidtermResults = useMemo(
    () => (writingMidterm ? getWritingResultsByTest(writingMidterm.id) : []),
    [writingMidterm],
  );
  const writingFinalResults = useMemo(
    () => (writingFinal ? getWritingResultsByTest(writingFinal.id) : []),
    [writingFinal],
  );

  const rows: Row[] = useMemo(() => {
    if (!currentClass) return [];
    return students.map(student => {
      const readingTests = getCASASTestsByStudent(student.id, 'reading');
      const listeningTests = getCASASTestsByStudent(student.id, 'listening');
      const readingBest = getHighestCASASTest(readingTests);
      const listeningBest = getHighestCASASTest(listeningTests);
      const readingHighest = getHighestCASASScore(readingTests);
      const listeningHighest = getHighestCASASScore(listeningTests);
      const readingPass = readingHighest !== null && readingHighest >= currentClass.casasReadingTarget;
      const listeningPass = listeningHighest !== null && listeningHighest >= currentClass.casasListeningTarget;

      const speakingMidtermScore = scoreForStudent(speakingMidtermResults, student.id);
      const speakingMidtermPass = speakingMidtermScore !== null && !!speakingMidterm && speakingMidtermScore >= speakingMidterm.passingScore;
      const writingMidtermScore = scoreForStudent(writingMidtermResults, student.id);
      const writingMidtermPass = writingMidtermScore !== null && !!writingMidterm && writingMidtermScore >= writingMidterm.passingScore;

      const speakingFinalScore = scoreForStudent(speakingFinalResults, student.id);
      const speakingFinalPass = speakingFinalScore !== null && !!speakingFinal && speakingFinalScore >= speakingFinal.passingScore;
      const writingFinalScore = scoreForStudent(writingFinalResults, student.id);
      const writingFinalPass = writingFinalScore !== null && !!writingFinal && writingFinalScore >= writingFinal.passingScore;

      const midtermPassCount = [readingPass, listeningPass, speakingMidtermPass, writingMidtermPass].filter(Boolean).length;
      const finalPassCount = [readingPass, listeningPass, speakingFinalPass, writingFinalPass].filter(Boolean).length;

      return {
        studentId: student.id,
        studentName: student.name,
        readingScore: readingHighest,
        readingFormScore: formatCasasFormScore(readingBest),
        readingPass,
        listeningScore: listeningHighest,
        listeningFormScore: formatCasasFormScore(listeningBest),
        listeningPass,
        speakingMidtermScore,
        speakingMidtermPass,
        writingMidtermScore,
        writingMidtermPass,
        midtermPass: isPromoted(midtermPassCount),
        speakingFinalScore,
        speakingFinalPass,
        writingFinalScore,
        writingFinalPass,
        finalPass: isPromoted(finalPassCount),
      };
    });
  }, [
    currentClass,
    students,
    speakingMidtermResults,
    speakingFinalResults,
    writingMidtermResults,
    writingFinalResults,
    speakingMidterm,
    speakingFinal,
    writingMidterm,
    writingFinal,
  ]);

  const printRows: ExitStudentRow[] = useMemo(() => {
    return rows.map(row => ({
      studentId: row.studentId,
      studentName: row.studentName,
      reading: row.readingScore,
      listening: row.listeningScore,
      oral: printTerm === 'midterm' ? row.speakingMidtermScore : row.speakingFinalScore,
      writing: printTerm === 'midterm' ? row.writingMidtermScore : row.writingFinalScore,
    }));
  }, [rows, printTerm]);

  const handleExportExcel = () => {
    if (!currentClass) return;
    const header = [
      'Student',
      'CASAS Reading (Highest)',
      'CASAS Reading P/NP',
      'CASAS Listening (Highest)',
      'CASAS Listening P/NP',
    ];
    if (showMidtermColumns) {
      header.push(
        'Speaking Midterm',
        'Speaking Midterm P/NP',
        'Writing Midterm',
        'Writing Midterm P/NP',
        'Midterm L4 P/NP',
      );
    }
    if (showFinalColumns) {
      header.push(
        'Speaking Final',
        'Speaking Final P/NP',
        'Writing Final',
        'Writing Final P/NP',
        'Final L4 P/NP',
      );
    }
    const data = [
      header,
      ...rows.map(row => {
        const line: Array<string | number> = [
          row.studentName,
          row.readingFormScore,
          row.readingPass ? 'P' : 'NP',
          row.listeningFormScore,
          row.listeningPass ? 'P' : 'NP',
        ];
        if (showMidtermColumns) {
          line.push(
            row.speakingMidtermScore ?? '',
            row.speakingMidtermPass ? 'P' : 'NP',
            row.writingMidtermScore ?? '',
            row.writingMidtermPass ? 'P' : 'NP',
            row.midtermPass ? 'P' : 'NP',
          );
        }
        if (showFinalColumns) {
          line.push(
            row.speakingFinalScore ?? '',
            row.speakingFinalPass ? 'P' : 'NP',
            row.writingFinalScore ?? '',
            row.writingFinalPass ? 'P' : 'NP',
            row.finalPass ? 'P' : 'NP',
          );
        }
        return line;
      }),
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Exit Assessments');
    XLSX.writeFile(wb, `exit-assessments-${currentClass.name.replace(/\s+/g, '-')}.xlsx`);
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Exit assessment - ${currentClass?.name || 'class'}`,
    onPrintError: () => {
      window.alert('Print failed. Scroll to the print preview below and try again.');
    },
  });

  if (!mounted) {
    return <div className="animate-pulse"><div className="h-8 w-48 rounded bg-gray-200" /></div>;
  }

  if (!currentClass) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card text-center py-12">
          <p className="text-gray-500">Class not found</p>
          <Link href="/" className="btn btn-primary mt-4">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-full space-y-6 px-4 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Exit Assessments</h1>
        <p className="text-gray-600">{currentClass.name}</p>
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="text-lg font-semibold text-[var(--cace-navy)]">Export</h2>
        <p className="text-xs text-gray-600">
          Using: Speaking Midterm ({speakingMidterm?.title || 'not designated'}), Writing Midterm ({writingMidterm?.title || 'not designated'}),
          Speaking Final ({speakingFinal?.title || 'not designated'}), Writing Final ({writingFinal?.title || 'not designated'}).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Exit date</label>
            <input
              type="date"
              className="input w-full"
              value={exitDate}
              onChange={e => setExitDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Printout uses</label>
            <select className="input w-full" value={printTerm} onChange={e => setPrintTerm(e.target.value as AssessmentType)}>
              <option value="midterm">Midterm speaking/writing scores</option>
              <option value="final">Final speaking/writing scores</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-600">
          Teacher on printout: <strong>{teacherName || '—'}</strong>
          {' · '}
          <Link href="/settings" className="text-[var(--cace-teal)] underline font-medium">
            Set name in Settings
          </Link>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary inline-flex items-center gap-2"
            disabled={printRows.length === 0}
            onClick={() => void handlePrint()}
          >
            <PrinterIcon className="w-5 h-5" />
            Print (save as PDF)
          </button>
          <button type="button" className="btn btn-secondary inline-flex items-center gap-2" onClick={handleExportExcel}>
            <DocumentArrowDownIcon className="w-5 h-5" />
            Export Excel
          </button>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="text-lg font-semibold text-[var(--cace-navy)]">Table columns</h2>
        <p className="text-xs text-gray-600">
          Hide midterm or final columns when you are not in that part of the year. Your choice is saved for this class.
        </p>
        <div className="flex flex-wrap gap-6">
          <label className="inline-flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={showMidtermColumns}
              onChange={e => setShowMidtermColumns(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show midterm (Speaking, Writing, L4 P/NP)
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={showFinalColumns}
              onChange={e => setShowFinalColumns(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show final (Speaking, Writing, L4 P/NP)
          </label>
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="min-w-[600px] w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="p-3 text-left font-semibold text-gray-700">Student</th>
              <th className="p-3 text-left font-semibold text-gray-700">CASAS Reading (Highest)</th>
              <th className="p-3 text-left font-semibold text-gray-700">CASAS Listening (Highest)</th>
              {showMidtermColumns && (
                <>
                  <th className="p-3 text-left font-semibold text-gray-700">Speaking Midterm</th>
                  <th className="p-3 text-left font-semibold text-gray-700">Writing Midterm</th>
                  <th className="p-3 text-left font-semibold text-gray-700">Midterm L4 P/NP</th>
                </>
              )}
              {showFinalColumns && (
                <>
                  <th className="p-3 text-left font-semibold text-gray-700">Speaking Final</th>
                  <th className="p-3 text-left font-semibold text-gray-700">Writing Final</th>
                  <th className="p-3 text-left font-semibold text-gray-700">Final L4 P/NP</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.studentId} className="border-b border-gray-100">
                <td className="p-3 font-medium text-gray-900 whitespace-nowrap">{row.studentName}</td>
                <td className="p-2">
                  <PassCell score={row.readingScore} pass={row.readingPass} detail={row.readingFormScore} />
                </td>
                <td className="p-2">
                  <PassCell score={row.listeningScore} pass={row.listeningPass} detail={row.listeningFormScore} />
                </td>
                {showMidtermColumns && (
                  <>
                    <td className="p-2"><PassCell score={row.speakingMidtermScore} pass={row.speakingMidtermPass} /></td>
                    <td className="p-2"><PassCell score={row.writingMidtermScore} pass={row.writingMidtermPass} /></td>
                    <td className="p-2"><StatusCell pass={row.midtermPass} /></td>
                  </>
                )}
                {showFinalColumns && (
                  <>
                    <td className="p-2"><PassCell score={row.speakingFinalScore} pass={row.speakingFinalPass} /></td>
                    <td className="p-2"><PassCell score={row.writingFinalScore} pass={row.writingFinalPass} /></td>
                    <td className="p-2"><StatusCell pass={row.finalPass} /></td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {printRows.length > 0 && (
        <div className="space-y-2 print:hidden">
          <h2 className="text-lg font-semibold text-[var(--cace-navy)]">Print preview</h2>
          <p className="text-xs text-gray-600">
            Layout matches the Level 3 exit sheet (two students per letter page). Use Print → Save as PDF.
          </p>
          <div className="overflow-x-auto">
            <ExitAssessmentPrintDocument
              ref={printRef}
              students={printRows}
              teacherName={teacherName}
              exitDateLabel={formatLongDate(exitDate)}
              readingPassMin={currentClass.casasReadingTarget}
              listeningPassMin={currentClass.casasListeningTarget}
              classIsAm={currentClass.schedule.toLowerCase().includes('morning')}
              levelNumber={currentClass.level}
              nextLevelNumber={Math.min(5, currentClass.level + 1)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
