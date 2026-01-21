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
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Evento</p>
          <h3 className="font-display text-xl text-slate-50">{ev.name}</h3>
          <p className="text-sm text-slate-300">{ev.venue_place?.city || ev.city}</p>
          {artists && <p className="text-sm text-slate-400 mt-1">{artists}</p>}
          <p className="text-sm text-slate-400 mt-2">
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
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Sala</p>
        <h3 className="font-display text-xl text-slate-50">{venue.name}</h3>
        <p className="text-sm text-slate-300">{venue.city}</p>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[1100] max-h-[60vh] rounded-t-3xl border border-white/10 bg-[#0b0f1a]/95 p-4 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="h-1 w-12 rounded-full bg-white/20" />
        <button
          type="button"
          className="text-xs text-slate-300"
          onClick={onClose}
        >
          Cerrar
        </button>
      </div>
      {renderDetails()}
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-100"
          onClick={onPrev}
        >
          ← Anterior
        </button>
        <button
          type="button"
          className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-100"
          onClick={onNext}
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
};

export default MapSelectionSheet;
