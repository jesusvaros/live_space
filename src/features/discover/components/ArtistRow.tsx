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
  const posters = artist.recent_posters || [];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onOpenProfile}
        >
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5">
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
          className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] disabled:opacity-60 ${
            isFollowing
              ? 'border-white/25 bg-white/10 text-white/80'
              : 'border-app-accent/35 bg-app-accent text-white'
          }`}
        >
          {followLoading ? 'Loading…' : isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>

      {posters.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">Latest posters</p>
          <div className="flex items-center gap-2">
            {posters.slice(0, 3).map((poster, index) => (
              <div
                key={`${artist.id}-${index}`}
                className="h-16 w-12 overflow-hidden rounded-lg border border-white/10 bg-black/35"
              >
                <img src={poster} alt={`${artist.name} poster ${index + 1}`} className="h-full w-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtistRow;
