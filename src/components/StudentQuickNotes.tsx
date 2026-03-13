'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { addStudentNote, getNotesByStudent } from '@/lib/storage';
import { StudentNote } from '@/types';

interface StudentQuickNotesProps {
  classId: string;
  studentId: string;
  studentName: string;
  className?: string;
}

function formatDisplayDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function StudentQuickNotes({
  classId,
  studentId,
  studentName,
  className,
}: StudentQuickNotesProps) {
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [isOpen, setIsOpen] = useState(false);
  const [noteDate, setNoteDate] = useState(today);
  const [noteContent, setNoteContent] = useState('');
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [saveMessage, setSaveMessage] = useState('');
  const portalRoot = typeof document !== 'undefined' ? document.body : null;

  const openModal = () => {
    setNotes(getNotesByStudent(studentId));
    setNoteDate(today);
    setNoteContent('');
    setSaveMessage('');
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setSaveMessage('');
  };

  const handleSave = () => {
    if (!noteContent.trim()) return;

    addStudentNote(studentId, noteContent.trim(), noteDate);
    setNotes(getNotesByStudent(studentId));
    setNoteContent('');
    setSaveMessage('Saved');
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={className || 'text-left hover:text-[var(--cace-teal)] hover:underline'}
      >
        {studentName}
      </button>

      {portalRoot && isOpen && createPortal(
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--cace-navy)]">{studentName}</h3>
                <p className="text-sm text-gray-500">
                  Quick note. This saves to the same Student Notes page.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
                title="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={noteDate}
                  onChange={(e) => setNoteDate(e.target.value)}
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  rows={5}
                  className="input w-full"
                  placeholder="Write a note about this student..."
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <Link
                  href={`/classes/${classId}/notes#student-${studentId}`}
                  className="text-sm text-[var(--cace-teal)] hover:underline"
                  onClick={closeModal}
                >
                  Open full notes page
                </Link>
                <div className="flex items-center gap-3">
                  {saveMessage && <span className="text-sm text-green-600">{saveMessage}</span>}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!noteContent.trim()}
                    className="btn btn-primary disabled:opacity-50"
                  >
                    Save Note
                  </button>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-sm font-medium text-gray-700 mb-2">Recent notes</p>
                {notes.length === 0 ? (
                  <p className="text-sm text-gray-400">No notes yet.</p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {notes.slice(0, 5).map((note) => (
                      <div key={note.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-xs font-medium text-gray-500 mb-1">
                          {formatDisplayDate(note.date)}
                        </p>
                        <p className="text-sm whitespace-pre-wrap text-gray-700">{note.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      , portalRoot)}
    </>
  );
}
