'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowUpTrayIcon,
  PrinterIcon,
} from '@heroicons/react/24/outline';
import { useApp } from '@/components/AppShell';
import {
  ExitAssessmentPrintDocument,
  type ExitStudentRow,
} from '@/components/exit-assessment/ExitAssessmentPrintDocument';
import { getClasses, getStudentsByClass } from '@/lib/storage';
import { formatLongDate } from '@/lib/exit-assessment';
import {
  inferAmPmFromFilename,
  parseExitWorksheetCsv,
  worksheetRowsToDisplayName,
  type ParsedExitWorksheetRow,
} from '@/lib/exit-assessment-csv';
import { downloadExitAssessmentPdfFromElement } from '@/lib/exit-assessment-pdf';
import type { CACELevel, Student } from '@/types';
import './exit-assessment-print.css';

const TEACHER_STORAGE_KEY = 'exitAssessmentTeacherName';

type TabId = 'csv' | 'roster';

function parsedToExitRows(parsed: ParsedExitWorksheetRow[]): ExitStudentRow[] {
  return parsed.map(p => ({
    studentId: `csv-${p.studentId}`,
    studentName: worksheetRowsToDisplayName(p),
    reading: p.reading,
    listening: p.listening,
    oral: p.oral,
    writing: p.writing,
  }));
}

