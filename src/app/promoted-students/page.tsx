'use client';

import { useState, useEffect } from 'react';
import { getPromotedStudents, getClasses, restoreStudent } from '@/lib/storage';
import { Student, Class } from '@/types';
import { ArrowUturnLeftIcon, AcademicCapIcon } from '@heroicons/react/24/outline';

export default function PromotedStudentsPage() {
  const [promotedStudents, setPromotedStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [showRestoreModal, setShowRestoreModal] = useState<Student | null>(null);

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = () => {
    setPromotedStudents(getPromotedStudents());
    setClasses(getClasses());
  };

  const handleRestore = (targetClassId: string) => {
    if (!showRestoreModal) return;
    restoreStudent(showRestoreModal.id, targetClassId);
    refreshData();
    setShowRestoreModal(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Promoted Students</h1>
        <p className="text-gray-600">
          Students marked as promoted (successful exit). They don&apos;t appear on the active roster and are
          excluded from retention metrics. Restore them to a class if needed.
        </p>
      </div>

      {promotedStudents.length === 0 ? (
        <div className="card text-center py-12">
          <AcademicCapIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">No promoted students</h3>
          <p className="text-gray-500">
            When you remove someone from a class and choose <strong>Promoted</strong>, they show up here.
          </p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Class when promoted</th>
                <th>Promoted date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {promotedStudents.map(student => {
                const cls = classes.find(c => c.id === student.classId);
                return (
                  <tr key={student.id}>
                    <td className="font-medium">{student.name}</td>
                    <td className="text-gray-600">{cls?.name || 'Unknown class'}</td>
                    <td className="text-gray-500">
                      {student.promotedDate
                        ? new Date(student.promotedDate + 'T00:00:00').toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="text-right">
                      {classes.length > 0 ? (
                        <button
                          onClick={() => setShowRestoreModal(student)}
                          className="btn btn-accent text-sm"
                        >
                          <ArrowUturnLeftIcon className="w-4 h-4" />
                          Restore
                        </button>
                      ) : (
                        <span className="text-gray-400 text-sm">Create a class first</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-sm text-gray-500">
        {promotedStudents.length} promoted student{promotedStudents.length !== 1 ? 's' : ''}
      </p>

      {showRestoreModal && (
        <div className="modal-overlay" onClick={() => setShowRestoreModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-4">Restore Student</h2>
            <p className="text-gray-600 mb-4">
              Restore <strong>{showRestoreModal.name}</strong> to which class?
            </p>
            <div className="space-y-2">
              {classes.map(cls => (
                <button
                  key={cls.id}
                  onClick={() => handleRestore(cls.id)}
                  className="w-full p-3 text-left rounded-lg border hover:bg-[var(--cace-gray)] hover:border-[var(--cace-teal)] transition-colors"
                >
                  <span className="font-medium">{cls.name}</span>
                  <span className="text-gray-500 ml-2">({cls.schedule})</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowRestoreModal(null)}
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
