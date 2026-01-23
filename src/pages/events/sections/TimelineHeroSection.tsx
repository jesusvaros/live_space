import React, { useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { UserConcertHeroState } from '../hooks/useUserConcertHero';
import { getEventCoverImage } from '../utils';
import { EventListItem } from '../types';

type TimelineHeroSectionProps = {
  state: UserConcertHeroState;
  onDismissPendingMoments?: (eventId: string) => void;
};

const formatEventLine = (event: EventListItem) => {
  const venueName = event.venue_place?.name || event.address || 'Venue';
  const date = new Date(event.starts_at).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} · ${venueName}`;
};

const TimelineHeroSection: React.FC<TimelineHeroSectionProps> = ({ state, onDismissPendingMoments }) => {
  const history = useHistory();

  const baseCardClass =
    'relative overflow-hidden border border-white/10 bg-[#141824] shadow-[0_24px_50px_rgba(0,0,0,0.45)]';

  const contentPadding = state.kind === 'just_attended' && state.size === 'compact' ? 'p-4' : 'p-6';

  const hero = useMemo(() => {
    if (state.kind === 'loading') {
      return (
        <div className={`${baseCardClass} ${contentPadding}`}>
          <div className="h-6 w-40 animate-pulse rounded bg-white/10" />
          <div className="mt-4 h-8 w-3/4 animate-pulse rounded bg-white/10" />
          <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-white/10" />
          <div className="mt-5 flex gap-3">
            <div className="h-10 w-36 animate-pulse rounded-2xl bg-white/10" />
            <div className="h-10 w-28 animate-pulse rounded-2xl bg-white/10" />
          </div>
        </div>
      );
    }

    if (state.kind === 'cold_start') {
      return (
        <div className={`${baseCardClass} overflow-hidden`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,107,74,0.25),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(122,167,255,0.18),transparent_55%)]" />
          <div className={`relative z-10 ${contentPadding}`}>
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Your Concert Timeline</p>
            <h2 className="mt-3 font-display text-3xl text-slate-50">Discover concerts near you</h2>
            <p className="mt-2 text-sm text-slate-500">Your timeline starts after the show.</p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                className="rounded-2xl bg-[#ff6b4a] px-4 py-2 text-sm font-semibold text-white"
                onClick={() => history.push('/tabs/map')}
              >
                Explore map
              </button>
              <button
                type="button"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100"
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
      return (
        <div className={`${baseCardClass} mx-auto w-full max-w-[520px] aspect-[4/5]`}>
          {image ? (
            <img
              src={image}
              alt={state.event.name}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,107,74,0.22),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(122,167,255,0.18),transparent_55%)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0e14]/95 via-[#0b0e14]/45 to-transparent" />
          <div className={`relative z-10 flex h-full flex-col justify-end ${contentPadding}`}>
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-300">Your Concert Timeline</p>
            <p className="mt-3 text-sm font-semibold text-slate-100">You’re going to</p>
            <h2 className="mt-2 font-display text-3xl text-white">{state.event.name}</h2>
            <p className="mt-2 text-sm text-slate-200/80">{formatEventLine(state.event)}</p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur"
                onClick={() => history.push(`/event/${state.event.id}`)}
              >
                View event
              </button>
              <button
                type="button"
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-slate-100 backdrop-blur"
                onClick={() => history.push('/tabs/discover')}
              >
                Discover
              </button>
            </div>
          </div>
        </div>
      );
    }

    // just_attended
    const image = getEventCoverImage(state.event);
    return (
      <div className={`${baseCardClass} mx-auto w-full max-w-[520px] aspect-[4/5]`}>
        {image ? (
          <img
            src={image}
            alt={state.event.name}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,107,74,0.22),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(122,167,255,0.18),transparent_55%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0e14]/95 via-[#0b0e14]/45 to-transparent" />
        <div className={`relative z-10 flex h-full flex-col justify-end ${contentPadding}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-200/80">Your Concert Timeline</p>
              <p className="mt-3 text-sm font-semibold text-white">Relive last night</p>
            </div>
            {onDismissPendingMoments && (
              <button
                type="button"
                className="rounded-full bg-black/30 px-3 py-1 text-[11px] font-semibold text-slate-100 backdrop-blur"
                onClick={() => onDismissPendingMoments(state.event.id)}
              >
                Not now
              </button>
            )}
          </div>

          <h2 className="mt-2 font-display text-3xl text-white">{state.event.name}</h2>
          <p className="mt-2 text-sm text-slate-200/80">{state.timeLabel}</p>
          <p className="mt-1 text-sm text-slate-200/70">{formatEventLine(state.event)}</p>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              className="rounded-2xl bg-[#ff6b4a] px-4 py-2 text-sm font-semibold text-white"
              onClick={() => history.push(`/event/${state.event.id}`, { openAddMoments: true })}
            >
              Add your moments
            </button>
            <button
              type="button"
              className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur"
              onClick={() => history.push(`/event/${state.event.id}`)}
            >
              View event
            </button>
          </div>
        </div>
      </div>
    );
  }, [baseCardClass, contentPadding, history, onDismissPendingMoments, state]);

  return <section className="space-y-3">{hero}</section>;
};

export default TimelineHeroSection;
