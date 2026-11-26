import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  clearCity,
  isFollowingLocation,
  persistCity,
  persistProfileSeen,
  readProfileSeen,
  readStoredCity,
  setFollowingLocation,
  subscribeCity,
} from './agendaPrefs';
import { chosenCity, syncHomeCity } from './homeCity';

// One profile write at a time, however many screens mount the hook.
let pushing: string | null = null;

/**
 * Keeps the device copy of the home city and the profile's equal (see
 * homeCity.ts). Mounted once for the whole app and by every screen that
 * changes the city.
 */
export const useHomeCitySync = () => {
  const { user, profile, updateProfile } = useAuth();
  const storedCity = useSyncExternalStore(subscribeCity, readStoredCity);
  const followingLocation = useSyncExternalStore(subscribeCity, isFollowingLocation);
  const userId = user?.id ?? null;
  // The profile row of this account (not a stale one from another session).
  const profileCity = profile && profile.id === userId ? profile.primary_city ?? null : undefined;

  useEffect(() => {
    if (!userId || profileCity === undefined || pushing) return;
    const action = syncHomeCity({
      storedCity,
      profileCity,
      seenProfileCity: readProfileSeen(userId),
      followingLocation,
    });
    if (action?.kind === 'push') {
      pushing = action.city;
      void updateProfile({ primary_city: action.city })
        .then(({ error }) => {
          // On failure the device copy still drives the home; retried later.
          if (!error) persistProfileSeen(userId, action.city);
        })
        .catch(() => undefined)
        .finally(() => {
          pushing = null;
        });
      return;
    }
    if (action?.kind === 'pull') persistCity(action.city);
    persistProfileSeen(userId, profileCity);
    // updateProfile changes identity with the auth state; the inputs are what matter.
  },[userId, profileCity, storedCity, followingLocation]);
};

/** The home city the person chose, and the two ways to change it. */
export const useHomeCity = () => {
  useHomeCitySync();
  const { profile } = useAuth();
  const storedCity = useSyncExternalStore(subscribeCity, readStoredCity);
  const followingLocation = useSyncExternalStore(subscribeCity, isFollowingLocation);
  const chosen = chosenCity({ storedCity, profileCity: profile?.primary_city, followingLocation });

  // The device copy changes now; the sync takes it to the profile.
  const setCity = useCallback((city: string) => {
    setFollowingLocation(false);
    persistCity(city);
  }, []);

  // The profile keeps its city (shown in Ajustes, used for notifications);
  // only this device follows the position.
  const followLocation = useCallback(() => {
    clearCity();
    setFollowingLocation(true);
  }, []);

  return { chosen, followingLocation, setCity, followLocation };
};
