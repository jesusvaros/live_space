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
    <div className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-[#141824] p-4 shadow-[0_20px_44px_rgba(0,0,0,0.45)]">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={onOpenProfile}
      >
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-white/5">
          {artist.avatar_url ? (
            <img src={artist.avatar_url} alt={artist.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.25),rgba(255,255,255,0.04))]" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-50 line-clamp-1">{artist.name}</p>
          <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
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
        className={`shrink-0 rounded-2xl px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
          isFollowing ? 'border border-white/10 bg-white/5 text-slate-100' : 'bg-[#ff6b4a] text-white'
        }`}
      >
        {followLoading ? 'Loading…' : isFollowing ? 'Following' : 'Follow'}
      </button>
    </div>
  );
};

export default ArtistRow;

