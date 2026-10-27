import React from 'react';
import Avatar from '../ui/Avatar';
import { Profile, ManagedEntity } from '../../lib/types';
import { IconEdit } from '../icons';

interface ProfileHeaderProps {
  isManagementMode: boolean;
  activeEntity: ManagedEntity | null;
  profile: Profile | null;
  managedEntities: ManagedEntity[];
  onEditClick: () => void;
  onToggleManagementMode: () => void;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  isManagementMode,
  activeEntity,
  profile,
  onEditClick,
}) => {
  const avatarUrl = isManagementMode && activeEntity
    ? activeEntity.type === 'artist'
      ? activeEntity.artist?.avatar_url || null
      : activeEntity.venue?.photos?.[0] || null
    : profile?.avatar_url || null;

  const displayName = isManagementMode && activeEntity
    ? activeEntity.type === 'artist'
      ? activeEntity.artist?.name
      : activeEntity.venue?.name
    : profile?.display_name || profile?.username || 'Tu perfil';

  const subline = isManagementMode && activeEntity
    ? activeEntity.type === 'artist'
      ? 'Artista gestionado'
      : 'Sala gestionada'
    : (profile?.primary_city || 'Ciudad') + ' · @' + (profile?.username || 'usuario');

  return (
    <div className="flex items-center gap-4 animate-fade-up motion-reduce:animate-none">
      <Avatar name={displayName || 'Tú'} src={avatarUrl} className="h-16 w-16 text-[22px]" />
      <div className="flex-1">
        <h2 className="font-display text-xl text-slate-50">
          {displayName}
        </h2>
        <p className="text-sm text-slate-400">
          {subline}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-[#ff5b2e]/40 px-3 py-1.5 text-xs font-semibold text-[#ffd1c4] transition hover:bg-[#ff5b2e]/10"
          onClick={onEditClick}
        >
          <IconEdit className="h-4 w-4" />
          Editar
        </button>
      </div>
    </div>
  );
};

export default ProfileHeader;
