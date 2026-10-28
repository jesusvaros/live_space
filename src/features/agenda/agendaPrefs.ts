import { EventListItem } from '../events/types';
import { calculateDistanceKm, toNumber } from '../events/utils';

// Device-level preferences of the personal agenda. The home reads the city
// key directly, so its name and plain-string format must not change.
const cityKey = 'live_space.city';
const tastesKey = 'live_space.tastes.v1';
const setupDoneKey = 'live_space.setup.v1';

const read = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
};

export const readStoredCity = () => read(cityKey);
export const persistCity = (city: string) => write(cityKey, city);

// Genres are kept lowercased so they match however the catalogue spells them.
export const genreKey = (genre: string) => genre.trim().toLocaleLowerCase('es');

export const readTastes = (): string[] => {
  try {
    const parsed = JSON.parse(read(tastesKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export const persistTastes = (genres: string[]) => write(tastesKey, JSON.stringify(genres.map(genreKey)));

// Done or skipped, per account: the setup only opens by itself once.
export const isSetupDone = (userId: string) => (read(setupDoneKey) || '').split(',').includes(userId);
export const markSetupDone = (userId: string) => {
  const done = (read(setupDoneKey) || '').split(',').filter(Boolean);
  if (!done.includes(userId)) write(setupDoneKey, [...done, userId].join(','));
};

export const eventCity = (event: EventListItem) => (event.city || event.venue_place?.city || '').trim();

export const sameCity = (left: string, right: string) =>
  left.toLocaleLowerCase('es') === right.toLocaleLowerCase('es');

// The city of the closest concert, however far it is.
export const nearestEventCity = (events: EventListItem[], location: { lat: number; lng: number }) => {
  let best: { city: string; distanceKm: number } | null = null;
  for (const event of events) {
    const name = eventCity(event);
    const eventLat = toNumber(event.latitude ?? event.venue_place?.latitude ?? null);
    const eventLng = toNumber(event.longitude ?? event.venue_place?.longitude ?? null);
    if (!name || eventLat === null || eventLng === null) continue;
    const distanceKm = calculateDistanceKm(location.lat, location.lng, eventLat, eventLng);
    if (!best || distanceKm < best.distanceKm) best = { city: name, distanceKm };
  }
  return best;
};

export const eventGenres = (event: EventListItem) =>
  (event.event_artists || []).flatMap(entry => entry.artist?.genres || []).filter(Boolean);

// Genres present in the listings, the given city's first, most common first.
export const deriveGenres = (events: EventListItem[], city?: string | null) => {
  const counts = new Map<string, { key: string; label: string; local: number; total: number }>();
  for (const event of events) {
    const local = city ? sameCity(eventCity(event), city) : false;
    for (const genre of new Set(eventGenres(event).map(item => item.trim()))) {
      const key = genreKey(genre);
      if (!key) continue;
      const current = counts.get(key) || { key, label: genre.charAt(0).toLocaleUpperCase('es') + genre.slice(1), local: 0, total: 0 };
      current.total += 1;
      if (local) current.local += 1;
      counts.set(key, current);
    }
  }
  return Array.from(counts.values()).sort(
    (left, right) => right.local - left.local || right.total - left.total || left.label.localeCompare(right.label, 'es'),
  );
};
