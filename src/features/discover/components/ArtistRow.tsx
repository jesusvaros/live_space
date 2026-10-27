import React from 'react';
import { DiscoverArtist } from '../types';
import Avatar from '../../../components/ui/Avatar';

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
  onToggleFollow,
  onOpenProfile,
}) => {
  const posters = artist.recent_posters || [];

  return (
    <article className="overflow-hidden rounded-2xl border border-app-line bg-app-surface p-3">
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
                alt={`Cartel ${index + 1} de ${artist.name}`}
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
          <Avatar name={artist.name} src={artist.avatar_url} className="h-12 w-12 text-[16px]" />
          <div className="min-w-0">
            <p className="font-display text-base font-bold text-white line-clamp-1">{artist.name}</p>
            <p className="mt-0.5 text-xs text-white/55 line-clamp-1">
              {artist.city || (artist.genres?.length ? artist.genres.slice(0, 2).join(' · ') : 'Artista')}
            </p>
          </div>
        </button>

        <button
          type="button"
          disabled={followLoading}
          onClick={e => {
            e.stopPropagation();
            onToggleFollow();
          }}
          className={`min-h-9 shrink-0 rounded-full px-3.5 text-[12px] font-semibold transition disabled:opacity-60 ${
            isFollowing ? 'border border-app-line text-white/70' : 'bg-app-ink text-app-bg'
          }`}
        >
          {isFollowing ? 'Siguiendo' : 'Seguir'}
        </button>
      </div>
    </article>
  );
};

export default ArtistRow;
