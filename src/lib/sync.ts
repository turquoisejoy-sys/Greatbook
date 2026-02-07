/**
 * Supabase Sync Layer
 * 
 * Handles automatic synchronization between local storage and Supabase.
 * Local storage is the primary store (fast, works offline).
 * Supabase is the cloud backup (accessible from any device).
 */

import { supabase } from './supabase';
import {
  Class,
  Student,
  CASASTest,
  UnitTest,
  Attendance,
  ReportCard,
} from '@/types';

// ============================================
// Sync Status
// ============================================

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

let currentSyncStatus: SyncStatus = 'idle';
let lastSyncError: string | null = null;
let syncListeners: ((status: SyncStatus, error?: string | null) => void)[] = [];

export function getSyncStatus(): SyncStatus {
  return currentSyncStatus;
}

export function getLastSyncError(): string | null {
  return lastSyncError;
}

export function subscribeSyncStatus(listener: (status: SyncStatus, error?: string | null) => void): () => void {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter(l => l !== listener);
  };
}

function setSyncStatus(status: SyncStatus, error?: string | null) {
  currentSyncStatus = status;
  lastSyncError = error || null;
  syncListeners.forEach(l => l(status, error));
}

// ============================================
// Conversion Helpers (camelCase <-> snake_case)
// ============================================

function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = obj[key];
  }
  return result;
}

function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

// ============================================
// Check if Supabase is configured
// ============================================

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(
    url && 
    key && 
    !url.includes('your-project') && 
    !url.includes('placeholder') &&
    !key.includes('your-anon-key') &&
    !key.includes('placeholder')
  );
}

// ============================================
// Upload Functions (Local -> Supabase)
// ============================================

export async function uploadClasses(classes: Class[]): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (classes.length === 0) return;
  
  const data = classes.map(c => toSnakeCase(c as unknown as Record<string, unknown>));
  
  const { error } = await supabase
    .from('classes')
    .upsert(data, { onConflict: 'id' });
  
  if (error) {
    console.error('Classes upload error:', error);
    throw error;
  }
}

export async function uploadStudents(students: Student[]): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (students.length === 0) return;
  
  const data = students.map(s => toSnakeCase(s as unknown as Record<string, unknown>));
  
  const { error } = await supabase
    .from('students')
    .upsert(data, { onConflict: 'id' });
  
  if (error) {
    console.error('Students upload error:', error);
    throw error;
  }
}

export async function uploadCASASTests(tests: CASASTest[]): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (tests.length === 0) return;
  
  const data = tests.map(t => toSnakeCase(t as unknown as Record<string, unknown>));
  
  const { error } = await supabase
    .from('casas_tests')
    .upsert(data, { onConflict: 'id' });
  
  if (error) {
    console.error('CASAS tests upload error:', error);
    throw error;
  }
}

export async function uploadUnitTests(tests: UnitTest[]): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (tests.length === 0) return;
  
  const data = tests.map(t => toSnakeCase(t as unknown as Record<string, unknown>));
  
  const { error } = await supabase
    .from('unit_tests')
    .upsert(data, { onConflict: 'id' });
  
  if (error) {
    console.error('Unit tests upload error:', error);
    throw error;
  }
}

export async function uploadAttendance(attendance: Attendance[]): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (attendance.length === 0) return;
  
  const data = attendance.map(a => toSnakeCase(a as unknown as Record<string, unknown>));
  
  const { error } = await supabase
    .from('attendance')
    .upsert(data, { onConflict: 'id' });
  
  if (error) {
    console.error('Attendance upload error:', error);
    throw error;
  }
}

export async function uploadReportCards(reportCards: ReportCard[]): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (reportCards.length === 0) return;
  
  // Ensure backward compatibility with database schema
  // Don't send teacherComments as the DB column may not exist yet
  const normalizedCards = reportCards.map(r => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { teacherComments, ...rest } = r;
    return {
      ...rest,
      // Ensure legacy fields have values for database compatibility
      speakingSkills: r.speakingSkills ?? r.teacherComments ?? '',
      writingSkills: r.writingSkills ?? '',
      suggestionsForImprovement: r.suggestionsForImprovement ?? '',
    };
  });
  
  const data = normalizedCards.map(r => toSnakeCase(r as unknown as Record<string, unknown>));
  
  const { error } = await supabase
    .from('report_cards')
    .upsert(data, { onConflict: 'id' });
  
  if (error) {
    console.error('Report cards upload error:', error);
    throw error;
  }
}

// ============================================
// Download Functions (Supabase -> Local)
// ============================================

export async function downloadClasses(): Promise<Class[]> {
  if (!isSupabaseConfigured()) return [];
  
  const { data, error } = await supabase
    .from('classes')
    .select('*');
  
  if (error) throw error;
  
  return (data || []).map(row => toCamelCase(row) as unknown as Class);
}

export async function downloadStudents(): Promise<Student[]> {
  if (!isSupabaseConfigured()) return [];
  
  const { data, error } = await supabase
    .from('students')
    .select('*');
  
  if (error) throw error;
  
  return (data || []).map(row => toCamelCase(row) as unknown as Student);
}

