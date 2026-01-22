import React from 'react';
import { IconMap, IconPlay } from '../icons';
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
        <div className="space-y-3">
          {events.map(event => {
            const startsAt = new Date(event.starts_at);
            const dateLabel = startsAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const weekdayLabel = startsAt.toLocaleDateString(undefined, { weekday: 'short' });
            const venueName = event.venue_place?.name || event.address || 'Venue TBA';
            const city = event.venue_place?.city || event.city || 'City';
            return (
              <div
                key={event.id}
                className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-black/30 text-center text-white">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200">{weekdayLabel}</span>
                    <span className="text-sm font-bold uppercase">{dateLabel}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{venueName}</p>
                    <p className="text-xs text-slate-400">{city}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onViewEvent(event.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-[#ff6b4a] bg-[#ff6b4a]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#ffb9a6] hover:bg-[#ff6b4a]/20"
                >
                  <IconPlay size={14} />
                  View event
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default UpcomingShowsSection;
