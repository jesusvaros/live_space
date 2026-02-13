import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { ManagedEntity } from '../lib/types';
import { managementService } from '../services/management.service';
import { useAuth } from './AuthContext';
import { useWorkspaceStore } from '../store/appStore';

interface WorkspaceContextType {
  managedEntities: ManagedEntity[];
  activeWorkspace: ManagedEntity | null;
  setActiveWorkspace: (workspace: ManagedEntity | null) => void;
  loading: boolean;
  ready: boolean;
  refreshWorkspaces: () => Promise<void>;
  isActingAsEntity: boolean;
  canCreateEvent: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);
const STORAGE_KEY_PREFIX = 'live_space.workspace.';

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore();
  const [managedEntities, setManagedEntities] = useState<ManagedEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);

  const storageKey = profile?.id ? `${STORAGE_KEY_PREFIX}${profile.id}` : null;

  const persistWorkspaceId = (subjectId: string | null) => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      if (subjectId) {
        window.localStorage.setItem(storageKey, subjectId);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // ignore storage errors
    }
  };

  const setActiveWorkspace = (workspace: ManagedEntity | null) => {
    console.log('[workspace] setActiveWorkspace ->', workspace);
    const nextId = workspace?.subject_id ?? null;
    setActiveWorkspaceId(nextId);
    persistWorkspaceId(nextId);
  };

  const readStoredWorkspaceId = () => {
    if (!storageKey || typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };

  const refreshWorkspaces = async () => {
    if (!profile?.id) {
      setManagedEntities([]);
      setActiveWorkspaceId(null);
      persistWorkspaceId(null);
      setLoading(false);
      setInitializedFor(null);
      return;
    }

    try {
      setLoading(true);
      const entities = await managementService.getManagedEntities(profile.id);
      console.log('[workspace] fetched entities', entities);
      setManagedEntities(entities);
      
      // Keep active workspace if it still exists in the list, otherwise null
      if (activeWorkspaceId) {
        const stillExists = entities.find(e => e.subject_id === activeWorkspaceId);
        if (!stillExists) {
          setActiveWorkspaceId(null);
          persistWorkspaceId(null);
        }
      } else {
        const storedId = readStoredWorkspaceId();
        if (storedId) {
          const match = entities.find(e => e.subject_id === storedId);
          if (match) {
            console.log('[workspace] restoring stored workspace', storedId);
            setActiveWorkspaceId(match.subject_id);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching managed entities:', error);
    } finally {
      setLoading(false);
      setInitializedFor(profile.id);
    }
  };

  useEffect(() => {
    refreshWorkspaces();
  }, [profile?.id]);

  useEffect(() => {
    const handleResume = () => {
      if (document.visibilityState !== 'visible') return;
      if (!profile?.id) return;
      refreshWorkspaces().catch(() => undefined);
    };

    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [profile?.id]);

  const activeWorkspace = useMemo(() => {
    if (!activeWorkspaceId) return null;
    return managedEntities.find(entity => entity.subject_id === activeWorkspaceId) ?? null;
  }, [activeWorkspaceId, managedEntities]);

  const isActingAsEntity = activeWorkspace !== null;
  const canCreateEvent = activeWorkspace !== null && 
    ['owner', 'admin', 'editor'].includes(activeWorkspace.role);
  const ready = Boolean(profile?.id && initializedFor === profile.id);

  return (
    <WorkspaceContext.Provider
      value={{
        managedEntities,
        activeWorkspace,
        setActiveWorkspace,
        loading,
        ready,
        refreshWorkspaces,
        isActingAsEntity,
        canCreateEvent
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
