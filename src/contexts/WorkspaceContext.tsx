import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ManagedEntity } from '../lib/types';
import { managementService } from '../services/management.service';
import { useAuth } from './AuthContext';

interface WorkspaceContextType {
  managedEntities: ManagedEntity[];
  activeWorkspace: ManagedEntity | null;
  setActiveWorkspace: (workspace: ManagedEntity | null) => void;
  loading: boolean;
  refreshWorkspaces: () => Promise<void>;
  isActingAsEntity: boolean;
  canCreateEvent: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const [managedEntities, setManagedEntities] = useState<ManagedEntity[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<ManagedEntity | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshWorkspaces = async () => {
    if (!profile?.id) {
      setManagedEntities([]);
      setActiveWorkspace(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const entities = await managementService.getManagedEntities(profile.id);
      setManagedEntities(entities);
      
      // Keep active workspace if it still exists in the list, otherwise null
      if (activeWorkspace) {
        const stillExists = entities.find(e => e.subject_id === activeWorkspace.subject_id);
        if (!stillExists) setActiveWorkspace(null);
      }
    } catch (error) {
      console.error('Error fetching managed entities:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshWorkspaces();
  }, [profile?.id]);

  const isActingAsEntity = activeWorkspace !== null;
  const canCreateEvent = activeWorkspace !== null && 
    ['owner', 'admin', 'editor'].includes(activeWorkspace.role);

  return (
    <WorkspaceContext.Provider
      value={{
        managedEntities,
        activeWorkspace,
        setActiveWorkspace,
        loading,
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
