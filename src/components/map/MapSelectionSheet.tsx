import React from 'react';
import { Event, VenuePlace } from '../../lib/types';

type SelectionItem = { type: 'event' | 'venue'; id: string };

type MapSelectionSheetProps = {
  activeItem: SelectionItem | null;
  events: (Event & { venue_place?: VenuePlace | null; event_artists?: { artist?: { name?: string | null } | null }[] })[];
  venues: VenuePlace[];
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
};

const MapSelectionSheet: React.FC<MapSelectionSheetProps> = ({
  activeItem,
  events,
  venues,
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
        <div className="flex gap-4">
          {/* Left: Poster vertical with action buttons overlay */}
          <div className="relative flex-shrink-0">
            {ev.cover_image_url ? (
              <img
                src={ev.cover_image_url}
                alt={ev.name}
                className="h-80 w-48 rounded-xl object-cover"
              />
            ) : (
              <div className="h-80 w-48 rounded-xl bg-white/10" />
            )}
            {/* Action buttons overlay */}
            <div className="absolute left-2 top-2 flex gap-2">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
                aria-label="Like"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
                aria-label="Going"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Right: Info */}
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Event</p>
            <h3 className="mt-2 font-display text-2xl font-bold text-white leading-tight">{ev.name}</h3>
            {ev.venue_place?.name && (
              <p className="mt-1 text-sm font-medium text-white/80">{ev.venue_place.name}</p>
            )}
            <p className="mt-1 text-sm text-white/70">{ev.venue_place?.city || ev.city}</p>
            {artists && <p className="mt-2 text-sm text-white/55">{artists}</p>}
            <p className="mt-3 text-sm text-white/55">
              {new Date(ev.starts_at).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
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
      className="fixed inset-x-0 bottom-0 z-[1100] max-h-[60vh] rounded-t-3xl bg-black/92 p-4"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mb-3 flex items-center justify-center">
        <div className="h-1 w-12 rounded-full bg-white/20" />
      </div>
      {renderDetails()}
    </div>
  );
};

export default MapSelectionSheet;
