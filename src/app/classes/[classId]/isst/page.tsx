'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import { getStudentsByClass, getClasses, getISSTRecordsByClass, addISSTDate, removeISSTDate } from '@/lib/storage';
import { sortStudentsByLastName, normalizeNameForMatching } from '@/lib/calculations';
import { parseISSTFileFromInput, ISSTParseResult, ISSTImportRow } from '@/lib/parsers';
import { Student, Class, ISSTRecord } from '@/types';
import { XMarkIcon, PlusIcon, MagnifyingGlassIcon, ArrowUpTrayIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

// School year months: August through June
const SCHOOL_MONTHS = [
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

function getSchoolYearMonths(): { key: string; label: string; fullMonth: string }[] {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  // If we're in Aug-Dec, school year is currentYear-nextYear
  // If we're in Jan-Jul, school year is prevYear-currentYear
  const schoolYearStart = currentMonth >= 8 ? currentYear : currentYear - 1;
  
  return SCHOOL_MONTHS.map(m => {
    const monthNum = parseInt(m.key, 10);
    const year = monthNum >= 8 ? schoolYearStart : schoolYearStart + 1;
    return {
      ...m,
      fullMonth: `${year}-${m.key}`, // e.g., "2025-08"
    };
  });
}

export default function ISSTPage() {
  const params = useParams();
  const { setCurrentClassId } = useApp();
  const classId = params.classId as string;

  const [students, setStudents] = useState<Student[]>([]);
  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [isstRecords, setISSTRecords] = useState<ISSTRecord[]>([]);
  const [editingCell, setEditingCell] = useState<{ studentId: string; month: string } | null>(null);
  const [newDate, setNewDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResults, setImportResults] = useState<ISSTParseResult[] | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [importPreview, setImportPreview] = useState<{
    matched: { student: Student; record: ISSTImportRow; datesCount: number }[];
    unmatched: ISSTImportRow[];
  } | null>(null);
  const [showImportSuccess, setShowImportSuccess] = useState<{ imported: number; dates: number } | null>(null);

  const schoolYearMonths = getSchoolYearMonths();

  useEffect(() => {
    const allClasses = getClasses();
    const cls = allClasses.find(c => c.id === classId);
    setCurrentClass(cls || null);
    if (cls) {
      setCurrentClassId(cls.id);
      refreshData();
    }
  }, [classId, setCurrentClassId]);

  const refreshData = () => {
    setStudents(sortStudentsByLastName(getStudentsByClass(classId)));
    setISSTRecords(getISSTRecordsByClass(classId));
  };

  const getRecordForCell = (studentId: string, month: string): ISSTRecord | undefined => {
    return isstRecords.find(r => r.studentId === studentId && r.month === month);
  };

  const handleAddDate = (studentId: string, month: string) => {
    if (!newDate) return;
    addISSTDate(studentId, month, newDate);
    refreshData();
    setNewDate('');
  };

  const handleRemoveDate = (studentId: string, month: string, date: string) => {
    removeISSTDate(studentId, month, date);
    refreshData();
  };

  const handleCellClick = (studentId: string, month: string) => {
    setEditingCell({ studentId, month });
    setNewDate('');
  };

  const closeEditor = () => {
    setEditingCell(null);
    setNewDate('');
  };

  // Import functions
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const results = await parseISSTFileFromInput(file);
      setImportResults(results);
      
      // Auto-select first sheet with data
      const firstWithData = results.find(r => r.records.length > 0);
      if (firstWithData) {
        setSelectedSheet(firstWithData.sheetName);
        prepareImportPreview(firstWithData);
      }
      
      setShowImportModal(true);
    } catch (err) {
      alert('Error reading file: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const prepareImportPreview = (result: ISSTParseResult) => {
    const matched: { student: Student; record: ISSTImportRow; datesCount: number }[] = [];
    const unmatched: ISSTImportRow[] = [];
    
    for (const record of result.records) {
      // Try to match by name
      const normalizedImport = normalizeNameForMatching(record.studentName);
      const matchedStudent = students.find(s => 
        normalizeNameForMatching(s.name) === normalizedImport
      );
      
      if (matchedStudent) {
        matched.push({
          student: matchedStudent,
          record,
          datesCount: record.dates.length,
        });
      } else {
        // Partial match attempt
        const partialMatch = students.find(s => {
          const importParts = normalizedImport.split(' ');
          const studentParts = normalizeNameForMatching(s.name).split(' ');
          return importParts.some(p => studentParts.includes(p) && p.length > 2);
        });
        
        if (partialMatch) {
          matched.push({
            student: partialMatch,
            record,
            datesCount: record.dates.length,
          });
        } else {
          unmatched.push(record);
        }
      }
    }
    
    setImportPreview({ matched, unmatched });
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    const result = importResults?.find(r => r.sheetName === sheetName);
    if (result) {
      prepareImportPreview(result);
    }
  };

  const handleConfirmImport = () => {
    if (!importPreview) return;
    
    let totalDates = 0;
    
    for (const { student, record } of importPreview.matched) {
      for (const { month, date } of record.dates) {
        addISSTDate(student.id, month, date);
        totalDates++;
      }
    }
    
    refreshData();
    setShowImportSuccess({ imported: importPreview.matched.length, dates: totalDates });
    setShowImportModal(false);
    setImportResults(null);
    setImportPreview(null);
    setSelectedSheet('');
    
    // Auto-hide success message
    setTimeout(() => setShowImportSuccess(null), 5000);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportResults(null);
    setImportPreview(null);
    setSelectedSheet('');
  };

  // Filter students by search query
  const filteredStudents = searchQuery.trim()
    ? students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : students;

  if (!currentClass) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card text-center py-12">
          <p className="text-gray-500">Class not found</p>
          <Link href="/" className="btn btn-primary mt-4">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--cace-navy)]">ISST - Tutoring Attendance</h1>
          <p className="text-gray-600">{currentClass.name} • {currentClass.schedule}</p>
          <p className="text-sm text-gray-500 mt-2">
            Track student attendance at extra tutoring sessions. Click on a cell to add or view dates.
          </p>
        </div>
        {students.length > 0 && (
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-secondary"
            >
              <ArrowUpTrayIcon className="w-4 h-4" />
              Import
            </button>
          </div>
        )}
      </div>

      {/* Import Success Message */}
      {showImportSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-green-800">
            Successfully imported {showImportSuccess.dates} dates for {showImportSuccess.imported} students.
          </p>
          <button 
            onClick={() => setShowImportSuccess(null)}
            className="ml-auto text-green-600 hover:text-green-800"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Search Bar */}
      {students.length > 0 && (
        <div className="relative max-w-md">
          <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search students..."
            className="input w-full"
            style={{ paddingLeft: '2.5rem' }}
          />
        </div>
      )}

      {/* Students Table */}
      {students.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No students in this class yet</p>
          <Link href={`/classes/${classId}/students`} className="btn btn-accent">
            Add Students
          </Link>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-500">No students match "{searchQuery}"</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-3 font-semibold text-[var(--cace-navy)] sticky left-0 bg-white min-w-[150px]">
                  Student
                </th>
                {schoolYearMonths.map(m => (
                  <th 
                    key={m.fullMonth} 
                    className="text-center py-3 px-2 font-semibold text-[var(--cace-navy)] min-w-[70px]"
                  >
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(student => (
                <tr key={student.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium sticky left-0 bg-white">
                    <Link 
                      href={`/classes/${classId}/notes#student-${student.id}`}
                      className="text-[var(--cace-navy)] hover:text-[var(--cace-teal)] hover:underline"
                    >
                      {student.name}
                    </Link>
                  </td>
                  {schoolYearMonths.map(m => {
                    const record = getRecordForCell(student.id, m.fullMonth);
                    const hasDates = record && record.dates.length > 0;
                    const isEditing = editingCell?.studentId === student.id && editingCell?.month === m.fullMonth;

                    return (
                      <td 
                        key={m.fullMonth} 
                        className={`py-2 px-1 text-center relative ${
                          hasDates ? 'bg-green-100' : ''
                        }`}
                      >
                        <button
                          onClick={() => handleCellClick(student.id, m.fullMonth)}
                          className={`w-full h-full min-h-[32px] rounded border-2 border-dashed transition-colors ${
                            hasDates 
                              ? 'border-green-300 hover:border-green-400 bg-green-100' 
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                          title={hasDates ? `${record.dates.length} date(s)` : 'Click to add date'}
                        >
                          {hasDates && (
                            <span className="text-xs font-medium text-green-700">
                              {record.dates.length}
                            </span>
                          )}
                        </button>

                        {/* Editor Popup */}
                        {isEditing && (
                          <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[220px]">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-semibold text-sm text-[var(--cace-navy)]">
                                {m.label} Dates
                              </h4>
                              <button 
                                onClick={closeEditor}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <XMarkIcon className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Existing Dates */}
                            {record && record.dates.length > 0 && (
                              <div className="space-y-1 mb-3">
                                {record.dates.map(date => (
                                  <div 
                                    key={date} 
                                    className="flex items-center justify-between bg-green-50 rounded px-2 py-1"
                                  >
                                    <span className="text-sm">
                                      {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                      })}
                                    </span>
                                    <button
                                      onClick={() => handleRemoveDate(student.id, m.fullMonth, date)}
                                      className="text-red-400 hover:text-red-600"
                                    >
                                      <XMarkIcon className="w-4 h-4" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Add New Date */}
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                value={newDate}
                                onChange={e => setNewDate(e.target.value)}
                                className="input text-sm flex-1 py-1"
                              />
                              <button
                                onClick={() => handleAddDate(student.id, m.fullMonth)}
                                disabled={!newDate}
                                className="btn btn-primary text-sm py-1 px-2"
                              >
                                <PlusIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded border-2 border-dashed border-gray-200 bg-white"></div>
          <span>No attendance</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded border-2 border-dashed border-green-300 bg-green-100 flex items-center justify-center">
            <span className="text-xs font-medium text-green-700">2</span>
          </div>
          <span>Has attendance (number = count)</span>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && importResults && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--cace-navy)]">Import ISST Data</h3>
              <button onClick={closeImportModal} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {/* Sheet Selector */}
              {importResults.length > 1 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Sheet</label>
                  <select
                    value={selectedSheet}
                    onChange={e => handleSheetChange(e.target.value)}
                    className="input w-full max-w-xs"
                  >
                    {importResults.map(r => (
                      <option key={r.sheetName} value={r.sheetName}>
                        {r.sheetName} ({r.records.length} students)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Parse Errors */}
              {importResults.find(r => r.sheetName === selectedSheet)?.errors.length ? (
                <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-yellow-800 mb-1">Parsing Notes:</p>
                  <ul className="text-xs text-yellow-700 list-disc list-inside">
                    {importResults.find(r => r.sheetName === selectedSheet)?.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Preview */}
              {importPreview && (
                <>
                  {/* Matched Students */}
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                      Matched Students ({importPreview.matched.length})
                    </h4>
                    {importPreview.matched.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No matches found</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto border rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2">Your Roster</th>
                              <th className="text-left px-3 py-2">Import Name</th>
                              <th className="text-center px-3 py-2">Dates</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.matched.map(({ student, record, datesCount }) => (
                              <tr key={student.id} className="border-t">
                                <td className="px-3 py-2 font-medium">{student.name}</td>
                                <td className="px-3 py-2 text-gray-600">{record.studentName}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">
                                    {datesCount}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Unmatched Students */}
                  {importPreview.unmatched.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-yellow-700 mb-2">
                        Unmatched ({importPreview.unmatched.length}) - will be skipped
                      </h4>
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <div className="flex flex-wrap gap-2">
                          {importPreview.unmatched.map((record, i) => (
                            <span 
                              key={i} 
                              className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs"
                            >
                              {record.studentName}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {importPreview?.matched.length || 0} students will be updated
              </p>
              <div className="flex gap-2">
                <button onClick={closeImportModal} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={!importPreview || importPreview.matched.length === 0}
                  className="btn btn-primary"
                >
                  Import Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
