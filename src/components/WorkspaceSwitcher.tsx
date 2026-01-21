import React, { useState } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { IconChevronDown, IconChevronUp, IconBriefcase, IconUser } from './icons';
import { ManagedEntity } from '../lib/types';

const WorkspaceSwitcher: React.FC = () => {
  const { managedEntities, activeWorkspace, setActiveWorkspace } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (workspace: ManagedEntity | null) => {
    setActiveWorkspace(workspace);
    setIsOpen(false);
  };

  if (managedEntities.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 transition-colors hover:bg-white/10"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-app-ink/20 text-app-ink">
          {activeWorkspace ? (
            <IconBriefcase size={12} />
          ) : (
            <IconUser size={12} />
          )}
        </div>
        <span className="max-w-[120px] truncate text-xs font-medium text-app-light">
          {activeWorkspace 
            ? (activeWorkspace.artist?.name || activeWorkspace.venue?.name || 'Workspace')
            : 'Personal Profile'}
        </span>
        {isOpen ? <IconChevronUp size={14} className="text-app-light/50" /> : <IconChevronDown size={14} className="text-app-light/50" />}
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-30" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#1A1D25] shadow-2xl">
            <div className="p-2 text-[10px] font-bold uppercase tracking-wider text-app-light/30 px-4 pt-4 pb-2">
              Personal
            </div>
            <button
              onClick={() => handleSelect(null)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 ${!activeWorkspace ? 'bg-app-ink/10 text-app-ink' : 'text-app-light'}`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-app-ink/20 text-app-ink">
                <IconUser size={16} />
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium">Personal Profile</div>
                <div className="text-[10px] opacity-50">Viewing as yourself</div>
              </div>
            </button>

            <div className="p-2 text-[10px] font-bold uppercase tracking-wider text-app-light/30 px-4 pt-4 pb-2">
              Workspaces
            </div>
            <div className="max-h-64 overflow-y-auto">
              {managedEntities.map((entity) => (
                <button
                  key={entity.subject_id}
                  onClick={() => handleSelect(entity)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 ${activeWorkspace?.subject_id === entity.subject_id ? 'bg-app-ink/10 text-app-ink' : 'text-app-light'}`}
                >
                  <div className="relative">
                    {entity.type === 'artist' ? (
                      entity.artist?.avatar_url ? (
                        <img src={entity.artist.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
                          <IconUser size={16} />
                        </div>
                      )
                    ) : (
                      entity.venue?.photos?.[0] ? (
                        <img src={entity.venue.photos[0]} alt="" className="h-8 w-8 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400">
                          <IconBriefcase size={16} />
                        </div>
                      )
                    )}
                    <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#1A1D25] p-0.5 text-[8px] font-bold uppercase ring-1 ring-white/10">
                      {entity.type === 'artist' ? 'A' : 'V'}
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="truncate text-sm font-medium">
                      {entity.type === 'artist' ? entity.artist?.name : entity.venue?.name}
                    </div>
                    <div className="text-[10px] opacity-50 uppercase tracking-tight">{entity.role}</div>
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