function parseScore(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function ExitAssessmentToolContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentClassId, setCurrentClassId, mounted } = useApp();
  const [tab, setTab] = useState<TabId>('csv');

  const classIdFromUrl = searchParams.get('classId');
  const effectiveClassId = classIdFromUrl || currentClassId || '';

  const [teacherName, setTeacherName] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(TEACHER_STORAGE_KEY) ?? '';
  });
  const [exitDate, setExitDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<Record<string, { r: string; l: string; o: string; w: string }>>(
    {},
  );

  const [csvRows, setCsvRows] = useState<ExitStudentRow[] | null>(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvParseNote, setCsvParseNote] = useState<string | null>(null);
  const [classIsAmCsv, setClassIsAmCsv] = useState(true);
  const [csvReadingMin, setCsvReadingMin] = useState(217);
  const [csvListeningMin, setCsvListeningMin] = useState(212);
  const [csvLevel, setCsvLevel] = useState<CACELevel>(3);

  const printContentRef = useRef<HTMLDivElement>(null);
  const printCsvRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mounted || !classIdFromUrl) return;
    setCurrentClassId(classIdFromUrl);
  }, [mounted, classIdFromUrl, setCurrentClassId]);

  const classes = useMemo(() => {
    if (!mounted) return [];
    return getClasses();
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !effectiveClassId) {
      setStudents([]);
      setScores({});
      return;
    }
    const roster = getStudentsByClass(effectiveClassId);
    setStudents(roster);
    setScores(prev => {
      const next: Record<string, { r: string; l: string; o: string; w: string }> = {};
      for (const s of roster) {
        next[s.id] = prev[s.id] ?? { r: '', l: '', o: '', w: '' };
      }
      return next;
    });
  }, [mounted, effectiveClassId]);

  const selectedClass = classes.find(c => c.id === effectiveClassId) ?? null;

  const exitRows: ExitStudentRow[] = useMemo(() => {
    if (!selectedClass) return [];
    return students.map(s => {
      const sc = scores[s.id] ?? { r: '', l: '', o: '', w: '' };
      return {
        studentId: s.id,
        studentName: s.name,
        reading: parseScore(sc.r),
        listening: parseScore(sc.l),
        oral: parseScore(sc.o),
        writing: parseScore(sc.w),
      };
    });
  }, [students, scores, selectedClass]);

  const exitDateLabel = useMemo(() => formatLongDate(exitDate), [exitDate]);

  const readingPassMinRoster = selectedClass?.casasReadingTarget ?? 217;
  const listeningPassMinRoster = selectedClass?.casasListeningTarget ?? 212;
  const classIsAmRoster = (selectedClass?.schedule ?? '').toLowerCase().includes('morning');
  const levelNumberRoster = selectedClass?.level ?? 3;
  const nextLevelNumberRoster = Math.min(5, levelNumberRoster + 1);
  const nextLevelCsv = Math.min(5, csvLevel + 1);

  const handlePrintSheets = useReactToPrint({
    contentRef: printContentRef,
    documentTitle: selectedClass
      ? `Exit assessment — ${selectedClass.name}`
      : 'Exit assessment',
  });

  const handlePrintCsvPreview = useReactToPrint({
    contentRef: printCsvRef,
    documentTitle: csvFileName
      ? `Exit assessment — ${csvFileName.replace(/\.csv$/i, '')}`
      : 'Exit assessment',
  });

  const setClassId = (id: string) => {
    if (id) {
      setCurrentClassId(id);
      router.push(`/tools/exit-assessment?classId=${encodeURIComponent(id)}`);
    } else {
      router.push('/tools/exit-assessment');
    }
  };

  const persistTeacher = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TEACHER_STORAGE_KEY, teacherName.trim());
  }, [teacherName]);

  const onCsvPick = (fileList: FileList | null) => {
    const f = fileList?.[0];
    if (!f) return;
    setCsvParseNote(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      try {
        const parsed = parseExitWorksheetCsv(text);
        if (parsed.length === 0) {
          setCsvRows(null);
          setCsvFileName('');
          setCsvParseNote(
            'No student rows found. Use the worksheet export with columns: ID, Last, First, Reading, Listening, Speaking, Writing.',
          );
          return;
        }
        setCsvRows(parsedToExitRows(parsed));
        setCsvFileName(f.name);
        const inferred = inferAmPmFromFilename(f.name);
        if (inferred !== null) setClassIsAmCsv(inferred);
        setCsvParseNote(`Loaded ${parsed.length} student(s).`);
      } catch {
        setCsvRows(null);
        setCsvFileName('');
        setCsvParseNote('Could not read that file as CSV.');
      }
    };
    reader.onerror = () => {
      setCsvParseNote('Could not read file.');
    };
    reader.readAsText(f, 'UTF-8');
  };

  const clearCsv = () => {
    setCsvRows(null);
    setCsvFileName('');
    setCsvParseNote(null);
  };

  const runDownloadPdf = async (rootEl: HTMLElement | null, fileName: string) => {
    if (!rootEl) {
      window.alert('Show the preview first (import CSV or pick a class with students), then try again.');
      return;
    }
    try {
      await downloadExitAssessmentPdfFromElement(rootEl, fileName);
    } catch (e) {
      console.error(e);
      window.alert('PDF export failed. Use “Print (browser)” and Save as PDF instead.');
    }
  };

  if (!mounted) {
    return (
      <div className="max-w-3xl mx-auto animate-pulse p-6">
        <div className="h-8 bg-gray-200 rounded w-64" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
            <ArrowLeftIcon className="w-5 h-5" />
            Dashboard
          </Link>
        </div>
      </div>

      <div className="print:hidden">
        <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Exit test printout</h1>
        <p className="text-gray-600 mt-1">
          Layout matches the reference sheet (
          <a
            href="/exit-assessment-preview-reference.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--cace-teal)] underline font-medium"
          >
            static HTML preview
          </a>
          ). Import the worksheet CSV or use a class roster; <strong>Download PDF</strong> captures
          the preview below (same styles as the reference).
        </p>
      </div>

      <div className="card space-y-4 print:hidden">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
          <button
            type="button"
            className={`btn text-sm ${tab === 'csv' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('csv')}
          >
            Import worksheet (CSV)
          </button>
          <button
            type="button"
            className={`btn text-sm ${tab === 'roster' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('roster')}
          >
            Build from class roster
          </button>
        </div>

        {tab === 'csv' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Use the same CSV you maintain in Sheets or Excel (for example “Exit Assessments worksheet
              (25-26) - AM.csv”). AM/PM is inferred from the filename when possible; override with the
              radio buttons if needed.
            </p>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-2 btn btn-secondary cursor-pointer text-sm">
                <ArrowUpTrayIcon className="w-4 h-4" />
                Choose CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={e => {
                    onCsvPick(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              {csvRows && (
                <button type="button" className="btn btn-secondary text-sm" onClick={clearCsv}>
                  Clear import
                </button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Teacher name (on PDF)</label>
                <input
                  type="text"
                  className="input w-full"
                  value={teacherName}
                  onChange={e => setTeacherName(e.target.value)}
                  onBlur={persistTeacher}
                  placeholder="e.g. Katie Salsbury"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Class session</label>
                <div className="flex gap-4 text-sm">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="csvAmPm"
                      checked={classIsAmCsv}
                      onChange={() => setClassIsAmCsv(true)}
                    />
                    AM
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="csvAmPm"
                      checked={!classIsAmCsv}
                      onChange={() => setClassIsAmCsv(false)}
                    />
                    PM
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Level (banner)</label>
                <select
                  className="input w-full"
                  value={csvLevel}
                  onChange={e => setCsvLevel(Number(e.target.value) as CACELevel)}
                >
                  {([0, 1, 2, 3, 4, 5] as const).map(n => (
                    <option key={n} value={n}>
                      Level {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reading pass ≥</label>
                  <input
                    type="number"
                    className="input w-full tabular-nums"
                    value={csvReadingMin}
                    onChange={e => setCsvReadingMin(Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Listening pass ≥</label>
                  <input
                    type="number"
                    className="input w-full tabular-nums"
                    value={csvListeningMin}
                    onChange={e => setCsvListeningMin(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            {csvParseNote && (
              <p
                className={`text-sm rounded-md px-3 py-2 ${
                  csvRows
                    ? 'bg-green-50 text-green-900 border border-green-200'
                    : 'bg-amber-50 text-amber-950 border border-amber-200'
                }`}
              >
                {csvParseNote}
              </p>
            )}

            {csvRows && csvRows.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary inline-flex items-center gap-2"
                  onClick={() =>
                    void runDownloadPdf(
                      printCsvRef.current,
                      csvFileName.replace(/\.csv$/i, '') || 'exit-assessment',
                    )
                  }
                >
                  <ArrowDownTrayIcon className="w-5 h-5" />
                  Download PDF
                </button>
                <button
                  type="button"
                  className="btn btn-secondary inline-flex items-center gap-2"
                  onClick={() => handlePrintCsvPreview()}
                >
                  <PrinterIcon className="w-5 h-5" />
                  Print (browser)
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'roster' && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Class</label>
                <select
                  className="input w-full"
                  value={effectiveClassId}
                  onChange={e => setClassId(e.target.value)}
                >
                  <option value="">Select a class…</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.academicYear}) · {c.schedule}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Exit date</label>
                <input
                  type="date"
                  className="input w-full"
                  value={exitDate}
                  onChange={e => setExitDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Teacher name (printout)</label>
              <input
                type="text"
                className="input w-full max-w-md"
                value={teacherName}
                onChange={e => setTeacherName(e.target.value)}
                onBlur={persistTeacher}
                placeholder="e.g. Katie Salsbury"
              />
            </div>

            {!effectiveClassId && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Choose a class to load the roster. Pass thresholds use that class&apos;s CASAS targets;
                oral and writing cut scores follow the standard exit rubric (12/16 and 24/36).
              </p>
            )}

            {effectiveClassId && !selectedClass && (
              <p className="text-sm text-red-700">Class not found.</p>
            )}

            {selectedClass && students.length === 0 && (
              <p className="text-sm text-gray-600">No students in this class yet.</p>
            )}

            {selectedClass && students.length > 0 && (
              <>
                <p className="text-xs text-gray-500">
                  CASAS pass lines: reading ≥ {readingPassMinRoster}, listening ≥ {listeningPassMinRoster}{' '}
                  (from class targets). Enter scores, then download a PDF or print from the browser.
                </p>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-left">
                        <th className="p-2 font-semibold text-gray-700">Student</th>
                        <th className="p-2 font-semibold text-gray-700 w-24">Reading</th>
                        <th className="p-2 font-semibold text-gray-700 w-24">Listening</th>
                        <th className="p-2 font-semibold text-gray-700 w-24">Oral</th>
                        <th className="p-2 font-semibold text-gray-700 w-24">Writing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map(s => (
                        <tr key={s.id} className="border-b border-gray-100">
                          <td className="p-2 font-medium text-gray-900 whitespace-nowrap">{s.name}</td>
                          {(['r', 'l', 'o', 'w'] as const).map(key => (
                            <td key={key} className="p-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                className="input w-full py-1 text-center tabular-nums"
                                value={scores[s.id]?.[key] ?? ''}
                                onChange={e => {
                                  const v = e.target.value;
                                  setScores(prev => ({
                                    ...prev,
                                    [s.id]: { ...(prev[s.id] ?? { r: '', l: '', o: '', w: '' }), [key]: v },
                                  }));
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary inline-flex items-center gap-2"
                    onClick={() =>
                      void runDownloadPdf(
                        printContentRef.current,
                        selectedClass
                          ? `exit-assessment-${selectedClass.name.replace(/\s+/g, '-')}`
                          : 'exit-assessment',
                      )
                    }
                  >
                    <ArrowDownTrayIcon className="w-5 h-5" />
                    Download PDF
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary inline-flex items-center gap-2"
                    onClick={() => handlePrintSheets()}
                  >
                    <PrinterIcon className="w-5 h-5" />
                    Print (browser)
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {tab === 'roster' && selectedClass && exitRows.length > 0 && (
        <div className="print:hidden space-y-2 mt-8 overflow-x-auto">
          <h2 className="text-sm font-semibold text-gray-700">Preview (browser print)</h2>
          <ExitAssessmentPrintDocument
            ref={printContentRef}
            students={exitRows}
            teacherName={teacherName}
            exitDateLabel={exitDateLabel}
            readingPassMin={readingPassMinRoster}
            listeningPassMin={listeningPassMinRoster}
            classIsAm={classIsAmRoster}
            levelNumber={levelNumberRoster}
            nextLevelNumber={nextLevelNumberRoster}
          />
        </div>
      )}

      {tab === 'csv' && csvRows && csvRows.length > 0 && (
        <div className="print:hidden space-y-2 mt-8 overflow-x-auto">
          <h2 className="text-sm font-semibold text-gray-700">Preview (browser print)</h2>
          <ExitAssessmentPrintDocument
            ref={printCsvRef}
            students={csvRows}
            teacherName={teacherName}
            exitDateLabel={exitDateLabel}
            readingPassMin={csvReadingMin}
            listeningPassMin={csvListeningMin}
            classIsAm={classIsAmCsv}
            levelNumber={csvLevel}
            nextLevelNumber={nextLevelCsv}
          />
        </div>
      )}
    </div>
  );
}

export default function ExitAssessmentToolPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto animate-pulse p-6">
          <div className="h-8 bg-gray-200 rounded w-64" />
        </div>
      }
    >
      <ExitAssessmentToolContent />
    </Suspense>
  );
}
