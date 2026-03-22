'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import { getStudentsByClass, getClasses, getNotesByStudent, addStudentNote, deleteStudentNote, updateStudentNote, migrateOldNotesToNewSystem } from '@/lib/storage';
import { sortStudentsByLastName } from '@/lib/calculations';
import { Student, Class, StudentNote } from '@/types';
import { MagnifyingGlassIcon, TrashIcon, XMarkIcon, PencilIcon, PrinterIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function NotesPage() {
  const params = useParams();
  const { setCurrentClassId } = useApp();
  const classId = params.classId as string;

  const [students, setStudents] = useState<Student[]>([]);
  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [notesByStudent, setNotesByStudent] = useState<Record<string, StudentNote[]>>({});
  /** Inline composer under each student header (no modal) */
  const [quickDraftByStudent, setQuickDraftByStudent] = useState<
    Record<string, { content: string; date: string }>
  >({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState('');
  const [editNoteDate, setEditNoteDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const allClasses = getClasses();
    const cls = allClasses.find(c => c.id === classId);
    setCurrentClass(cls || null);
    if (cls) {
      setCurrentClassId(cls.id);
      // Migrate any old notes to the new system
      migrateOldNotesToNewSystem(classId);
      refreshData();
    }
  }, [classId, setCurrentClassId]);

  // Scroll to student if hash is present in URL
  useEffect(() => {
    if (students.length > 0 && typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash) {
        const element = document.querySelector(hash);
        if (element) {
          setTimeout(() => {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }
      }
    }
  }, [students]);

  const refreshData = () => {
    const studentsList = sortStudentsByLastName(getStudentsByClass(classId));
    setStudents(studentsList);
    
    // Load notes for each student
    const notesMap: Record<string, StudentNote[]> = {};
    for (const student of studentsList) {
      notesMap[student.id] = getNotesByStudent(student.id);
    }
    setNotesByStudent(notesMap);
  };

  const todayStr = () => new Date().toISOString().split('T')[0];

  const getQuickDraft = (studentId: string) =>
    quickDraftByStudent[studentId] ?? { content: '', date: todayStr() };

  const setQuickDraft = (studentId: string, patch: Partial<{ content: string; date: string }>) => {
    setQuickDraftByStudent((prev) => {
      const cur = prev[studentId] ?? { content: '', date: todayStr() };
      return { ...prev, [studentId]: { ...cur, ...patch } };
    });
  };

  const saveQuickNote = (studentId: string) => {
    const { content, date } = getQuickDraft(studentId);
    const trimmed = content.trim();
    if (!trimmed) return;
    addStudentNote(studentId, trimmed, date);
    setQuickDraftByStudent((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    refreshData();
  };

  const handleDeleteNote = (noteId: string) => {
    if (confirm('Delete this note?')) {
      deleteStudentNote(noteId);
      refreshData();
    }
  };

  const startEditingNote = (note: StudentNote) => {
    setEditingNoteId(note.id);
    setEditNoteContent(note.content);
    setEditNoteDate(note.date);
  };

  const handleUpdateNote = () => {
    if (!editingNoteId || !editNoteContent.trim()) return;
    updateStudentNote(editingNoteId, editNoteContent.trim(), editNoteDate);
    refreshData();
    setEditingNoteId(null);
    setEditNoteContent('');
    setEditNoteDate('');
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setEditNoteContent('');
    setEditNoteDate('');
  };

  const handlePrintNotes = (student: Student, notes: StudentNote[]) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const notesHtml = notes.length > 0
      ? notes.map(note => `
          <div style="margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
            <p style="font-size: 14px; color: #6b7280; margin: 0 0 8px 0; font-weight: 500;">
              ${new Date(note.date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <p style="margin: 0; white-space: pre-wrap; line-height: 1.5;">${note.content}</p>
          </div>
        `).join('')
      : '<p style="color: #9ca3af; font-style: italic;">No notes recorded.</p>';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Notes - ${student.name}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 800px;
              margin: 0 auto;
              padding: 40px 20px;
              color: #1f2937;
            }
            h1 {
              color: #1e3a5f;
              margin: 0 0 8px 0;
              font-size: 24px;
            }
            .subtitle {
              color: #6b7280;
              margin: 0 0 24px 0;
              font-size: 14px;
            }
            @media print {
              body { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <h1>${student.name}</h1>
          <p class="subtitle">
            ${currentClass?.name || ''} • Enrolled: ${new Date(student.enrollmentDate + 'T00:00:00').toLocaleDateString()}
          </p>
          <div>${notesHtml}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Filter students by search
  const filteredStudents = searchQuery.trim()
    ? students
        .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          const query = searchQuery.toLowerCase();
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
            className="input w-full"
            style={{ paddingLeft: '2.5rem' }}
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
          {filteredStudents.map(student => {
            const studentNotes = notesByStudent[student.id] || [];
            const quick = getQuickDraft(student.id);
            const canSaveQuick = quick.content.trim().length > 0;

            return (
              <div key={student.id} id={`student-${student.id}`} className="card scroll-mt-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-lg text-[var(--cace-navy)]">
                      {student.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Enrolled: {new Date(student.enrollmentDate + 'T00:00:00').toLocaleDateString()}
                    </p>
                    {/* Inline composer — click and type, no modal */}
                    <div className="mt-3 space-y-2">
                      <label htmlFor={`quick-note-${student.id}`} className="sr-only">
                        New note for {student.name}
                      </label>
                      <textarea
                        id={`quick-note-${student.id}`}
                        value={quick.content}
                        onChange={(e) => setQuickDraft(student.id, { content: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            saveQuickNote(student.id);
                          }
                        }}
                        placeholder="Jot a note — Save or ⌘/Ctrl+Enter"
                        className="input text-sm min-h-[5rem] resize-y w-full"
                        rows={3}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          aria-label="Note date"
                          value={quick.date}
                          onChange={(e) => setQuickDraft(student.id, { date: e.target.value })}
                          className="input text-xs py-1.5 max-w-[11rem]"
                        />
                        <button
                          type="button"
                          onClick={() => saveQuickNote(student.id)}
                          disabled={!canSaveQuick}
                          className="btn btn-primary text-sm py-1.5"
                        >
                          Save note
                        </button>
                      </div>
                    </div>
                  </div>
                  {studentNotes.length > 0 && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => handlePrintNotes(student, studentNotes)}
                        className="btn btn-secondary text-sm"
                        title="Print notes"
                      >
                        <PrinterIcon className="w-4 h-4" />
                        Print
                      </button>
                    </div>
                  )}
                </div>

                {/* Notes List */}
                {studentNotes.length > 0 ? (
                  <div className="space-y-3">
                    {studentNotes.map(note => {
                      const isEditing = editingNoteId === note.id;

                      if (isEditing) {
                        return (
                          <div 
                            key={note.id} 
                            className="bg-yellow-50 border border-yellow-200 rounded-lg p-4"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-medium text-[var(--cace-navy)]">Edit Note</h4>
                              <button onClick={cancelEditingNote} className="text-gray-400 hover:text-gray-600">
                                <XMarkIcon className="w-5 h-5" />
                              </button>
                            </div>
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                <input
                                  type="date"
                                  value={editNoteDate}
                                  onChange={e => setEditNoteDate(e.target.value)}
                                  className="input w-full max-w-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                                <textarea
                                  value={editNoteContent}
                                  onChange={e => setEditNoteContent(e.target.value)}
                                  className="input min-h-[80px] resize-y w-full"
                                  rows={3}
                                  autoFocus
                                />
                              </div>
                              <div className="flex gap-2">
                                <button onClick={cancelEditingNote} className="btn btn-secondary">
                                  Cancel
                                </button>
                                <button
                                  onClick={handleUpdateNote}
                                  disabled={!editNoteContent.trim()}
                                  className="btn btn-primary"
                                >
                                  Save Changes
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div 
                          key={note.id} 
                          className="bg-gray-50 rounded-lg p-3 border border-gray-100"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-500 mb-1">
                                {new Date(note.date + 'T00:00:00').toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </p>
                              <p className="text-gray-700 whitespace-pre-wrap">{note.content}</p>
                            </div>
                            <div className="flex items-center gap-1 ml-2">
                              <button
                                onClick={() => startEditingNote(note)}
                                className="text-gray-400 hover:text-blue-500"
                                title="Edit note"
                              >
                                <PencilIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                className="text-gray-400 hover:text-red-500"
                                title="Delete note"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">
                    Saved notes will show here.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
