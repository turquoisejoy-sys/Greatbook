'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/components/AppShell';
import { 
  getClasses, 
  createClass, 
  deleteClass, 
  getStudentsByClass,
  getStudents 
} from '@/lib/storage';
import { Class, Student } from '@/types';
import { 
  PlusIcon, 
  TrashIcon, 
  MagnifyingGlassIcon,
  UserGroupIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function Dashboard() {
  const { currentClassId, setCurrentClassId, refreshClasses, mounted } = useApp();
  const [classes, setClasses] = useState<Class[]>([]);
  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassPeriod, setNewClassPeriod] = useState('Morning');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Student[]>([]);

  useEffect(() => {
    if (mounted) {
      setClasses(getClasses());
    }
  }, [mounted]);

  const handleAddClass = () => {
    if (!newClassName.trim()) return;
    const newClass = createClass(newClassName.trim(), newClassPeriod);
    setClasses(getClasses());
    refreshClasses();
    setCurrentClassId(newClass.id);
    setShowAddClass(false);
    setNewClassName('');
    setNewClassPeriod('Morning');
  };

  const handleDeleteClass = (classId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this class and all its students? This cannot be undone.')) return;
    deleteClass(classId);
    setClasses(getClasses());
    refreshClasses();
    if (currentClassId === classId) {
      setCurrentClassId(null);
    }
  };

  const handleSelectClass = (classId: string) => {
    setCurrentClassId(classId);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const allStudents = getStudents().filter(s => !s.isDropped);
    const matches = allStudents.filter(s => 
      s.name.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(matches.slice(0, 10));
  };

  const selectedClass = classes.find(c => c.id === currentClassId);
  const studentsInClass = currentClassId && mounted ? getStudentsByClass(currentClassId) : [];

  if (!mounted) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-64 mb-8"></div>
          <div className="h-12 bg-gray-200 rounded mb-8"></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[var(--cace-navy)]">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome to CACE Gradebook</p>
      </div>

      {/* Search Bar */}
      <div className="card">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search students by name..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 border rounded-lg divide-y">
            {searchResults.map(student => {
              const studentClass = classes.find(c => c.id === student.classId);
              return (
                <Link
                  key={student.id}
                  href={`/classes/${student.classId}/notes`}
                  className="flex items-center justify-between p-3 hover:bg-gray-50"
                >
                  <span className="font-medium">{student.name}</span>
                  <span className="text-sm text-gray-500">
                    {studentClass?.name || 'Unknown class'}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        {searchQuery.length >= 2 && searchResults.length === 0 && (
          <p className="mt-3 text-gray-500 text-sm">No students found matching "{searchQuery}"</p>
        )}
      </div>

      {/* Classes Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-[var(--cace-navy)]">Your Classes</h2>
          <button 
            onClick={() => setShowAddClass(true)}
            className="btn btn-primary"
          >
            <PlusIcon className="w-5 h-5" />
            Add Class
          </button>
        </div>

        {classes.length === 0 ? (
          <div className="card text-center py-12">
            <AcademicCapIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">No classes yet</h3>
            <p className="text-gray-500 mb-4">Create your first class to get started</p>
            <button 
              onClick={() => setShowAddClass(true)}
              className="btn btn-accent"
            >
              <PlusIcon className="w-5 h-5" />
              Create Class
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map(cls => {
              const studentCount = getStudentsByClass(cls.id).length;
              const isSelected = cls.id === currentClassId;
              return (
                <div
                  key={cls.id}
                  onClick={() => handleSelectClass(cls.id)}
                  className={`card cursor-pointer transition-all hover:shadow-md ${
                    isSelected 
                      ? 'ring-2 ring-[var(--cace-teal)] border-[var(--cace-teal)]' 
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{cls.name}</h3>
                      <p className="text-sm text-gray-500">{cls.period}</p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteClass(cls.id, e)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete class"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                    <UserGroupIcon className="w-4 h-4" />
                    <span>{studentCount} student{studentCount !== 1 ? 's' : ''}</span>
                  </div>
                  {isSelected && (
                    <div className="mt-3 pt-3 border-t">
                      <span className="text-xs font-medium text-[var(--cace-teal)] uppercase tracking-wide">
                        Currently Selected
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Stats for Selected Class */}
      {selectedClass && (
        <div>
          <h2 className="text-xl font-semibold text-[var(--cace-navy)] mb-4">
            {selectedClass.name} Overview
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Students Summary */}
            <div className="card">
              <h3 className="font-medium text-gray-700 mb-3">Students</h3>
              {studentsInClass.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No students yet.{' '}
                  <Link 
                    href={`/classes/${currentClassId}/students`}
                    className="text-[var(--cace-teal)] hover:underline"
                  >
                    Add students →
                  </Link>
                </p>
              ) : (
                <div>
                  <p className="text-3xl font-bold text-[var(--cace-navy)]">
                    {studentsInClass.length}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {studentsInClass.length === 1 ? 'student enrolled' : 'students enrolled'}
                  </p>
                  <Link 
                    href={`/classes/${currentClassId}/students`}
                    className="inline-block mt-3 text-sm text-[var(--cace-teal)] hover:underline"
                  >
                    Manage students →
                  </Link>
                </div>
              )}
            </div>

            {/* Quick Links */}
            <div className="card">
              <h3 className="font-medium text-gray-700 mb-3">Quick Links</h3>
              <div className="space-y-2">
                <Link 
                  href={`/classes/${currentClassId}/casas-reading`}
                  className="block p-2 rounded hover:bg-gray-50 text-sm"
                >
                  📖 CASAS Reading
                </Link>
                <Link 
                  href={`/classes/${currentClassId}/casas-listening`}
                  className="block p-2 rounded hover:bg-gray-50 text-sm"
                >
                  🎧 CASAS Listening
                </Link>
                <Link 
                  href={`/classes/${currentClassId}/attendance`}
                  className="block p-2 rounded hover:bg-gray-50 text-sm"
                >
                  📅 Attendance
                </Link>
                <Link 
                  href={`/classes/${currentClassId}/analysis`}
                  className="block p-2 rounded hover:bg-gray-50 text-sm"
                >
                  📊 Student Analysis
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Class Modal */}
      {showAddClass && (
        <div className="modal-overlay" onClick={() => setShowAddClass(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-4">Add New Class</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Class Name
                </label>
                <input
                  type="text"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="e.g., ESL Level 3"
                  className="input"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period
                </label>
                <select
                  value={newClassPeriod}
                  onChange={(e) => setNewClassPeriod(e.target.value)}
                  className="input"
                >
                  <option value="Morning">Morning</option>
                  <option value="Afternoon">Afternoon</option>
                  <option value="Evening">Evening</option>
                  <option value="Night">Night</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setShowAddClass(false)}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddClass}
                disabled={!newClassName.trim()}
                className="btn btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Class
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
