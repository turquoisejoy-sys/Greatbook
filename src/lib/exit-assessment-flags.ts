const STORAGE_KEY = 'gradebook_exit_assessment_chat_flags';

export type ExitAssessmentChatFlags = {
  midtermL4: string[];
  finalL4: string[];
  /** User cleared an auto-suggested Final L4 flag (still overridable manually). */
  dismissedFinalL4Auto?: string[];
};

const EMPTY: ExitAssessmentChatFlags = { midtermL4: [], finalL4: [] };

export type L4FlagField = keyof Pick<ExitAssessmentChatFlags, 'midtermL4' | 'finalL4'>;

export function loadExitAssessmentChatFlags(classId: string): ExitAssessmentChatFlags {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const all = JSON.parse(raw) as Record<string, ExitAssessmentChatFlags>;
    const saved = all[classId];
    if (!saved) return { ...EMPTY };
    return {
      midtermL4: Array.isArray(saved.midtermL4) ? [...saved.midtermL4] : [],
      finalL4: Array.isArray(saved.finalL4) ? [...saved.finalL4] : [],
      dismissedFinalL4Auto: Array.isArray(saved.dismissedFinalL4Auto)
        ? [...saved.dismissedFinalL4Auto]
        : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveExitAssessmentChatFlags(classId: string, flags: ExitAssessmentChatFlags): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, ExitAssessmentChatFlags>) : {};
    all[classId] = {
      midtermL4: [...flags.midtermL4],
      finalL4: [...flags.finalL4],
      dismissedFinalL4Auto: flags.dismissedFinalL4Auto?.length
        ? [...flags.dismissedFinalL4Auto]
        : undefined,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore quota / private mode
  }
}

export function isStudentL4Flagged(
  flags: ExitAssessmentChatFlags,
  studentId: string,
  field: L4FlagField,
): boolean {
  return flags[field].includes(studentId);
}

/** Final L4: manual flag, or auto-suggested unless dismissed. */
export function isStudentFinalL4Flagged(
  flags: ExitAssessmentChatFlags,
  studentId: string,
  autoFlagStudentIds: string[],
): boolean {
  if (flags.finalL4.includes(studentId)) return true;
  if (flags.dismissedFinalL4Auto?.includes(studentId)) return false;
  return autoFlagStudentIds.includes(studentId);
}

export function isStudentFinalL4AutoFlagged(
  flags: ExitAssessmentChatFlags,
  studentId: string,
  autoFlagStudentIds: string[],
): boolean {
  return (
    autoFlagStudentIds.includes(studentId) &&
    !flags.finalL4.includes(studentId) &&
    !flags.dismissedFinalL4Auto?.includes(studentId)
  );
}

export function toggleStudentL4Flag(
  flags: ExitAssessmentChatFlags,
  studentId: string,
  field: L4FlagField,
): ExitAssessmentChatFlags {
  const list = flags[field];
  const next = list.includes(studentId)
    ? list.filter(id => id !== studentId)
    : [...list, studentId];
  return { ...flags, [field]: next };
}

export function toggleStudentFinalL4Flag(
  flags: ExitAssessmentChatFlags,
  studentId: string,
  autoFlagStudentIds: string[],
): ExitAssessmentChatFlags {
  const currently = isStudentFinalL4Flagged(flags, studentId, autoFlagStudentIds);

  if (currently) {
    const finalL4 = flags.finalL4.filter(id => id !== studentId);
    const dismissed = new Set(flags.dismissedFinalL4Auto ?? []);
    if (autoFlagStudentIds.includes(studentId)) {
      dismissed.add(studentId);
    }
    return {
      ...flags,
      finalL4,
      dismissedFinalL4Auto: [...dismissed],
    };
  }

  const finalL4 = flags.finalL4.includes(studentId)
    ? flags.finalL4
    : [...flags.finalL4, studentId];
  const dismissed = (flags.dismissedFinalL4Auto ?? []).filter(id => id !== studentId);
  return {
    ...flags,
    finalL4,
    dismissedFinalL4Auto: dismissed,
  };
}

/** Drop dismissals for students who no longer match auto rules. */
export function pruneDismissedFinalL4Auto(
  flags: ExitAssessmentChatFlags,
  autoFlagStudentIds: string[],
): ExitAssessmentChatFlags {
  const autoSet = new Set(autoFlagStudentIds);
  const dismissed = (flags.dismissedFinalL4Auto ?? []).filter(id => autoSet.has(id));
  if (dismissed.length === (flags.dismissedFinalL4Auto ?? []).length) return flags;
  return {
    ...flags,
    dismissedFinalL4Auto: dismissed,
  };
}
