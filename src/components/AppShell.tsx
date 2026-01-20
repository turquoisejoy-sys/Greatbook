'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import Sidebar from './Sidebar';
import { getCurrentClassId, setCurrentClassId as saveCurrentClassId, getClasses, syncFromCloud } from '@/lib/storage';
import { subscribeSyncStatus, getSyncStatus, isSupabaseConfigured, SyncStatus } from '@/lib/sync';
import { Class } from '@/types';

interface AppContextType {
  currentClassId: string | null;
  setCurrentClassId: (id: string | null) => void;
  classes: Class[];
  refreshClasses: () => void;
  mounted: boolean;
  syncStatus: SyncStatus;
  isCloudEnabled: boolean;
}

const AppContext = createContext<AppContextType>({
  currentClassId: null,
  setCurrentClassId: () => {},
  classes: [],
  refreshClasses: () => {},
  mounted: false,
  syncStatus: 'idle',
  isCloudEnabled: false,
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [isCloudEnabled, setIsCloudEnabled] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Check if Supabase is configured
    const cloudEnabled = isSupabaseConfigured();
    setIsCloudEnabled(cloudEnabled);
    
    // Subscribe to sync status updates
    const unsubscribe = subscribeSyncStatus((status) => {
      setSyncStatus(status);
    });
    
    // Set initial sync status
    setSyncStatus(getSyncStatus());
    
    // Initial data load
    const initializeData = async () => {
      // Try to sync from cloud first
      if (cloudEnabled) {
        await syncFromCloud();
      }
      
      // Then load from local storage
      const id = getCurrentClassId();
      setCurrentClassIdState(id);
      setClasses(getClasses());
    };
    
    initializeData();
    
    return () => {
      unsubscribe();
    };
  }, []);

  const setCurrentClassId = (id: string | null) => {
    setCurrentClassIdState(id);
    saveCurrentClassId(id);
  };

  const refreshClasses = () => {
    setClasses(getClasses());
  };

  return (
    <AppContext.Provider value={{ 
      currentClassId, 
      setCurrentClassId, 
      classes, 
      refreshClasses, 
      mounted,
      syncStatus,
      isCloudEnabled,
    }}>
      <div className="flex min-h-screen bg-[var(--cace-gray)]">
        <Sidebar currentClassId={currentClassId} syncStatus={syncStatus} isCloudEnabled={isCloudEnabled} />
        <main className="flex-1 p-8 overflow-auto">
          {children}
        </main>
      </div>
    </AppContext.Provider>
  );
}
