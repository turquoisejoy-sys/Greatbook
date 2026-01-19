'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import Sidebar from './Sidebar';
import { getCurrentClassId, setCurrentClassId as saveCurrentClassId, getClasses } from '@/lib/storage';
import { Class } from '@/types';

interface AppContextType {
  currentClassId: string | null;
  setCurrentClassId: (id: string | null) => void;
  classes: Class[];
  refreshClasses: () => void;
  mounted: boolean;
}

const AppContext = createContext<AppContextType>({
  currentClassId: null,
  setCurrentClassId: () => {},
  classes: [],
  refreshClasses: () => {},
  mounted: false,
});

export function useApp() {
  return useContext(AppContext);
}

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [currentClassId, setCurrentClassIdState] = useState<string | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const id = getCurrentClassId();
    setCurrentClassIdState(id);
    setClasses(getClasses());
  }, []);

  const setCurrentClassId = (id: string | null) => {
    setCurrentClassIdState(id);
    saveCurrentClassId(id);
  };

  const refreshClasses = () => {
    setClasses(getClasses());
  };

  return (
    <AppContext.Provider value={{ currentClassId, setCurrentClassId, classes, refreshClasses, mounted }}>
      <div className="flex min-h-screen bg-[var(--cace-gray)]">
        <Sidebar currentClassId={currentClassId} />
        <main className="flex-1 p-8 overflow-auto">
          {children}
        </main>
      </div>
    </AppContext.Provider>
  );
}
