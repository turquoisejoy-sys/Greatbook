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
  findStudentByName,
  createStudent,
  dropStudent,
} from '@/lib/storage';
import { parseAttendanceFileFromInput, calculateAttendancePercentage } from '@/lib/parsers';
import { calculateAttendanceAverage, getColorLevel, compareByLastName } from '@/lib/calculations';
import { Student, Class, Attendance, AttendanceImportRow } from '@/types';
import {
  ArrowUpTrayIcon,
  XMarkIcon,
  UserPlusIcon,
  UserMinusIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
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
    newStudentsAdded: number;
    studentsDropped: number;
    vacationCount?: number;
  } | null>(null);
  const [editingCell, setEditingCell] = useState<{ studentId: string; month: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  
  // Import review state - 3 steps: select-month -> review-zero -> review-new
  const [importStep, setImportStep] = useState<'select-month' | 'review-zero' | 'review-new'>('select-month');
  const [parsedRecords, setParsedRecords] = useState<AttendanceImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [newStudents, setNewStudents] = useState<{ name: string; selected: boolean; enrollDate: string }[]>([]);
  const [missingStudents, setMissingStudents] = useState<{ student: Student; selected: boolean }[]>([]);
  const [zeroAttendanceStudents, setZeroAttendanceStudents] = useState<{ 
    name: string; 
    action: 'record' | 'vacation' | 'drop' | 'ignore';
    studentId?: string;
    enrollDate?: string;
  }[]>([]);

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
    
    data.sort((a, b) => compareByLastName(a.student.name, b.student.name));
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

  const handleAnalyzeImport = async () => {
    if (!importFile || !importMonth || !currentClass) return;

    setIsImporting(true);
    const result = await parseAttendanceFileFromInput(importFile);

    // Auto-ignore: DROPPED + zero hours — don't ask about them, don't import
    const isDroppedZero = (r: AttendanceImportRow) => {
      const pct = calculateAttendancePercentage(r.totalHours, r.scheduledHours);
      const dropped = r.status && /dropped/i.test(r.status);
      return pct === 0 && dropped;
    };

    // Get current roster
    const currentStudents = getStudentsByClass(classId);
    const currentNames = new Set(currentStudents.map(s => s.name.trim().toLowerCase()));
    
    // Check if this is a first-time import (empty roster)
    const isFirstImport = currentStudents.length === 0;
    
    // Pre-calculate which students have zero attendance (excluding auto-ignored dropped+zero)
    const zeroAttendanceNames = new Set<string>();
    for (const record of result.records) {
      if (isDroppedZero(record)) continue;
      const percentage = calculateAttendancePercentage(record.totalHours, record.scheduledHours);
      if (percentage === 0) {
        zeroAttendanceNames.add(record.studentName.trim().toLowerCase());
      }
    }
    
    // Get names from import file (excluding auto-ignored so they don't affect "missing")
    const importNames = new Set(
      result.records.filter(r => !isDroppedZero(r)).map(r => r.studentName.trim().toLowerCase())
    );
    
    // Find new students (in file but not in roster) WHO HAVE ACTUAL ATTENDANCE
    // New students with 0% attendance will be shown in the zero attendance step instead
    // Auto-ignored (DROPPED + zero) are never added
    const newStudentNames: string[] = [];
    let skippedZeroAttendance = 0;
    for (const record of result.records) {
      if (isDroppedZero(record)) continue;
      const normalizedName = record.studentName.trim().toLowerCase();
      if (!currentNames.has(normalizedName)) {
        // On first import, silently skip students with 0% attendance
        if (isFirstImport && zeroAttendanceNames.has(normalizedName)) {
          skippedZeroAttendance++;
          continue;
        }
        // New students with 0% go to zero attendance step, not here
        if (zeroAttendanceNames.has(normalizedName)) {
          continue;
        }
        newStudentNames.push(record.studentName.trim());
      }
    }
    
    // Find missing students (in roster but not in file)
    const missingStudentsList: Student[] = [];
    for (const student of currentStudents) {
      const normalizedName = student.name.trim().toLowerCase();
      if (!importNames.has(normalizedName)) {
        missingStudentsList.push(student);
      }
    }
    
    // Find students with zero attendance — exclude auto-ignored (DROPPED + zero)
    const zeroAttendanceList: { name: string; studentId?: string }[] = [];
    for (const record of result.records) {
      if (isDroppedZero(record)) continue;
      const percentage = calculateAttendancePercentage(record.totalHours, record.scheduledHours);
      if (percentage === 0) {
        const normalizedName = record.studentName.trim().toLowerCase();
        const existingStudent = currentStudents.find(
          s => s.name.trim().toLowerCase() === normalizedName
        );
        if (isFirstImport && !existingStudent) continue;
        zeroAttendanceList.push({
          name: record.studentName.trim(),
          studentId: existingStudent?.id,
        });
      }
    }
    
    // Parsed records to keep: exclude first-import zero new students, and exclude auto-ignored (DROPPED + zero)
    const filteredRecords = result.records
      .filter(r => !isDroppedZero(r))
      .filter(r => {
        if (!isFirstImport) return true;
        const normalizedName = r.studentName.trim().toLowerCase();
        const isNew = !currentNames.has(normalizedName);
        const hasZero = zeroAttendanceNames.has(normalizedName);
        return !(isNew && hasZero);
      });
    
    const autoIgnoredCount = result.records.filter(isDroppedZero).length;
    setParsedRecords(filteredRecords);
    setParseErrors(
      [
        ...result.errors,
        ...(skippedZeroAttendance > 0 ? [`Skipped ${skippedZeroAttendance} student(s) with 0% attendance (first import)`] : []),
        ...(autoIgnoredCount > 0 ? [`${autoIgnoredCount} student(s) with DROPPED + 0 hours were automatically ignored`] : []),
      ]
    );
    // Store ALL new student names (we'll filter out ignored ones later)
    const today = new Date().toISOString().split('T')[0];
    setNewStudents(newStudentNames.map(name => ({ name, selected: true, enrollDate: today })));
    setMissingStudents(missingStudentsList.map(student => ({ student, selected: false })));
    setZeroAttendanceStudents(zeroAttendanceList.map(item => ({ 
      ...item, 
      action: 'record' as const,  // Default to just recording 0%
      enrollDate: item.studentId ? undefined : today  // Only new students need enrollment date
    })));
    
    setIsImporting(false);
    
    // Determine which step to go to
    if (zeroAttendanceList.length > 0) {
      // Has zero attendance students - show that step first
      setImportStep('review-zero');
    } else if (newStudentNames.length > 0 || missingStudentsList.length > 0) {
      // No zero attendance, but has new/missing students
      setImportStep('review-new');
    } else {
      // Nothing to review - go straight to import
      handleConfirmImport();
    }
  };
  
  // Move from zero attendance step to new students step (or import if nothing left)
  const handleZeroAttendanceNext = () => {
    // Check if there's anything to show in the next step
    // (new students with actual attendance, or missing students)
    if (newStudents.length > 0 || missingStudents.length > 0) {
      setImportStep('review-new');
    } else {
      // Nothing left to review - import directly
      handleConfirmImport();
    }
  };

  const handleConfirmImport = () => {
    if (!currentClass) return;
    
    setIsImporting(true);
    
    // Build a map of zero attendance actions first (needed to check before adding new students)
    const zeroAttendanceActions = new Map<string, 'record' | 'vacation' | 'drop' | 'ignore'>();
    for (const item of zeroAttendanceStudents) {
      zeroAttendanceActions.set(item.name.trim().toLowerCase(), item.action);
    }
    
    // Add new students that were selected (but skip if they're marked for drop or ignore)
    const addedNewStudents: string[] = [];
    for (const { name, selected, enrollDate } of newStudents) {
      if (selected) {
        const normalizedName = name.trim().toLowerCase();
        const zeroAction = zeroAttendanceActions.get(normalizedName);
        // Don't add if this student is marked for drop or ignore
        if (zeroAction === 'drop' || zeroAction === 'ignore') {
          continue;
        }
        createStudent(name, classId, enrollDate);
        addedNewStudents.push(name);
      }
    }
    
    // Also add NEW students with 0% attendance who are marked for 'record' or 'vacation'
    // (these aren't in newStudents list since they have 0% attendance)
    for (const item of zeroAttendanceStudents) {
      if (!item.studentId && (item.action === 'record' || item.action === 'vacation')) {
        createStudent(item.name, classId, item.enrollDate);
        addedNewStudents.push(item.name);
      }
    }
    
    // Drop missing students that were selected
    let droppedCount = 0;
    for (const { student, selected } of missingStudents) {
      if (selected) {
        dropStudent(student.id);
        droppedCount++;
      }
    }
    
    // Handle zero attendance for EXISTING students (drop them if marked for drop)
    for (const item of zeroAttendanceStudents) {
      if (item.action === 'drop' && item.studentId) {
        dropStudent(item.studentId);
        droppedCount++;
      }
    }
    
    // Now import attendance for all students in the file
    let added = 0;
    let vacationCount = 0;
    for (const record of parsedRecords) {
      const normalizedName = record.studentName.trim().toLowerCase();
      const zeroAction = zeroAttendanceActions.get(normalizedName);
      
      // Skip if this student was marked for drop or ignore
      if (zeroAction === 'drop' || zeroAction === 'ignore') {
        continue;
      }
      
      const student = findStudentByName(record.studentName, classId);
      if (student) {
        const percentage = calculateAttendancePercentage(record.totalHours, record.scheduledHours);
        
        // Mark as vacation if that action was selected
        if (percentage === 0 && zeroAction === 'vacation') {
          setAttendance(student.id, importMonth, 0, true); // isVacation = true
          vacationCount++;
        } else {
          setAttendance(student.id, importMonth, percentage, false);
        }
        added++;
      }
    }

    setImportResult({
      added,
      errors: parseErrors,
      newStudentsAdded: addedNewStudents.length,
      studentsDropped: droppedCount,
      vacationCount,
    });

    refreshData();
    setIsImporting(false);
    resetImportModal();
  };
  
  const resetImportModal = () => {
    setShowImportModal(false);
    setImportFile(null);
    setImportMonth('');
    setImportStep('select-month');
    setParsedRecords([]);
    setParseErrors([]);
    setNewStudents([]);
    setMissingStudents([]);
    setZeroAttendanceStudents([]);
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
          {studentAttendance.length > 0 && (() => {
            const validAverages = studentAttendance
              .map(sa => sa.average)
              .filter((avg): avg is number => avg !== null);
            if (validAverages.length === 0) return null;
            const classAverage = validAverages.reduce((sum, avg) => sum + avg, 0) / validAverages.length;
            return (
              <p className="text-sm mt-1">
                <span className="font-medium">Class Average:</span>{' '}
                <span className={`font-semibold ${
                  classAverage >= 80 ? 'text-green-600' : 
                  classAverage >= 60 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {classAverage.toFixed(1)}%
                </span>
              </p>
            );
          })()}
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
              {importResult.newStudentsAdded > 0 && (
                <p className="text-green-700 mt-1">
                  <UserPlusIcon className="w-4 h-4 inline mr-1" />
                  Added {importResult.newStudentsAdded} new student{importResult.newStudentsAdded !== 1 ? 's' : ''} to roster
                </p>
              )}
              {importResult.studentsDropped > 0 && (
                <p className="text-orange-700 mt-1">
                  <UserMinusIcon className="w-4 h-4 inline mr-1" />
                  Dropped {importResult.studentsDropped} student{importResult.studentsDropped !== 1 ? 's' : ''}
                </p>
              )}
              {importResult.vacationCount && importResult.vacationCount > 0 && (
                <p className="text-purple-700 mt-1">
                  <MinusCircleIcon className="w-4 h-4 inline mr-1" />
                  Marked {importResult.vacationCount} student{importResult.vacationCount !== 1 ? 's' : ''} as on vacation
                </p>
              )}
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
        <div className="modal-overlay" onClick={() => resetImportModal()}>
          <div className="modal max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {importStep === 'select-month' && 'Import Attendance'}
                {importStep === 'review-zero' && 'Zero Attendance Review'}
                {importStep === 'review-new' && 'Review Roster Changes'}
              </h2>
              <button onClick={() => resetImportModal()} className="p-1 hover:bg-gray-100 rounded">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            
            {importStep === 'select-month' && (
              <>
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
                  <button onClick={() => resetImportModal()} className="btn btn-secondary flex-1">
                    Cancel
                  </button>
                  <button
                    onClick={handleAnalyzeImport}
                    disabled={!importMonth || isImporting}
                    className="btn btn-primary flex-1 disabled:opacity-50"
                  >
                    {isImporting ? 'Analyzing...' : 'Continue'}
                  </button>
                </div>
              </>
            )}
            
            {/* Step 1: Zero Attendance Review */}
            {importStep === 'review-zero' && (
              <>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  <div className="text-sm text-gray-600">
                    Step 1 of 2: Review students with zero attendance
                  </div>
                  
                  <div className="border rounded-lg p-4 bg-purple-50 border-purple-200">
                    <div className="flex items-center gap-2 mb-3">
                      <MinusCircleIcon className="w-5 h-5 text-purple-600" />
                      <h3 className="font-semibold text-purple-800">
                        Zero Attendance ({zeroAttendanceStudents.length})
                      </h3>
                    </div>
                    <p className="text-sm text-purple-700 mb-3">
                      These students have 0% attendance this month. What would you like to do?
                    </p>
                    <div className="space-y-3">
                      {zeroAttendanceStudents.map((item, idx) => (
                        <div key={idx} className="flex flex-col gap-2 py-2 border-b border-purple-200 last:border-0">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1">
                              <span className="text-sm font-medium">{item.name}</span>
                              {!item.studentId && (
                                <span className="ml-2 text-xs text-purple-500">(new)</span>
                              )}
                            </div>
                            <select
                              value={item.action}
                              onChange={e => {
                                const updated = [...zeroAttendanceStudents];
                                updated[idx].action = e.target.value as 'record' | 'vacation' | 'drop' | 'ignore';
                                setZeroAttendanceStudents(updated);
                              }}
                              className="text-sm rounded border-purple-300 bg-white focus:ring-purple-500 focus:border-purple-500"
                            >
                              <option value="record">Record 0%</option>
                              <option value="vacation">Mark as vacation</option>
                              <option value="drop">Drop student</option>
                              <option value="ignore">Ignore (don't import)</option>
                            </select>
                          </div>
                          {/* Show enrollment date picker for NEW students being added */}
                          {!item.studentId && (item.action === 'record' || item.action === 'vacation') && (
                            <div className="flex items-center gap-2 ml-4">
                              <span className="text-xs text-gray-500">Enrollment date:</span>
                              <input
                                type="date"
                                value={item.enrollDate || ''}
                                onChange={e => {
                                  const updated = [...zeroAttendanceStudents];
                                  updated[idx].enrollDate = e.target.value;
                                  setZeroAttendanceStudents(updated);
                                }}
                                className="text-xs border border-gray-300 rounded px-2 py-1"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <button
                        onClick={() => setZeroAttendanceStudents(zeroAttendanceStudents.map(s => ({ ...s, action: 'record' })))}
                        className="text-purple-700 underline"
                      >
                        All: Record 0%
                      </button>
                      <button
                        onClick={() => setZeroAttendanceStudents(zeroAttendanceStudents.map(s => ({ ...s, action: 'vacation' })))}
                        className="text-purple-700 underline"
                      >
                        All: Vacation
                      </button>
                      <button
                        onClick={() => setZeroAttendanceStudents(zeroAttendanceStudents.map(s => ({ ...s, action: 'drop' })))}
                        className="text-purple-700 underline"
                      >
                        All: Drop
                      </button>
                      <button
                        onClick={() => setZeroAttendanceStudents(zeroAttendanceStudents.map(s => ({ ...s, action: 'ignore' })))}
                        className="text-purple-700 underline"
                      >
                        All: Ignore
                      </button>
                    </div>
                    {/* Mass enrollment date for new students */}
                    {zeroAttendanceStudents.some(s => !s.studentId) && (
                      <div className="mt-3 pt-3 border-t border-purple-200 flex items-center gap-2">
                        <span className="text-xs text-purple-700">Set all enroll dates (new students):</span>
                        <input
                          type="date"
                          onChange={e => {
                            if (e.target.value) {
                              setZeroAttendanceStudents(zeroAttendanceStudents.map(s => 
                                !s.studentId ? { ...s, enrollDate: e.target.value } : s
                              ));
                            }
                          }}
                          className="text-xs border border-purple-300 rounded px-2 py-1"
                        />
                      </div>
                    )}
                  </div>
                  
                  {parseErrors.length > 0 && (
                    <div className="text-red-600 text-sm">
                      <p className="font-medium">Warnings:</p>
                      <ul className="list-disc list-inside">
                        {parseErrors.map((err, i) => <li key={i}>{err}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-3 mt-6">
                  <button 
                    onClick={() => setImportStep('select-month')} 
                    className="btn btn-secondary flex-1"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleZeroAttendanceNext}
                    className="btn btn-primary flex-1"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}
            
            {/* Step 2: New/Missing Students Review */}
            {importStep === 'review-new' && (
              <>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  <div className="text-sm text-gray-600">
                    {zeroAttendanceStudents.length > 0 ? 'Step 2 of 2: ' : ''}Review roster changes
                  </div>
                  
                  {/* New Students Section */}
                  {newStudents.length > 0 && (
                    <div className="border rounded-lg p-4 bg-green-50 border-green-200">
                      <div className="flex items-center gap-2 mb-3">
                        <UserPlusIcon className="w-5 h-5 text-green-600" />
                        <h3 className="font-semibold text-green-800">
                          New Students Detected ({newStudents.length})
                        </h3>
                      </div>
                      <p className="text-sm text-green-700 mb-3">
                        These students have attendance this month but are not on your roster. Check the ones you want to add:
                      </p>
                      <div className="space-y-2">
                        {newStudents.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={e => {
                                const updated = [...newStudents];
                                updated[idx].selected = e.target.checked;
                                setNewStudents(updated);
                              }}
                              className="rounded border-green-400 text-green-600 focus:ring-green-500"
                            />
                            <span className="text-sm flex-1">{item.name}</span>
                            {item.selected && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-500">Enroll:</span>
                                <input
                                  type="date"
                                  value={item.enrollDate}
                                  onChange={e => {
                                    const updated = [...newStudents];
                                    updated[idx].enrollDate = e.target.value;
                                    setNewStudents(updated);
                                  }}
                                  className="text-xs border border-gray-300 rounded px-2 py-1"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setNewStudents(newStudents.map(s => ({ ...s, selected: true })))}
                            className="text-xs text-green-700 underline"
                          >
                            Select all
                          </button>
                          <button
                            onClick={() => setNewStudents(newStudents.map(s => ({ ...s, selected: false })))}
                            className="text-xs text-green-700 underline"
                          >
                            Select none
                          </button>
                        </div>
                        <div className="flex items-center gap-2 border-l pl-3 border-green-300">
                          <span className="text-xs text-green-700">Set all enroll dates:</span>
                          <input
                            type="date"
                            onChange={e => {
                              if (e.target.value) {
                                setNewStudents(newStudents.map(s => ({ ...s, enrollDate: e.target.value })));
                              }
                            }}
                            className="text-xs border border-green-300 rounded px-2 py-1"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Missing Students Section */}
                  {missingStudents.length > 0 && (
                    <div className="border rounded-lg p-4 bg-orange-50 border-orange-200">
                      <div className="flex items-center gap-2 mb-3">
                        <ExclamationTriangleIcon className="w-5 h-5 text-orange-600" />
                        <h3 className="font-semibold text-orange-800">
                          Students Missing From File ({missingStudents.length})
                        </h3>
                      </div>
                      <p className="text-sm text-orange-700 mb-3">
                        These students are on your roster but not in this month's attendance. 
                        Check the ones you want to drop:
                      </p>
                      <div className="space-y-2">
                        {missingStudents.map((item, idx) => (
                          <label key={item.student.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={e => {
                                const updated = [...missingStudents];
                                updated[idx].selected = e.target.checked;
                                setMissingStudents(updated);
                              }}
                              className="rounded border-orange-400 text-orange-600 focus:ring-orange-500"
                            />
                            <span className="text-sm">{item.student.name}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => setMissingStudents(missingStudents.map(s => ({ ...s, selected: true })))}
                          className="text-xs text-orange-700 underline"
                        >
                          Select all
                        </button>
                        <button
                          onClick={() => setMissingStudents(missingStudents.map(s => ({ ...s, selected: false })))}
                          className="text-xs text-orange-700 underline"
                        >
                          Select none
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* No changes in this step */}
                  {newStudents.length === 0 && missingStudents.length === 0 && (
                    <div className="text-center py-4 text-gray-600">
                      <p>No roster changes needed. Ready to import attendance.</p>
                    </div>
                  )}
                  
                  {parseErrors.length > 0 && (
                    <div className="text-red-600 text-sm">
                      <p className="font-medium">Warnings:</p>
                      <ul className="list-disc list-inside">
                        {parseErrors.map((err, i) => <li key={i}>{err}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-3 mt-6">
                  <button 
                    onClick={() => zeroAttendanceStudents.length > 0 ? setImportStep('review-zero') : setImportStep('select-month')} 
                    className="btn btn-secondary flex-1"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    disabled={isImporting}
                    className="btn btn-primary flex-1 disabled:opacity-50"
                  >
                    {isImporting ? 'Importing...' : 'Import Attendance'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
