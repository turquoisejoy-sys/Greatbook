import {
  SpeakingTest,
  SpeakingTestResult,
  Student,
  StudentNote,
  WritingTest,
  WritingTestResult,
} from '@/types';

/** Hidden student_notes payload when speaking/writing tables are not in Supabase yet. */
export const SPEAKING_WRITING_SYNC_PREFIX = '__GRADEBOOK_SW_SYNC_V1__:';
export const SPEAKING_WRITING_SYNC_NOTE_ID_PREFIX = 'gradebook-sw-sync-';

interface ClassSpeakingWritingBundle {
  speakingTests: SpeakingTest[];
  speakingTestResults: SpeakingTestResult[];
  writingTests: WritingTest[];
  writingTestResults: WritingTestResult[];
}

export function isSpeakingWritingSyncNote(note: Pick<StudentNote, 'id' | 'content'>): boolean {
  return (
    note.id.startsWith(SPEAKING_WRITING_SYNC_NOTE_ID_PREFIX) ||
    note.content.startsWith(SPEAKING_WRITING_SYNC_PREFIX)
  );
}

export function buildSpeakingWritingSyncNotesForUpload(
  students: Student[],
  speakingTests: SpeakingTest[],
  speakingTestResults: SpeakingTestResult[],
  writingTests: WritingTest[],
  writingTestResults: WritingTestResult[],
): StudentNote[] {
  const classIds = new Set([
    ...speakingTests.map(t => t.classId),
    ...writingTests.map(t => t.classId),
  ]);

  const notes: StudentNote[] = [];
  const now = new Date().toISOString();

  for (const classId of classIds) {
    const classSpeakingTests = speakingTests.filter(t => t.classId === classId);
    const classSpeakingTestIds = new Set(classSpeakingTests.map(t => t.id));
    const classWritingTests = writingTests.filter(t => t.classId === classId);
    const classWritingTestIds = new Set(classWritingTests.map(t => t.id));

    const bundle: ClassSpeakingWritingBundle = {
      speakingTests: classSpeakingTests,
      speakingTestResults: speakingTestResults.filter(r => classSpeakingTestIds.has(r.testId)),
      writingTests: classWritingTests,
      writingTestResults: writingTestResults.filter(r => classWritingTestIds.has(r.testId)),
    };

    const hasData =
      bundle.speakingTests.length > 0 ||
      bundle.speakingTestResults.length > 0 ||
      bundle.writingTests.length > 0 ||
      bundle.writingTestResults.length > 0;
    if (!hasData) continue;

    const anchor = students.find(s => s.classId === classId);
    if (!anchor) continue;

    notes.push({
      id: `${SPEAKING_WRITING_SYNC_NOTE_ID_PREFIX}${classId}`,
      studentId: anchor.id,
      content: SPEAKING_WRITING_SYNC_PREFIX + JSON.stringify(bundle),
      date: '1970-01-01',
      createdAt: now,
    });
  }

  return notes;
}

export function parseSpeakingWritingFromSyncNotes(notes: StudentNote[]): {
  speakingTests: SpeakingTest[];
  speakingTestResults: SpeakingTestResult[];
  writingTests: WritingTest[];
  writingTestResults: WritingTestResult[];
} {
  const speakingTests: SpeakingTest[] = [];
  const speakingTestResults: SpeakingTestResult[] = [];
  const writingTests: WritingTest[] = [];
  const writingTestResults: WritingTestResult[] = [];
  const seenSpeakingTestIds = new Set<string>();
  const seenSpeakingResultIds = new Set<string>();
  const seenWritingTestIds = new Set<string>();
  const seenWritingResultIds = new Set<string>();

  for (const note of notes) {
    if (!note.content.startsWith(SPEAKING_WRITING_SYNC_PREFIX)) continue;
    try {
      const raw = note.content.slice(SPEAKING_WRITING_SYNC_PREFIX.length);
      const bundle = JSON.parse(raw) as ClassSpeakingWritingBundle;
      for (const t of bundle.speakingTests || []) {
        if (!seenSpeakingTestIds.has(t.id)) {
          seenSpeakingTestIds.add(t.id);
          speakingTests.push(t);
        }
      }
      for (const r of bundle.speakingTestResults || []) {
        if (!seenSpeakingResultIds.has(r.id)) {
          seenSpeakingResultIds.add(r.id);
          speakingTestResults.push(r);
        }
      }
      for (const t of bundle.writingTests || []) {
        if (!seenWritingTestIds.has(t.id)) {
          seenWritingTestIds.add(t.id);
          writingTests.push(t);
        }
      }
      for (const r of bundle.writingTestResults || []) {
        if (!seenWritingResultIds.has(r.id)) {
          seenWritingResultIds.add(r.id);
          writingTestResults.push(r);
        }
      }
    } catch {
      // Ignore corrupt sync payloads
    }
  }

  return { speakingTests, speakingTestResults, writingTests, writingTestResults };
}

export function countSpeakingWritingInSyncNotes(notes: StudentNote[]): {
  speakingTests: number;
  speakingTestResults: number;
  writingTests: number;
  writingTestResults: number;
} {
  const parsed = parseSpeakingWritingFromSyncNotes(notes);
  return {
    speakingTests: parsed.speakingTests.length,
    speakingTestResults: parsed.speakingTestResults.length,
    writingTests: parsed.writingTests.length,
    writingTestResults: parsed.writingTestResults.length,
  };
}

export function stripSpeakingWritingSyncNotes(notes: StudentNote[]): StudentNote[] {
  return notes.filter(n => !isSpeakingWritingSyncNote(n));
}
