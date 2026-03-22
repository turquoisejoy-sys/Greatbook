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
  promoteStudent,
  transferStudent,
  findStudentByName,
} from '@/lib/storage';
import { parseAttendanceFileFromInput } from '@/lib/parsers';
import { sortStudentsByLastName } from '@/lib/calculations';
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
  const [showTransferStudent, setShowTransferStudent] = useState<Student | null>(null);
  const [showExitStudent, setShowExitStudent] = useState<Student | null>(null);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEnrollment, setNewStudentEnrollment] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [editName, setEditName] = useState('');
  const [editEnrollment, setEditEnrollment] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importEnrollmentDate, setImportEnrollmentDate] = useState(
    new Date().toISOString().split('T')[0]
  );
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
    setStudents(sortStudentsByLastName(getStudentsByClass(classId)));
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

  const handleConfirmDrop = () => {
    if (!showExitStudent) return;
    dropStudent(showExitStudent.id);
    refreshStudents();
    setShowExitStudent(null);
  };

  const handleConfirmPromote = () => {
    if (!showExitStudent) return;
    promoteStudent(showExitStudent.id);
    refreshStudents();
    setShowExitStudent(null);
  };

  const handleTransferStudent = (targetClassId: string) => {
    if (!showTransferStudent) return;
    transferStudent(showTransferStudent.id, targetClassId);
    refreshStudents();
    setShowTransferStudent(null);
  };

  const openEditModal = (student: Student) => {
    setEditName(student.name);
    setEditEnrollment(student.enrollmentDate);
    setEditNotes(student.notes);
    setShowEditStudent(student);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Store the file and show the modal
    setPendingFile(file);
    setImportEnrollmentDate(new Date().toISOString().split('T')[0]);
    setShowImportModal(true);

    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processImport = async () => {
    if (!pendingFile) return;

    setIsImporting(true);
    setImportResult(null);

    const result = await parseAttendanceFileFromInput(pendingFile);
    
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
        createStudent(normalizedName, classId, importEnrollmentDate);
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
    setShowImportModal(false);
    setPendingFile(null);
  };

  const cancelImport = () => {
    setShowImportModal(false);
    setPendingFile(null);
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
          <p className="text-gray-600">
            {currentClass.name} • {currentClass.schedule} • <span className="font-medium">{students.length} enrolled</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            Import from File
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
                <th className="w-1/2">Name</th>
                <th>Enrolled</th>
                <th className="text-right w-32">Actions</th>
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
                    {new Date(student.enrollmentDate + 'T00:00:00').toLocaleDateString()}
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
                      <button
                        onClick={() => setShowExitStudent(student)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        title="Leave class — promote, transfer, or drop"
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

      {/* Drop vs Promote Modal */}
      {showExitStudent && (
        <div className="modal-overlay" onClick={() => setShowExitStudent(null)}>
          <div className="modal max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-2">Leave this class</h2>
            <p className="text-gray-600 mb-6">
              What happened with <strong>{showExitStudent.name}</strong>?
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleConfirmPromote}
                className="w-full p-4 text-left rounded-lg border-2 border-[var(--cace-teal)]/40 bg-teal-50/80 hover:bg-teal-50 transition-colors"
              >
                <span className="font-semibold text-[var(--cace-navy)]">Promoted</span>
                <p className="text-sm text-gray-600 mt-1">
                  Left successfully (e.g. next level). Does not count against retention. Listed under Promoted Students.
                </p>
              </button>
              {otherClasses.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const s = showExitStudent;
                    setShowExitStudent(null);
                    setShowTransferStudent(s);
                  }}
                  className="w-full p-4 text-left rounded-lg border-2 border-blue-200 bg-blue-50/70 hover:bg-blue-50 transition-colors"
                >
                  <span className="font-semibold text-[var(--cace-navy)] inline-flex items-center gap-2">
                    <ArrowRightIcon className="w-5 h-5 text-blue-600 shrink-0" />
                    Transfer to another class
                  </span>
                  <p className="text-sm text-gray-600 mt-1">
                    Same program, different section/level. All scores, attendance, notes, and report cards stay on
                    their record. Does not count against retention for <em>this</em> class.
                  </p>
                </button>
              ) : (
                <div className="p-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
                  <span className="font-medium text-gray-700">Transfer</span> — add another class first (Dashboard)
                  to move students between sections.
                </div>
              )}
              <button
                type="button"
                onClick={handleConfirmDrop}
                className="w-full p-4 text-left rounded-lg border-2 border-red-200 bg-red-50/50 hover:bg-red-50 transition-colors"
              >
                <span className="font-semibold text-red-800">Dropped</span>
                <p className="text-sm text-gray-600 mt-1">
                  Stopped attending. Counts in retention if they don&apos;t return. Listed under Dropped Students.
                </p>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowExitStudent(null)}
              className="btn btn-secondary w-full mt-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Transfer: pick destination class */}
      {showTransferStudent && (
        <div className="modal-overlay" onClick={() => setShowTransferStudent(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Transfer student</h2>
              <button
                onClick={() => setShowTransferStudent(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-600 mb-4">
              Transfer <strong>{showTransferStudent.name}</strong> and all their data to:
            </p>
            <div className="space-y-2">
              {otherClasses.map(cls => (
                <button
                  key={cls.id}
                  onClick={() => handleTransferStudent(cls.id)}
                  className="w-full p-3 text-left rounded-lg border hover:bg-[var(--cace-gray)] hover:border-[var(--cace-teal)] transition-colors"
                >
                  <span className="font-medium">{cls.name}</span>
                  <span className="text-gray-500 ml-2">({cls.schedule})</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowTransferStudent(null)}
              className="btn btn-secondary w-full mt-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Import Students Modal */}
      {showImportModal && pendingFile && (
        <div className="modal-overlay" onClick={cancelImport}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Import Students</h2>
              <button
                onClick={cancelImport}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Selected file:</p>
                <p className="font-medium text-gray-900">{pendingFile.name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enrollment Date for New Students
                </label>
                <input
                  type="date"
                  value={importEnrollmentDate}
                  onChange={e => setImportEnrollmentDate(e.target.value)}
                  className="input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This date will be set as the enrollment date for all imported students
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={cancelImport} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={processImport}
                disabled={isImporting}
                className="btn btn-primary flex-1 disabled:opacity-50"
              >
                {isImporting ? 'Importing...' : 'Import Students'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
