import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import type { MapVenueGroup } from '../../hooks/useMapFilters';
import type { MapEvent } from '../../data/eventQueries';
import GeneratedPoster from '../ui/GeneratedPoster';

type MapSelectionSheetProps = {
  group: MapVenueGroup | null;
  onClose: () => void;
};

const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const clean = (value: string) => value.replace('.', '');
  return `${clean(weekday.format(date))} ${clean(dayMonth.format(date))} · ${time.format(date)}`.toUpperCase();
};

const Poster: React.FC<{ event: MapEvent }> = ({ event }) => {
  const image = event.cover_image_url ?? event.artist?.avatar_url ?? null;
  if (image) {
    return <img src={image} alt="" loading="lazy" className="h-[72px] w-14 shrink-0 rounded-lg object-cover" />;
  }
  return (
    <span className="relative h-[72px] w-14 shrink-0 overflow-hidden rounded-lg">
      <GeneratedPoster title={event.artist?.name || event.name} variant="thumb" />
    </span>
  );
};

const MapSelectionSheet: React.FC<MapSelectionSheetProps> = ({ group, onClose }) => {
  const touchStartY = useRef<number | null>(null);
  if (!group) return null;

  const count = group.events.length;

  return (
    <section
      role="dialog"
      aria-label={group.name}
      className="absolute inset-x-0 bottom-0 z-[1100] flex max-h-[62%] flex-col rounded-t-3xl border-t border-app-line bg-app-surface text-app-ink shadow-[0_-12px_40px_rgba(0,0,0,0.55)]"
      onKeyDown={event => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div
        className="shrink-0 px-5 pb-3 pt-2"
        onTouchStart={event => {
          touchStartY.current = event.touches[0].clientY;
        }}
        onTouchEnd={event => {
          const start = touchStartY.current;
          touchStartY.current = null;
          if (start !== null && event.changedTouches[0].clientY - start > 60) onClose();
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-xl font-bold leading-tight">{group.name}</h2>
            <p className="mt-0.5 text-sm text-app-ink/55">
              {group.city ? `${group.city} · ` : ''}
              {count} {count === 1 ? 'concierto' : 'conciertos'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-app-ink/60 hover:bg-white/5 hover:text-app-ink"
          >
            ✕
          </button>
        </div>
        <Link
          to={`/tabs/venue/${group.id}`}
          className="mt-3 inline-flex h-11 items-center rounded-full border border-app-line px-4 text-sm font-semibold text-app-ink hover:border-app-accent/60"
        >
          Ver sala →
        </Link>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-app-line px-3 pb-4">
        {group.events.map(event => (
          <li key={event.id}>
            <Link
              to={`/event/${event.id}`}
              className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-white/5"
            >
              <Poster event={event} />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[12px] font-semibold tracking-wide text-app-accent">
                  {formatDate(event.starts_at)}
                </span>
                <span className="mt-1 block truncate text-[16px] font-bold leading-snug">
                  {event.artist?.name || event.name}
                </span>
                <span className="block truncate text-[13px] text-app-ink/55">
                  {event.artist && event.artist.name !== event.name ? event.name : group.name}
                </span>
              </span>
              <span aria-hidden="true" className="text-app-ink/30">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default MapSelectionSheet;
