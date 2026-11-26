import { sameCity } from './agendaPrefs';

// The home city: one choice, read everywhere (Inicio, Ajustes → Perfil, the
// agenda set-up). It is kept in two places:
// - on the device (live_space.city), which every screen reads at once, and
// - with an account, in profiles.primary_city, so it follows the person.
// syncHomeCity keeps both equal. The device copy changes first (no wait for
// the network); the profile catches up.

export const DEFAULT_CITY = 'Madrid';

const clean = (value?: string | null) => (value || '').trim();

/** The city the person chose, or null to fall back on position / default. */
export const chosenCity = (options: {
  storedCity?: string | null;
  profileCity?: string | null;
  followingLocation: boolean;
}): string | null => {
  if (options.followingLocation) return null;
  return clean(options.storedCity) || clean(options.profileCity) || null;
};

/**
 * The city Inicio shows: the chosen one, else the one around the person,
 * else Madrid, spelled as in the list of cities with concerts.
 */
export const resolveHomeCity = (options: {
  cities: { name: string }[];
  chosen: string | null;
  nearest: string | null;
}): string => {
  const find = (name?: string | null) =>
    name ? options.cities.find(option => sameCity(option.name, name))?.name : undefined;
  return (
    find(options.chosen) ||
    find(options.nearest) ||
    find(DEFAULT_CITY) ||
    options.cities[0]?.name ||
    options.chosen ||
    DEFAULT_CITY
  );
};

export type HomeCitySyncAction =
  | { kind: 'push'; city: string } // device → profile
  | { kind: 'pull'; city: string } // profile → device
  | null;

/**
 * What to do to keep the device and the profile on the same city.
 * `seenProfileCity` is the profile city this device saw last time (undefined
 * the first time this account opens here): if the profile moved since, the
 * change came from another device and wins; otherwise a different device
 * copy is a change made here that the profile has not got yet.
 */
export const syncHomeCity = (options: {
  storedCity?: string | null;
  profileCity?: string | null;
  seenProfileCity?: string;
  followingLocation: boolean;
}): HomeCitySyncAction => {
  if (options.followingLocation) return null;
  const stored = clean(options.storedCity);
  const profile = clean(options.profileCity);
  const differs = Boolean(stored) && !(profile && sameCity(stored, profile));

  if (options.seenProfileCity === undefined) {
    // First time here: what this device was already showing is kept.
    if (differs) return { kind: 'push', city: stored };
    if (profile && !stored) return { kind: 'pull', city: profile };
    return null;
  }

  const seen = clean(options.seenProfileCity);
  const profileMoved = profile ? !(seen && sameCity(profile, seen)) : false;
  if (profileMoved && (!stored || !sameCity(stored, profile))) return { kind: 'pull', city: profile };
  if (differs) return { kind: 'push', city: stored };
  return null;
};

/** Search in the city picker: accents and case do not matter. */
export const matchesCity = (name: string, query: string) => {
  const fold = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLocaleLowerCase('es')
      .trim();
  const needle = fold(query);
  return !needle || fold(name).includes(needle);
};
