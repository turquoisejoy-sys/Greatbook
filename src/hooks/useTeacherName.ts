'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getTeacherName,
  setTeacherName,
  TEACHER_NAME_CHANGED_EVENT,
} from '@/lib/teacher-settings';

export function useTeacherName(): [string, (name: string) => void] {
  const [name, setNameState] = useState('');

  useEffect(() => {
    setNameState(getTeacherName());
    const refresh = () => setNameState(getTeacherName());
    window.addEventListener(TEACHER_NAME_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(TEACHER_NAME_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const setName = useCallback((next: string) => {
    setTeacherName(next);
    setNameState(next.trim());
  }, []);

  return [name, setName];
}
