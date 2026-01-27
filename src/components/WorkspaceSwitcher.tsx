import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { IconChevronDown, IconChevronUp, IconBriefcase, IconUser } from './icons';
import { ManagedEntity } from '../lib/types';

const WorkspaceSwitcher: React.FC = () => {
  const { managedEntities, activeWorkspace, setActiveWorkspace } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const history = useHistory();

  const handleSelect = (workspace: ManagedEntity | null) => {
    console.log('[workspace-switcher] selecting', workspace);
    setActiveWorkspace(
      workspace
        ? {
            ...workspace,
            artist: workspace.artist
              ? { ...workspace.artist, id: (workspace.artist as any).id ?? (workspace.artist as any).artist_id }
              : undefined,
            venue: workspace.venue
              ? { ...workspace.venue, id: (workspace.venue as any).id ?? (workspace.venue as any).venue_place_id }
              : undefined,
          }
        : null
    );
    setIsOpen(false);
    if (workspace?.type === 'artist' && (workspace.artist as any)?.id) {
      history.replace(`/tabs/artist/${(workspace.artist as any).id}`);
    } else if (workspace?.type === 'venue' && (workspace.venue as any)?.id) {
      history.replace(`/tabs/venue/${(workspace.venue as any).id}`);
    } else {
      history.replace('/tabs/profile');
    }
  };

  if (managedEntities.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1 text-white/80 transition-colors hover:text-white"
      >
        <div className="flex h-5 w-5 items-center justify-center text-white/70">
          {activeWorkspace ? (
            <IconBriefcase size={12} />
          ) : (
            <IconUser size={12} />
          )}
        </div>
        <span className="max-w-[120px] truncate text-xs font-medium text-white/80">
          {activeWorkspace 
            ? (activeWorkspace.artist?.name || activeWorkspace.venue?.name || 'Workspace')
            : 'Personal Profile'}
        </span>
        {isOpen ? <IconChevronUp size={14} className="text-white/50" /> : <IconChevronDown size={14} className="text-white/50" />}
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-30" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl bg-black/95">
            <div className="px-4 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40">
              Personal
            </div>
            <button
              onClick={() => handleSelect(null)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 ${!activeWorkspace ? 'text-white' : 'text-white/80'}`}
            >
              <div className="flex h-8 w-8 items-center justify-center bg-white/10 text-white/80">
                <IconUser size={16} />
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium">Personal Profile</div>
                <div className="text-[10px] text-white/50">Viewing as yourself</div>
              </div>
            </button>

            <div className="px-4 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40">
              Workspaces
            </div>
            <div className="max-h-64 overflow-y-auto">
              {managedEntities.map((entity) => (
                <button
                  key={entity.subject_id}
                  onClick={() => handleSelect(entity)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 ${activeWorkspace?.subject_id === entity.subject_id ? 'text-white' : 'text-white/80'}`}
                >
                  <div className="relative">
                    {entity.type === 'artist' ? (
                      entity.artist?.avatar_url ? (
                        <img src={entity.artist.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70">
                          <IconUser size={16} />
                        </div>
                      )
                    ) : (
                      entity.venue?.photos?.[0] ? (
                        <img src={entity.venue.photos[0]} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-white/10 text-white/70">
                          <IconBriefcase size={16} />
                        </div>
                      )
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="truncate text-sm font-medium">
                      {entity.type === 'artist' ? entity.artist?.name : entity.venue?.name}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">{entity.role}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WorkspaceSwitcher;
