import React from 'react';
import { IconMap } from '../icons';
import EventPosterTile from '../../features/events/components/EventPosterTile';
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
    <section className="animate-fade-up space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 motion-reduce:animate-none">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Upcoming</p>
          <h2 className="font-display text-xl font-bold text-white">Upcoming shows</h2>
        </div>
        <button
          type="button"
          onClick={onOpenMap}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75 transition-colors hover:border-white/35 hover:text-white"
        >
          <IconMap size={16} />
          Artist map
        </button>
      </div>
      {events.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <p className="font-semibold text-white">No upcoming shows</p>
          <p className="mt-1 text-sm text-white/55">
            When new dates are announced they will show up here first.
          </p>
          {isManager ? (
            <button
              type="button"
              onClick={onCreateShow}
              className="mt-4 inline-flex items-center justify-center rounded-full border border-app-accent/35 bg-app-accent/20 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-app-accent/30"
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
              <div key={event.id} className="w-[220px] shrink-0 overflow-hidden rounded-2xl border border-white/10">
                <EventPosterTile
                  event={event}
                  className="w-full"
                  kicker={dateLabel}
                  title={venueName}
                  subtitle={city}
                  onSelect={selected => onViewEvent(selected.id)}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default UpcomingShowsSection;
