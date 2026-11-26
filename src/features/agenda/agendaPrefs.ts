import { EventListItem } from '../events/types';
import { calculateDistanceKm } from '../events/utils';

// Device-level preferences of the personal agenda. Other screens read the
// city key directly, so its name and plain-string format must not change.
// The home city as a whole (device copy + profile) is in homeCity.ts.
const cityKey = 'live_space.city';
// «Usar mi ubicación»: the home follows the position instead of a city.
const followLocationKey = 'live_space.city.follow_location';
// The profile's city as this device last saw it ("<userId>\n<city>"), to tell
// a change made on another device from one made here (see homeCity.ts).
const profileSeenKey = 'live_space.city.profile_seen';
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

const remove = (key: string) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
};

// Screens showing the city re-render when it changes (useSyncExternalStore).
const cityListeners = new Set<() => void>();
const notifyCity = () => cityListeners.forEach(listener => listener());
export const subscribeCity = (listener: () => void) => {
  cityListeners.add(listener);
  return () => {
    cityListeners.delete(listener);
  };
};

export const readStoredCity = () => read(cityKey);
export const persistCity = (city: string) => {
  write(cityKey, city);
  notifyCity();
};
export const clearCity = () => {
  remove(cityKey);
  notifyCity();
};

export const isFollowingLocation = () => read(followLocationKey) === '1';
export const setFollowingLocation = (on: boolean) => {
  if (on) write(followLocationKey, '1');
  else remove(followLocationKey);
  notifyCity();
};

/** The profile city this device last saw for `userId`; undefined if never. */
export const readProfileSeen = (userId: string): string | undefined => {
  const raw = read(profileSeenKey);
  if (raw === null) return undefined;
  const [id, ...rest] = raw.split('\n');
  return id === userId ? rest.join('\n') : undefined;
};
export const persistProfileSeen = (userId: string, city: string | null) =>
  write(profileSeenKey, `${userId}\n${city ?? ''}`);

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
