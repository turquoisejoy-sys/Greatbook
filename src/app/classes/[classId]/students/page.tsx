'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import {
  getStudentsByClass,
  getClasses,
  createStudent,
  updateStudent,
  dropStudent,
  moveStudent,
} from '@/lib/storage';
import { Student, Class } from '@/types';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function StudentsPage() {
  const params = useParams();
  const router = useRouter();
  const { setCurrentClassId } = useApp();
  const classId = params.classId as string;

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

  useEffect(() => {
    const allClasses = getClasses();
    setClasses(allClasses);
    const cls = allClasses.find(c => c.id === classId);
    setCurrentClass(cls || null);
    if (cls) {
      setCurrentClassId(cls.id);
      refreshStudents();
    }
  }, [classId, setCurrentClassId]);

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
          <p className="text-gray-600">{currentClass.name} • {currentClass.period}</p>
        </div>
        <button onClick={() => setShowAddStudent(true)} className="btn btn-primary">
          <PlusIcon className="w-5 h-5" />
          Add Student
        </button>
      </div>

      {/* Students Table */}
      {students.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No students in this class yet</p>
          <button onClick={() => setShowAddStudent(true)} className="btn btn-accent">
            <PlusIcon className="w-5 h-5" />
            Add First Student
          </button>
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
                  <span className="text-gray-500 ml-2">({cls.period})</span>
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
