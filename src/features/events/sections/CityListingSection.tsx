import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventListItem } from '../types';
import { getEventCoverImage, getPrimaryArtistName } from '../utils';
import GeneratedPoster from '../../../components/ui/GeneratedPoster';
import EventPosterTile from '../components/EventPosterTile';

export const LISTING_CITIES = ['Madrid', 'Barcelona'] as const;

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
      .filter(event => (event.city || event.venue_place?.city || '').toLowerCase() === city.toLowerCase())
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
  useEffect(() => {
    setSelected(firstDayWithEvents >= 0 ? firstDayWithEvents : 0);
  }, [city, firstDayWithEvents]);

  const selectedEvents = byDay.get(dayKey(days[selected])) || [];
  const nextDayIndex = days.findIndex((day, index) => index > selected && (byDay.get(dayKey(day)) || []).length > 0);

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-white">Cartelera</h2>
        <div className="flex rounded-full border border-app-line bg-app-surface p-1" role="tablist" aria-label="Ciudad">
          {LISTING_CITIES.map(option => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={city === option}
              onClick={() => onCityChange(option)}
              className={`min-h-9 rounded-full px-3.5 text-[13px] font-semibold transition ${
                city === option ? 'bg-app-ink text-app-bg' : 'text-white/65'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
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
              onClick={() => setSelected(index)}
              className={`flex min-w-[64px] shrink-0 flex-col items-center rounded-2xl border px-3 py-2 transition ${
                active ? 'border-app-accent bg-app-accent text-[#14151a]' : 'border-app-line bg-app-surface text-white'
              } ${count === 0 && !active ? 'opacity-45' : ''}`}
            >
              <span className="text-[12px] font-semibold capitalize">{dayLabel(day, index)}</span>
              <span className="font-poster text-[26px] leading-none">{day.getDate()}</span>
              <span className={`font-mono text-[10px] ${active ? 'text-[#14151a]/75' : 'text-white/55'}`}>
                {count > 0 ? count : '—'}
              </span>
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
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/event/${event.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-app-line bg-app-surface p-2 text-left transition hover:border-white/25"
                >
                  <div className="relative h-[72px] w-[58px] shrink-0 overflow-hidden rounded-lg">
                    {cover ? (
                      <img src={cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <GeneratedPoster title={artist} variant="thumb" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-semibold text-app-accent">{timeLabel(event.starts_at)}</p>
                    <p className="font-display text-base font-bold leading-snug text-white line-clamp-1">{artist}</p>
                    <p className="text-[13px] text-white/60 line-clamp-1">{venue}</p>
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
    </section>
  );
};

export default CityListingSection;
