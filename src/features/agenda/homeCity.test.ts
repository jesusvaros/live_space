import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chosenCity, matchesCity, resolveHomeCity, syncHomeCity } from './homeCity';
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
import { stubLocalStorage } from '../../test/memoryStorage';

const cities = [{ name: 'Madrid' }, { name: 'Barcelona' }, { name: 'A Coruña' }];

describe('chosenCity', () => {
  it('prefers the device copy, then the profile', () => {
    expect(chosenCity({ storedCity: 'Barcelona', profileCity: 'Madrid', followingLocation: false })).toBe('Barcelona');
    expect(chosenCity({ storedCity: null, profileCity: 'Madrid', followingLocation: false })).toBe('Madrid');
    expect(chosenCity({ storedCity: '  ', profileCity: '', followingLocation: false })).toBeNull();
  });

  it('is nothing while following the position', () => {
    expect(chosenCity({ storedCity: 'Barcelona', profileCity: 'Madrid', followingLocation: true })).toBeNull();
  });
});

describe('resolveHomeCity', () => {
  it('uses the chosen city, spelled as in the list', () => {
    expect(resolveHomeCity({ cities, chosen: 'barcelona', nearest: 'Madrid' })).toBe('Barcelona');
  });

  it('falls back on the nearest city, then Madrid, then the first', () => {
    expect(resolveHomeCity({ cities, chosen: null, nearest: 'A Coruña' })).toBe('A Coruña');
    expect(resolveHomeCity({ cities, chosen: 'Soria', nearest: null })).toBe('Madrid');
    expect(resolveHomeCity({ cities: [{ name: 'Bilbao' }], chosen: null, nearest: null })).toBe('Bilbao');
  });

  it('keeps the chosen city before the list arrives', () => {
    expect(resolveHomeCity({ cities: [], chosen: 'Valencia', nearest: null })).toBe('Valencia');
    expect(resolveHomeCity({ cities: [], chosen: null, nearest: null })).toBe('Madrid');
  });
});

describe('syncHomeCity', () => {
  it('does nothing while following the position', () => {
    expect(syncHomeCity({ storedCity: 'Bilbao', profileCity: 'Madrid', followingLocation: true })).toBeNull();
  });

  it('first time on this device: keeps what the device showed, else takes the profile', () => {
    expect(syncHomeCity({ storedCity: 'Bilbao', profileCity: 'Madrid', followingLocation: false })).toEqual({
      kind: 'push',
      city: 'Bilbao',
    });
    expect(syncHomeCity({ storedCity: null, profileCity: 'Madrid', followingLocation: false })).toEqual({
      kind: 'pull',
      city: 'Madrid',
    });
    expect(syncHomeCity({ storedCity: 'madrid', profileCity: 'Madrid', followingLocation: false })).toBeNull();
    expect(syncHomeCity({ storedCity: null, profileCity: null, followingLocation: false })).toBeNull();
  });

  it('a city picked here goes to the profile', () => {
    expect(
      syncHomeCity({ storedCity: 'Sevilla', profileCity: 'Madrid', seenProfileCity: 'Madrid', followingLocation: false }),
    ).toEqual({ kind: 'push', city: 'Sevilla' });
    expect(syncHomeCity({ storedCity: 'Sevilla', profileCity: null, seenProfileCity: '', followingLocation: false })).toEqual({
      kind: 'push',
      city: 'Sevilla',
    });
  });

  it('a city changed on another device comes here', () => {
    expect(
      syncHomeCity({ storedCity: 'Madrid', profileCity: 'Valencia', seenProfileCity: 'Madrid', followingLocation: false }),
    ).toEqual({ kind: 'pull', city: 'Valencia' });
    expect(
      syncHomeCity({ storedCity: null, profileCity: 'Valencia', seenProfileCity: '', followingLocation: false }),
    ).toEqual({ kind: 'pull', city: 'Valencia' });
  });

  it('nothing to do when both agree', () => {
    expect(
      syncHomeCity({ storedCity: 'Valencia', profileCity: 'Valencia', seenProfileCity: 'Madrid', followingLocation: false }),
    ).toBeNull();
    expect(
      syncHomeCity({ storedCity: 'Valencia', profileCity: 'Valencia', seenProfileCity: 'Valencia', followingLocation: false }),
    ).toBeNull();
  });
});

describe('matchesCity', () => {
  it('ignores accents and case', () => {
    expect(matchesCity('A Coruña', 'coruna')).toBe(true);
    expect(matchesCity('Cádiz', 'CAD')).toBe(true);
    expect(matchesCity('Madrid', 'bar')).toBe(false);
    expect(matchesCity('Madrid', '  ')).toBe(true);
  });
});

describe('city prefs on the device', () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it('tells listeners when the city or the follow flag change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCity(listener);
    persistCity('Bilbao');
    expect(readStoredCity()).toBe('Bilbao');
    setFollowingLocation(true);
    expect(isFollowingLocation()).toBe(true);
    clearCity();
    expect(readStoredCity()).toBeNull();
    setFollowingLocation(false);
    expect(isFollowingLocation()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
    persistCity('Madrid');
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('remembers the profile city seen, per account', () => {
    expect(readProfileSeen('u1')).toBeUndefined();
    persistProfileSeen('u1', 'Madrid');
    expect(readProfileSeen('u1')).toBe('Madrid');
    expect(readProfileSeen('u2')).toBeUndefined();
    persistProfileSeen('u1', null);
    expect(readProfileSeen('u1')).toBe('');
  });
});
