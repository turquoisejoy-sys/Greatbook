'use client';

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import {
  getStudentsByClass,
  getClasses,
  getReportCardsByStudent,
  createReportCard,
  updateReportCard,
  deleteReportCard,
  getCASASTestsByStudent,
  getUnitTestsByStudent,
  getAttendanceByStudent,
  getISSTRecordsByStudent,
  getNotesByStudent,
} from '@/lib/storage';
import {
  getStudentStats,
  getStudentsWithRanks,
  sortStudentsByLastName,
  getColorLevel,
  getColorClass,
} from '@/lib/calculations';
import { Student, Class, ReportCard, StudentWithStats, CASASTest, UnitTest, Attendance, ISSTRecord, StudentNote } from '@/types';
import { subscribeSyncStatus } from '@/lib/sync';
import {
  PrinterIcon,
  DocumentPlusIcon,
  TrashIcon,
  ChevronDownIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  Cell,
  LabelList,
} from 'recharts';

/** Fixed pixel size — ResponsiveContainer breaks in print when body uses visibility:hidden. */
function CASASLineChart({
  tests,
  target,
  levelStart,
  color = '#3B9B8E',
  chartHeight = 140,
}: {
  tests: CASASTest[];
  target: number;
  levelStart: number;
  color?: string;
  /** Shorter charts in print so Reading + Listening fit one page side-by-side */
  chartHeight?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 560, h: chartHeight });

  useLayoutEffect(() => {
    setDims((d) => ({ ...d, h: chartHeight }));
  }, [chartHeight]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w >= 200) {
        setDims((d) => ({ w, h: d.h }));
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const onPrint = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(measure);
      });
    };
    window.addEventListener('beforeprint', onPrint);
    window.addEventListener('afterprint', onPrint);
    return () => {
      ro.disconnect();
      window.removeEventListener('beforeprint', onPrint);
      window.removeEventListener('afterprint', onPrint);
    };
  }, []);

  const sortedTests = [...tests]
    .filter(t => t.score !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sortedTests.length === 0) {
    return (
      <div className="h-[100px] flex items-center justify-center bg-gray-50 rounded text-gray-400 text-sm">
        No test data
      </div>
    );
  }

  const data = sortedTests.map(test => {
    const date = new Date(test.date + 'T00:00:00');
    const label = `${date.getMonth() + 1}/${date.getDate()}-${test.formNumber}: ${test.score}`;
    return {
      label,
      score: test.score,
    };
  });

  const scores = sortedTests.map(t => t.score as number);
  const minScore = Math.min(...scores, levelStart);
  const maxScore = Math.max(...scores, target);
  const padding = Math.ceil((maxScore - minScore) * 0.1) || 5;
  const yMin = Math.floor(minScore - padding);
  const yMax = Math.ceil(maxScore + padding);
  const xAxisH = chartHeight <= 118 ? 34 : 46;

  return (
    <div
      ref={wrapRef}
      className="chart-container casas-line-chart-wrap w-full min-w-0"
      style={{ minHeight: dims.h }}
    >
      <LineChart
        width={dims.w}
        height={dims.h}
        data={data}
        margin={{ top: chartHeight <= 118 ? 4 : 8, right: 6, bottom: 2, left: 2 }}
      >
        <XAxis
          dataKey="label"
          tick={{ fontSize: chartHeight <= 118 ? 7 : 8 }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
          interval={0}
          angle={-22}
          textAnchor="end"
          height={xAxisH}
          tickMargin={2}
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fontSize: 9 }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
          width={32}
        />
        <ReferenceLine
          y={target}
          stroke="#22c55e"
          strokeDasharray="4 4"
          label={{ value: 'L4', fontSize: 9, fill: '#22c55e', position: 'insideTopRight' }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke={color}
          strokeWidth={2}
          dot={{ fill: color, strokeWidth: 0, r: 3 }}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}

// Map class rank to a softer "Overall Performance" tier (thirds: above / average / below)
function getPerformanceTier(rank: number, totalStudents: number): string {
  if (totalStudents <= 0) return 'Average';
  const third = Math.ceil(totalStudents / 3);
  if (rank <= third) return 'Above average';
  if (rank > totalStudents - third) return 'Below average';
  return 'Average';
}

// Bar fill for attendance (match getScoreBgColor logic: 80+ green, 60+ yellow, else red; vacation = gray)
function getAttendanceBarColor(percentage: number, isVacation: boolean): string {
  if (isVacation) return '#9ca3af';
  if (percentage >= 80) return '#22c55e';
  if (percentage >= 60) return '#eab308';
  return '#ef4444';
}

// School year order: Aug (8) through Jul (7). Sort by (school year, month index), then take last 12.
function sortAttendanceAugustToPresent(attendance: Attendance[]): Attendance[] {
  return [...attendance].sort((a, b) => {
    const [yA, mA] = a.month.split('-').map(Number);
    const [yB, mB] = b.month.split('-').map(Number);
    const schoolYearA = mA >= 8 ? yA : yA - 1;
    const schoolYearB = mB >= 8 ? yB : yB - 1;
    if (schoolYearA !== schoolYearB) return schoolYearA - schoolYearB;
    const idxA = (mA - 8 + 12) % 12;
    const idxB = (mB - 8 + 12) % 12;
    return idxA - idxB;
  });
}

// Monthly Attendance Bar Chart
function AttendanceBarChart({
  attendance,
  chartHeight = 150,
}: {
  attendance: Attendance[];
  chartHeight?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [barW, setBarW] = useState(320);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const rw = Math.floor(el.getBoundingClientRect().width);
      if (rw >= 200) setBarW(rw);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const onP = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(measure);
      });
    };
    window.addEventListener('beforeprint', onP);
    window.addEventListener('afterprint', onP);
    return () => {
      ro.disconnect();
      window.removeEventListener('beforeprint', onP);
      window.removeEventListener('afterprint', onP);
    };
  }, []);

  const sorted = sortAttendanceAugustToPresent(attendance);
  const data = sorted.slice(-12).map(a => {
    const monthNum = a.month.split('-')[1];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = monthNames[parseInt(monthNum, 10) - 1] || monthNum;
    return {
      month: monthName,
      percentage: a.isVacation ? 0 : a.percentage,
      barHeight: a.isVacation ? 5 : a.percentage, // small visible bar for vacation
      isVacation: a.isVacation,
      displayLabel: a.isVacation ? 'Out' : `${a.percentage.toFixed(0)}%`,
    };
  });

  if (data.length === 0) return null;

  const topM = chartHeight <= 125 ? 16 : 22;

  return (
    <div ref={wrapRef} className="chart-container w-full min-w-0" style={{ minHeight: chartHeight }}>
      <BarChart
        data={data}
        width={barW}
        height={chartHeight}
        margin={{ top: topM, right: 8, bottom: 4, left: 0 }}
      >
        <XAxis
          dataKey="month"
          tick={{ fontSize: 9 }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 9 }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
          width={28}
          tickFormatter={(v) => `${v}%`}
        />
        <Bar dataKey="barHeight" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          <LabelList dataKey="displayLabel" position="top" fontSize={9} fill="#374151" />
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getAttendanceBarColor(entry.percentage, entry.isVacation)} />
          ))}
        </Bar>
      </BarChart>
    </div>
  );
}

