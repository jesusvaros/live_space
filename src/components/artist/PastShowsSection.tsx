import React from 'react';
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
      <div className="space-y-3">
        {events.map(event => {
          const date = new Date(event.starts_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
          const venueName = event.venue_place?.name || event.address || 'Venue TBA';
          const city = event.venue_place?.city || event.city || 'City';
          return (
            <div
              key={event.id}
              className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{date}</p>
                <p className="text-sm font-semibold text-white">{venueName}</p>
                <p className="text-xs text-slate-400">{city}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                  Past show
                </span>
                <button
                  type="button"
                  onClick={() => onViewEvent(event.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:border-[#ff6b4a]/60 hover:text-[#ffb9a6]"
                >
                  View event
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </section>
);

export default PastShowsSection;
