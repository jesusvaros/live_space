import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventListItem } from '../types';
import { getEventCoverImage, getEventCoverSources, getPrimaryArtistName } from '../utils';
import CoverImage from '../../../components/ui/CoverImage';
import GeneratedPoster from '../../../components/ui/GeneratedPoster';
import EventPosterTile from '../components/EventPosterTile';
import HomeSectionHeader from './HomeSectionHeader';
import { IconCalendar, IconUser } from '../../../components/icons';
import { goingLabel, useGoingCounts } from '../goingCounts';
import { CityButton } from '../../agenda/CityPicker';

const eventCity = (event: EventListItem) => (event.city || event.venue_place?.city || '').trim();

type CityListingSectionProps = {
  /** The listings; only the chosen city's are shown. */
  events: EventListItem[];
  city: string;
  /** Opens the home's city picker (the same one as the top of Inicio). */
  onOpenCityPicker: () => void;
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
const CityListingSection: React.FC<CityListingSectionProps> = ({ events, city, onOpenCityPicker, loading, error }) => {
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
  useEffect(() => {
    setSelected(firstDayWithEvents >= 0 ? firstDayWithEvents : 0);
  }, [city, firstDayWithEvents]);

  const selectedEvents = byDay.get(dayKey(days[selected])) || [];
  // The week at a glance: «182 conciertos esta semana» says the city is alive.
  const weekTotal = useMemo(() => Array.from(byDay.values()).reduce((sum, list) => sum + list.length, 0), [byDay]);
  const selectedIds = useMemo(() => selectedEvents.map(event => event.id), [selectedEvents]);
  const goingCounts = useGoingCounts(selectedIds);
  const nextDayIndex = days.findIndex((day, index) => index > selected && (byDay.get(dayKey(day)) || []).length > 0);

  return (
    <section className="flex flex-col gap-3.5">
      <HomeSectionHeader
        title="Cartelera"
        kicker={weekTotal > 0 ? `${weekTotal} ${weekTotal === 1 ? 'concierto' : 'conciertos'} esta semana` : 'En tu ciudad'}
        icon={<IconCalendar size={20} />}
        action={<CityButton label={city} onClick={onOpenCityPicker} className="max-w-[45%] shrink-0" />}
      />

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
                    <CoverImage
                      sources={getEventCoverSources(event)}
                      className="absolute inset-0 h-full w-full object-cover"
                      fallback={<GeneratedPoster title={artist} variant="thumb" />}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-semibold text-app-accent">{timeLabel(event.starts_at)}</p>
                    <p className="mt-0.5 font-display text-base font-bold leading-snug text-app-ink line-clamp-1">{artist}</p>
                    <p className="mt-0.5 text-[13px] text-[#c9c5bd] line-clamp-1">{subtitle}</p>
                  </div>
                  {goingLabel(goingCounts.get(event.id)) ? (
                    <span className="inline-flex shrink-0 items-center gap-1 self-start rounded-full border border-app-line px-2 py-1 font-mono text-[11px] font-semibold text-app-ink/80">
                      <IconUser size={12} />
                      {goingLabel(goingCounts.get(event.id))}
                    </span>
                  ) : null}
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
