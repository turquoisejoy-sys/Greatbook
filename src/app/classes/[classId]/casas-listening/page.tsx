'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import {
  getStudentsByClass,
  getClasses,
  getCASASTestsByStudent,
  addCASASTest,
  updateCASASTest,
  deleteCASASTest,
  findOrCreateStudent,
} from '@/lib/storage';
import { parseCASASFileFromInput } from '@/lib/parsers';
import { calculateCASASAverage, calculateCASASProgress, getColorLevel, compareByLastName } from '@/lib/calculations';
import { Student, Class, CASASTest } from '@/types';
import {
  ArrowUpTrayIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

interface StudentWithTests {
  student: Student;
  tests: CASASTest[];
  average: number | null;
  progress: number | null;
}

export default function CASASListeningPage() {
  const params = useParams();
  const { setCurrentClassId, mounted } = useApp();
  const classId = params.classId as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [studentsWithTests, setStudentsWithTests] = useState<StudentWithTests[]>([]);
  const [maxTests, setMaxTests] = useState(0);
  const [showImportResult, setShowImportResult] = useState<{
    added: number;
    skipped: number;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [editingCell, setEditingCell] = useState<{ studentId: string; testIndex: number } | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editForm, setEditForm] = useState('');
  const [editScore, setEditScore] = useState('');

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
    const students = getStudentsByClass(classId);
    let maxTestCount = 0;
    
    const data: StudentWithTests[] = students.map(student => {
      const tests = getCASASTestsByStudent(student.id, 'listening')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      maxTestCount = Math.max(maxTestCount, tests.length);
      const average = calculateCASASAverage(tests);
      const progress = calculateCASASProgress(
        average,
        cls.casasListeningLevelStart,
        cls.casasListeningTarget
      );
      return { student, tests, average, progress };
    });
    
    data.sort((a, b) => compareByLastName(a.student.name, b.student.name));
    setStudentsWithTests(data);
    setMaxTests(Math.max(maxTestCount, 1));
  };

  const startEdit = (studentId: string, testIndex: number, test: CASASTest | null) => {
    setEditingCell({ studentId, testIndex });
    setEditDate(test?.date || new Date().toISOString().split('T')[0]);
    setEditForm(test?.formNumber || '');
    setEditScore(test?.score?.toString() || '');
  };

  const saveEdit = (studentId: string, existingTest: CASASTest | null) => {
    const score = editScore ? parseInt(editScore) : null;
    let form = editForm.toUpperCase().trim();
    if (form && !form.endsWith('L')) {
      form = form + 'L';
    }

    if (existingTest) {
      if (!editDate && !form && !editScore) {
        deleteCASASTest(existingTest.id);
      } else {
        updateCASASTest(existingTest.id, {
          date: editDate,
          formNumber: form,
          score,
        });
      }
    } else if (editDate || form || editScore) {
      addCASASTest(studentId, 'listening', editDate, form, score);
    }

    setEditingCell(null);
    if (currentClass) refreshData(currentClass);
  };

  const cancelEdit = () => {
    setEditingCell(null);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentClass) return;

    setIsImporting(true);
    const result = await parseCASASFileFromInput(file);
    
    let added = 0;
    let skipped = 0;

    for (const row of result.listening) {
      const student = findOrCreateStudent(row.studentName, classId);
      const test = addCASASTest(student.id, 'listening', row.date, row.formNumber, row.score);
      if (test) added++;
      else skipped++;
    }

    setShowImportResult({ added, skipped, errors: result.errors, warnings: result.warnings });
    refreshData(currentClass);
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const getScoreColor = (score: number | null) => {
    if (!currentClass || score === null) return '';
    const progress = calculateCASASProgress(score, currentClass.casasListeningLevelStart, currentClass.casasListeningTarget);
    return getProgressColor(progress);
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

  const testColumns = Array.from({ length: maxTests + 1 }, (_, i) => i + 1);

  return (
    <div className="max-w-full mx-auto space-y-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--cace-navy)]">CASAS Listening</h1>
          <p className="text-gray-600">
            {currentClass.name} • Target: {currentClass.casasListeningTarget} (from {currentClass.casasListeningLevelStart})
          </p>
        </div>
        <div className="flex gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="btn btn-secondary"
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            {isImporting ? 'Importing...' : 'Import File'}
          </button>
        </div>
      </div>

      {/* Import Result */}
      {showImportResult && (
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-blue-900">Import Complete</h3>
              <p className="text-blue-800 mt-1">
                Added {showImportResult.added} listening scores
                {showImportResult.skipped > 0 && `, skipped ${showImportResult.skipped} duplicates`}
              </p>
              {showImportResult.errors.length > 0 && (
                <ul className="mt-2 text-red-700 text-sm list-disc list-inside">
                  {showImportResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}
            </div>
            <button onClick={() => setShowImportResult(null)} className="text-blue-600 hover:text-blue-800">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Students Table */}
      {studentsWithTests.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No students in this class yet</p>
          <Link href={`/classes/${classId}/students`} className="btn btn-accent">Add Students</Link>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="data-table text-sm">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 bg-[var(--cace-gray)] z-10 min-w-[150px]">Student</th>
                {testColumns.map(num => (
                  <th key={num} colSpan={3} className="text-center border-l">Test {num}</th>
                ))}
                <th rowSpan={2} className="text-center border-l">Avg</th>
                <th rowSpan={2} className="text-center">Progress</th>
              </tr>
              <tr>
                {testColumns.map(num => (
                  <React.Fragment key={num}>
                    <th className="text-center text-xs font-normal border-l">Date</th>
                    <th className="text-center text-xs font-normal">Form</th>
                    <th className="text-center text-xs font-normal">Score</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {studentsWithTests.map(({ student, tests, average, progress }) => (
                <tr key={student.id}>
                  <td className="sticky left-0 bg-white font-medium z-10">{student.name}</td>
                  {testColumns.map((_, idx) => {
                    const test = tests[idx] || null;
                    const isEditing = editingCell?.studentId === student.id && editingCell?.testIndex === idx;
                    
                    if (isEditing) {
                      return (
                        <React.Fragment key={idx}>
                          <td className="border-l p-1">
                            <input
                              type="date"
                              value={editDate}
                              onChange={e => setEditDate(e.target.value)}
                              className="w-24 text-xs border rounded px-1"
                              autoFocus
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              value={editForm}
                              onChange={e => setEditForm(e.target.value)}
                              className="w-14 text-xs border rounded px-1 text-center"
                              placeholder="Form"
                            />
                          </td>
                          <td className="p-1">
                            <div className="flex gap-1">
                              <input
                                type="number"
                                value={editScore}
                                onChange={e => setEditScore(e.target.value)}
                                className="w-12 text-xs border rounded px-1 text-center"
                                placeholder="Score"
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveEdit(student.id, test);
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                              />
                              <button 
                                onClick={() => saveEdit(student.id, test)}
                                className="text-green-600 text-xs"
                              >✓</button>
                              <button 
                                onClick={cancelEdit}
                                className="text-gray-400 text-xs"
                              >✕</button>
                            </div>
                          </td>
                        </React.Fragment>
                      );
                    }
                    
                    return (
                      <React.Fragment key={idx}>
                        <td 
                          className="text-center text-xs border-l cursor-pointer hover:bg-gray-50"
                          onClick={() => startEdit(student.id, idx, test)}
                        >
                          {test?.date ? new Date(test.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : '—'}
                        </td>
                        <td 
                          className="text-center text-xs cursor-pointer hover:bg-gray-50"
                          onClick={() => startEdit(student.id, idx, test)}
                        >
                          {test?.formNumber || '—'}
                        </td>
                        <td 
                          className={`text-center text-xs cursor-pointer hover:bg-gray-50 ${test?.score ? getScoreColor(test.score) : ''}`}
                          onClick={() => startEdit(student.id, idx, test)}
                        >
                          {test?.score ?? '—'}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  <td className="text-center font-medium border-l">
                    {average !== null ? average.toFixed(0) : '—'}
                  </td>
                  <td className="text-center">
                    {progress !== null ? (
                      <span className={`px-2 py-0.5 rounded text-xs ${getProgressColor(progress)}`}>
                        {progress >= 100 ? 'GOAL!' : `${progress.toFixed(0)}%`}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm text-gray-600">
        <span className="text-gray-500">Click any cell to edit • Progress = (Avg - {currentClass.casasListeningLevelStart}) ÷ {currentClass.casasListeningTarget - currentClass.casasListeningLevelStart} × 100</span>
      </div>
    </div>
  );
}
