'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import {
  getStudentsByClass,
  getClasses,
  createStudent,
  updateStudent,
  dropStudent,
  moveStudent,
  findStudentByName,
} from '@/lib/storage';
import { parseAttendanceFileFromInput } from '@/lib/parsers';
import { Student, Class } from '@/types';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowRightIcon,
  ArrowUpTrayIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function StudentsPage() {
  const params = useParams();
  const { setCurrentClassId, mounted } = useApp();
  const classId = params.classId as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showEditStudent, setShowEditStudent] = useState<Student | null>(null);
  const [showMoveStudent, setShowMoveStudent] = useState<Student | null>(null);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEnrollment, setNewStudentEnrollment] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [editName, setEditName] = useState('');
  const [editEnrollment, setEditEnrollment] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    added: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  useEffect(() => {
    if (mounted) {
      const allClasses = getClasses();
      setClasses(allClasses);
      const cls = allClasses.find(c => c.id === classId);
      setCurrentClass(cls || null);
      if (cls) {
        setCurrentClassId(cls.id);
        refreshStudents();
      }
    }
  }, [classId, setCurrentClassId, mounted]);

  const refreshStudents = () => {
    setStudents(getStudentsByClass(classId));
  };

  const handleAddStudent = () => {
    if (!newStudentName.trim()) return;
    createStudent(newStudentName.trim(), classId, newStudentEnrollment);
    refreshStudents();
    setShowAddStudent(false);
    setNewStudentName('');
    setNewStudentEnrollment(new Date().toISOString().split('T')[0]);
  };

  const handleEditStudent = () => {
    if (!showEditStudent || !editName.trim()) return;
    updateStudent(showEditStudent.id, {
      name: editName.trim(),
      enrollmentDate: editEnrollment,
      notes: editNotes,
    });
    refreshStudents();
    setShowEditStudent(null);
  };

  const handleDropStudent = (student: Student) => {
    if (!confirm(`Drop ${student.name} from this class? They will be moved to Dropped Students.`)) return;
    dropStudent(student.id);
    refreshStudents();
  };

  const handleMoveStudent = (targetClassId: string) => {
    if (!showMoveStudent) return;
    moveStudent(showMoveStudent.id, targetClassId);
    refreshStudents();
    setShowMoveStudent(null);
  };

  const openEditModal = (student: Student) => {
    setEditName(student.name);
    setEditEnrollment(student.enrollmentDate);
    setEditNotes(student.notes);
    setShowEditStudent(student);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    const result = await parseAttendanceFileFromInput(file);
    
    let added = 0;
    let skipped = 0;

    // Extract unique student names and create students
    const seenNames = new Set<string>();
    for (const record of result.records) {
      const normalizedName = record.studentName.trim();
      if (seenNames.has(normalizedName.toLowerCase())) continue;
      seenNames.add(normalizedName.toLowerCase());

      // Check if student already exists
      const existing = findStudentByName(normalizedName, classId);
      if (existing) {
        skipped++;
      } else {
        createStudent(normalizedName, classId);
        added++;
      }
    }

    setImportResult({
      added,
      skipped,
      errors: result.errors,
    });

    refreshStudents();
    setIsImporting(false);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!mounted) {
    return <div className="animate-pulse"><div className="h-8 bg-gray-200 rounded w-48"></div></div>;
  }

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

  const otherClasses = classes.filter(c => c.id !== classId);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Students</h1>
          <p className="text-gray-600">{currentClass.name} • {currentClass.schedule}</p>
        </div>
        <div className="flex gap-2">
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
            {isImporting ? 'Importing...' : 'Import from File'}
          </button>
          <button onClick={() => setShowAddStudent(true)} className="btn btn-primary">
            <PlusIcon className="w-5 h-5" />
            Add Student
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
                Added {importResult.added} new student{importResult.added !== 1 ? 's' : ''}
                {importResult.skipped > 0 && `, skipped ${importResult.skipped} (already exist)`}
              </p>
              {importResult.errors.length > 0 && (
                <div className="mt-2 text-red-700">
                  <p className="font-medium">Errors:</p>
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

      {/* Students Table */}
      {students.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">No students in this class yet</p>
          <p className="text-sm text-gray-400 mt-2">
            Use the buttons above to add students or import from an attendance file
          </p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Enrolled</th>
                <th>Notes</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map(student => (
                <tr key={student.id}>
                  <td>
                    <Link
                      href={`/classes/${classId}/notes`}
                      className="font-medium text-[var(--cace-navy)] hover:text-[var(--cace-teal)]"
                    >
                      {student.name}
                    </Link>
                  </td>
                  <td className="text-gray-600">
                    {new Date(student.enrollmentDate).toLocaleDateString()}
                  </td>
                  <td className="text-gray-500 text-sm max-w-xs truncate">
                    {student.notes || '—'}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditModal(student)}
                        className="p-2 text-gray-400 hover:text-[var(--cace-teal)] hover:bg-[var(--cace-gray)] rounded-lg"
                        title="Edit student"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      {otherClasses.length > 0 && (
                        <button
                          onClick={() => setShowMoveStudent(student)}
                          className="p-2 text-gray-400 hover:text-[var(--cace-navy)] hover:bg-[var(--cace-gray)] rounded-lg"
                          title="Move to another class"
                        >
                          <ArrowRightIcon className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDropStudent(student)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        title="Drop student"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-sm text-gray-500">
        {students.length} student{students.length !== 1 ? 's' : ''} enrolled
      </p>

      {/* Add Student Modal */}
      {showAddStudent && (
        <div className="modal-overlay" onClick={() => setShowAddStudent(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Add Student</h2>
              <button
                onClick={() => setShowAddStudent(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Student Name
                </label>
                <input
                  type="text"
                  value={newStudentName}
                  onChange={e => setNewStudentName(e.target.value)}
                  placeholder="e.g., John Smith"
                  className="input"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enrollment Date
                </label>
                <input
                  type="date"
                  value={newStudentEnrollment}
                  onChange={e => setNewStudentEnrollment(e.target.value)}
                  className="input"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAddStudent(false)} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={handleAddStudent}
                disabled={!newStudentName.trim()}
                className="btn btn-primary flex-1 disabled:opacity-50"
              >
                Add Student
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {showEditStudent && (
        <div className="modal-overlay" onClick={() => setShowEditStudent(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Edit Student</h2>
              <button
                onClick={() => setShowEditStudent(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="input"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enrollment Date
                </label>
                <input
                  type="date"
                  value={editEnrollment}
                  onChange={e => setEditEnrollment(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Personal notes (not shown on report cards)"
                  className="input min-h-[80px] resize-y"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowEditStudent(null)} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={handleEditStudent}
                disabled={!editName.trim()}
                className="btn btn-primary flex-1 disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Student Modal */}
      {showMoveStudent && (
        <div className="modal-overlay" onClick={() => setShowMoveStudent(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Move Student</h2>
              <button
                onClick={() => setShowMoveStudent(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-600 mb-4">
              Move <strong>{showMoveStudent.name}</strong> to another class:
            </p>
            <div className="space-y-2">
              {otherClasses.map(cls => (
                <button
                  key={cls.id}
                  onClick={() => handleMoveStudent(cls.id)}
                  className="w-full p-3 text-left rounded-lg border hover:bg-[var(--cace-gray)] hover:border-[var(--cace-teal)] transition-colors"
                >
                  <span className="font-medium">{cls.name}</span>
                  <span className="text-gray-500 ml-2">({cls.schedule})</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowMoveStudent(null)}
              className="btn btn-secondary w-full mt-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
