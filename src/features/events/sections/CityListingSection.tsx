import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventListItem } from '../types';
import { getEventCoverImage, getPrimaryArtistName } from '../utils';
import GeneratedPoster from '../../../components/ui/GeneratedPoster';
import { Modal } from '../../../components/ui/AppPrimitives';
import EventPosterTile from '../components/EventPosterTile';

const eventCity = (event: EventListItem) => (event.city || event.venue_place?.city || '').trim();

// Cities come from the data: a new city shows up as soon as it has concerts.
export const deriveCities = (events: EventListItem[]) => {
  const counts = new Map<string, { name: string; count: number }>();
  for (const event of events) {
    const name = eventCity(event);
    if (!name) continue;
    const key = name.toLocaleLowerCase('es');
    const current = counts.get(key);
    counts.set(key, { name: current?.name || name, count: (current?.count || 0) + 1 });
  }
  return Array.from(counts.values()).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'es'));
};

const PinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff5b2e" strokeWidth="2" aria-hidden="true">
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

const ChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

type CityListingSectionProps = {
  events: EventListItem[];
  city: string;
  onCityChange: (city: string) => void;
  loading: boolean;
  error?: string | null;
};

const DAYS = 7;

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const dayLabel = (date: Date, index: number) => {
  if (index === 0) return 'Hoy';
  if (index === 1) return 'Mañana';
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(date).replace('.', '');
};

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

// The city's listings, day by day for the next week, then what comes after.
const CityListingSection: React.FC<CityListingSectionProps> = ({ events, city, onCityChange, loading, error }) => {
  const navigate = useNavigate();

  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, []);

  const { byDay, later } = useMemo(() => {
    const map = new Map<string, EventListItem[]>();
    const after: EventListItem[] = [];
    const now = Date.now();
    const weekEnd = new Date(days[DAYS - 1]);
    weekEnd.setHours(23, 59, 59, 999);
    const inCity = events
      .filter(event => eventCity(event).toLowerCase() === city.toLowerCase())
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    for (const event of inCity) {
      const startsAt = new Date(event.starts_at);
      // Tonight's concert stays listed for a few hours after doors.
      if (startsAt.getTime() < now - 1000 * 60 * 60 * 4) continue;
      if (startsAt > weekEnd) {
        after.push(event);
        continue;
      }
      const key = dayKey(startsAt);
      map.set(key, [...(map.get(key) || []), event]);
    }
    return { byDay: map, later: after.slice(0, 12) };
  }, [city, days, events]);

  const firstDayWithEvents = days.findIndex(day => (byDay.get(dayKey(day)) || []).length > 0);
  const [selected, setSelected] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const cities = useMemo(() => deriveCities(events), [events]);
  useEffect(() => {
    setSelected(firstDayWithEvents >= 0 ? firstDayWithEvents : 0);
  }, [city, firstDayWithEvents]);

  const selectedEvents = byDay.get(dayKey(days[selected])) || [];
  const nextDayIndex = days.findIndex((day, index) => index > selected && (byDay.get(dayKey(day)) || []).length > 0);

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-app-ink">Cartelera</h2>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Ciudad: ${city}. Cambiar`}
          onClick={() => setPickerOpen(true)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-app-line bg-app-surface pl-3.5 pr-3 text-sm font-semibold text-app-ink"
        >
          <PinIcon />
          {city}
          <ChevronDown />
        </button>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Día">
        {days.map((day, index) => {
          const count = (byDay.get(dayKey(day)) || []).length;
          const active = index === selected;
          return (
            <button
              key={dayKey(day)}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${dayLabel(day, index)} ${day.getDate()}: ${count} conciertos`}
              onClick={() => setSelected(index)}
              className={`flex w-[62px] shrink-0 flex-col items-center gap-0.5 rounded-2xl border py-2 transition ${
                active ? 'border-app-accent bg-app-accent text-[#14151a]' : 'border-app-line bg-app-surface text-app-ink'
              } ${count === 0 && !active ? 'opacity-45' : ''}`}
            >
              <span className="text-xs font-semibold capitalize">{dayLabel(day, index)}</span>
              <span className="font-poster text-[26px] leading-none">{day.getDate()}</span>
            </button>
          );
        })}
      </div>

      {loading && selectedEvents.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2].map(index => (
            <div key={index} className="h-[88px] animate-pulse rounded-2xl bg-app-surface" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-rose-400">{error}</p>
      ) : selectedEvents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-app-line p-5 text-center">
          <p className="text-sm text-white/70">No hay conciertos anunciados en {city} este día.</p>
          {nextDayIndex >= 0 ? (
            <button
              type="button"
              className="mt-3 min-h-11 rounded-full border border-app-line px-4 text-sm font-semibold text-white"
              onClick={() => setSelected(nextDayIndex)}
            >
              Ver el {dayLabel(days[nextDayIndex], nextDayIndex).toLowerCase()} {days[nextDayIndex].getDate()}
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-2">
          {selectedEvents.map(event => {
            const cover = getEventCoverImage(event);
            const artist = getPrimaryArtistName(event);
            const venue = event.venue_place?.name || event.address || city;
            const subtitle = event.name && !event.name.toLowerCase().includes(artist.toLowerCase())
              ? `${venue} · ${event.name}`
              : venue;
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/event/${event.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-app-line bg-app-surface p-2 text-left transition hover:border-white/25"
                >
                  <div className="relative h-[72px] w-[58px] shrink-0 overflow-hidden rounded-[10px]">
                    {cover ? (
                      <img src={cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <GeneratedPoster title={artist} variant="thumb" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-semibold text-app-accent">{timeLabel(event.starts_at)}</p>
                    <p className="mt-0.5 font-display text-base font-bold leading-snug text-app-ink line-clamp-1">{artist}</p>
                    <p className="mt-0.5 text-[13px] text-[#c9c5bd] line-clamp-1">{subtitle}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {later.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="font-display text-lg font-bold text-white">Más adelante en {city}</h3>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {later.map(event => (
              <EventPosterTile
                key={event.id}
                event={{ ...event, cover_image_url: getEventCoverImage(event) }}
                onSelect={selected => navigate(`/event/${selected.id}`)}
              />
            ))}
          </div>
        </div>
      )}
      <Modal isOpen={pickerOpen} onDidDismiss={() => setPickerOpen(false)} initialBreakpoint={0.5} title="Elegir ciudad">
        <div className="px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
          <h3 className="px-1 pb-2 font-display text-lg font-bold text-app-ink">Ciudad</h3>
          <ul className="max-h-[60dvh] overflow-y-auto">
            {cities.map(option => {
              const active = option.name.toLowerCase() === city.toLowerCase();
              return (
                <li key={option.name}>
                  <button
                    type="button"
                    onClick={() => {
                      onCityChange(option.name);
                      setPickerOpen(false);
                    }}
                    aria-current={active ? 'true' : undefined}
                    className={`flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-[15px] font-semibold ${
                      active ? 'bg-white/[0.08] text-app-accent' : 'text-app-ink'
                    }`}
                  >
                    {option.name}
                    <span className="font-mono text-xs text-white/50">{option.count} conciertos</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
    </section>
  );
};

export default CityListingSection;
