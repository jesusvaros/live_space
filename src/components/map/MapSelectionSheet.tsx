import React from 'react';
import { Event, VenuePlace } from '../../lib/types';

type SelectionItem = { type: 'event' | 'venue'; id: string };

type MapSelectionSheetProps = {
  activeItem: SelectionItem | null;
  events: (Event & { venue_place?: VenuePlace | null; event_artists?: { artist?: { name?: string | null } | null }[] })[];
  venues: VenuePlace[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
};

const MapSelectionSheet: React.FC<MapSelectionSheetProps> = ({
  activeItem,
  events,
  venues,
  onClose,
  onPrev,
  onNext,
  onTouchStart,
  onTouchEnd,
}) => {
  if (!activeItem) return null;

  const renderDetails = () => {
    if (activeItem.type === 'event') {
      const ev = events.find(e => e.id === activeItem.id);
      if (!ev) return null;
      const artists = (ev.event_artists || []).map(a => a.artist?.name).filter(Boolean).join(', ');
      return (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Event</p>
          <h3 className="mt-2 font-display text-xl font-bold text-white">{ev.name}</h3>
          <p className="text-sm text-white/70">{ev.venue_place?.city || ev.city}</p>
          {artists && <p className="mt-1 text-sm text-white/55">{artists}</p>}
          <p className="mt-2 text-sm text-white/55">
            {new Date(ev.starts_at).toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      );
    }
    const venue = venues.find(v => v.id === activeItem.id);
    if (!venue) return null;
    return (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Venue</p>
        <h3 className="mt-2 font-display text-xl font-bold text-white">{venue.name}</h3>
        <p className="text-sm text-white/70">{venue.city}</p>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[1100] max-h-[60vh] bg-black/92 p-4"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="h-1 w-12 rounded-full bg-white/20" />
        <button
          type="button"
          className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      {renderDetails()}
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          className="bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white"
          onClick={onPrev}
        >
          Prev
        </button>
        <button
          type="button"
          className="bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white"
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default MapSelectionSheet;
