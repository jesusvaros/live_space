import { useMemo, useState } from 'react';
import type { MapEvent } from '../data/eventQueries';

export type MapWhen = 'all' | 'today' | 'tomorrow' | 'weekend' | 'week' | 'next30' | 'day';

// Busy venues list a year ahead; a month keeps pin counts meaningful.
const DEFAULT_WHEN: MapWhen = 'next30';

export type MapArtistFilter = { id: string; name: string; avatar_url: string | null };

export type MapVenueGroup = {
  id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  /** Matching concerts at this venue, soonest first. */
  events: MapEvent[];
};

// In the order the chips show. 'day' (a date picked in the calendar) has its
// own chip with the chosen date as label.
export const MAP_WHEN_LABELS: Record<Exclude<MapWhen, 'all' | 'day'>, string> = {
  today: 'Hoy',
  tomorrow: 'Mañana',
  weekend: 'Este finde',
  week: 'Esta semana',
  next30: 'Próximos 30 días',
};

/** yyyy-mm-dd in local time (what <input type="date"> uses). */
export const toDateInputValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const fromDateInputValue = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/** [start, end] in local time for a date chip, or null for "any date". */
export const getWhenRange = (when: MapWhen, now = new Date(), day: string | null = null): [Date, Date] | null => {
  const today = startOfDay(now);
  if (when === 'today') return [today, endOfDay(today)];
  if (when === 'tomorrow') return [addDays(today, 1), endOfDay(addDays(today, 1))];
  if (when === 'week') {
    // From today to Sunday.
    const daysToSunday = (7 - today.getDay()) % 7;
    return [today, endOfDay(addDays(today, daysToSunday))];
  }
  if (when === 'day') {
    if (!day) return null;
    const picked = fromDateInputValue(day);
    return [startOfDay(picked), endOfDay(picked)];
  }
  if (when === 'next30') return [today, endOfDay(addDays(today, 30))];
  if (when === 'weekend') {
    // Friday to Sunday of this week; on the weekend itself, from today.
    const day = today.getDay();
    const friday = day === 0 ? addDays(today, -2) : day === 6 ? addDays(today, -1) : addDays(today, 5 - day);
    const start = friday < today ? today : friday;
    return [start, endOfDay(addDays(friday, 2))];
  }
  return null;
};

const normalize = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const useMapFilters = (events: MapEvent[]) => {
  const [search, setSearch] = useState('');
  const [when, setWhen] = useState<MapWhen>(DEFAULT_WHEN);
  const [city, setCity] = useState<string | null>(null);
  const [artists, setArtists] = useState<MapArtistFilter[]>([]);
  const [includePast, setIncludePast] = useState(false);
  const [day, setDayState] = useState<string | null>(null);
  const setDay = (value: string | null) => {
    setDayState(value);
    setWhen(value ? 'day' : DEFAULT_WHEN);
  };
  const whenRange = useMemo(() => getWhenRange(when, new Date(), day), [when, day]);

  const cities = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach(event => {
      if (!event.venue || !event.city) return;
      counts.set(event.city, (counts.get(event.city) ?? 0) + 1);
    });
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([name]) => name);
  }, [events]);

  const filteredEvents = useMemo(() => {
    const query = normalize(search.trim());
    const range = whenRange;
    const artistIds = new Set(artists.map(artist => artist.id));

    return events.filter(event => {
      if (!event.venue) return false;
      if (city && event.city !== city) return false;
      if (range) {
        const startsAt = new Date(event.starts_at);
        if (startsAt < range[0] || startsAt > range[1]) return false;
      }
      if (artistIds.size > 0 && !event.artist_ids.some(id => artistIds.has(id))) return false;
      if (query) {
        const haystack = normalize(
          [event.name, event.city, event.venue.name, ...event.artist_names].join(' ')
        );
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [events, search, whenRange, city, artists]);

  const venueGroups = useMemo(() => {
    const groups = new Map<string, MapVenueGroup>();
    filteredEvents.forEach(event => {
      const venue = event.venue;
      if (!venue) return;
      const group = groups.get(venue.id);
      if (group) {
        group.events.push(event);
      } else {
        groups.set(venue.id, {
          id: venue.id,
          name: venue.name,
          city: event.city,
          latitude: venue.latitude,
          longitude: venue.longitude,
          events: [event],
        });
      }
    });
    return [...groups.values()];
  }, [filteredEvents]);

  const addArtist = (artist: MapArtistFilter) =>
    setArtists(current => (current.some(item => item.id === artist.id) ? current : [...current, artist]));
  const removeArtist = (id: string) => setArtists(current => current.filter(item => item.id !== id));

  const activeFilterCount =
    (when !== DEFAULT_WHEN ? 1 : 0) + (city ? 1 : 0) + (artists.length > 0 ? 1 : 0) + (includePast ? 1 : 0);

  const clearFilters = () => {
    setWhen(DEFAULT_WHEN);
    setDayState(null);
    setCity(null);
    setArtists([]);
    setIncludePast(false);
  };

  return {
    search,
    setSearch,
    when,
    setWhen,
    day,
    setDay,
    whenRange,
    city,
    setCity,
    cities,
    artists,
    addArtist,
    removeArtist,
    clearArtists: () => setArtists([]),
    includePast,
    setIncludePast,
    activeFilterCount,
    clearFilters,
    filteredEvents,
    venueGroups,
  };
};
