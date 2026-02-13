import React from 'react';
import { DiscoverArtist } from '../types';

type ArtistRowProps = {
  artist: DiscoverArtist;
  isFollowing: boolean;
  followLoading?: boolean;
  canFollow: boolean;
  onToggleFollow: () => void;
  onOpenProfile: () => void;
};

const ArtistRow: React.FC<ArtistRowProps> = ({
  artist,
  isFollowing,
  followLoading,
  canFollow,
  onToggleFollow,
  onOpenProfile,
}) => {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={onOpenProfile}
      >
        <div className="h-14 w-14 shrink-0 overflow-hidden bg-white/5">
          {artist.avatar_url ? (
            <img src={artist.avatar_url} alt={artist.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-white/10" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-white line-clamp-1">{artist.name}</p>
          <p className="mt-0.5 text-xs text-white/55 line-clamp-1">
            {artist.city || (artist.genres?.length ? artist.genres.slice(0, 2).join(' · ') : 'Artist')}
          </p>
        </div>
      </button>

      <button
        type="button"
        disabled={!canFollow || followLoading}
        onClick={e => {
          e.stopPropagation();
          onToggleFollow();
        }}
        className={`shrink-0 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] disabled:opacity-60 ${
          isFollowing ? 'bg-white/10 text-white/80' : 'bg-[#ff6b4a] text-white'
        }`}
      >
        {followLoading ? 'Loading…' : isFollowing ? 'Following' : 'Follow'}
      </button>
    </div>
  );
};

export default ArtistRow;
