'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import { getStudentsByClass, getClasses, getISSTRecordsByClass, addISSTDate, removeISSTDate } from '@/lib/storage';
import { sortStudentsByLastName } from '@/lib/calculations';
import { Student, Class, ISSTRecord } from '@/types';
import { XMarkIcon, PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
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
      <div>
        <h1 className="text-2xl font-bold text-[var(--cace-navy)]">ISST - Tutoring Attendance</h1>
        <p className="text-gray-600">{currentClass.name} • {currentClass.schedule}</p>
        <p className="text-sm text-gray-500 mt-2">
          Track student attendance at extra tutoring sessions. Click on a cell to add or view dates.
        </p>
      </div>

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
    </div>
  );
}
