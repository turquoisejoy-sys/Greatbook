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
import { getClassMetrics } from '@/lib/calculations';
import { Class, CACELevel, CACE_LEVELS, ClassMetrics } from '@/types';
import { 
  PlusIcon, 
  TrashIcon, 
  UserGroupIcon,
  AcademicCapIcon,
  ChevronDownIcon,
  ChevronUpIcon,
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
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

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
  const classMetrics = useMemo(() => {
    if (!mounted || !selectedYear) return new Map<string, ClassMetrics>();
    
    const metrics = new Map<string, ClassMetrics>();
    const filteredClasses = classes.filter(c => c.academicYear === selectedYear);
    
    for (const cls of filteredClasses) {
      metrics.set(cls.id, getClassMetrics(cls.id, selectedYear));
    }
    
    return metrics;
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

  const toggleExpanded = (classId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(classId)) {
        next.delete(classId);
      } else {
        next.add(classId);
      }
      return next;
    });
  };

  // Get best available retention rate for display
  const getBestRetention = (metrics: ClassMetrics): { rate: number | null; label: string } => {
    if (metrics.retention.thirtyDay.rate !== null) {
      return { rate: metrics.retention.thirtyDay.rate, label: '30-Day' };
    }
    if (metrics.retention.midyear.rate !== null) {
      return { rate: metrics.retention.midyear.rate, label: 'Midyear' };
    }
    if (metrics.retention.endYear.rate !== null) {
      return { rate: metrics.retention.endYear.rate, label: 'End-Year' };
    }
    return { rate: null, label: '' };
  };

  const filteredClasses = classes.filter(c => c.academicYear === selectedYear);

  if (!mounted) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="grid grid-cols-3 gap-4 mt-8">
            <div className="h-40 bg-gray-200 rounded"></div>
            <div className="h-40 bg-gray-200 rounded"></div>
            <div className="h-40 bg-gray-200 rounded"></div>
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
          <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Your Classes</h1>
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

      {/* Classes Grid */}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClasses.map(cls => {
            const metrics = classMetrics.get(cls.id);
            const isSelected = cls.id === currentClassId;
            const isExpanded = expandedCards.has(cls.id);
            const bestRetention = metrics ? getBestRetention(metrics) : { rate: null, label: '' };

            return (
              <div
                key={cls.id}
                onClick={() => handleSelectClass(cls.id)}
                className={`card cursor-pointer transition-all hover:shadow-md ${
                  isSelected 
                    ? 'ring-2 ring-[var(--cace-teal)] border-[var(--cace-teal)]' 
                    : ''
                }`}
                style={isSelected ? { boxShadow: '0 0 20px 4px rgba(0, 181, 216, 0.35)' } : {}}
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{cls.name}</h3>
                    <p className="text-sm text-gray-500">
                      {cls.schedule} • {cls.level !== undefined ? CACE_LEVELS[cls.level as CACELevel]?.name : 'Level 3'}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteClass(cls.id, e)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete class"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Metrics Row */}
                <div className="mt-4 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <UserGroupIcon className="w-4 h-4" />
                    <span>{metrics?.studentCount || 0} students</span>
                  </div>
                  <div className="text-gray-600">
                    Att: {metrics?.averageAttendance !== null 
                      ? `${metrics.averageAttendance.toFixed(0)}%` 
                      : '—'}
                  </div>
                </div>

                {/* Retention Summary + Expand Button */}
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-gray-500">Retention: </span>
                    {bestRetention.rate !== null ? (
                      <span className={`font-medium ${
                        bestRetention.rate >= 70 ? 'text-green-600' : 
                        bestRetention.rate >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {bestRetention.rate.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </div>
                  <button
                    onClick={(e) => toggleExpanded(cls.id, e)}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                    title={isExpanded ? 'Hide details' : 'Show details'}
                  >
                    {isExpanded ? (
                      <ChevronUpIcon className="w-4 h-4" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Expanded Retention Details */}
                {isExpanded && metrics && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-sm">
                    <h4 className="font-medium text-gray-700">Retention Metrics</h4>
                    
                    {/* 30-Day */}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">30-Day:</span>
                      {metrics.retention.thirtyDay.rate !== null ? (
                        <span className={`font-medium ${
                          metrics.retention.thirtyDay.rate >= 70 ? 'text-green-600' : 
                          metrics.retention.thirtyDay.rate >= 50 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {metrics.retention.thirtyDay.rate.toFixed(0)}% 
                          <span className="text-gray-400 font-normal ml-1">
                            ({metrics.retention.thirtyDay.retained}/{metrics.retention.thirtyDay.eligible})
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">Not enough data</span>
                      )}
                    </div>

                    {/* Midyear */}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Midyear:</span>
                      {metrics.retention.midyear.rate !== null ? (
                        <span className={`font-medium ${
                          metrics.retention.midyear.rate >= 70 ? 'text-green-600' : 
                          metrics.retention.midyear.rate >= 50 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {metrics.retention.midyear.rate.toFixed(0)}%
                          <span className="text-gray-400 font-normal ml-1">
                            ({metrics.retention.midyear.retained}/{metrics.retention.midyear.eligible})
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">Not yet</span>
                      )}
                    </div>

                    {/* End-Year */}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">End-Year:</span>
                      {metrics.retention.endYear.rate !== null ? (
                        <span className={`font-medium ${
                          metrics.retention.endYear.rate >= 70 ? 'text-green-600' : 
                          metrics.retention.endYear.rate >= 50 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {metrics.retention.endYear.rate.toFixed(0)}%
                          <span className="text-gray-400 font-normal ml-1">
                            ({metrics.retention.endYear.retained}/{metrics.retention.endYear.eligible})
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">Not yet</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Selected indicator */}
                {isSelected && (
                  <div className="mt-3 pt-3 border-t">
                    <span className="text-xs font-medium text-[var(--cace-teal)] uppercase tracking-wide">
                      Currently Selected
                    </span>
                  </div>
                )}
              </div>
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
