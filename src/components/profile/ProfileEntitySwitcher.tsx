import React from 'react';
import { ManagedEntity } from '../../lib/types';

interface ProfileEntitySwitcherProps {
  isManagementMode: boolean;
  managedEntities: ManagedEntity[];
  activeEntity: ManagedEntity | null;
  onSelectEntity: (entity: ManagedEntity) => void;
}

const ProfileEntitySwitcher: React.FC<ProfileEntitySwitcherProps> = ({
  isManagementMode,
  managedEntities,
  activeEntity,
  onSelectEntity,
}) => {
  if (!isManagementMode || managedEntities.length <= 1) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 animate-fade-in scrollbar-hide">
      {managedEntities.map(ent => (
        <button
          key={ent.subject_id}
          type="button"
          className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition ${
            activeEntity?.subject_id === ent.subject_id
              ? 'bg-white text-[#141824]'
              : 'bg-white/5 text-slate-400 hover:bg-white/10'
          }`}
          onClick={() => onSelectEntity(ent)}
        >
          {ent.type === 'artist' ? ent.artist?.name : ent.venue?.name}
        </button>
      ))}
    </div>
  );
};

export default ProfileEntitySwitcher;
