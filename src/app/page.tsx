'use client';

import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/components/AppShell';
import { 
  getClasses, 
  createClass, 
  deleteClass, 
  getStudentsByClass,
  getCurrentAcademicYear,
  getAcademicYearOptions,
} from '@/lib/storage';
import { 
  getClassMetrics,
  getTopPerformers,
  getAtRiskStudents,
  calculateYTDRetention,
  getClassAttendanceAverage,
  calculate30DayRetention,
} from '@/lib/calculations';
import { Class, CACELevel, CACE_LEVELS, StudentWithStats } from '@/types';
import { 
  PlusIcon, 
  TrashIcon,
  AcademicCapIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

export default function Dashboard() {
  const { currentClassId, setCurrentClassId, refreshClasses, mounted } = useApp();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassSchedule, setNewClassSchedule] = useState('Morning');
  const [newClassLevel, setNewClassLevel] = useState<CACELevel>(3);

  useEffect(() => {
    if (mounted) {
      const allClasses = getClasses();
      setClasses(allClasses);
      setYearOptions(getAcademicYearOptions());
      if (!selectedYear) {
        setSelectedYear(getCurrentAcademicYear());
      }
    }
  }, [mounted, selectedYear]);

  // Calculate metrics for all filtered classes
  const classData = useMemo(() => {
    if (!mounted || !selectedYear) return new Map<string, {
      studentCount: number;
      avgAttendance: number | null;
      thirtyDayRetention: number | null;
      ytdRetention: number | null;
      topPerformers: StudentWithStats[];
      atRiskStudents: StudentWithStats[];
    }>();
    
    const data = new Map();
    const filteredClasses = classes.filter(c => c.academicYear === selectedYear);
    
    for (const cls of filteredClasses) {
      const students = getStudentsByClass(cls.id);
      const avgAttendance = getClassAttendanceAverage(cls.id);
      const thirtyDay = calculate30DayRetention(cls.id);
      const ytd = calculateYTDRetention(cls.id, selectedYear);
      const topPerformers = getTopPerformers(cls.id, 5);
      const atRiskStudents = getAtRiskStudents(cls.id, 5);
      
      data.set(cls.id, {
        studentCount: students.length,
        avgAttendance,
        thirtyDayRetention: thirtyDay.rate,
        ytdRetention: ytd.rate,
        topPerformers,
        atRiskStudents,
      });
    }
    
    return data;
  }, [classes, selectedYear, mounted]);

  const handleAddClass = () => {
    if (!newClassName.trim()) return;
    const newClass = createClass(newClassName.trim(), newClassSchedule, newClassLevel);
    setClasses(getClasses());
    setYearOptions(getAcademicYearOptions());
    refreshClasses();
    setCurrentClassId(newClass.id);
    setShowAddClass(false);
    setNewClassName('');
    setNewClassSchedule('Morning');
    setNewClassLevel(3);
  };

  const handleDeleteClass = (classId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this class and all its students? This cannot be undone.')) return;
    deleteClass(classId);
    setClasses(getClasses());
    refreshClasses();
    if (currentClassId === classId) {
      setCurrentClassId(null);
    }
  };

  const handleSelectClass = (classId: string) => {
    setCurrentClassId(classId);
  };

  const filteredClasses = classes.filter(c => c.academicYear === selectedYear);

  // Color helpers
  const getAttendanceColor = (value: number | null): string => {
    if (value === null) return 'text-gray-400';
    if (value >= 80) return 'text-green-600';
    if (value >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRetentionColor = (value: number | null): string => {
    if (value === null) return 'text-gray-400';
    if (value >= 70) return 'text-green-600';
    if (value >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (!mounted) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="grid grid-cols-2 gap-6 mt-8">
            <div className="h-96 bg-gray-200 rounded"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header - All on one line */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-[var(--cace-navy)] whitespace-nowrap">Your Classes</h1>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="input w-auto text-sm"
          >
            {yearOptions.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        <button 
          onClick={() => setShowAddClass(true)}
          className="btn btn-primary"
        >
          <PlusIcon className="w-5 h-5" />
          Add Class
        </button>
      </div>

      {/* Classes - Two Panel Layout */}
      {filteredClasses.length === 0 ? (
        <div className="card text-center py-12">
          <AcademicCapIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">No classes for {selectedYear}</h3>
          <p className="text-gray-500 mb-4">
            {selectedYear === getCurrentAcademicYear() 
              ? 'Create your first class to get started' 
              : 'No classes were created for this year'}
          </p>
          {selectedYear === getCurrentAcademicYear() && (
            <button 
              onClick={() => setShowAddClass(true)}
              className="btn btn-accent"
            >
              <PlusIcon className="w-5 h-5" />
              Create Class
            </button>
          )}
        </div>
      ) : (
        <div className={`grid gap-6 items-start ${filteredClasses.length === 1 ? 'grid-cols-1 max-w-lg mx-auto' : 'grid-cols-1 md:grid-cols-2'}`}>
          {filteredClasses.map(cls => {
            const data = classData.get(cls.id);
            const isSelected = cls.id === currentClassId;

            return (
              <button
                key={cls.id}
                onClick={() => handleSelectClass(cls.id)}
                className={`text-left w-full p-6 rounded-xl border-2 transition-all hover:shadow-lg flex flex-col justify-start items-stretch ${
                  isSelected 
                    ? 'border-[var(--cace-teal)] bg-white' 
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                style={isSelected ? { boxShadow: '0 0 20px 4px rgba(0, 181, 216, 0.25)' } : {}}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-xl text-[var(--cace-navy)]">{cls.name}</h3>
                    <p className="text-sm text-gray-500">{cls.schedule}</p>
                  </div>
                  <div
                    onClick={(e) => handleDeleteClass(cls.id, e)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete class"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="space-y-2 mb-5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Students:</span>
                    <span className="font-medium">{data?.studentCount ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Avg Attendance:</span>
                    <span className={`font-medium ${getAttendanceColor(data?.avgAttendance ?? null)}`}>
                      {data?.avgAttendance !== null && data?.avgAttendance !== undefined
                        ? `${data.avgAttendance.toFixed(0)}%` 
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">30-Day Retention:</span>
                    <span className={`font-medium ${getRetentionColor(data?.thirtyDayRetention ?? null)}`}>
                      {data?.thirtyDayRetention !== null && data?.thirtyDayRetention !== undefined
                        ? `${data.thirtyDayRetention.toFixed(0)}%` 
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">YTD Retention:</span>
                    <span className={`font-medium ${getRetentionColor(data?.ytdRetention ?? null)}`}>
                      {data?.ytdRetention !== null && data?.ytdRetention !== undefined
                        ? `${data.ytdRetention.toFixed(0)}%` 
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* Top Performers */}
                {data && data.topPerformers.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Top Performers
                    </h4>
                    <div className="space-y-1">
                      {data.topPerformers.map(student => (
                        <div key={student.id} className="flex items-center text-sm">
                          <span className="text-gray-400 w-8">#{student.rank}</span>
                          <span className="text-gray-700">{student.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* At Risk */}
                {data && data.atRiskStudents.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      At Risk
                    </h4>
                    <div className="space-y-1">
                      {data.atRiskStudents.map(student => (
                        <div key={student.id} className="flex items-center text-sm">
                          <span className="text-gray-400 w-8">#{student.rank}</span>
                          <span className="text-gray-700">{student.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No ranked students message */}
                {data && data.topPerformers.length === 0 && data.atRiskStudents.length === 0 && data.studentCount > 0 && (
                  <div className="text-sm text-gray-400 italic mb-4">
                    No students with complete ranking data yet
                  </div>
                )}

                {/* Selection Indicator */}
                <div className={`pt-4 border-t ${isSelected ? 'border-[var(--cace-teal)]/30' : 'border-gray-100'}`}>
                  {isSelected ? (
                    <div className="flex items-center gap-2 text-[var(--cace-teal)]">
                      <CheckIcon className="w-4 h-4" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Selected</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Click to select</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Add Class Modal */}
      {showAddClass && (
        <div className="modal-overlay" onClick={() => setShowAddClass(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-4">Add New Class</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Class Name
                </label>
                <input
                  type="text"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="e.g., ESL Level 3"
                  className="input"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Schedule
                </label>
                <select
                  value={newClassSchedule}
                  onChange={(e) => setNewClassSchedule(e.target.value)}
                  className="input"
                >
                  <option value="Morning">Morning</option>
                  <option value="Evening">Evening</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CACE Level
                </label>
                <select
                  value={newClassLevel}
                  onChange={(e) => setNewClassLevel(parseInt(e.target.value) as CACELevel)}
                  className="input"
                >
                  {([0, 1, 2, 3, 4, 5] as CACELevel[]).map(level => (
                    <option key={level} value={level}>
                      {CACE_LEVELS[level].name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  CASAS targets will be set automatically based on level
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setShowAddClass(false)}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddClass}
                disabled={!newClassName.trim()}
                className="btn btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Class
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
