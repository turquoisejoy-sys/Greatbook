const TEACHER_NAME_KEY = 'gradebook_teacher_name';
const LEGACY_TEACHER_NAME_KEY = 'exitAssessmentTeacherName';

export const TEACHER_NAME_CHANGED_EVENT = 'gradebook-teacher-name-changed';

export function getTeacherName(): string {
  if (typeof window === 'undefined') return '';
  const current = localStorage.getItem(TEACHER_NAME_KEY);
  if (current !== null && current !== '') return current;
  const legacy = localStorage.getItem(LEGACY_TEACHER_NAME_KEY);
  if (legacy) {
    localStorage.setItem(TEACHER_NAME_KEY, legacy);
    return legacy;
  }
  return '';
}

export function setTeacherName(name: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = name.trim();
  localStorage.setItem(TEACHER_NAME_KEY, trimmed);
  window.dispatchEvent(new CustomEvent(TEACHER_NAME_CHANGED_EVENT));
}
