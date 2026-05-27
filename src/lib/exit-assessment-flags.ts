const STORAGE_KEY = 'gradebook_exit_assessment_chat_flags';

export type ExitAssessmentChatFlags = {
  midtermL4: string[];
  finalL4: string[];
};

const EMPTY: ExitAssessmentChatFlags = { midtermL4: [], finalL4: [] };

export type L4FlagField = keyof ExitAssessmentChatFlags;

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
