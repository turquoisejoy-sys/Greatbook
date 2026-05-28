'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import StudentQuickNotes from '@/components/StudentQuickNotes';
import {
  addWritingTest,
  deleteWritingTest,
  findStudentByName,
  getClasses,
  getStudentsByClass,
  getWritingResultsByTest,
  getWritingTestResults,
  getWritingTestsByClass,
  upsertWritingResultComment,
  upsertWritingResultScore,
} from '@/lib/storage';
import { parseFinalScoreFileFromInput } from '@/lib/parsers';
import { compareStudentsByLastName } from '@/lib/calculations';
import type { Class, Student, WritingTest, WritingTestResult } from '@/types';
import { ArrowUpTrayIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';

function scoresToMap(rows: WritingTestResult[]): Map<string, WritingTestResult> {
  return new Map(rows.map(row => [row.studentId, row]));
}

function formatPercent(rawScore: number, totalPoints: number): string {
  if (totalPoints <= 0) return '—';
  const pct = (rawScore / totalPoints) * 100;
  return `${Math.max(0, Math.min(100, pct)).toFixed(0)}%`;
}

export default function WritingPage() {
  const params = useParams();
  const { setCurrentClassId, mounted } = useApp();
  const classId = params.classId as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [tests, setTests] = useState<WritingTest[]>([]);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [resultsMap, setResultsMap] = useState<Map<string, WritingTestResult>>(new Map());

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTotalPoints, setNewTotalPoints] = useState('100');
  const [newPassingScore, setNewPassingScore] = useState('60');
  const [newExitAssessmentType, setNewExitAssessmentType] = useState<'none' | 'midterm' | 'final'>('none');

  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    unmatched: string[];
    warnings: string[];
  } | null>(null);

  const refresh = () => {
    const allClasses = getClasses();
    const cls = allClasses.find(c => c.id === classId) || null;
    setCurrentClass(cls);
    if (cls) setCurrentClassId(cls.id);

    const roster = getStudentsByClass(classId).sort((a, b) => compareStudentsByLastName(a, b));
    setStudents(roster);

    const writingTests = getWritingTestsByClass(classId);
    setTests(writingTests);
    setSelectedTestId(prev => {
      if (prev && writingTests.some(t => t.id === prev)) return prev;
      return writingTests[0]?.id || '';
    });
  };

  useEffect(() => {
    if (!mounted) return;
    refresh();
  }, [mounted, classId, setCurrentClassId]);

  useEffect(() => {
    if (!mounted) return;
    if (!selectedTestId) {
      setResultsMap(new Map());
      return;
    }
    setResultsMap(scoresToMap(getWritingResultsByTest(selectedTestId)));
    setScoreDrafts({});
    setCommentDrafts({});
  }, [mounted, selectedTestId]);

  const selectedTest = useMemo(
    () => tests.find(t => t.id === selectedTestId) || null,
    [tests, selectedTestId],
  );

  const handleConfirmDeleteTest = () => {
    if (!selectedTest) return;
    deleteWritingTest(selectedTest.id);
    setShowDeleteConfirm(false);
    refresh();
  };

  const writingAverageByStudent = useMemo(() => {
    const allResults = getWritingTestResults();
    const testsById = new Map(tests.map(t => [t.id, t]));
    const avgMap = new Map<string, number>();
    for (const student of students) {
      const percents: number[] = [];
      for (const result of allResults) {
        if (result.studentId !== student.id || result.score === null) continue;
        const test = testsById.get(result.testId);
        if (!test || test.totalPoints <= 0) continue;
        percents.push((result.score / test.totalPoints) * 100);
      }
      if (percents.length > 0) {
        avgMap.set(student.id, percents.reduce((sum, p) => sum + p, 0) / percents.length);
      }
    }
    return avgMap;
  }, [tests, students, resultsMap]);

  const createTest = () => {
    if (!newTitle.trim()) return;
    const totalPoints = Number(newTotalPoints);
    const passingScore = Number(newPassingScore);
    if (!Number.isFinite(totalPoints) || totalPoints <= 0) return;
    if (!Number.isFinite(passingScore) || passingScore < 0) return;

    const created = addWritingTest(
      classId,
      newTitle.trim(),
      newDate,
      Math.round(totalPoints * 100) / 100,
      Math.round(passingScore * 100) / 100,
      newExitAssessmentType,
    );
    setShowCreateForm(false);
    setNewTitle('');
    setNewDate(new Date().toISOString().split('T')[0]);
    setNewTotalPoints('100');
    setNewPassingScore('60');
    setNewExitAssessmentType('none');
    refresh();
    setSelectedTestId(created.id);
  };

  const persistScore = (studentId: string) => {
    if (!selectedTest) return;
    const raw = scoreDrafts[studentId];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed === null || Number.isNaN(parsed)) {
      upsertWritingResultScore(selectedTest.id, studentId, null);
    } else {
      const clamped = Math.max(0, Math.min(selectedTest.totalPoints, parsed));
      upsertWritingResultScore(selectedTest.id, studentId, Math.round(clamped * 100) / 100);
    }
    setResultsMap(scoresToMap(getWritingResultsByTest(selectedTest.id)));
  };

  const persistComment = (studentId: string) => {
    if (!selectedTest) return;
    const comment = commentDrafts[studentId];
    if (comment === undefined) return;
    upsertWritingResultComment(selectedTest.id, studentId, comment);
    setResultsMap(scoresToMap(getWritingResultsByTest(selectedTest.id)));
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedTest) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) fileInputRef.current.value = '';

    setIsImporting(true);
    const parsed = await parseFinalScoreFileFromInput(file, {
      scoreColumnHint: 'writing',
      classSchedule: currentClass?.schedule,
    });
    let imported = 0;
    const unmatched: string[] = [];

    for (const row of parsed.records) {
      const student = findStudentByName(row.studentName, classId, true);
      if (!student) {
        unmatched.push(row.studentName);
        continue;
      }
      const clamped = Math.max(0, Math.min(selectedTest.totalPoints, row.score));
      upsertWritingResultScore(selectedTest.id, student.id, Math.round(clamped * 100) / 100);
      imported++;
    }

    setResultsMap(scoresToMap(getWritingResultsByTest(selectedTest.id)));
    setImportSummary({
      imported,
      unmatched: [...new Set(unmatched)],
      warnings: parsed.warnings,
    });
    setIsImporting(false);
  };

  if (!mounted) {
    return <div className="animate-pulse"><div className="h-8 bg-gray-200 rounded w-48" /></div>;
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
    <div className="mx-auto w-full min-w-0 max-w-full space-y-6 px-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Writing</h1>
          <p className="text-gray-600">{currentClass.name}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm(v => !v)}
          className="btn btn-secondary inline-flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          New writing test
        </button>
      </div>

      {showCreateForm && (
        <div className="card p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Test title</label>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="input w-full"
                placeholder="e.g. Exit Assessment"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Total points</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={newTotalPoints}
                onChange={e => setNewTotalPoints(e.target.value)}
                className="input w-full"
                placeholder="e.g. 16"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Passing score</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newPassingScore}
                onChange={e => setNewPassingScore(e.target.value)}
                className="input w-full"
                placeholder="e.g. 12"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Test type</label>
              <select
                value={newExitAssessmentType}
                onChange={e => setNewExitAssessmentType(e.target.value as 'none' | 'midterm' | 'final')}
                className="input w-full"
              >
                <option value="none">Regular test</option>
                <option value="midterm">Midterm exit assessment</option>
                <option value="final">Final exit assessment</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <button type="button" className="btn btn-primary" onClick={createTest} disabled={!newTitle.trim()}>
              Create test
            </button>
          </div>
        </div>
      )}

      {tests.length === 0 ? (
        <div className="card text-center py-10 text-gray-600">
          <p>No writing tests yet. Create one to enter scores and comments.</p>
        </div>
      ) : (
        <>
          <div className="card p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Writing test</label>
                <select
                  className="input w-full"
                  value={selectedTestId}
                  onChange={e => setSelectedTestId(e.target.value)}
                >
                  {tests.map(test => (
                    <option key={test.id} value={test.id}>
                      {test.title} · {test.date}
                      {test.exitAssessmentType === 'midterm'
                        ? ' · Midterm Exit'
                        : test.exitAssessmentType === 'final'
                          ? ' · Final Exit'
                          : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-sm text-gray-700">
                <p><span className="font-medium">Total points:</span> {selectedTest?.totalPoints ?? '—'}</p>
                <p><span className="font-medium">Passing score:</span> {selectedTest?.passingScore ?? '—'}</p>
              </div>
              <div className="flex justify-start md:justify-end gap-2 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleImportFile}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-secondary inline-flex items-center gap-2"
                  disabled={!selectedTest || isImporting}
                  title="Excel/CSV with student name + Writing Score (e.g. Exit Assessments worksheet)"
                >
                  <ArrowUpTrayIcon className="w-5 h-5" />
                  {isImporting ? 'Importing...' : 'Import scores'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary text-red-700 border-red-200 hover:bg-red-50 inline-flex items-center gap-1.5"
                  disabled={!selectedTest}
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <TrashIcon className="w-4 h-4" />
                  Delete test
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Import accepts .xlsx, .xls, or .csv with student names and a <strong>Writing Score</strong> column
              (including the Exit Assessments worksheet — uses the AM or PM sheet based on this class schedule).
            </p>
          </div>

          {importSummary && (
            <div className="card bg-blue-50 border-blue-200">
              <p className="text-sm text-blue-900 font-semibold">Import complete: {importSummary.imported} rows updated</p>
              {importSummary.unmatched.length > 0 && (
                <p className="text-sm text-orange-700 mt-1">
                  Unmatched names ({importSummary.unmatched.length}): {importSummary.unmatched.join(', ')}
                </p>
              )}
              {importSummary.warnings.length > 0 && (
                <p className="text-xs text-gray-600 mt-1">{importSummary.warnings[0]}</p>
              )}
            </div>
          )}

          {students.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500 mb-4">No students in this class yet</p>
              <Link href={`/classes/${classId}/students`} className="btn btn-accent">
                Add students
              </Link>
            </div>
          ) : (
            <div className="card p-0 overflow-x-auto">
              <table className="data-table text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-[var(--cace-gray)] z-10">Student</th>
                    <th className="text-center">Score</th>
                    <th className="text-center">Avg %</th>
                    <th>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => {
                    const result = resultsMap.get(student.id);
                    const draftScore = scoreDrafts[student.id];
                    const draftComment = commentDrafts[student.id];
                    const scoreValue =
                      draftScore !== undefined
                        ? draftScore
                        : result?.score === null || result?.score === undefined
                          ? ''
                          : String(result.score);
                    const commentValue = draftComment !== undefined ? draftComment : (result?.comment || '');
                    const isPassing = selectedTest && result?.score !== null && result?.score !== undefined
                      ? result.score >= selectedTest.passingScore
                      : null;
                    return (
                      <tr key={student.id}>
                        <td className="sticky left-0 bg-white z-10">
                          <StudentQuickNotes
                            classId={classId}
                            studentId={student.id}
                            studentName={student.name}
                          />
                        </td>
                        <td className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="number"
                              className={`input w-28 text-center ${
                                isPassing === true ? 'border-green-300 bg-green-50' : ''
                              } ${isPassing === false ? 'border-red-300 bg-red-50' : ''}`}
                              min="0"
                              step="0.01"
                              max={selectedTest?.totalPoints ?? undefined}
                              value={scoreValue}
                              onChange={e => setScoreDrafts(prev => ({ ...prev, [student.id]: e.target.value }))}
                              onBlur={() => persistScore(student.id)}
                              placeholder={selectedTest ? `0-${selectedTest.totalPoints}` : 'Score'}
                            />
                            <span className="text-xs text-gray-500">
                              {result?.score !== null && result?.score !== undefined && selectedTest
                                ? formatPercent(result.score, selectedTest.totalPoints)
                                : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="text-center">
                          {writingAverageByStudent.has(student.id)
                            ? `${writingAverageByStudent.get(student.id)!.toFixed(0)}%`
                            : '—'}
                        </td>
                        <td>
                          <input
                            type="text"
                            className="input w-full"
                            value={commentValue}
                            onChange={e => setCommentDrafts(prev => ({ ...prev, [student.id]: e.target.value }))}
                            onBlur={() => persistComment(student.id)}
                            placeholder="Optional comment"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showDeleteConfirm && selectedTest && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-red-600">Delete test</h2>
              <button onClick={() => setShowDeleteConfirm(false)} className="p-1 hover:bg-gray-100 rounded">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-gray-700">
                Are you sure you want to delete <strong>&quot;{selectedTest.title}&quot;</strong>?
              </p>
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm font-medium">This action cannot be undone.</p>
                <p className="text-red-600 text-sm mt-1">
                  All student scores and comments for this writing test will be permanently deleted.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteTest}
                className="btn flex-1 bg-red-600 text-white hover:bg-red-700"
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
