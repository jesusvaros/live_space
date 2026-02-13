import React, { useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { UserConcertHeroState } from '../hooks/useUserConcertHero';
import { getEventCoverImage } from '../utils';
import { EventListItem } from '../types';

type TimelineHeroSectionProps = {
  state: UserConcertHeroState;
  onDismissPendingMoments?: (eventId: string) => void;
};

const getVenueName = (event: EventListItem) =>
  event.venue_place?.name || event.address || event.city || 'Venue';

const getPrimaryArtistName = (event: EventListItem) => {
  const artist = event.event_artists?.find(entry => entry.artist)?.artist;
  return artist?.name || event.name;
};

const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const TimelineHeroSection: React.FC<TimelineHeroSectionProps> = ({ state, onDismissPendingMoments }) => {
  const history = useHistory();

  const hero = useMemo(() => {
    if (state.kind === 'loading') {
      return (
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
          <div className="absolute inset-x-0 bottom-0 bg-black/70 p-5">
            <div className="h-8 w-3/4 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-white/10" />
            <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-white/10" />
            <div className="mt-5 h-11 w-full animate-pulse rounded bg-white/10" />
          </div>
        </div>
      );
    }

    if (state.kind === 'cold_start') {
      return (
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
          <div className="absolute inset-x-0 bottom-0 bg-black/70 p-5">
            <h2 className="font-display text-3xl font-bold text-white">Discover concerts near you</h2>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                className="rounded bg-white/10 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => history.push('/tabs/map')}
              >
                Explore map
              </button>
              <button
                type="button"
                className="rounded bg-white/10 px-4 py-2 text-sm font-semibold text-white/90"
                onClick={() => history.push('/tabs/discover')}
              >
                Discover
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (state.kind === 'upcoming') {
      const image = getEventCoverImage(state.event);
      const artist = getPrimaryArtistName(state.event);
      const venue = getVenueName(state.event);
      const date = formatShortDate(state.event.starts_at);
      return (
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
          {image ? (
            <img
              src={image}
              alt={state.event.name}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-black" />
          )}
          <div className="absolute inset-x-0 bottom-0 bg-black/70 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">
              You’re going to
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-white">{artist}</h2>
            <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/80">{venue}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/65">{date}</p>
            <div className="mt-5">
              <button
                type="button"
                className="w-full rounded bg-white/10 px-4 py-3 text-sm font-semibold text-white"
                onClick={() => history.push(`/event/${state.event.id}`)}
              >
                View event
              </button>
            </div>
          </div>
        </div>
      );
    }

    // just_attended
    const image = getEventCoverImage(state.event);
    const artist = getPrimaryArtistName(state.event);
    const venue = getVenueName(state.event);
    const date = formatShortDate(state.event.starts_at);
    return (
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
        {image ? (
          <img
            src={image}
            alt={state.event.name}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-black" />
        )}
        {onDismissPendingMoments && (
          <button
            type="button"
            className="absolute right-4 top-4 z-10 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70"
            onClick={() => onDismissPendingMoments(state.event.id)}
          >
            Dismiss
          </button>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-black/70 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">
            Last night at {venue}
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-white">{artist}</h2>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/65">{date}</p>
          <div className="mt-5">
            <button
              type="button"
              className="w-full rounded bg-[#ff6b4a] px-4 py-3 text-sm font-semibold text-white"
              onClick={() => history.push(`/event/${state.event.id}`, { openAddMoments: true })}
            >
              Add your moments
            </button>
          </div>
        </div>
      </div>
    );
  }, [history, onDismissPendingMoments, state]);

  return <section>{hero}</section>;
};

export default TimelineHeroSection;
