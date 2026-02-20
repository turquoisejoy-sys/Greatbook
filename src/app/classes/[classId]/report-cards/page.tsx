'use client';

import { useState, useEffect, useRef } from 'react';
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

// CASAS Line Chart Component
function CASASLineChart({ 
  tests, 
  target, 
  levelStart,
  color = '#3B9B8E' 
}: { 
  tests: CASASTest[]; 
  target: number;
  levelStart: number;
  color?: string;
}) {
  // Sort tests by date and filter valid scores
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

  // Prepare data for chart - include score in label for print
  const data = sortedTests.map(test => {
    const date = new Date(test.date + 'T00:00:00');
    const label = `${date.getMonth() + 1}/${date.getDate()}-${test.formNumber}: ${test.score}`;
    return {
      label,
      score: test.score,
    };
  });

  // Calculate Y-axis domain with some padding
  const scores = sortedTests.map(t => t.score as number);
  const minScore = Math.min(...scores, levelStart);
  const maxScore = Math.max(...scores, target);
  const padding = Math.ceil((maxScore - minScore) * 0.1) || 5;
  const yMin = Math.floor(minScore - padding);
  const yMax = Math.ceil(maxScore + padding);

  return (
    <div className="chart-container" style={{ width: '100%', height: 100 }}>
      <LineChart 
        data={data} 
        width={320} 
        height={100} 
        margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
        style={{ maxWidth: '100%' }}
      >
        <XAxis 
          dataKey="label" 
          tick={{ fontSize: 8 }} 
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
          interval={0}
        />
        <YAxis 
          domain={[yMin, yMax]} 
          tick={{ fontSize: 9 }} 
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
          width={30}
        />
        <ReferenceLine 
          y={target} 
          stroke="#22c55e" 
          strokeDasharray="4 4" 
          label={{ value: 'Target', fontSize: 9, fill: '#22c55e', position: 'right' }}
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

// Bar fill for attendance (match getScoreBgColor logic: 80+ green, 60+ yellow, else red; vacation = gray)
function getAttendanceBarColor(percentage: number, isVacation: boolean): string {
  if (isVacation) return '#9ca3af';
  if (percentage >= 80) return '#22c55e';
  if (percentage >= 60) return '#eab308';
  return '#ef4444';
}

// Monthly Attendance Bar Chart
function AttendanceBarChart({ attendance }: { attendance: Attendance[] }) {
  const data = attendance.slice(0, 12).map(a => {
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

  return (
    <div className="chart-container" style={{ width: '100%', height: 140 }}>
      <BarChart
        data={data}
        width={320}
        height={140}
        margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
        style={{ maxWidth: '100%' }}
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

export default function ReportCardsPage() {
  const params = useParams();
  const { setCurrentClassId, mounted } = useApp();
  const classId = params.classId as string;
  const printRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (selectedStudentId && currentClass) {
      const studentStats = studentsWithRanks.find(s => s.id === selectedStudentId);
      setSelectedStudent(studentStats || null);
      
      // Load test data
      setReadingTests(getCASASTestsByStudent(selectedStudentId, 'reading'));
      setListeningTests(getCASASTestsByStudent(selectedStudentId, 'listening'));
      setUnitTests(getUnitTestsByStudent(selectedStudentId));
      setAttendance(getAttendanceByStudent(selectedStudentId));
      setIsstRecords(getISSTRecordsByStudent(selectedStudentId));
      setStudentNotes(getNotesByStudent(selectedStudentId));
      
      // Load past report cards
      setPastReportCards(getReportCardsByStudent(selectedStudentId));
      
      // Reset form
      setViewingPastCard(null);
      setTeacherComments('');
      setSaveMessage('');
    }
  }, [selectedStudentId, currentClass, studentsWithRanks]);

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

      {/* Report Card Preview */}
      {selectedStudent && displayData && (
        <div ref={printRef} className="card print:shadow-none print:border-none">
          {/* Report Card Header */}
          <div className="text-center border-b pb-4 mb-4">
            <h2 className="text-2xl font-bold text-[var(--cace-navy)]">
              Campbell Adult and Community Education
            </h2>
            <p className="text-[var(--cace-teal)] font-medium">Student Progress Report</p>
            <p className="text-gray-600 mt-1">{periodName}</p>
          </div>

          {/* Student Info */}
          <div className="flex justify-between items-start mb-6 pb-4 border-b">
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
                <div className="flex items-center gap-2">
                  {displayData.rank <= 10 && (
                    <TrophyIcon className="w-6 h-6 text-yellow-500" />
                  )}
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Class Rank</p>
                    <p className="text-2xl font-bold text-[var(--cace-navy)]">
                      #{displayData.rank}
                    </p>
                    <p className="text-sm text-gray-500">
                      of {displayData.totalStudents} students
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 italic">Not Ranked</p>
              )}
            </div>
          </div>

          {/* CASAS Progress - Line Charts */}
          <div className="mb-6 casas-charts-section">
            <h4 className="font-semibold text-[var(--cace-navy)] mb-3">CASAS Progress</h4>
            <div className="grid grid-cols-2 gap-6 print:gap-8">
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
                />
                <p className="text-xs text-gray-500 mt-1">
                  Last: {displayData.casasReadingLast?.toFixed(0) || '—'} | Target: {currentClass.casasReadingTarget}
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
                />
                <p className="text-xs text-gray-500 mt-1">
                  Last: {displayData.casasListeningLast?.toFixed(0) || '—'} | Target: {currentClass.casasListeningTarget}
                </p>
              </div>
            </div>
          </div>

          {/* Unit Tests & Attendance - Detailed Scores */}
          {!viewingPastCard && (
            <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
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

              {/* Monthly Attendance */}
              <div className="attendance-chart-section">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold text-[var(--cace-navy)]">Monthly Attendance</h4>
                  {displayData.attendanceAverage !== null && (
                    <span className={`text-xs px-2 py-0.5 rounded ${getScoreBgColor(displayData.attendanceAverage)}`}>
                      Avg: {displayData.attendanceAverage.toFixed(0)}%
                    </span>
                  )}
                </div>
                {attendance.length === 0 ? (
                  <p className="text-gray-400 text-xs">No attendance recorded</p>
                ) : (
                  <AttendanceBarChart attendance={attendance} />
                )}
              </div>
            </div>
          )}

          {/* Teacher Comments */}
          <div className="border-t pt-4">
            <h4 className="font-semibold text-[var(--cace-navy)] mb-2">Teacher Comments</h4>
            <textarea
              value={teacherComments}
              onChange={(e) => setTeacherComments(e.target.value)}
              className="input text-sm print:border-none print:p-0 print:resize-none w-full"
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
      )}

      {/* Reference: ISST & Notes (below report card, hidden when printing) */}
      {selectedStudentId && (
        <div className="card print:hidden mt-6">
          <h3 className="text-sm font-semibold text-[var(--cace-navy)] mb-3">Reference for teacher comments</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">ISST attendance</h4>
              {isstRecords.length === 0 ? (
                <p className="text-gray-400 text-xs">No ISST dates recorded</p>
              ) : (
                <ul className="space-y-2">
                  {isstRecords
                    .sort((a, b) => b.month.localeCompare(a.month))
                    .map((r) => {
                      const monthLabel = (() => {
                        const [y, m] = r.month.split('-');
                        const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                        return `${names[parseInt(m, 10) - 1]} ${y}`;
                      })();
                      return (
                        <li key={r.id} className="text-gray-700">
                          <span className="font-medium">{monthLabel}:</span>{' '}
                          {r.dates.length ? r.dates.sort().join(', ') : '—'}
                        </li>
                      );
                    })}
                </ul>
              )}
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
          body * {
            visibility: hidden;
          }
          .card, .card * {
            visibility: visible;
          }
          .card {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
          }
          .print\\:hidden {
            display: none !important;
          }
          /* Fix chart layout for print */
          .casas-charts-section,
          .attendance-chart-section {
            page-break-inside: avoid;
          }
          .chart-container {
            overflow: visible !important;
          }
          .chart-container svg {
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
