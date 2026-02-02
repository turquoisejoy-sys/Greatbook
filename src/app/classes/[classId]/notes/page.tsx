'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import { getStudentsByClass, getClasses, updateStudent } from '@/lib/storage';
import { sortStudentsByLastName } from '@/lib/calculations';
import { Student, Class } from '@/types';
import { CheckIcon, PencilIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function NotesPage() {
  const params = useParams();
  const { setCurrentClassId } = useApp();
  const classId = params.classId as string;

  const [students, setStudents] = useState<Student[]>([]);
  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const allClasses = getClasses();
    const cls = allClasses.find(c => c.id === classId);
    setCurrentClass(cls || null);
    if (cls) {
      setCurrentClassId(cls.id);
      refreshStudents();
    }
  }, [classId, setCurrentClassId]);

  const refreshStudents = () => {
    setStudents(sortStudentsByLastName(getStudentsByClass(classId)));
  };

  const startEditing = (student: Student) => {
    setEditingId(student.id);
    setEditingNotes(student.notes);
  };

  const saveNotes = (studentId: string) => {
    updateStudent(studentId, { notes: editingNotes });
    refreshStudents();
    setEditingId(null);
    setEditingNotes('');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingNotes('');
  };

  // Filter and sort students: matches appear first
  const filteredStudents = searchQuery.trim()
    ? students
        .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          const query = searchQuery.toLowerCase();
          // Prioritize names that start with the query
          const aStarts = aName.startsWith(query);
          const bStarts = bName.startsWith(query);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return aName.localeCompare(bName);
        })
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Student Notes</h1>
        <p className="text-gray-600">{currentClass.name} • {currentClass.schedule}</p>
        <p className="text-sm text-gray-500 mt-2">
          Personal notes for each student. These are for your reference only and won't appear on report cards.
        </p>
      </div>

      {/* Search Bar */}
      {students.length > 0 && (
        <div className="relative">
          <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search students..."
            className="input pl-10 w-full"
          />
        </div>
      )}

      {/* Students List */}
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
        <div className="space-y-4">
          {filteredStudents.map(student => (
            <div key={student.id} className="card">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-lg text-[var(--cace-navy)]">
                    {student.name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Enrolled: {new Date(student.enrollmentDate + 'T00:00:00').toLocaleDateString()}
                  </p>
                </div>
                {editingId !== student.id && (
                  <button
                    onClick={() => startEditing(student)}
                    className="btn btn-secondary text-sm"
                  >
                    <PencilIcon className="w-4 h-4" />
                    Edit
                  </button>
                )}
              </div>

              {editingId === student.id ? (
                <div className="mt-3">
                  <textarea
                    value={editingNotes}
                    onChange={e => setEditingNotes(e.target.value)}
                    placeholder="Add notes about this student..."
                    className="input min-h-[100px] resize-y"
                    rows={4}
                    autoFocus
                  />
                  <div className="flex gap-2 mt-3">
                    <button onClick={cancelEditing} className="btn btn-secondary">
                      Cancel
                    </button>
                    <button
                      onClick={() => saveNotes(student.id)}
                      className="btn btn-primary"
                    >
                      <CheckIcon className="w-4 h-4" />
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  {student.notes ? (
                    <p className="text-gray-700 whitespace-pre-wrap">{student.notes}</p>
                  ) : (
                    <p className="text-gray-400 italic">No notes yet. Click Edit to add notes.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
