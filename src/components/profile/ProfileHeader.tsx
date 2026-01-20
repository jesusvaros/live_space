import React from 'react';
import { Profile, ManagedEntity } from '../../lib/types';
import { IconEdit, IconBriefcase } from '../icons';

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
  managedEntities,
  onEditClick,
  onToggleManagementMode,
}) => {
  const avatarUrl = isManagementMode && activeEntity
    ? activeEntity.type === 'artist'
      ? activeEntity.artist?.image_url || `https://picsum.photos/seed/artist-${activeEntity.subject_id}/120/120`
      : activeEntity.venue?.photos?.[0] || `https://picsum.photos/seed/venue-${activeEntity.subject_id}/120/120`
    : profile?.avatar_url || `https://picsum.photos/seed/${profile?.id}/120/120`;

  const displayName = isManagementMode && activeEntity
    ? activeEntity.type === 'artist'
      ? activeEntity.artist?.name
      : activeEntity.venue?.name
    : profile?.display_name || profile?.username || 'Your profile';

  const subline = isManagementMode && activeEntity
    ? activeEntity.type === 'artist'
      ? 'Managed Artist'
      : 'Managed Venue'
    : (profile?.primary_city || 'City') + ' · @' + (profile?.username || 'user');

  return (
    <div className="flex items-center gap-4 animate-fade-up motion-reduce:animate-none">
      <div className="h-16 w-16 overflow-hidden rounded-full bg-slate-800 ring-2 ring-white/5">
        <img
          src={avatarUrl}
          alt="Profile avatar"
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
          Edit
        </button>
        {managedEntities.length > 0 && (
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              isManagementMode
                ? 'border-[#ff6b4a] bg-[#ff6b4a] text-white'
                : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
            onClick={onToggleManagementMode}
          >
            <IconBriefcase className="h-4 w-4" />
            {isManagementMode ? 'Exit Mgmt' : 'Mgmt Mode'}
          </button>
        )}
      </div>
    </div>
  );
};

export default ProfileHeader;
