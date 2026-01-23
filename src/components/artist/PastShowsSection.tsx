import React from 'react';
import EventPosterTile from '../EventPosterTile';
import { ArtistProfileEvent } from './types';

type PastShowsSectionProps = {
  events: ArtistProfileEvent[];
  playedCount: number;
  isManager: boolean;
  onViewEvent: (id: string) => void;
  onCreateShow: () => void;
};

const PastShowsSection: React.FC<PastShowsSectionProps> = ({
  events,
  playedCount,
  isManager,
  onViewEvent,
  onCreateShow,
}) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Archive</p>
        <h2 className="font-display text-xl text-white">Past shows</h2>
        <p className="text-sm text-slate-400">Last {events.length || 3} performances.</p>
      </div>
      {playedCount > 0 && (
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#ff6b4a]">
          Played {playedCount}
        </span>
      )}
    </div>
    {events.length === 0 ? (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-slate-300">
        <p className="font-semibold text-white">No past shows yet</p>
        <p className="mt-1 text-sm text-slate-400">
          We will start showing the archive as soon as the first show finishes.
        </p>
        {isManager ? (
          <button
            type="button"
            onClick={onCreateShow}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/30 px-4 py-2 text-sm font-semibold text-white hover:border-[#ff6b4a]/60 hover:text-[#ffb9a6]"
          >
            Create show
          </button>
        ) : null}
      </div>
    ) : (
      <div className="flex gap-3 overflow-x-auto pb-1">
        {events.map(event => {
          const dateLabel = new Date(event.starts_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
          const venueName = event.venue_place?.name || event.address || 'Venue TBA';
          const city = event.venue_place?.city || event.city || 'City';
          return (
            <EventPosterTile
              key={event.id}
              event={event}
              className="w-[220px] shrink-0"
              kicker={dateLabel}
              title={venueName}
              subtitle={city}
              onSelect={selected => onViewEvent(selected.id)}
            />
          );
        })}
      </div>
    )}
  </section>
);

export default PastShowsSection;
