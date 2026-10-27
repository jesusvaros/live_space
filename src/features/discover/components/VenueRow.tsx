import React from 'react';
import Avatar from '../../../components/ui/Avatar';
import { DiscoverVenue } from '../types';

type VenueRowProps = {
  venue: DiscoverVenue;
  isFollowing: boolean;
  followLoading?: boolean;
  canFollow: boolean;
  onToggleFollow: () => void;
  onOpenProfile: () => void;
};

const VenueRow: React.FC<VenueRowProps> = ({
  venue,
  isFollowing,
  followLoading,
  onToggleFollow,
  onOpenProfile,
}) => {
  const cover = venue.photos?.[0] || null;
  const posters = venue.recent_posters || [];

  return (
    <div className="rounded-2xl border border-app-line bg-app-surface p-3">
      <div className="flex items-center justify-between gap-4">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onOpenProfile}>
          <Avatar name={venue.name} src={cover} rounded="xl" className="h-12 w-12 text-[16px]" />
          <div className="min-w-0">
            <p className="font-display text-base font-bold text-white line-clamp-1">{venue.name}</p>
            <p className="mt-0.5 text-xs text-white/55 line-clamp-1">{venue.city}</p>
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

      {posters.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="mb-2 text-[12px] text-white/55">Últimos carteles</p>
          <div className="flex items-center gap-2">
            {posters.slice(0, 3).map((poster, index) => (
              <div
                key={`${venue.id}-${index}`}
                className="h-16 w-12 overflow-hidden rounded-lg border border-white/10 bg-black/35"
              >
                <img src={poster} alt={`Cartel ${index + 1} de ${venue.name}`} className="h-full w-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VenueRow;
