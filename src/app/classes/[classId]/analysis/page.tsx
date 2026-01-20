'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import { getStudentsByClass, getClasses } from '@/lib/storage';
import { getStudentsWithRanks, getColorLevel } from '@/lib/calculations';
import { Class, StudentWithStats, CACE_LEVELS, CACELevel } from '@/types';
import {
  TrophyIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  PrinterIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

type SortField = 'rank' | 'name' | 'casasReading' | 'casasListening' | 'tests' | 'attendance' | 'overall';
type SortDir = 'asc' | 'desc';
type FilterMode = 'all' | 'top10' | 'bottom10' | 'incomplete';

export default function AnalysisPage() {
  const params = useParams();
  const { setCurrentClassId, mounted } = useApp();
  const classId = params.classId as string;

  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [students, setStudents] = useState<StudentWithStats[]>([]);
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  useEffect(() => {
    if (mounted) {
      const allClasses = getClasses();
      const cls = allClasses.find(c => c.id === classId);
      setCurrentClass(cls || null);
      if (cls) {
        setCurrentClassId(cls.id);
        refreshData(cls);
      }
    }
  }, [classId, setCurrentClassId, mounted]);

  const refreshData = (cls: Class) => {
    const classStudents = getStudentsByClass(classId);
    const studentsWithStats = getStudentsWithRanks(classStudents, cls);
    setStudents(studentsWithStats);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  const getSortedStudents = () => {
    let filtered = [...students];

    // Apply filter
    if (filterMode === 'top10') {
      filtered = filtered.filter(s => s.isComplete && s.rank !== null && s.rank <= 10);
    } else if (filterMode === 'bottom10') {
      const rankedStudents = filtered.filter(s => s.isComplete && s.rank !== null);
      const maxRank = Math.max(...rankedStudents.map(s => s.rank!));
      filtered = rankedStudents.filter(s => s.rank! > maxRank - 10);
    } else if (filterMode === 'incomplete') {
      filtered = filtered.filter(s => !s.isComplete);
    }

    // Apply sort
    filtered.sort((a, b) => {
      let aVal: number | string | null = null;
      let bVal: number | string | null = null;

      switch (sortField) {
        case 'rank':
          aVal = a.rank ?? 9999;
          bVal = b.rank ?? 9999;
          break;
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'casasReading':
          aVal = a.casasReadingProgress ?? -1;
          bVal = b.casasReadingProgress ?? -1;
          break;
        case 'casasListening':
          aVal = a.casasListeningProgress ?? -1;
          bVal = b.casasListeningProgress ?? -1;
          break;
        case 'tests':
          aVal = a.testAverage ?? -1;
          bVal = b.testAverage ?? -1;
          break;
        case 'attendance':
          aVal = a.attendanceAverage ?? -1;
          bVal = b.attendanceAverage ?? -1;
          break;
        case 'overall':
          aVal = a.overallScore ?? -1;
          bVal = b.overallScore ?? -1;
          break;
      }

      if (aVal === null || bVal === null) return 0;
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  };

  const getProgressColor = (progress: number | null) => {
    if (!currentClass || progress === null) return '';
    const level = getColorLevel(progress, currentClass.colorThresholds);
    switch (level) {
      case 'good': return 'score-good';
      case 'warning': return 'score-warning';
      case 'poor': return 'score-poor';
      default: return '';
    }
  };

  const getRankBadge = (student: StudentWithStats) => {
    if (!student.isComplete || student.rank === null) {
      return <span className="text-gray-400 text-sm">Incomplete</span>;
    }
    
    const totalRanked = students.filter(s => s.isComplete).length;
    const isTop10 = student.rank <= 10;
    const isBottom10 = student.rank > totalRanked - 10 && totalRanked > 10;

    return (
      <div className="flex items-center gap-1">
        <span className="font-bold">{student.rank}</span>
        {isTop10 && <TrophyIcon className="w-4 h-4 text-yellow-500" title="Top 10" />}
        {isBottom10 && <ExclamationTriangleIcon className="w-4 h-4 text-orange-500" title="Bottom 10" />}
      </div>
    );
  };

  const handlePrint = () => {
    window.print();
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

  const sortedStudents = getSortedStudents();
  const rankedCount = students.filter(s => s.isComplete).length;
  const incompleteCount = students.filter(s => !s.isComplete).length;
  const levelInfo = currentClass.level !== undefined ? CACE_LEVELS[currentClass.level as CACELevel] : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Student Analysis</h1>
          <p className="text-gray-600">
            {currentClass.name} • {levelInfo?.name || `Level ${currentClass.level}`}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {rankedCount} ranked, {incompleteCount} incomplete
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={handlePrint} className="btn btn-secondary">
            <PrinterIcon className="w-5 h-5" />
            Print
          </button>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">Student Analysis - {currentClass.name}</h1>
        <p className="text-sm text-gray-600">{levelInfo?.name} • {new Date().toLocaleDateString()}</p>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 flex-wrap print:hidden">
        <button
          onClick={() => setFilterMode('all')}
          className={`btn ${filterMode === 'all' ? 'btn-primary' : 'btn-secondary'} text-sm`}
        >
          All Students ({students.length})
        </button>
        <button
          onClick={() => setFilterMode('top10')}
          className={`btn ${filterMode === 'top10' ? 'btn-primary' : 'btn-secondary'} text-sm`}
        >
          <TrophyIcon className="w-4 h-4" />
          Top 10
        </button>
        <button
          onClick={() => setFilterMode('bottom10')}
          className={`btn ${filterMode === 'bottom10' ? 'btn-primary' : 'btn-secondary'} text-sm`}
        >
          <ExclamationTriangleIcon className="w-4 h-4" />
          Bottom 10
        </button>
        <button
          onClick={() => setFilterMode('incomplete')}
          className={`btn ${filterMode === 'incomplete' ? 'btn-primary' : 'btn-secondary'} text-sm`}
        >
          Incomplete ({incompleteCount})
        </button>
      </div>

      {/* Analysis Table */}
      {students.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No students in this class yet</p>
          <Link href={`/classes/${classId}/students`} className="btn btn-accent">
            Add Students
          </Link>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="data-table text-sm">
            <thead>
              <tr>
                <th 
                  className="cursor-pointer hover:bg-gray-200 select-none"
                  onClick={() => handleSort('rank')}
                >
                  Rank {sortField === 'rank' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="cursor-pointer hover:bg-gray-200 select-none"
                  onClick={() => handleSort('name')}
                >
                  Student {sortField === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="cursor-pointer hover:bg-gray-200 select-none text-center"
                  onClick={() => handleSort('casasReading')}
                  title={`Target: ${currentClass.casasReadingTarget}`}
                >
                  Reading % {sortField === 'casasReading' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="cursor-pointer hover:bg-gray-200 select-none text-center"
                  onClick={() => handleSort('casasListening')}
                  title={`Target: ${currentClass.casasListeningTarget}`}
                >
                  Listening % {sortField === 'casasListening' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="cursor-pointer hover:bg-gray-200 select-none text-center"
                  onClick={() => handleSort('tests')}
                >
                  Tests {sortField === 'tests' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="cursor-pointer hover:bg-gray-200 select-none text-center"
                  onClick={() => handleSort('attendance')}
                >
                  Attend. {sortField === 'attendance' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="cursor-pointer hover:bg-gray-200 select-none text-center"
                  onClick={() => handleSort('overall')}
                >
                  Overall {sortField === 'overall' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map(student => {
                const totalRanked = students.filter(s => s.isComplete).length;
                const isTop10 = student.rank !== null && student.rank <= 10;
                const isBottom10 = student.rank !== null && student.rank > totalRanked - 10 && totalRanked > 10;
                
                return (
                  <tr 
                    key={student.id}
                    className={`
                      ${isTop10 ? 'bg-green-50' : ''}
                      ${isBottom10 ? 'bg-orange-50' : ''}
                    `}
                  >
                    <td className="text-center">
                      {getRankBadge(student)}
                    </td>
                    <td className="font-medium">
                      <Link 
                        href={`/classes/${classId}/notes`}
                        className="hover:text-[var(--cace-teal)]"
                      >
                        {student.name}
                      </Link>
                    </td>
                    <td className="text-center">
                      {student.casasReadingProgress !== null ? (
                        <div>
                          <span className={`px-2 py-0.5 rounded text-xs ${getProgressColor(student.casasReadingProgress)}`}>
                            {student.casasReadingProgress >= 100 ? 'GOAL!' : `${student.casasReadingProgress.toFixed(0)}%`}
                          </span>
                          <div className="text-xs text-gray-400 mt-0.5">
                            avg: {student.casasReadingAvg?.toFixed(0)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="text-center">
                      {student.casasListeningProgress !== null ? (
                        <div>
                          <span className={`px-2 py-0.5 rounded text-xs ${getProgressColor(student.casasListeningProgress)}`}>
                            {student.casasListeningProgress >= 100 ? 'GOAL!' : `${student.casasListeningProgress.toFixed(0)}%`}
                          </span>
                          <div className="text-xs text-gray-400 mt-0.5">
                            avg: {student.casasListeningAvg?.toFixed(0)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="text-center">
                      {student.testAverage !== null ? (
                        <span className={`px-2 py-0.5 rounded text-xs ${getProgressColor(student.testAverage)}`}>
                          {student.testAverage.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="text-center">
                      {student.attendanceAverage !== null ? (
                        <span className={`px-2 py-0.5 rounded text-xs ${getProgressColor(student.attendanceAverage)}`}>
                          {student.attendanceAverage.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="text-center font-medium">
                      {student.overallScore !== null ? (
                        <span className={`px-2 py-0.5 rounded text-xs ${getProgressColor(student.overallScore)}`}>
                          {student.overallScore.toFixed(0)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend & Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
        <div className="card">
          <h3 className="font-semibold mb-2">Color Legend</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded score-good"></span>
              <span>80%+ (Good)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded score-warning"></span>
              <span>60-79%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded score-poor"></span>
              <span>&lt;60%</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm mt-3">
            <div className="flex items-center gap-2">
              <TrophyIcon className="w-4 h-4 text-yellow-500" />
              <span>Top 10</span>
            </div>
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 text-orange-500" />
              <span>Bottom 10</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-2">Ranking Weights</h3>
          <div className="text-sm space-y-1">
            <p>CASAS Reading: {currentClass.rankingWeights.casasReading}%</p>
            <p>CASAS Listening: {currentClass.rankingWeights.casasListening}%</p>
            <p>Unit Tests: {currentClass.rankingWeights.tests}%</p>
            <p>Attendance: {currentClass.rankingWeights.attendance}%</p>
          </div>
        </div>
      </div>

      {/* CASAS Targets Info */}
      <div className="card print:hidden">
        <h3 className="font-semibold mb-2">CASAS Targets (Level {currentClass.level})</h3>
        <div className="text-sm text-gray-600 grid grid-cols-2 gap-4">
          <div>
            <p><strong>Reading:</strong> {currentClass.casasReadingLevelStart} → {currentClass.casasReadingTarget}</p>
            <p className="text-xs text-gray-400">Progress = (Avg - {currentClass.casasReadingLevelStart}) ÷ {currentClass.casasReadingTarget - currentClass.casasReadingLevelStart} × 100</p>
          </div>
          <div>
            <p><strong>Listening:</strong> {currentClass.casasListeningLevelStart} → {currentClass.casasListeningTarget}</p>
            <p className="text-xs text-gray-400">Progress = (Avg - {currentClass.casasListeningLevelStart}) ÷ {currentClass.casasListeningTarget - currentClass.casasListeningLevelStart} × 100</p>
          </div>
        </div>
      </div>
    </div>
  );
}
