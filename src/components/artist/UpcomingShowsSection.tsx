import React from 'react';
import { IconMap } from '../icons';
import EventPosterTile from '../EventPosterTile';
import { ArtistProfileEvent } from './types';

type UpcomingShowsSectionProps = {
  events: ArtistProfileEvent[];
  isManager: boolean;
  onViewEvent: (id: string) => void;
  onCreateShow: () => void;
  onOpenMap: () => void;
};

const UpcomingShowsSection: React.FC<UpcomingShowsSectionProps> = ({
  events,
  isManager,
  onViewEvent,
  onCreateShow,
  onOpenMap,
}) => {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Upcoming</p>
          <h2 className="font-display text-xl text-white">Upcoming shows</h2>
        </div>
        <button
          type="button"
          onClick={onOpenMap}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:border-[#ff6b4a]/60 hover:text-[#ffb9a6] transition"
        >
          <IconMap size={16} />
          Artist map
        </button>
      </div>
      {events.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-slate-300">
          <p className="font-semibold text-white">No upcoming shows</p>
          <p className="mt-1 text-sm text-slate-400">
            When new dates are announced they will show up here first.
          </p>
          {isManager ? (
            <button
              type="button"
              onClick={onCreateShow}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/30 px-4 py-2 text-sm font-semibold text-white hover:border-[#ff6b4a]/60 hover:text-[#ffb9a6]"
            >
              Create your first show
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {events.map(event => {
            const startsAt = new Date(event.starts_at);
            const dateLabel = startsAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
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
};

export default UpcomingShowsSection;
