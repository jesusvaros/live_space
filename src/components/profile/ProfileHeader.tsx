import React from 'react';
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
      ? activeEntity.artist?.avatar_url || `https://picsum.photos/seed/artist-${activeEntity.subject_id}/120/120`
      : activeEntity.venue?.photos?.[0] || `https://picsum.photos/seed/venue-${activeEntity.subject_id}/120/120`
    : profile?.avatar_url || `https://picsum.photos/seed/${profile?.id}/120/120`;

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
      <div className="h-16 w-16 overflow-hidden rounded-full bg-slate-800 ring-2 ring-white/5">
        <img
          src={avatarUrl}
          alt="Foto de perfil"
          className="h-full w-full object-cover"
        />
      </div>
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
          className="inline-flex items-center gap-2 rounded-xl border border-[#ff6b4a]/40 px-3 py-1.5 text-xs font-semibold text-[#ffd1c4] transition hover:bg-[#ff6b4a]/10"
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
