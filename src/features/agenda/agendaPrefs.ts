import { EventListItem } from '../events/types';
import { calculateDistanceKm } from '../events/utils';

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
export const clearCity = () => {
  try {
    window.localStorage.removeItem(cityKey);
  } catch {
    // ignore storage failures
  }
};

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

// The closest of the cities with concerts, by their representative point.
export const nearestCity = (
  cities: { name: string; latitude: number | null; longitude: number | null }[],
  location: { lat: number; lng: number },
) => {
  let best: { city: string; distanceKm: number } | null = null;
  for (const option of cities) {
    if (option.latitude === null || option.longitude === null) continue;
    const distanceKm = calculateDistanceKm(location.lat, location.lng, option.latitude, option.longitude);
    if (!best || distanceKm < best.distanceKm) best = { city: option.name, distanceKm };
  }
  return best;
};

export const eventGenres = (event: EventListItem) =>
  (event.event_artists || []).flatMap(entry => entry.artist?.genres || []).filter(Boolean);
