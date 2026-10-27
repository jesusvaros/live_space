import { useMemo, useState } from 'react';
import type { MapEvent } from '../data/eventQueries';

export type MapWhen = 'all' | 'today' | 'weekend' | 'next30';

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

export const MAP_WHEN_LABELS: Record<Exclude<MapWhen, 'all'>, string> = {
  today: 'Hoy',
  weekend: 'Este finde',
  next30: 'Próximos 30 días',
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
export const getWhenRange = (when: MapWhen, now = new Date()): [Date, Date] | null => {
  const today = startOfDay(now);
  if (when === 'today') return [today, endOfDay(today)];
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
    const range = getWhenRange(when);
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
  }, [events, search, when, city, artists]);

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
    setCity(null);
    setArtists([]);
    setIncludePast(false);
  };

  return {
    search,
    setSearch,
    when,
    setWhen,
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
