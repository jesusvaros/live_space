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

  const heroShellClass = 'relative h-[64vh] min-h-[420px] w-full overflow-hidden bg-black';
  const basePrimaryCtaClass =
    'inline-flex items-center justify-center rounded-full border border-app-accent/35 bg-app-accent px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none';
  const baseGhostCtaClass =
    'inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white/90 transition-colors hover:text-white';

  const hero = useMemo(() => {
    if (state.kind === 'loading') {
      return (
        <div className={heroShellClass}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(255,107,74,0.22),transparent_48%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(122,167,255,0.16),transparent_52%)]" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/72 to-transparent p-5 sm:p-6">
            <div className="h-8 w-3/4 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-white/10" />
            <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-white/10" />
            <div className="mt-5 h-11 w-44 animate-pulse rounded-full bg-white/10" />
          </div>
        </div>
      );
    }

    if (state.kind === 'cold_start') {
      return (
        <div className={heroShellClass}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(255,107,74,0.28),transparent_46%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_84%_14%,rgba(122,167,255,0.2),transparent_54%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/45 to-black/75" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/65">Events</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">Discover concerts near you</h2>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                className={basePrimaryCtaClass}
                onClick={() => history.push('/tabs/map')}
              >
                Explore map
              </button>
              <button
                type="button"
                className={baseGhostCtaClass}
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
        <div className={heroShellClass}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(255,107,74,0.2),transparent_48%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_14%,rgba(122,167,255,0.16),transparent_54%)]" />
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/58 to-black/22" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/65">
              You’re going to
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">{artist}</h2>
            <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/82">{venue}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">{date}</p>
            <div className="mt-5">
              <button
                type="button"
                className={baseGhostCtaClass}
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
      <div className={heroShellClass}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(255,107,74,0.2),transparent_48%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_14%,rgba(122,167,255,0.16),transparent_54%)]" />
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
            className="absolute right-4 top-4 z-10 rounded-full border border-white/25 bg-black/35 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80 backdrop-blur-sm"
            onClick={() => onDismissPendingMoments(state.event.id)}
          >
            Dismiss
          </button>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/58 to-black/22" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/65">
            Last night at {venue}
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">{artist}</h2>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">{date}</p>
          <div className="mt-5">
            <button
              type="button"
              className={basePrimaryCtaClass}
              onClick={() => history.push(`/event/${state.event.id}`, { openAddMoments: true })}
            >
              Add your moments
            </button>
          </div>
        </div>
      </div>
    );
  }, [baseGhostCtaClass, basePrimaryCtaClass, heroShellClass, history, onDismissPendingMoments, state]);

  return <section>{hero}</section>;
};

export default TimelineHeroSection;