export async function downloadCASASTests(): Promise<CASASTest[]> {
  if (!isSupabaseConfigured()) return [];
  
  const { data, error } = await supabase
    .from('casas_tests')
    .select('*');
  
  if (error) throw error;
  
  return (data || []).map(row => toCamelCase(row) as unknown as CASASTest);
}

export async function downloadUnitTests(): Promise<UnitTest[]> {
  if (!isSupabaseConfigured()) return [];
  
  const { data, error } = await supabase
    .from('unit_tests')
    .select('*');
  
  if (error) throw error;
  
  return (data || []).map(row => toCamelCase(row) as unknown as UnitTest);
}

export async function downloadAttendance(): Promise<Attendance[]> {
  if (!isSupabaseConfigured()) return [];
  
  const { data, error } = await supabase
    .from('attendance')
    .select('*');
  
  if (error) throw error;
  
  return (data || []).map(row => toCamelCase(row) as unknown as Attendance);
}

export async function downloadReportCards(): Promise<ReportCard[]> {
  if (!isSupabaseConfigured()) return [];
  
  const { data, error } = await supabase
    .from('report_cards')
    .select('*');
  
  if (error) throw error;
  
  return (data || []).map(row => toCamelCase(row) as unknown as ReportCard);
}

// ============================================
// Delete Functions (sync deletions)
// ============================================

export async function deleteFromCloud(table: string, id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

// ============================================
// Full Sync Functions
// ============================================

/**
 * Upload all local data to Supabase
 */
export async function uploadAllToCloud(data: {
  classes: Class[];
  students: Student[];
  casasTests: CASASTest[];
  unitTests: UnitTest[];
  attendance: Attendance[];
  reportCards: ReportCard[];
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.log('Supabase not configured, skipping sync');
    return;
  }
  
  setSyncStatus('syncing');
  
  try {
    // Get valid IDs for filtering orphaned records
    const validClassIds = new Set(data.classes.map(c => c.id));
    const validStudentIds = new Set(data.students.map(s => s.id));
    
    // Filter students to only those with valid class references
    const validStudents = data.students.filter(s => validClassIds.has(s.classId));
    const finalStudentIds = new Set(validStudents.map(s => s.id));
    
    // Filter child records to only those with valid student references
    const validCasasTests = data.casasTests.filter(t => finalStudentIds.has(t.studentId));
    const validUnitTests = data.unitTests.filter(t => finalStudentIds.has(t.studentId));
    const validAttendance = data.attendance.filter(a => finalStudentIds.has(a.studentId));
    const validReportCards = data.reportCards.filter(r => finalStudentIds.has(r.studentId));
    
    // Upload in order (classes first due to foreign keys)
    await uploadClasses(data.classes);
    await uploadStudents(validStudents);
    await uploadCASASTests(validCasasTests);
    await uploadUnitTests(validUnitTests);
    await uploadAttendance(validAttendance);
    await uploadReportCards(validReportCards);
    
    setSyncStatus('synced');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Sync error:', message);
    setSyncStatus('error', message);
    throw error;
  }
}

/**
 * Download all data from Supabase (used on initial load)
 */
export async function downloadAllFromCloud(): Promise<{
  classes: Class[];
  students: Student[];
  casasTests: CASASTest[];
  unitTests: UnitTest[];
  attendance: Attendance[];
  reportCards: ReportCard[];
} | null> {
  if (!isSupabaseConfigured()) {
    console.log('Supabase not configured, skipping download');
    return null;
  }
  
  setSyncStatus('syncing');
  
  try {
    const [classes, students, casasTests, unitTests, attendance, reportCards] = await Promise.all([
      downloadClasses(),
      downloadStudents(),
      downloadCASASTests(),
      downloadUnitTests(),
      downloadAttendance(),
      downloadReportCards(),
    ]);
    
    setSyncStatus('synced');
    
    return { classes, students, casasTests, unitTests, attendance, reportCards };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Download error:', message);
    setSyncStatus('error', message);
    return null;
  }
}

// ============================================
// Debounced Sync (for frequent local changes)
// ============================================

let syncTimeout: NodeJS.Timeout | null = null;
let pendingSyncData: Parameters<typeof uploadAllToCloud>[0] | null = null;

/**
 * Queue a sync operation (debounced to avoid too many API calls)
 */
export function queueSync(data: Parameters<typeof uploadAllToCloud>[0]): void {
  pendingSyncData = data;
  
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  
  // Debounce: wait 1 second after last change before syncing
  syncTimeout = setTimeout(async () => {
    if (pendingSyncData) {
      try {
        await uploadAllToCloud(pendingSyncData);
      } catch {
        // Error already logged in uploadAllToCloud
      }
      pendingSyncData = null;
    }
  }, 1000);
}

/**
 * Force immediate sync (bypass debounce)
 */
export async function forceSyncNow(data: Parameters<typeof uploadAllToCloud>[0]): Promise<void> {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  pendingSyncData = null;
  await uploadAllToCloud(data);
}
