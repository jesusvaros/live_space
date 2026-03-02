import React from 'react';
import { DiscoverArtist } from '../types';
import { IconUser } from '../../../components/icons';

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
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(155deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02)_68%,rgba(255,107,74,0.08))] p-3">
      {posters.length > 0 && (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
          {posters.slice(0, 6).map((poster, index) => (
            <button
              key={`${artist.id}-${index}`}
              type="button"
              className="group/poster relative aspect-[3/4] w-36 shrink-0 snap-start overflow-hidden rounded-xl text-left"
              onClick={onOpenProfile}
            >
              <img
                src={poster}
                alt={`${artist.name} poster ${index + 1}`}
                className="h-full w-full object-cover transition-transform duration-300 group-hover/poster:scale-[1.03]"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      <div className={`${posters.length > 0 ? 'mt-3' : ''} flex items-center justify-between gap-3`}>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onOpenProfile}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/10">
            {artist.avatar_url ? (
              <img src={artist.avatar_url} alt={artist.name} className="h-full w-full object-cover" />
            ) : (
              <IconUser className="h-5 w-5 text-white/65" />
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
          className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition disabled:opacity-60 ${
            isFollowing
              ? 'border-white/25 bg-white/10 text-white/80'
              : 'border-app-accent/35 bg-app-accent text-white'
          }`}
        >
          {followLoading ? 'Loading…' : isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>
    </article>
  );
};

export default ArtistRow;