/** True while print dialog / PDF preview is active — tighter charts & spacing for one-page layout */
function usePrintMode(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const on = () => setPrinting(true);
    const off = () => setPrinting(false);
    window.addEventListener('beforeprint', on);
    window.addEventListener('afterprint', off);
    return () => {
      window.removeEventListener('beforeprint', on);
      window.removeEventListener('afterprint', off);
    };
  }, []);
  return printing;
}

export default function ReportCardsPage() {
  const params = useParams();
  const { setCurrentClassId, mounted } = useApp();
  const classId = params.classId as string;
  const printRef = useRef<HTMLDivElement>(null);
  const printing = usePrintMode();
  const casasChartH = printing ? 110 : 140;
  const attendanceChartH = printing ? 118 : 150;

  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsWithRanks, setStudentsWithRanks] = useState<StudentWithStats[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<StudentWithStats | null>(null);
  const [pastReportCards, setPastReportCards] = useState<ReportCard[]>([]);
  const [viewingPastCard, setViewingPastCard] = useState<ReportCard | null>(null);
  
  // Form state
  const [periodName, setPeriodName] = useState(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    if (month >= 7 && month <= 11) return `Fall ${year}`;
    if (month >= 0 && month <= 4) return `Spring ${year}`;
    return `Summer ${year}`;
  });
  const [teacherComments, setTeacherComments] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Test data for display
  const [readingTests, setReadingTests] = useState<CASASTest[]>([]);
  const [listeningTests, setListeningTests] = useState<CASASTest[]>([]);
  const [unitTests, setUnitTests] = useState<UnitTest[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [isstRecords, setIsstRecords] = useState<ISSTRecord[]>([]);
  const [studentNotes, setStudentNotes] = useState<StudentNote[]>([]);

  useEffect(() => {
    if (mounted) {
      const allClasses = getClasses();
      const cls = allClasses.find(c => c.id === classId);
      setCurrentClass(cls || null);
      if (cls) {
        setCurrentClassId(cls.id);
        const studentList = getStudentsByClass(classId);
        setStudents(studentList);
        const ranked = getStudentsWithRanks(studentList, cls);
        setStudentsWithRanks(ranked);
      }
    }
  }, [classId, setCurrentClassId, mounted]);

  /** Always read ranks + tests from storage so “New” report card matches Analysis / latest CASAS. */
  const reloadLiveStudentData = useCallback(
    (studentId: string) => {
      if (!currentClass) return;
      const studentList = getStudentsByClass(classId);
      const ranked = getStudentsWithRanks(studentList, currentClass);
      setStudentsWithRanks(ranked);
      setSelectedStudent(ranked.find(s => s.id === studentId) || null);
      setReadingTests(getCASASTestsByStudent(studentId, 'reading'));
      setListeningTests(getCASASTestsByStudent(studentId, 'listening'));
      setUnitTests(getUnitTestsByStudent(studentId));
      setAttendance(getAttendanceByStudent(studentId));
      setIsstRecords(getISSTRecordsByStudent(studentId));
      setStudentNotes(getNotesByStudent(studentId));
    },
    [classId, currentClass],
  );

  useEffect(() => {
    if (selectedStudentId && currentClass) {
      reloadLiveStudentData(selectedStudentId);
      setPastReportCards(getReportCardsByStudent(selectedStudentId));
      setViewingPastCard(null);
      setTeacherComments('');
      setSaveMessage('');
    }
  }, [selectedStudentId, currentClass, reloadLiveStudentData]);

  // Re-read from storage after sync or returning to the tab so charts/stats stay current
  useEffect(() => {
    if (!selectedStudentId || !currentClass) return;

    const refreshReference = () => {
      reloadLiveStudentData(selectedStudentId);
    };

    const unsub = subscribeSyncStatus((status) => {
      if (status === 'synced') refreshReference();
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshReference();
    };
    window.addEventListener('focus', refreshReference);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsub();
      window.removeEventListener('focus', refreshReference);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [selectedStudentId, currentClass, reloadLiveStudentData]);

  useEffect(() => {
    const onBeforePrint = () => {
      if (selectedStudentId && currentClass) reloadLiveStudentData(selectedStudentId);
    };
    window.addEventListener('beforeprint', onBeforePrint);
    return () => window.removeEventListener('beforeprint', onBeforePrint);
  }, [selectedStudentId, currentClass, reloadLiveStudentData]);

  const handleViewPastCard = (card: ReportCard) => {
    setViewingPastCard(card);
    // Use new field if available, otherwise combine legacy fields
    if (card.teacherComments) {
      setTeacherComments(card.teacherComments);
    } else {
      // Combine legacy fields for backward compatibility
      const parts = [];
      if (card.speakingSkills) parts.push(`Speaking: ${card.speakingSkills}`);
      if (card.writingSkills) parts.push(`Writing: ${card.writingSkills}`);
      if (card.suggestionsForImprovement) parts.push(`Suggestions: ${card.suggestionsForImprovement}`);
      setTeacherComments(parts.join('\n\n'));
    }
    setPeriodName(card.periodName);
  };

  const handleNewCard = () => {
    setViewingPastCard(null);
    setTeacherComments('');
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    if (month >= 7 && month <= 11) setPeriodName(`Fall ${year}`);
    else if (month >= 0 && month <= 4) setPeriodName(`Spring ${year}`);
    else setPeriodName(`Summer ${year}`);
    if (selectedStudentId) reloadLiveStudentData(selectedStudentId);
  };

  const handleSaveReportCard = () => {
    if (!selectedStudent || !currentClass) return;
    setIsSaving(true);

    const totalStudents = studentsWithRanks.filter(s => s.isComplete).length;

    if (viewingPastCard) {
      // Update existing
      updateReportCard(viewingPastCard.id, {
        periodName,
        teacherComments,
      });
      setSaveMessage('Report card updated!');
    } else {
      // Create new
      createReportCard({
        studentId: selectedStudent.id,
        periodName,
        casasReadingAvg: selectedStudent.casasReadingAvg,
        casasReadingProgress: selectedStudent.casasReadingProgress,
        casasListeningAvg: selectedStudent.casasListeningAvg,
        casasListeningProgress: selectedStudent.casasListeningProgress,
        testAverage: selectedStudent.testAverage,
        attendanceAverage: selectedStudent.attendanceAverage,
        rank: selectedStudent.rank,
        totalStudents,
        teacherComments,
      });
      setSaveMessage('Report card saved!');
    }

    // Refresh past cards
    setPastReportCards(getReportCardsByStudent(selectedStudentId));
    setIsSaving(false);
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleDeleteReportCard = (cardId: string) => {
    if (!confirm('Delete this report card? This cannot be undone.')) return;
    deleteReportCard(cardId);
    setPastReportCards(getReportCardsByStudent(selectedStudentId));
    if (viewingPastCard?.id === cardId) {
      handleNewCard();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getScoreStatus = (score: number | null) => {
    if (score === null) return { label: 'No Data', color: 'text-gray-500' };
    if (score >= 90) return { label: 'Excellent', color: 'text-green-600' };
    if (score >= 80) return { label: 'Good', color: 'text-green-500' };
    if (score >= 70) return { label: 'Satisfactory', color: 'text-yellow-600' };
    return { label: 'Needs Improvement', color: 'text-red-500' };
  };

  // Get background color class for score cells
  const getScoreBgColor = (score: number | null) => {
    if (score === null) return '';
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (!mounted) {
    return <div className="animate-pulse"><div className="h-8 bg-gray-200 rounded w-48"></div></div>;
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

  const displayData = viewingPastCard ? {
    casasReadingProgress: viewingPastCard.casasReadingProgress,
    casasReadingAvg: viewingPastCard.casasReadingAvg,
    casasReadingLast: viewingPastCard.casasReadingAvg, // Past cards stored avg, show as last
    casasListeningProgress: viewingPastCard.casasListeningProgress,
    casasListeningAvg: viewingPastCard.casasListeningAvg,
    casasListeningLast: viewingPastCard.casasListeningAvg, // Past cards stored avg, show as last
    testAverage: viewingPastCard.testAverage,
    attendanceAverage: viewingPastCard.attendanceAverage,
    rank: viewingPastCard.rank,
    totalStudents: viewingPastCard.totalStudents,
    isComplete: viewingPastCard.rank !== null,
  } : selectedStudent ? {
    ...selectedStudent,
    totalStudents: studentsWithRanks.length,
  } : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header - Hidden when printing */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Report Cards</h1>
          <p className="text-gray-600">{currentClass.name}</p>
        </div>
      </div>

      {/* Student Selection - Hidden when printing */}
      <div className="card print:hidden">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Student
            </label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="input"
            >
              <option value="">Choose a student...</option>
              {sortStudentsByLastName(studentsWithRanks).map(student => (
                <option key={student.id} value={student.id}>
                  {student.name} {student.rank ? `(#${student.rank})` : '(Incomplete)'}
                </option>
              ))}
            </select>
          </div>
          
          {selectedStudentId && (
            <>
              <div className="min-w-[150px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period Name
                </label>
                <input
                  type="text"
                  value={periodName}
                  onChange={(e) => setPeriodName(e.target.value)}
                  className="input"
                  placeholder="e.g., Fall 2025"
                />
              </div>
              <button onClick={handlePrint} className="btn btn-secondary">
                <PrinterIcon className="w-5 h-5" />
                Print
              </button>
            </>
          )}
        </div>

        {/* Past Report Cards */}
        {selectedStudentId && pastReportCards.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium text-gray-700 mb-2">Past Report Cards</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleNewCard}
                className={`px-3 py-1 rounded text-sm ${
                  !viewingPastCard ? 'bg-[var(--cace-teal)] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <DocumentPlusIcon className="w-4 h-4 inline mr-1" />
                New
              </button>
              {pastReportCards.map(card => (
                <div key={card.id} className="flex items-center gap-1">
                  <button
                    onClick={() => handleViewPastCard(card)}
                    className={`px-3 py-1 rounded text-sm ${
                      viewingPastCard?.id === card.id 
                        ? 'bg-[var(--cace-navy)] text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {card.periodName}
                  </button>
                  <button
                    onClick={() => handleDeleteReportCard(card.id)}
                    className="p-1 text-gray-400 hover:text-red-500"
                    title="Delete"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Report card (+ on-screen reference). Print: main card only; reference is print:hidden */}
      {selectedStudent && displayData && (
        <div ref={printRef} className="report-print-root space-y-6">
        <div className="card print:shadow-none print:border-none print:px-4 print:py-3 print:text-[11px] print:leading-tight print:[&_h2]:text-lg print:[&_h3]:text-base print:[&_h4]:text-sm">
          {/* Report Card Header */}
          <div className="text-center border-b pb-4 mb-4 print:pb-2 print:mb-2">
            <h2 className="text-2xl font-bold text-[var(--cace-navy)]">
              Campbell Adult and Community Education
            </h2>
            <p className="text-[var(--cace-teal)] font-medium">Student Progress Report</p>
            <p className="text-gray-600 mt-1 print:mt-0.5">{periodName}</p>
          </div>

          {/* Student Info */}
          <div className="flex justify-between items-start mb-6 pb-4 border-b print:mb-3 print:pb-2">
            <div>
              <h3 className="text-xl font-semibold text-[var(--cace-navy)]">
                {selectedStudent.name}
              </h3>
              <p className="text-gray-600">{currentClass.name} • {currentClass.schedule}</p>
              <p className="text-sm text-gray-500">
                Report Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div className="text-right">
              {displayData.isComplete && displayData.rank !== null ? (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Overall Performance</p>
                  <div className="flex flex-col gap-0.5 items-end">
                    {(['Above average', 'Average', 'Below average'] as const).map((tier) => {
                      const isActive = getPerformanceTier(displayData.rank!, displayData.totalStudents) === tier;
                      return (
                        <div
                          key={tier}
                          className="inline-flex items-center justify-end gap-0.5 w-fit"
                        >
                          {tier === 'Above average' && isActive && (
                            <TrophyIcon className="w-5 h-5 text-yellow-500 shrink-0 -translate-x-px" aria-hidden />
                          )}
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              isActive
                                ? 'ring-2 ring-[var(--cace-navy)] ring-offset-0.5 text-[var(--cace-navy)]'
                                : 'text-gray-400'
                            }`}
                          >
                            {tier}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 italic">Not Ranked</p>
              )}
            </div>
          </div>

          {/* CASAS Progress - Line Charts (screen: 2-col md+; print: always 2 columns, one row) */}
          <div className="mb-6 casas-charts-section print:mb-3">
            <h4 className="font-semibold text-[var(--cace-navy)] mb-3 print:mb-1.5">CASAS Progress</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-2 print:items-start">
              {/* CASAS Reading Chart */}
              <div>
                <div className="flex justify-between text-sm mb-2 items-center">
                  <span className="font-medium">Reading</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${getColorClass(getColorLevel(displayData.casasReadingProgress, currentClass.colorThresholds))}`}>
                    {displayData.casasReadingProgress !== null 
                      ? (displayData.casasReadingProgress >= 100 ? 'GOAL!' : `${displayData.casasReadingProgress.toFixed(0)}%`)
                      : '—'}
                  </span>
                </div>
                <CASASLineChart 
                  tests={readingTests} 
                  target={currentClass.casasReadingTarget}
                  levelStart={currentClass.casasReadingLevelStart}
                  color="#3B9B8E"
                  chartHeight={casasChartH}
                />
                <p className="text-xs text-gray-500 mt-1 print:text-[10px] print:mt-0.5 print:leading-snug">
                  Last test: {displayData.casasReadingLast?.toFixed(0) || '—'} | Target score:{' '}
                  {currentClass.casasReadingTarget}
                  <span className="text-gray-400"> · </span>
                  <span className="text-gray-600">Gain:</span>{' '}
                  <span className="font-semibold text-[var(--cace-navy)] tabular-nums">
                    {selectedStudent.casasReadingGain !== null && selectedStudent.casasReadingGain !== undefined
                      ? selectedStudent.casasReadingGain
                      : '—'}
                  </span>
                </p>
              </div>

              {/* CASAS Listening Chart */}
              <div>
                <div className="flex justify-between text-sm mb-2 items-center">
                  <span className="font-medium">Listening</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${getColorClass(getColorLevel(displayData.casasListeningProgress, currentClass.colorThresholds))}`}>
                    {displayData.casasListeningProgress !== null 
                      ? (displayData.casasListeningProgress >= 100 ? 'GOAL!' : `${displayData.casasListeningProgress.toFixed(0)}%`)
                      : '—'}
                  </span>
                </div>
                <CASASLineChart 
                  tests={listeningTests} 
                  target={currentClass.casasListeningTarget}
                  levelStart={currentClass.casasListeningLevelStart}
                  color="#1E3A5F"
                  chartHeight={casasChartH}
                />
                <p className="text-xs text-gray-500 mt-1 print:text-[10px] print:mt-0.5 print:leading-snug">
                  Last test: {displayData.casasListeningLast?.toFixed(0) || '—'} | Target score:{' '}
                  {currentClass.casasListeningTarget}
                  <span className="text-gray-400"> · </span>
                  <span className="text-gray-600">Gain:</span>{' '}
                  <span className="font-semibold text-[var(--cace-navy)] tabular-nums">
                    {selectedStudent.casasListeningGain !== null && selectedStudent.casasListeningGain !== undefined
                      ? selectedStudent.casasListeningGain
                      : '—'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Unit Tests & Attendance — grid row height = left column; right column flex pushes chart to bottom */}
          <div className="mb-6 grid grid-cols-2 gap-6 text-sm print:mb-3 print:gap-3 items-stretch">
            {/* Unit Tests */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-[var(--cace-navy)]">Unit Tests</h4>
                {displayData.testAverage !== null && (
                  <span className={`text-xs px-2 py-0.5 rounded ${getScoreBgColor(displayData.testAverage)}`}>
                    Avg: {displayData.testAverage.toFixed(0)}%
                  </span>
                )}
              </div>
              {unitTests.length === 0 ? (
                <p className="text-gray-400 text-xs">No tests recorded</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1">Test</th>
                      <th className="text-right py-1">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitTests.slice(0, 8).map(test => (
                      <tr key={test.id} className="border-b border-gray-100">
                        <td className="py-1">{test.testName}</td>
                        <td className="py-1 text-right">
                          <span className={`px-1.5 py-0.5 rounded ${getScoreBgColor(test.score)}`}>
                            {test.score}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Monthly Attendance — bottom of chart lines up with bottom of unit test table */}
            <div className="attendance-chart-section flex flex-col h-full min-h-0">
              <div className="flex justify-between items-center mb-2 shrink-0">
                <h4 className="font-semibold text-[var(--cace-navy)]">Monthly Attendance</h4>
                {displayData.attendanceAverage !== null && (
                  <span className={`text-xs px-2 py-0.5 rounded ${getScoreBgColor(displayData.attendanceAverage)}`}>
                    Avg: {displayData.attendanceAverage.toFixed(0)}%
                  </span>
                )}
              </div>
              {attendance.length === 0 ? (
                <p className="text-gray-400 text-xs self-start">No attendance recorded</p>
              ) : (
                <div className="mt-auto w-full min-w-0">
                  <AttendanceBarChart attendance={attendance} chartHeight={attendanceChartH} />
                </div>
              )}
            </div>
          </div>

          {/* Teacher Comments */}
          <div className="border-t pt-4 print:pt-2">
            <h4 className="font-semibold text-[var(--cace-navy)] mb-2 print:mb-1">Teacher Comments</h4>
            <textarea
              value={teacherComments}
              onChange={(e) => setTeacherComments(e.target.value)}
              className="input text-sm print:border print:border-gray-300 print:rounded print:p-1.5 print:resize-none w-full print:min-h-[2.75rem] print:max-h-24 print:text-xs print:leading-snug"
              rows={4}
              placeholder="Comments on student progress, speaking/writing skills, areas for improvement..."
            />
          </div>


          {/* Save Button - Hidden when printing */}
          <div className="mt-4 pt-4 border-t flex items-center gap-3 print:hidden">
            <button
              onClick={handleSaveReportCard}
              disabled={isSaving}
              className="btn btn-primary"
            >
              {viewingPastCard ? 'Update Report Card' : 'Save Report Card'}
            </button>
            {saveMessage && (
              <span className="text-green-600 text-sm">{saveMessage}</span>
            )}
          </div>
        </div>

      {/* Reference: ISST & Notes — on-screen only; not part of printed report */}
      {selectedStudentId && (
        <div className="card mt-6 print:hidden">
          <h3 className="text-sm font-semibold text-[var(--cace-navy)] mb-3">Reference for teacher comments</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">ISST attendance</h4>
              {(() => {
                const monthTotals = new Map<string, number>();
                for (const r of isstRecords) {
                  if (!Array.isArray(r.dates) || r.dates.length === 0) continue;
                  const key = r.month;
                  monthTotals.set(key, (monthTotals.get(key) ?? 0) + r.dates.length);
                }
                const monthsSorted = [...monthTotals.keys()].sort((a, b) => b.localeCompare(a));
                if (monthsSorted.length === 0) {
                  return (
                    <p className="text-gray-400 text-xs">No ISST dates recorded</p>
                  );
                }
                const formatMonthLabel = (monthKey: string) => {
                  const [y, m] = monthKey.split('-');
                  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                  const idx = parseInt(m, 10) - 1;
                  const label = idx >= 0 && idx < 12 ? names[idx] : m;
                  return `${label} ${y}`;
                };
                return (
                  <ul className="space-y-2">
                    {monthsSorted.map((monthKey) => {
                      const count = monthTotals.get(monthKey) ?? 0;
                      return (
                        <li key={monthKey} className="text-gray-700">
                          <span className="font-medium">{formatMonthLabel(monthKey)}:</span>{' '}
                          <span className="tabular-nums">
                            {count} {count === 1 ? 'time' : 'times'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Notes</h4>
              {studentNotes.length === 0 ? (
                <p className="text-gray-400 text-xs">No notes</p>
              ) : (
                <ul className="space-y-2">
                  {studentNotes
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((n) => (
                      <li key={n.id} className="text-gray-700">
                        <span className="text-gray-500 text-xs">{n.date}</span>
                        <p className="mt-0.5 whitespace-pre-wrap">{n.content}</p>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
        </div>
      )}

      {/* Empty State */}
      {!selectedStudentId && (
        <div className="card text-center py-12">
          <DocumentPlusIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">Select a Student</h3>
          <p className="text-gray-500">Choose a student above to create or view their report card</p>
        </div>
      )}

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          @page {
            size: letter;
            margin: 0.35in;
          }
          html, body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * {
            visibility: hidden;
          }
          .report-print-root,
          .report-print-root * {
            visibility: visible;
          }
          /* Flow in document instead of absolute — avoids phantom 2nd page from min-h-screen + empty main */
          .report-print-root {
            position: relative !important;
            left: auto !important;
            top: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 8px 10px !important;
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
            min-height: 0 !important;
            zoom: 0.94;
          }
          /* App shell: flex + min-h-screen reserves full viewport height when printing */
          body > div.flex.min-h-screen {
            min-height: 0 !important;
            height: auto !important;
          }
          aside.sidebar {
            display: none !important;
          }
          main {
            overflow: visible !important;
            min-height: 0 !important;
            height: auto !important;
            padding: 0 !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          /* Recharts: explicit width/height from JS; keep wrappers from clipping */
          .report-print-root .casas-charts-section .chart-container {
            overflow: visible !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
          }
          .report-print-root .chart-container .recharts-wrapper,
          .report-print-root .chart-container svg {
            max-width: 100% !important;
            overflow: visible !important;
          }
          /* Force background colors to print */
          .bg-gray-200, .bg-green-500, .bg-green-400, .bg-yellow-400, .bg-red-400 {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          /* Progress bar containers */
          .rounded-full {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
