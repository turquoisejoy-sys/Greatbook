'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import {
  getClasses,
  getStudentsByClass,
  getProductionAssignments,
  getProductionAssignmentsByClass,
  addProductionAssignment,
  updateProductionAssignment,
  deleteProductionAssignment,
  getProductionScoresByAssignment,
  upsertProductionRubricField,
  repairProductionAssignmentsMissingClassIds,
  moveProductionAssignmentToClass,
} from '@/lib/storage';
import {
  speakingMean,
  writingMean,
  columnClassMean,
  parseRubricCell,
} from '@/lib/production-rubric';
import { compareByLastName } from '@/lib/calculations';
import type {
  Class,
  ProductionAssignment,
  ProductionModality,
  ProductionRubricField,
  ProductionRubricScore,
  Student,
} from '@/types';
import {
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import StudentQuickNotes from '@/components/StudentQuickNotes';

const SPEAKING_COLS: { field: ProductionRubricField; label: string }[] = [
  { field: 'speakFluency', label: 'Flu' },
  { field: 'speakAccuracy', label: 'Acc' },
  { field: 'speakPronunciation', label: 'Pron' },
  { field: 'speakCommunication', label: 'Comm' },
];

const WRITING_COLS: { field: ProductionRubricField; label: string }[] = [
  { field: 'writeContent', label: 'Cnt' },
  { field: 'writeOrganization', label: 'Org' },
  { field: 'writeAccuracy', label: 'Gram' },
  { field: 'writeVocabulary', label: 'Voc' },
  { field: 'writeMechanics', label: 'Mech' },
];

function modalityLabel(m: ProductionModality): string {
  if (m === 'speaking') return 'Speaking';
  if (m === 'writing') return 'Writing';
  return 'Speaking + writing';
}

function scoresToMap(scores: ProductionRubricScore[]): Map<string, ProductionRubricScore> {
  return new Map(scores.map(s => [s.studentId, s]));
}

function modalityShows(mod: ProductionModality): { showSpeaking: boolean; showWriting: boolean } {
  return {
    showSpeaking: mod !== 'writing',
    showWriting: mod !== 'speaking',
  };
}

function rubricColumnSpan(mod: ProductionModality): number {
  const { showSpeaking, showWriting } = modalityShows(mod);
  let n = 0;
  if (showSpeaking) n += SPEAKING_COLS.length + 1;
  if (showWriting) n += WRITING_COLS.length + 1;
  return n;
}

function classSpeakingAvgForRows(
  ids: string[],
  map: Map<string, ProductionRubricScore>,
): number | null {
  const vals: number[] = [];
  for (const id of ids) {
    const m = speakingMean(map.get(id));
    if (m !== null) vals.push(m);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function classWritingAvgForRows(
  ids: string[],
  map: Map<string, ProductionRubricScore>,
): number | null {
  const vals: number[] = [];
  for (const id of ids) {
    const m = writingMean(map.get(id));
    if (m !== null) vals.push(m);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export default function ProductionSkillsPage() {
  const params = useParams();
  const { setCurrentClassId, mounted } = useApp();
  const rawClassId = params.classId;
  const classIdRaw =
    typeof rawClassId === 'string'
      ? rawClassId
      : Array.isArray(rawClassId)
        ? String(rawClassId[0] ?? '')
        : '';
  const classId = (() => {
    if (!classIdRaw) return '';
    try {
      return decodeURIComponent(classIdRaw);
    } catch {
      return classIdRaw;
    }
  })();

  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<ProductionAssignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [rowsByAssignment, setRowsByAssignment] = useState<
    Map<string, Map<string, ProductionRubricScore>>
  >(() => new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newModality, setNewModality] = useState<'speaking' | 'writing'>('speaking');
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [metaEditorOpen, setMetaEditorOpen] = useState(false);
  const [storageTick, setStorageTick] = useState(0);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);

  const persistTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const refreshAssignments = useCallback(() => {
    if (!classId) {
      setAssignments([]);
      setStorageTick(t => t + 1);
      return;
    }
    setAssignments(getProductionAssignmentsByClass(classId));
    setStorageTick(t => t + 1);
  }, [classId]);

  useEffect(() => {
    if (!mounted || !classId) return;
    const cls = getClasses().find(c => c.id === classId) || null;
    setCurrentClass(cls);
    if (cls) setCurrentClassId(cls.id);
    const roster = getStudentsByClass(classId).sort((a, b) =>
      compareByLastName(a.name, b.name),
    );
    setStudents(roster);
    setAssignments(getProductionAssignmentsByClass(classId));
  }, [classId, setCurrentClassId, mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (assignments.length === 0) {
      setSelectedAssignmentId('');
      return;
    }
    setSelectedAssignmentId(prev => {
      if (prev && assignments.some(a => a.id === prev)) return prev;
      return assignments[0].id;
    });
  }, [mounted, assignments]);

  useEffect(() => {
    if (!mounted) return;
    Object.values(persistTimers.current).forEach(t => clearTimeout(t));
    persistTimers.current = {};
    if (assignments.length === 0) {
      setRowsByAssignment(new Map());
      return;
    }
    const m = new Map<string, Map<string, ProductionRubricScore>>();
    for (const a of assignments) {
      m.set(a.id, scoresToMap(getProductionScoresByAssignment(a.id)));
    }
    setRowsByAssignment(m);
  }, [mounted, assignments, storageTick]);

  const selectedAssignment = assignments.find(a => a.id === selectedAssignmentId) ?? null;

  const sortedAssignments = useMemo(() => {
    return [...assignments].sort(
      (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
    );
  }, [assignments]);

  const savedProductionAll = useMemo(
    () => {
      if (!mounted || typeof window === 'undefined') return [];
      return getProductionAssignments();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storageTick bumps after localStorage writes
    [mounted, storageTick],
  );

  const notLinkedToThisClass = useMemo(() => {
    if (!classId) return [];
    const want = classId.trim();
    return savedProductionAll.filter(a => String(a.classId ?? '').trim() !== want);
  }, [classId, savedProductionAll]);

  useEffect(() => {
    if (assignments.length === 0) setMetaEditorOpen(false);
  }, [assignments.length]);

  useEffect(() => {
    if (searchQuery && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchQuery]);

  const schedulePersist = useCallback(
    (assignmentId: string, studentId: string, field: ProductionRubricField, value: number | null) => {
      const key = `${assignmentId}:${studentId}:${field}`;
      const prev = persistTimers.current[key];
      if (prev) clearTimeout(prev);
      persistTimers.current[key] = setTimeout(() => {
        upsertProductionRubricField(assignmentId, studentId, field, value);
        delete persistTimers.current[key];
      }, 320);
    },
    [],
  );

  const flushPersist = useCallback(
    (assignmentId: string, studentId: string, field: ProductionRubricField, value: number | null) => {
      const key = `${assignmentId}:${studentId}:${field}`;
      const prev = persistTimers.current[key];
      if (prev) clearTimeout(prev);
      delete persistTimers.current[key];
      upsertProductionRubricField(assignmentId, studentId, field, value);
    },
    [],
  );

  const handleCellChange = useCallback(
    (assignmentId: string, studentId: string, field: ProductionRubricField, raw: string) => {
      const parsed = parseRubricCell(raw);
      setRowsByAssignment(prev => {
        const next = new Map(prev);
        const inner = new Map(next.get(assignmentId) ?? []);
        const cur = inner.get(studentId);
        const base: ProductionRubricScore =
          cur ??
          ({
            id: '',
            assignmentId,
            studentId,
            speakFluency: null,
            speakAccuracy: null,
            speakPronunciation: null,
            speakCommunication: null,
            writeContent: null,
            writeOrganization: null,
            writeAccuracy: null,
            writeVocabulary: null,
            writeMechanics: null,
            createdAt: '',
            updatedAt: '',
          } as ProductionRubricScore);
        inner.set(studentId, { ...base, [field]: parsed });
        next.set(assignmentId, inner);
        return next;
      });
      schedulePersist(assignmentId, studentId, field, parsed);
    },
    [schedulePersist],
  );

  const handleCellBlur = useCallback(
    (assignmentId: string, studentId: string, field: ProductionRubricField, raw: string) => {
      const parsed = parseRubricCell(raw);
      flushPersist(assignmentId, studentId, field, parsed);
    },
    [flushPersist],
  );

  const studentIds = useMemo(() => students.map(s => s.id), [students]);

  const handleCreateAssignment = () => {
    if (!newTitle.trim() || !classId) return;
    const a = addProductionAssignment(classId, newTitle.trim(), newDate, newModality);
    refreshAssignments();
    setSelectedAssignmentId(a.id);
    setShowNewForm(false);
    setNewTitle('');
    setNewDate(new Date().toISOString().split('T')[0]);
  };

  const handleRepairOrphanProduction = () => {
    if (!classId) return;
    const n = repairProductionAssignmentsMissingClassIds(classId);
    if (n > 0) refreshAssignments();
  };

  const handleMoveProductionHere = (assignmentId: string) => {
    if (!classId) return;
    moveProductionAssignmentToClass(assignmentId, classId);
    refreshAssignments();
  };

  const handleOpenMetaEditor = () => {
    if (!selectedAssignment) return;
    setEditTitle(selectedAssignment.title);
    setEditDate(selectedAssignment.date);
    setMetaEditorOpen(true);
  };

  const handleCancelMetaEditor = () => {
    if (selectedAssignment) {
      setEditTitle(selectedAssignment.title);
      setEditDate(selectedAssignment.date);
    }
    setMetaEditorOpen(false);
  };

  const handleSaveMeta = () => {
    if (!selectedAssignmentId) return;
    updateProductionAssignment(selectedAssignmentId, {
      title: editTitle.trim() || 'Untitled',
      date: editDate,
    });
    refreshAssignments();
    setMetaEditorOpen(false);
  };

  const handleDeleteAssignment = () => {
    if (!selectedAssignmentId) return;
    if (!confirm('Delete this assignment and all entered rubric scores for it?')) return;
    deleteProductionAssignment(selectedAssignmentId);
    refreshAssignments();
    setMetaEditorOpen(false);
    setSelectedAssignmentId('');
  };

  if (!mounted) {
    return <div className="animate-pulse"><div className="h-8 bg-gray-200 rounded w-48" /></div>;
  }

  if (!classId) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card text-center py-12">
          <p className="text-gray-500">Missing class in URL.</p>
          <Link href="/" className="btn btn-primary mt-4">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  if (!currentClass) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card text-center py-12">
          <p className="text-gray-500">Class not found</p>
          <Link href="/" className="btn btn-primary mt-4">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-full space-y-6 px-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Speaking & writing</h1>
          <p className="text-gray-600">{currentClass.name}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewForm(s => !s)}
          className="btn btn-secondary inline-flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          New assignment
        </button>
      </div>

      {showNewForm && (
        <div className="card p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="input w-full"
                placeholder="e.g. Week 3 oral interview"
              />
            </div>
            <div className="w-44">
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="input w-full"
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!newTitle.trim()}
              onClick={handleCreateAssignment}
            >
              Create
            </button>
          <button
            type="button"
            className="text-gray-500 hover:text-gray-700 p-2"
            onClick={() => {
              setShowNewForm(false);
              setNewTitle('');
              setNewModality('speaking');
            }}
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
          </div>
          <fieldset className="border-0 p-0 m-0">
            <legend className="text-xs font-medium text-gray-600 mb-2">Assignment type</legend>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="newProdModality"
                  checked={newModality === 'speaking'}
                  onChange={() => setNewModality('speaking')}
                  className="rounded-full border-gray-300"
                />
                Speaking only (4 rubric cells)
              </label>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="newProdModality"
                  checked={newModality === 'writing'}
                  onChange={() => setNewModality('writing')}
                  className="rounded-full border-gray-300"
                />
                Writing only (5 rubric cells)
              </label>
            </div>
          </fieldset>
        </div>
      )}

      {assignments.length === 0 && savedProductionAll.length > 0 ? (
        <div className="card p-4 space-y-4 border-amber-200 bg-amber-50/80">
          <p className="text-sm font-medium text-amber-950">
            {notLinkedToThisClass.length > 0
              ? `You have ${savedProductionAll.length} saved production assignment(s), but ${notLinkedToThisClass.length} are not tied to this class (URL id below). Attach them or open the class they belong to.`
              : `Found ${savedProductionAll.length} assignment(s) in storage that already match this class id, but the list didn’t show them — try reload.`}
          </p>
          <p className="text-xs font-mono text-gray-700 break-all">This page: {classId}</p>
          {notLinkedToThisClass.some(a => !String(a.classId ?? '').trim()) && (
            <button type="button" className="btn btn-primary text-sm" onClick={handleRepairOrphanProduction}>
              Link all assignments missing a class id to this class
            </button>
          )}
          {notLinkedToThisClass.length > 0 && (
            <ul className="text-sm text-amber-950 space-y-2">
              {notLinkedToThisClass.map(a => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 border border-amber-200/80 rounded-md px-3 py-2 bg-white/60"
                >
                  <span>
                    <span className="font-medium">{a.title}</span>
                    <span className="text-gray-600"> · stored class: </span>
                    <span className="font-mono text-xs">{String(a.classId ?? '(empty)')}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary text-xs shrink-0"
                    onClick={() => handleMoveProductionHere(a.id)}
                  >
                    Use this class
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-secondary text-sm" onClick={() => refreshAssignments()}>
            Reload assignment list
          </button>
        </div>
      ) : assignments.length === 0 ? (
        <div className="card text-center py-10 text-gray-600">
          <p>No assignments yet. Create one to enter 1–4 rubric scores per student.</p>
        </div>
      ) : (
        <>
          <div className="card p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-[200px] flex-1 max-w-md">
                <label className="block text-xs font-medium text-gray-600 mb-1">Assignment</label>
                <select
                  className="input w-full"
                  value={selectedAssignmentId}
                  onChange={e => {
                    setMetaEditorOpen(false);
                    setSelectedAssignmentId(e.target.value);
                  }}
                >
                  {assignments.map(a => (
                    <option key={a.id} value={a.id}>
                      [{modalityLabel(a.modality)}] {a.title} · {a.date}
                    </option>
                  ))}
                </select>
              </div>
              {selectedAssignment && !metaEditorOpen && (
                <div className="flex flex-1 flex-wrap items-end justify-between gap-4 min-w-0">
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <div>
                      <span className="text-xs font-medium text-gray-500 block mb-0.5">Title</span>
                      <span className="font-semibold text-[var(--cace-navy)]">{selectedAssignment.title}</span>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 block mb-0.5">Date</span>
                      <span className="font-medium text-gray-800 tabular-nums">{selectedAssignment.date}</span>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 block mb-0.5">Type</span>
                      <span className="font-medium text-gray-800">{modalityLabel(selectedAssignment.modality)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm shrink-0 inline-flex items-center gap-2"
                    onClick={handleOpenMetaEditor}
                  >
                    <PencilSquareIcon className="w-4 h-4" />
                    Edit assignment
                  </button>
                </div>
              )}
            </div>
            {selectedAssignment && metaEditorOpen && (
              <div className="border-t border-gray-200 pt-4 space-y-4">
                <p className="text-sm font-medium text-gray-800">Edit assignment</p>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                    <input
                      type="text"
                      className="input w-full"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                    />
                  </div>
                  <div className="w-44">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                    <input
                      type="date"
                      className="input w-full"
                      value={editDate}
                      onChange={e => setEditDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary text-sm" onClick={handleSaveMeta}>
                      Save
                    </button>
                    <button type="button" className="btn btn-secondary text-sm" onClick={handleCancelMetaEditor}>
                      Cancel
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm text-red-700 border-red-200 hover:bg-red-50 inline-flex items-center gap-1.5"
                    onClick={handleDeleteAssignment}
                  >
                    <TrashIcon className="w-4 h-4" />
                    Delete assignment
                  </button>
                </div>
              </div>
            )}
          </div>

          {students.length > 0 && (
            <div className="relative max-w-sm">
              <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Find student…"
                className="input w-full"
                style={{ paddingLeft: '2.5rem' }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {students.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500 mb-4">No students in this class yet</p>
              <Link href={`/classes/${classId}/students`} className="btn btn-accent">
                Add students
              </Link>
            </div>
          ) : (
            <div className="min-w-0 w-full max-w-full">
              <div className="card p-0 min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
                <div className="w-max min-w-full">
                  <table className="text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th
                          rowSpan={2}
                          className="text-left p-2 sticky left-0 z-20 min-w-[11rem] bg-gray-50 font-semibold text-[var(--cace-navy)] border-r border-gray-200 whitespace-nowrap shadow-[4px_0_8px_-4px_rgba(0,0,0,0.12)]"
                        >
                          Student
                        </th>
                        {sortedAssignments.map((a, ai) => (
                          <th
                            key={a.id}
                            colSpan={rubricColumnSpan(a.modality)}
                            scope="colgroup"
                            className={`p-2 text-center align-bottom cursor-pointer select-none transition-colors hover:bg-gray-100/90 ${
                              ai > 0 ? 'border-l-2 border-gray-300' : ''
                            } ${
                              a.id === selectedAssignmentId
                                ? 'bg-teal-50/90 ring-1 ring-inset ring-[var(--cace-teal)]'
                                : ''
                            }`}
                            onClick={() => {
                              setSelectedAssignmentId(a.id);
                              setMetaEditorOpen(false);
                            }}
                            title="Select for Edit assignment below"
                          >
                            <div className="text-xs font-semibold text-[var(--cace-navy)] truncate max-w-[12rem] mx-auto">
                              {a.title}
                            </div>
                            <div className="text-[10px] font-medium text-gray-500 tabular-nums mt-0.5">
                              {modalityLabel(a.modality)} · {a.date}
                            </div>
                          </th>
                        ))}
                      </tr>
                      <tr className="border-b border-gray-200 bg-gray-50/80">
                        {sortedAssignments.map((a, ai) => {
                          const { showSpeaking, showWriting } = modalityShows(a.modality);
                          const blockLead = ai > 0;
                          return (
                            <React.Fragment key={`sub-${a.id}`}>
                              {showSpeaking &&
                                SPEAKING_COLS.map(({ field, label }, i) => (
                                  <th
                                    key={`${a.id}-s-${field}`}
                                    className={`p-1.5 text-center text-xs font-medium text-gray-700 min-w-[3rem] ${
                                      blockLead && i === 0
                                        ? 'border-l-2 border-gray-300'
                                        : 'border-l border-gray-200'
                                    }`}
                                    title={field}
                                  >
                                    {label}
                                  </th>
                                ))}
                              {showWriting &&
                                WRITING_COLS.map(({ field, label }, i) => (
                                  <th
                                    key={`${a.id}-w-${field}`}
                                    className={`p-1.5 text-center text-xs font-medium text-gray-700 min-w-[3rem] ${
                                      blockLead && !showSpeaking && i === 0
                                        ? 'border-l-2 border-gray-300'
                                        : 'border-l border-gray-200'
                                    }`}
                                    title={field}
                                  >
                                    {label}
                                  </th>
                                ))}
                              {showSpeaking && (
                                <th
                                  className={`p-1.5 text-center text-xs font-medium text-gray-700 min-w-[3.5rem] border-l border-gray-200`}
                                >
                                  Spk
                                </th>
                              )}
                              {showWriting && (
                                <th
                                  className={`p-1.5 text-center text-xs font-medium text-gray-700 min-w-[3.5rem] border-l border-gray-200`}
                                >
                                  Wri
                                </th>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student, rowIndex) => {
                        const isMatch =
                          searchQuery &&
                          student.name.toLowerCase().includes(searchQuery.toLowerCase());
                        const isFirstMatch =
                          isMatch &&
                          students.findIndex(s =>
                            s.name.toLowerCase().includes(searchQuery.toLowerCase()),
                          ) === rowIndex;
                        return (
                          <tr
                            key={student.id}
                            ref={isFirstMatch ? highlightedRowRef : undefined}
                            className={isMatch ? 'bg-yellow-50' : 'border-b border-gray-100'}
                          >
                            <td
                              className={`p-1 sticky left-0 z-10 min-w-[11rem] whitespace-nowrap border-r border-gray-200 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.12)] ${
                                isMatch ? 'bg-yellow-50' : 'bg-white'
                              }`}
                            >
                              <StudentQuickNotes
                                classId={classId}
                                studentId={student.id}
                                studentName={student.name}
                              />
                            </td>
                            {sortedAssignments.map((a, ai) => {
                              const { showSpeaking, showWriting } = modalityShows(a.modality);
                              const blockLead = ai > 0;
                              const map = rowsByAssignment.get(a.id) ?? new Map<string, ProductionRubricScore>();
                              const row = map.get(student.id);
                              const spk = speakingMean(row);
                              const wri = writingMean(row);
                              return (
                                <React.Fragment key={`${student.id}-${a.id}`}>
                                  {showSpeaking &&
                                    SPEAKING_COLS.map(({ field }, i) => {
                                      const v = row?.[field];
                                      const display = v === null || v === undefined ? '' : String(v);
                                      return (
                                        <td
                                          key={`${a.id}-s-${field}`}
                                          className={`p-0.5 text-center min-w-[3rem] ${
                                            blockLead && i === 0
                                              ? 'border-l-2 border-gray-200'
                                              : 'border-l border-gray-100'
                                          }`}
                                        >
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            autoComplete="off"
                                            value={display}
                                            onChange={e =>
                                              handleCellChange(a.id, student.id, field, e.target.value)
                                            }
                                            onBlur={e =>
                                              handleCellBlur(a.id, student.id, field, e.target.value)
                                            }
                                            className="w-11 min-w-[2.75rem] px-0 py-1 text-center text-sm border border-gray-200 rounded tabular-nums focus:border-[var(--cace-teal)] focus:ring-1 focus:ring-[var(--cace-teal)] outline-none"
                                            aria-label={`${student.name} ${a.title} ${field}`}
                                          />
                                        </td>
                                      );
                                    })}
                                  {showWriting &&
                                    WRITING_COLS.map(({ field }, i) => {
                                      const v = row?.[field];
                                      const display = v === null || v === undefined ? '' : String(v);
                                      return (
                                        <td
                                          key={`${a.id}-w-${field}`}
                                          className={`p-0.5 text-center min-w-[3rem] ${
                                            blockLead && !showSpeaking && i === 0
                                              ? 'border-l-2 border-gray-200'
                                              : 'border-l border-gray-100'
                                          }`}
                                        >
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            autoComplete="off"
                                            value={display}
                                            onChange={e =>
                                              handleCellChange(a.id, student.id, field, e.target.value)
                                            }
                                            onBlur={e =>
                                              handleCellBlur(a.id, student.id, field, e.target.value)
                                            }
                                            className="w-11 min-w-[2.75rem] px-0 py-1 text-center text-sm border border-gray-200 rounded tabular-nums focus:border-[var(--cace-teal)] focus:ring-1 focus:ring-[var(--cace-teal)] outline-none"
                                            aria-label={`${student.name} ${a.title} ${field}`}
                                          />
                                        </td>
                                      );
                                    })}
                                  {showSpeaking && (
                                    <td className="p-1 text-center border-l border-gray-200 tabular-nums font-medium text-gray-800 min-w-[3.5rem]">
                                      {spk !== null ? spk.toFixed(2) : '—'}
                                    </td>
                                  )}
                                  {showWriting && (
                                    <td className="p-1 text-center border-l border-gray-200 tabular-nums font-medium text-gray-800 min-w-[3.5rem]">
                                      {wri !== null ? wri.toFixed(2) : '—'}
                                    </td>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        );
                      })}
                      <tr className="bg-gray-100 font-medium border-t-2 border-gray-300">
                        <td className="p-2 sticky left-0 z-10 min-w-[11rem] border-r border-gray-200 bg-gray-100 text-gray-800 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.12)]">
                          Class avg
                        </td>
                        {sortedAssignments.map((a, ai) => {
                          const { showSpeaking, showWriting } = modalityShows(a.modality);
                          const blockLead = ai > 0;
                          const map = rowsByAssignment.get(a.id) ?? new Map<string, ProductionRubricScore>();
                          const classSpk = classSpeakingAvgForRows(studentIds, map);
                          const classWri = classWritingAvgForRows(studentIds, map);
                          return (
                            <React.Fragment key={`avg-${a.id}`}>
                              {showSpeaking &&
                                SPEAKING_COLS.map(({ field }, i) => {
                                  const m = columnClassMean(studentIds, map, field);
                                  return (
                                    <td
                                      key={`${a.id}-s-${field}`}
                                      className={`p-1 text-center tabular-nums text-gray-800 ${
                                        blockLead && i === 0
                                          ? 'border-l-2 border-gray-200'
                                          : 'border-l border-gray-200'
                                      }`}
                                    >
                                      {m !== null ? m.toFixed(2) : '—'}
                                    </td>
                                  );
                                })}
                              {showWriting &&
                                WRITING_COLS.map(({ field }, i) => {
                                  const m = columnClassMean(studentIds, map, field);
                                  return (
                                    <td
                                      key={`${a.id}-w-${field}`}
                                      className={`p-1 text-center tabular-nums text-gray-800 ${
                                        blockLead && !showSpeaking && i === 0
                                          ? 'border-l-2 border-gray-200'
                                          : 'border-l border-gray-200'
                                      }`}
                                    >
                                      {m !== null ? m.toFixed(2) : '—'}
                                    </td>
                                  );
                                })}
                              {showSpeaking && (
                                <td className="p-1 text-center border-l border-gray-200 tabular-nums text-[var(--cace-navy)] min-w-[3.5rem]">
                                  {classSpk !== null ? classSpk.toFixed(2) : '—'}
                                </td>
                              )}
                              {showWriting && (
                                <td className="p-1 text-center border-l border-gray-200 tabular-nums text-[var(--cace-navy)] min-w-[3.5rem]">
                                  {classWri !== null ? classWri.toFixed(2) : '—'}
                                </td>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
