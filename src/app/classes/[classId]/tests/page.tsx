'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import {
  getStudentsByClass,
  getClasses,
  getUnitTestsByStudent,
  addUnitTest,
  updateUnitTest,
  deleteUnitTest,
  findOrCreateStudent,
} from '@/lib/storage';
import { parseTestsFileFromInput } from '@/lib/parsers';
import { calculateTestAverage, getColorLevel, compareByLastName } from '@/lib/calculations';
import { Student, Class, UnitTest } from '@/types';
import {
  PlusIcon,
  ArrowUpTrayIcon,
  XMarkIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  ArrowUturnLeftIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

interface TestColumn {
  testName: string;
  date: string;
}

interface StudentWithTests {
  student: Student;
  tests: UnitTest[];
  average: number | null;
}

type SortColumn = 'name' | 'average' | string; // string = test name
type SortDirection = 'asc' | 'desc' | null;

export default function UnitTestsPage() {
  const params = useParams();
  const { setCurrentClassId, mounted } = useApp();
  const classId = params.classId as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [studentsWithTests, setStudentsWithTests] = useState<StudentWithTests[]>([]);
  const [testColumns, setTestColumns] = useState<TestColumn[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTestName, setImportTestName] = useState('');
  const [importTestDate, setImportTestDate] = useState(new Date().toISOString().split('T')[0]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    added: number;
    testsImported?: string[];
    errors: string[];
  } | null>(null);
  const [lastImportIds, setLastImportIds] = useState<string[]>([]);

  const [newTestName, setNewTestName] = useState('');
  const [newTestDate, setNewTestDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingCell, setEditingCell] = useState<{ studentId: string; testName: string } | null>(null);
  const [editScore, setEditScore] = useState('');
  const [showAddTestRow, setShowAddTestRow] = useState(false);
  const [editingTestIdx, setEditingTestIdx] = useState<number | null>(null);
  const [editTestName, setEditTestName] = useState('');
  const [editTestDate, setEditTestDate] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);

  // Scroll to highlighted student when search changes
  useEffect(() => {
    if (searchQuery && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchQuery]);

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

  const refreshData = () => {
    const students = getStudentsByClass(classId);
    const testColumnsMap = new Map<string, string>(); // testName -> date
    
    const data: StudentWithTests[] = students.map(student => {
      const tests = getUnitTestsByStudent(student.id);
      tests.forEach(t => {
        // Keep the most recent date for each test name
        const existingDate = testColumnsMap.get(t.testName);
        if (!existingDate || t.date > existingDate) {
          testColumnsMap.set(t.testName, t.date);
        }
      });
      const average = calculateTestAverage(tests);
      return { student, tests, average };
    });
    
    data.sort((a, b) => compareByLastName(a.student.name, b.student.name));
    setStudentsWithTests(data);
    
    // Sort test columns by date
    const columns = Array.from(testColumnsMap.entries())
      .map(([testName, date]) => ({ testName, date }))
      .sort((a, b) => a.date.localeCompare(b.date));
    setTestColumns(columns);
  };

  const startEdit = (studentId: string, testName: string, test: UnitTest | null) => {
    setEditingCell({ studentId, testName });
    setEditScore(test?.score?.toString() || '');
  };

  const saveEdit = (studentId: string, testName: string, existingTest: UnitTest | null, testDate: string) => {
    const score = editScore ? parseInt(editScore) : null;

    if (existingTest) {
      if (!editScore) {
        deleteUnitTest(existingTest.id);
      } else if (score !== null && score >= 0 && score <= 100) {
        updateUnitTest(existingTest.id, { score });
      }
    } else if (score !== null && score >= 0 && score <= 100) {
      addUnitTest(studentId, testName, testDate, score);
    }

    setEditingCell(null);
    refreshData();
  };

  const cancelEdit = () => {
    setEditingCell(null);
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === null) {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else {
        setSortDirection(null);
        setSortColumn('name');
      }
    } else {
      setSortColumn(column);
      setSortDirection(column === 'name' ? 'asc' : 'desc');
    }
  };

  const getSortedStudents = () => {
    if (sortDirection === null || sortColumn === 'name') {
      return studentsWithTests;
    }

    return [...studentsWithTests].sort((a, b) => {
      let aValue: number | null = null;
      let bValue: number | null = null;

      if (sortColumn === 'average') {
        aValue = a.average;
        bValue = b.average;
      } else {
        // Sort by specific test name
        const aTest = a.tests.find(t => t.testName === sortColumn);
        const bTest = b.tests.find(t => t.testName === sortColumn);
        aValue = aTest?.score ?? null;
        bValue = bTest?.score ?? null;
      }

      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      return sortDirection === 'desc' ? bValue - aValue : aValue - bValue;
    });
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column || sortDirection === null) {
      return <ChevronUpDownIcon className="w-4 h-4 inline ml-1 text-gray-400" />;
    }
    return sortDirection === 'desc' 
      ? <ChevronDownIcon className="w-4 h-4 inline ml-1 text-blue-600" />
      : <ChevronUpIcon className="w-4 h-4 inline ml-1 text-blue-600" />;
  };

  const handleAddTestColumn = () => {
    if (!newTestName.trim() || !newTestDate) return;
    
    // Add test column - scores will be added individually
    setTestColumns(prev => [...prev, { testName: newTestName.trim(), date: newTestDate }]);
    setShowAddTestRow(false);
    setNewTestName('');
    setNewTestDate(new Date().toISOString().split('T')[0]);
  };

  const startEditTest = (idx: number) => {
    setEditingTestIdx(idx);
    setEditTestName(testColumns[idx].testName);
    setEditTestDate(testColumns[idx].date);
  };

  const saveEditTest = (idx: number) => {
    if (!editTestName.trim() || !editTestDate) return;
    
    const oldName = testColumns[idx].testName;
    const newName = editTestName.trim();
    
    // Update all existing test records with the new name if it changed
    if (oldName !== newName) {
      studentsWithTests.forEach(({ student, tests }) => {
        const test = tests.find(t => t.testName === oldName);
        if (test) {
          updateUnitTest(test.id, { testName: newName, date: editTestDate });
        }
      });
    } else {
      // Just update the date for all tests with this name
      studentsWithTests.forEach(({ student, tests }) => {
        const test = tests.find(t => t.testName === oldName);
        if (test) {
          updateUnitTest(test.id, { date: editTestDate });
        }
      });
    }
    
    setTestColumns(prev => prev.map((col, i) => 
      i === idx ? { testName: newName, date: editTestDate } : col
    ));
    setEditingTestIdx(null);
    refreshData();
  };

  const confirmDeleteTestColumn = (idx: number) => {
    const testName = testColumns[idx].testName;
    
    // Delete all tests with this name
    studentsWithTests.forEach(({ tests }) => {
      const test = tests.find(t => t.testName === testName);
      if (test) {
        deleteUnitTest(test.id);
      }
    });
    
    setTestColumns(prev => prev.filter((_, i) => i !== idx));
    setDeleteConfirmIdx(null);
    refreshData();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentClass) return;
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Parse file first to check if it's multi-test format
    setIsImporting(true);
    const result = await parseTestsFileFromInput(file);
    
    if (result.errors.length > 0 && result.summary.totalRecords === 0) {
      setImportResult({ added: 0, errors: result.errors });
      setIsImporting(false);
      return;
    }

    if (result.isMultiTest) {
      // Multi-test format - import directly
      let added = 0;
      const importedIds: string[] = [];
      const testsImported = new Set<string>();

      for (const record of result.multiTestRecords) {
        const student = findOrCreateStudent(record.studentName, classId);
        const test = addUnitTest(student.id, record.testName, record.date, record.score);
        if (test) {
          added++;
          importedIds.push(test.id);
          testsImported.add(record.testName);
        }
      }

      setLastImportIds(importedIds);
      setImportResult({
        added,
        testsImported: Array.from(testsImported),
        errors: result.errors,
      });
      refreshData();
      setIsImporting(false);
    } else {
      // Single-test format - show modal to get test name
      setImportFile(file);
      setShowImportModal(true);
      setIsImporting(false);
    }
  };

  const handleImport = async () => {
    if (!importFile || !importTestName.trim() || !currentClass) return;

    setIsImporting(true);
    const result = await parseTestsFileFromInput(importFile);
    
    let added = 0;
    const importedIds: string[] = [];

    for (const record of result.records) {
      const student = findOrCreateStudent(record.studentName, classId);
      const test = addUnitTest(student.id, importTestName.trim(), importTestDate, record.score);
      if (test) {
        added++;
        importedIds.push(test.id);
      }
    }

    setLastImportIds(importedIds);
    setImportResult({
      added,
      testsImported: [importTestName.trim()],
      errors: result.errors,
    });

    refreshData();
    setIsImporting(false);
    setShowImportModal(false);
    setImportFile(null);
    setImportTestName('');
    setImportTestDate(new Date().toISOString().split('T')[0]);
  };

  const handleUndoImport = () => {
    if (lastImportIds.length === 0) return;
    
    if (!confirm(`Undo last import? This will delete ${lastImportIds.length} test scores.`)) return;
    
    for (const id of lastImportIds) {
      deleteUnitTest(id);
    }
    
    setLastImportIds([]);
    setImportResult(null);
    refreshData();
  };

  const getScoreColor = (score: number | null) => {
    if (!currentClass || score === null) return '';
    const level = getColorLevel(score, currentClass.colorThresholds);
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
    <div className="max-w-full mx-auto space-y-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Unit Tests</h1>
          <p className="text-gray-600">{currentClass.name}</p>
        </div>
        <div className="flex gap-3">
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
            Import Test
          </button>
        </div>
      </div>

      {/* Test Management Section */}
      <div className="card">
        <h3 className="font-semibold text-[var(--cace-navy)] mb-3">Tests</h3>
        <div className="space-y-2">
          {testColumns.map((col, idx) => (
            <div key={idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
              {editingTestIdx === idx ? (
                <>
                  <input
                    type="text"
                    value={editTestName}
                    onChange={e => setEditTestName(e.target.value)}
                    className="input min-w-[200px] flex-1"
                    placeholder="Test name"
                    autoFocus
                  />
                  <input
                    type="date"
                    value={editTestDate}
                    onChange={e => setEditTestDate(e.target.value)}
                    className="input w-44"
                  />
                  <button
                    onClick={() => saveEditTest(idx)}
                    className="text-green-600 hover:text-green-700 p-1"
                  >✓</button>
                  <button
                    onClick={() => setEditingTestIdx(null)}
                    className="text-gray-400 hover:text-gray-600 p-1"
                  >✕</button>
                </>
              ) : (
                <>
                  <span className="font-medium flex-1">{col.testName}</span>
                  <span className="text-gray-500 text-sm">
                    {new Date(col.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <button
                    onClick={() => startEditTest(idx)}
                    className="text-blue-600 hover:text-blue-700 text-sm"
                  >Edit</button>
                  <button
                    onClick={() => setDeleteConfirmIdx(idx)}
                    className="text-red-500 hover:text-red-600 p-1"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))}
          
          {/* Add New Test Row */}
          {showAddTestRow ? (
            <div className="flex items-center gap-3 p-2 bg-blue-50 rounded-lg border-2 border-dashed border-blue-200">
              <input
                type="text"
                value={newTestName}
                onChange={e => setNewTestName(e.target.value)}
                className="input min-w-[200px] flex-1"
                placeholder="Test name (e.g., Unit 1, Midterm)"
                autoFocus
              />
              <input
                type="date"
                value={newTestDate}
                onChange={e => setNewTestDate(e.target.value)}
                className="input w-44"
              />
              <button
                onClick={handleAddTestColumn}
                disabled={!newTestName.trim()}
                className="btn btn-primary text-sm disabled:opacity-50"
              >Add</button>
              <button
                onClick={() => { setShowAddTestRow(false); setNewTestName(''); }}
                className="text-gray-400 hover:text-gray-600 p-1"
              >✕</button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddTestRow(true)}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 p-2"
            >
              <PlusIcon className="w-5 h-5" />
              Add Test
            </button>
          )}
        </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-blue-900">Import Complete</h3>
              <p className="text-blue-800 mt-1">
                Added {importResult.added} test scores
                {importResult.testsImported && importResult.testsImported.length > 0 && (
                  <span className="block text-sm mt-1">
                    Tests: {importResult.testsImported.join(', ')}
                  </span>
                )}
              </p>
              {importResult.errors.length > 0 && (
                <div className="mt-2 text-red-700">
                  <ul className="list-disc list-inside text-sm">
                    {importResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}
              {lastImportIds.length > 0 && (
                <button
                  onClick={handleUndoImport}
                  className="mt-3 flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium text-sm"
                >
                  <ArrowUturnLeftIcon className="w-4 h-4" />
                  Undo Import
                </button>
              )}
            </div>
            <button onClick={() => setImportResult(null)} className="text-blue-600 hover:text-blue-800">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      {studentsWithTests.length > 0 && (
        <div className="relative max-w-sm">
          <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Find student..."
            className="input pl-10 w-full"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Students Table */}
      {studentsWithTests.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No students in this class yet</p>
          <Link href={`/classes/${classId}/students`} className="btn btn-accent">
            Add Students
          </Link>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="data-table text-sm" style={{ tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th 
                  rowSpan={2} 
                  className="sticky left-0 bg-[var(--cace-gray)] z-10 whitespace-nowrap w-0 cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('name')}
                >
                  Student Name <SortIcon column="name" />
                </th>
                {testColumns.map((col, idx) => (
                  <th 
                    key={idx} 
                    className="text-center border-l min-w-[90px] cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort(col.testName)}
                  >
                    {col.testName} <SortIcon column={col.testName} />
                  </th>
                ))}
                {testColumns.length === 0 && (
                  <th className="text-center border-l min-w-[90px] text-gray-400">No tests yet</th>
                )}
                <th 
                  rowSpan={2} 
                  className="text-center border-l min-w-[70px] cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('average')}
                >
                  Avg <SortIcon column="average" />
                </th>
              </tr>
              <tr>
                {testColumns.map((col, idx) => (
                  <th key={idx} className="text-center text-xs font-normal border-l text-gray-500">
                    {new Date(col.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}
                  </th>
                ))}
                {testColumns.length === 0 && (
                  <th className="border-l"></th>
                )}
              </tr>
            </thead>
            <tbody>
              {getSortedStudents().map(({ student, tests, average }, rowIndex) => {
                const isMatch = searchQuery && student.name.toLowerCase().includes(searchQuery.toLowerCase());
                const isFirstMatch = isMatch && getSortedStudents().findIndex(s => 
                  s.student.name.toLowerCase().includes(searchQuery.toLowerCase())
                ) === rowIndex;
                
                return (
                <tr 
                  key={student.id} 
                  ref={isFirstMatch ? highlightedRowRef : null}
                  className={isMatch ? 'bg-yellow-100' : ''}
                >
                  <td className={`sticky left-0 font-medium z-10 whitespace-nowrap w-0 ${isMatch ? 'bg-yellow-100' : 'bg-white'}`}>{student.name}</td>
                  {testColumns.map((col, idx) => {
                    const test = tests.find(t => t.testName === col.testName);
                    const isEditing = editingCell?.studentId === student.id && editingCell?.testName === col.testName;
                    
                    if (isEditing) {
                      return (
                        <td key={idx} className="border-l p-1">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              value={editScore}
                              onChange={e => setEditScore(e.target.value)}
                              className="w-14 text-sm border rounded px-1 text-center"
                              placeholder="Score"
                              min="0"
                              max="100"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveEdit(student.id, col.testName, test || null, col.date);
                                if (e.key === 'Escape') cancelEdit();
                              }}
                            />
                            <button 
                              onClick={() => saveEdit(student.id, col.testName, test || null, col.date)}
                              className="text-green-600 text-xs"
                            >✓</button>
                            <button 
                              onClick={cancelEdit}
                              className="text-gray-400 text-xs"
                            >✕</button>
                          </div>
                        </td>
                      );
                    }
                    
                    return (
                      <td
                        key={idx}
                        className={`text-center cursor-pointer hover:bg-gray-50 border-l ${test?.score !== undefined ? getScoreColor(test.score) : ''}`}
                        onClick={() => startEdit(student.id, col.testName, test || null)}
                      >
                        {test?.score !== undefined ? test.score : '—'}
                      </td>
                    );
                  })}
                  {testColumns.length === 0 && (
                    <td className="text-center text-gray-400 border-l">—</td>
                  )}
                  <td className="text-center font-medium border-l">
                    {average !== null ? (
                      <span className={`px-2 py-0.5 rounded ${getScoreColor(average)}`}>
                        {average.toFixed(0)}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm text-gray-600">
        <span className="text-gray-500">Click any cell to edit</span>
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
      </div>

      {/* Import Test Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Import Test Scores</h2>
              <button onClick={() => setShowImportModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Test Name
                </label>
                <input
                  type="text"
                  value={importTestName}
                  onChange={e => setImportTestName(e.target.value)}
                  placeholder="e.g., Unit 1, Midterm, Final"
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Test Date
                </label>
                <input
                  type="date"
                  value={importTestDate}
                  onChange={e => setImportTestDate(e.target.value)}
                  className="input"
                />
              </div>
              <p className="text-sm text-gray-500">
                File: {importFile?.name}
              </p>
              <p className="text-xs text-gray-400">
                Expected columns: Student Name, Score (0-100)
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowImportModal(false)} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!importTestName.trim() || isImporting}
                className="btn btn-primary flex-1 disabled:opacity-50"
              >
                {isImporting ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Test Confirmation Modal */}
      {deleteConfirmIdx !== null && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmIdx(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-red-600">Delete Test</h2>
              <button onClick={() => setDeleteConfirmIdx(null)} className="p-1 hover:bg-gray-100 rounded">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-gray-700">
                Are you sure you want to delete <strong>"{testColumns[deleteConfirmIdx]?.testName}"</strong>?
              </p>
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm font-medium">
                  ⚠️ This action cannot be undone.
                </p>
                <p className="text-red-600 text-sm mt-1">
                  All scores for this test will be deleted forever.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDeleteConfirmIdx(null)} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={() => confirmDeleteTestColumn(deleteConfirmIdx)}
                className="btn flex-1 bg-red-600 text-white hover:bg-red-700"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
