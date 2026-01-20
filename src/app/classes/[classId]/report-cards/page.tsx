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
} from '@/lib/storage';
import {
  getStudentStats,
  getStudentsWithRanks,
  sortStudentsByLastName,
} from '@/lib/calculations';
import { Student, Class, ReportCard, StudentWithStats, CASASTest, UnitTest, Attendance } from '@/types';
import {
  PrinterIcon,
  DocumentPlusIcon,
  TrashIcon,
  ChevronDownIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

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
  const [speakingSkills, setSpeakingSkills] = useState('');
  const [writingSkills, setWritingSkills] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Test data for display
  const [readingTests, setReadingTests] = useState<CASASTest[]>([]);
  const [listeningTests, setListeningTests] = useState<CASASTest[]>([]);
  const [unitTests, setUnitTests] = useState<UnitTest[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);

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
      
      // Load past report cards
      setPastReportCards(getReportCardsByStudent(selectedStudentId));
      
      // Reset form
      setViewingPastCard(null);
      setSpeakingSkills('');
      setWritingSkills('');
      setSuggestions('');
      setSaveMessage('');
    }
  }, [selectedStudentId, currentClass, studentsWithRanks]);

  const handleViewPastCard = (card: ReportCard) => {
    setViewingPastCard(card);
    setSpeakingSkills(card.speakingSkills);
    setWritingSkills(card.writingSkills);
    setSuggestions(card.suggestionsForImprovement);
    setPeriodName(card.periodName);
  };

  const handleNewCard = () => {
    setViewingPastCard(null);
    setSpeakingSkills('');
    setWritingSkills('');
    setSuggestions('');
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
        speakingSkills,
        writingSkills,
        suggestionsForImprovement: suggestions,
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
        speakingSkills,
        writingSkills,
        suggestionsForImprovement: suggestions,
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

  const getProgressColor = (progress: number | null) => {
    if (progress === null) return 'bg-gray-200';
    if (progress >= 100) return 'bg-green-500';
    if (progress >= 80) return 'bg-green-400';
    if (progress >= 60) return 'bg-yellow-400';
    return 'bg-red-400';
  };

  const getScoreStatus = (score: number | null) => {
    if (score === null) return { label: 'No Data', color: 'text-gray-500' };
    if (score >= 90) return { label: 'Excellent', color: 'text-green-600' };
    if (score >= 80) return { label: 'Good', color: 'text-green-500' };
    if (score >= 70) return { label: 'Satisfactory', color: 'text-yellow-600' };
    return { label: 'Needs Improvement', color: 'text-red-500' };
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
    casasListeningProgress: viewingPastCard.casasListeningProgress,
    casasListeningAvg: viewingPastCard.casasListeningAvg,
    testAverage: viewingPastCard.testAverage,
    attendanceAverage: viewingPastCard.attendanceAverage,
    rank: viewingPastCard.rank,
    totalStudents: viewingPastCard.totalStudents,
    isComplete: viewingPastCard.rank !== null,
  } : selectedStudent;

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
            <p className="text-[var(--cace-teal)] font-medium">Student Progress Report Card</p>
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

          {/* Overall Performance */}
          <div className="mb-6">
            <h4 className="font-semibold text-[var(--cace-navy)] mb-3">Overall Performance</h4>
            <div className="grid grid-cols-2 gap-4">
              {/* CASAS Reading */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>CASAS Reading</span>
                  <span className="font-medium">
                    {displayData.casasReadingProgress !== null 
                      ? (displayData.casasReadingProgress >= 100 ? 'GOAL!' : `${displayData.casasReadingProgress.toFixed(0)}%`)
                      : '—'}
                  </span>
                </div>
                <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getProgressColor(displayData.casasReadingProgress)} transition-all`}
                    style={{ width: `${Math.min(displayData.casasReadingProgress || 0, 100)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Avg: {displayData.casasReadingAvg?.toFixed(0) || '—'} 
                  (Target: {currentClass.casasReadingTarget})
                </p>
              </div>

              {/* CASAS Listening */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>CASAS Listening</span>
                  <span className="font-medium">
                    {displayData.casasListeningProgress !== null 
                      ? (displayData.casasListeningProgress >= 100 ? 'GOAL!' : `${displayData.casasListeningProgress.toFixed(0)}%`)
                      : '—'}
                  </span>
                </div>
                <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getProgressColor(displayData.casasListeningProgress)} transition-all`}
                    style={{ width: `${Math.min(displayData.casasListeningProgress || 0, 100)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Avg: {displayData.casasListeningAvg?.toFixed(0) || '—'}
                  (Target: {currentClass.casasListeningTarget})
                </p>
              </div>

              {/* Test Average */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Unit Tests</span>
                  <span className={`font-medium ${getScoreStatus(displayData.testAverage).color}`}>
                    {displayData.testAverage !== null ? `${displayData.testAverage.toFixed(0)}%` : '—'}
                  </span>
                </div>
                <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getProgressColor(displayData.testAverage)} transition-all`}
                    style={{ width: `${displayData.testAverage || 0}%` }}
                  ></div>
                </div>
                <p className={`text-xs mt-1 ${getScoreStatus(displayData.testAverage).color}`}>
                  {getScoreStatus(displayData.testAverage).label}
                </p>
              </div>

              {/* Attendance */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Attendance</span>
                  <span className={`font-medium ${getScoreStatus(displayData.attendanceAverage).color}`}>
                    {displayData.attendanceAverage !== null ? `${displayData.attendanceAverage.toFixed(0)}%` : '—'}
                  </span>
                </div>
                <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getProgressColor(displayData.attendanceAverage)} transition-all`}
                    style={{ width: `${displayData.attendanceAverage || 0}%` }}
                  ></div>
                </div>
                <p className={`text-xs mt-1 ${getScoreStatus(displayData.attendanceAverage).color}`}>
                  {getScoreStatus(displayData.attendanceAverage).label}
                </p>
              </div>
            </div>
          </div>

          {/* Detailed Scores - Only show for new cards, not past snapshots */}
          {!viewingPastCard && (
            <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
              {/* CASAS Tests */}
              <div>
                <h4 className="font-semibold text-[var(--cace-navy)] mb-2">CASAS Reading Tests</h4>
                {readingTests.length === 0 ? (
                  <p className="text-gray-400 text-xs">No tests recorded</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1">Date</th>
                        <th className="text-left py-1">Form</th>
                        <th className="text-right py-1">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {readingTests.slice(0, 5).map(test => (
                        <tr key={test.id} className="border-b border-gray-100">
                          <td className="py-1">{new Date(test.date + 'T00:00:00').toLocaleDateString()}</td>
                          <td className="py-1">{test.formNumber}</td>
                          <td className="py-1 text-right">{test.score ?? '*'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h4 className="font-semibold text-[var(--cace-navy)] mb-2 mt-4">CASAS Listening Tests</h4>
                {listeningTests.length === 0 ? (
                  <p className="text-gray-400 text-xs">No tests recorded</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1">Date</th>
                        <th className="text-left py-1">Form</th>
                        <th className="text-right py-1">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listeningTests.slice(0, 5).map(test => (
                        <tr key={test.id} className="border-b border-gray-100">
                          <td className="py-1">{new Date(test.date + 'T00:00:00').toLocaleDateString()}</td>
                          <td className="py-1">{test.formNumber}</td>
                          <td className="py-1 text-right">{test.score ?? '*'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Unit Tests & Attendance */}
              <div>
                <h4 className="font-semibold text-[var(--cace-navy)] mb-2">Unit Tests</h4>
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
                      {unitTests.slice(0, 6).map(test => (
                        <tr key={test.id} className="border-b border-gray-100">
                          <td className="py-1">{test.testName}</td>
                          <td className="py-1 text-right">{test.score}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h4 className="font-semibold text-[var(--cace-navy)] mb-2 mt-4">Monthly Attendance</h4>
                {attendance.filter(a => !a.isVacation).length === 0 ? (
                  <p className="text-gray-400 text-xs">No attendance recorded</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1 text-xs">
                    {attendance.filter(a => !a.isVacation).slice(0, 9).map(a => (
                      <div key={a.id} className="flex justify-between px-1 py-0.5 bg-gray-50 rounded">
                        <span>{a.month.substring(5)}/{a.month.substring(2, 4)}</span>
                        <span>{a.percentage.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Teacher Comments */}
          <div className="border-t pt-4">
            <h4 className="font-semibold text-[var(--cace-navy)] mb-3">Teacher Comments</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Speaking Skills
                </label>
                <textarea
                  value={speakingSkills}
                  onChange={(e) => setSpeakingSkills(e.target.value)}
                  className="input text-sm print:border-none print:p-0 print:resize-none"
                  rows={2}
                  placeholder="Comments on speaking abilities..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Writing Skills
                </label>
                <textarea
                  value={writingSkills}
                  onChange={(e) => setWritingSkills(e.target.value)}
                  className="input text-sm print:border-none print:p-0 print:resize-none"
                  rows={2}
                  placeholder="Comments on writing abilities..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Suggestions for Improvement
                </label>
                <textarea
                  value={suggestions}
                  onChange={(e) => setSuggestions(e.target.value)}
                  className="input text-sm print:border-none print:p-0 print:resize-none"
                  rows={2}
                  placeholder="Areas to focus on..."
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t text-center text-sm text-gray-500 print:mt-8">
            <p className="italic">"A World of Opportunity"</p>
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
        }
      `}</style>
    </div>
  );
}
