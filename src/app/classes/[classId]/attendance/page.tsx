'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import {
  getStudentsByClass,
  getClasses,
  getAttendanceByStudent,
  setAttendance,
  toggleVacation,
  deleteAttendance,
  findOrCreateStudent,
} from '@/lib/storage';
import { parseAttendanceFileFromInput, calculateAttendancePercentage } from '@/lib/parsers';
import { calculateAttendanceAverage, getColorLevel } from '@/lib/calculations';
import { Student, Class, Attendance } from '@/types';
import {
  ArrowUpTrayIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { StopIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';

// School year months (Aug - Jun)
const MONTHS = [
  { key: '08', label: 'Aug' },
  { key: '09', label: 'Sep' },
  { key: '10', label: 'Oct' },
  { key: '11', label: 'Nov' },
  { key: '12', label: 'Dec' },
  { key: '01', label: 'Jan' },
  { key: '02', label: 'Feb' },
  { key: '03', label: 'Mar' },
  { key: '04', label: 'Apr' },
  { key: '05', label: 'May' },
  { key: '06', label: 'Jun' },
];

interface StudentAttendance {
  student: Student;
  monthlyData: Map<string, Attendance | null>;
  average: number | null;
}

export default function AttendancePage() {
  const params = useParams();
  const { setCurrentClassId, mounted } = useApp();
  const classId = params.classId as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [studentAttendance, setStudentAttendance] = useState<StudentAttendance[]>([]);
  const [selectedYear, setSelectedYear] = useState(() => {
    const now = new Date();
    // If we're in Aug-Dec, use current year. If Jan-Jul, use previous year for school year start.
    return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  });
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMonth, setImportMonth] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    added: number;
    errors: string[];
  } | null>(null);
  const [editingCell, setEditingCell] = useState<{ studentId: string; month: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (mounted) {
      const allClasses = getClasses();
      const cls = allClasses.find(c => c.id === classId);
      setCurrentClass(cls || null);
      if (cls) {
        setCurrentClassId(cls.id);
        refreshData();
      }
    }
  }, [classId, setCurrentClassId, mounted]);

  const getMonthKey = (monthNum: string) => {
    // Convert month number to YYYY-MM format
    const year = parseInt(monthNum) >= 8 ? selectedYear : selectedYear + 1;
    return `${year}-${monthNum}`;
  };

  const refreshData = () => {
    const students = getStudentsByClass(classId);
    const data: StudentAttendance[] = students.map(student => {
      const allAttendance = getAttendanceByStudent(student.id);
      const monthlyData = new Map<string, Attendance | null>();
      
      MONTHS.forEach(({ key }) => {
        const monthKey = getMonthKey(key);
        const record = allAttendance.find(a => a.month === monthKey);
        monthlyData.set(monthKey, record || null);
      });

      const average = calculateAttendanceAverage(allAttendance);
      return { student, monthlyData, average };
    });
    
    data.sort((a, b) => a.student.name.localeCompare(b.student.name));
    setStudentAttendance(data);
  };

  const handleCellClick = (studentId: string, month: string, currentValue: Attendance | null) => {
    if (currentValue?.isVacation) return; // Can't edit vacation cells directly
    setEditingCell({ studentId, month });
    setEditValue(currentValue?.percentage?.toString() || '');
  };

  const handleCellSave = () => {
    if (!editingCell) return;
    const percentage = parseFloat(editValue);
    if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
      setAttendance(editingCell.studentId, editingCell.month, percentage, false);
      refreshData();
    }
    setEditingCell(null);
    setEditValue('');
  };

  const handleToggleVacation = (studentId: string, month: string) => {
    const success = toggleVacation(studentId, month);
    if (!success) {
      alert('Cannot mark as vacation - delete the attendance data first');
    }
    refreshData();
  };

  const handleDeleteCell = (studentId: string, month: string) => {
    deleteAttendance(studentId, month);
    refreshData();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setShowImportModal(true);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (!importFile || !importMonth || !currentClass) return;

    setIsImporting(true);
    const result = await parseAttendanceFileFromInput(importFile);
    
    let added = 0;

    for (const record of result.records) {
      const student = findOrCreateStudent(record.studentName, classId);
      const percentage = calculateAttendancePercentage(record.totalHours, record.scheduledHours);
      setAttendance(student.id, importMonth, percentage, false);
      added++;
    }

    setImportResult({
      added,
      errors: result.errors,
    });

    refreshData();
    setIsImporting(false);
    setShowImportModal(false);
    setImportFile(null);
    setImportMonth('');
  };

  const getColorClass = (percentage: number | null, isVacation: boolean) => {
    if (isVacation) return 'bg-blue-100 text-blue-700';
    if (percentage === null) return '';
    if (!currentClass) return '';
    const level = getColorLevel(percentage, currentClass.colorThresholds);
    switch (level) {
      case 'good': return 'score-good';
      case 'warning': return 'score-warning';
      case 'poor': return 'score-poor';
      default: return '';
    }
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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Attendance</h1>
          <p className="text-gray-600">
            {currentClass.name} • {selectedYear}-{selectedYear + 1}
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary"
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            Import Month
          </button>
        </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-blue-900">Import Complete</h3>
              <p className="text-blue-800 mt-1">
                Updated attendance for {importResult.added} students
              </p>
              {importResult.errors.length > 0 && (
                <div className="mt-2 text-red-700">
                  <ul className="list-disc list-inside text-sm">
                    {importResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <button onClick={() => setImportResult(null)} className="text-blue-600 hover:text-blue-800">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Attendance Table */}
      {studentAttendance.length === 0 ? (
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
                <th className="sticky left-0 bg-[var(--cace-gray)] z-10">Student</th>
                {MONTHS.map(({ key, label }) => (
                  <th key={key} className="text-center min-w-[60px]">{label}</th>
                ))}
                <th className="text-center">Avg</th>
              </tr>
            </thead>
            <tbody>
              {studentAttendance.map(({ student, monthlyData, average }) => (
                <tr key={student.id}>
                  <td className="sticky left-0 bg-white font-medium z-10">{student.name}</td>
                  {MONTHS.map(({ key }) => {
                    const monthKey = getMonthKey(key);
                    const record = monthlyData.get(monthKey);
                    const isEditing = editingCell?.studentId === student.id && editingCell?.month === monthKey;
                    
                    return (
                      <td key={key} className="text-center p-1">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={e => e.key === 'Enter' && handleCellSave()}
                            className="w-14 text-center text-xs border rounded px-1 py-0.5"
                            min="0"
                            max="100"
                            autoFocus
                          />
                        ) : record?.isVacation ? (
                          <button
                            onClick={() => handleToggleVacation(student.id, monthKey)}
                            className={`px-2 py-1 rounded text-xs ${getColorClass(null, true)}`}
                            title="Click to remove vacation"
                          >
                            <StopIcon className="w-4 h-4 inline" />
                          </button>
                        ) : record ? (
                          <div className="group relative inline-block">
                            <span
                              onClick={() => handleCellClick(student.id, monthKey, record)}
                              className={`inline-block px-2 py-1 rounded cursor-pointer text-xs ${getColorClass(record.percentage, false)}`}
                            >
                              {record.percentage.toFixed(0)}%
                            </span>
                            <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 flex gap-0.5">
                              <button
                                onClick={() => handleDeleteCell(student.id, monthKey)}
                                className="text-red-500 text-xs"
                                title="Delete"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => handleCellClick(student.id, monthKey, null)}
                              className="text-gray-300 hover:text-gray-500 text-xs"
                              title="Add attendance"
                            >
                              —
                            </button>
                            <button
                              onClick={() => handleToggleVacation(student.id, monthKey)}
                              className="text-gray-300 hover:text-blue-500"
                              title="Mark as vacation"
                            >
                              <StopIcon className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-center font-medium">
                    {average !== null ? (
                      <span className={`px-2 py-1 rounded ${getColorClass(average, false)}`}>
                        {average.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded score-good"></span>
          <span>80%+ (Good)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded score-warning"></span>
          <span>60-79% (Warning)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded score-poor"></span>
          <span>&lt;60% (Needs Improvement)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-blue-100"></span>
          <span>Vacation (excluded from avg)</span>
        </div>
      </div>

      {/* Import Month Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Import Attendance</h2>
              <button onClick={() => setShowImportModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Which month is this attendance for?
                </label>
                <select
                  value={importMonth}
                  onChange={e => setImportMonth(e.target.value)}
                  className="input"
                >
                  <option value="">Select month...</option>
                  {MONTHS.map(({ key, label }) => (
                    <option key={key} value={getMonthKey(key)}>
                      {label} {parseInt(key) >= 8 ? selectedYear : selectedYear + 1}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-gray-500">
                File: {importFile?.name}
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowImportModal(false)} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!importMonth || isImporting}
                className="btn btn-primary flex-1 disabled:opacity-50"
              >
                {isImporting ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
