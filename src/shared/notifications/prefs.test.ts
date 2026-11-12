import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PREFS,
  isNotificationTypeOn,
  notificationsSummary,
  prefsFromRow,
  readLocalPrefs,
  rowFromPrefs,
  toClock,
  writeLocalPrefs,
} from './prefs';

// Node's own (file-less) localStorage can shadow jsdom's: use a plain one.
const stubStorage = () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
};

beforeEach(stubStorage);

describe('prefsFromRow', () => {
  it('no row means the defaults: everything on, 23:00–09:00, 3 a day', () => {
    expect(prefsFromRow(null)).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS.quietStart).toBe('23:00');
    expect(DEFAULT_PREFS.quietEnd).toBe('09:00');
    expect(DEFAULT_PREFS.dailyLimit).toBe(3);
  });

  it('reads the Postgres row (time as HH:MM:SS)', () => {
    const prefs = prefsFromRow({
      profile_id: 'me',
      enabled: true,
      concert_day: false,
      upload_reminder: true,
      merch_pickup: true,
      new_moments: false,
      followed_new_concert: true,
      quiet_start: '22:30:00',
      quiet_end: '08:00:00',
      daily_limit: 5,
    });
    expect(prefs.types.concert_day).toBe(false);
    expect(prefs.types.new_moments).toBe(false);
    // A row from before the column existed: the default (on).
    expect(prefs.types.suggestion_imported).toBe(true);
    expect(prefs.quietStart).toBe('22:30');
    expect(prefs.quietEnd).toBe('08:00');
    expect(prefs.dailyLimit).toBe(5);
  });

  it('falls back per field on junk', () => {
    const prefs = prefsFromRow({ enabled: 'yes' as never, quiet_start: '25:00', daily_limit: 99 });
    expect(prefs.enabled).toBe(true);
    expect(prefs.quietStart).toBe('23:00');
    expect(prefs.dailyLimit).toBe(3);
  });
});

describe('rowFromPrefs', () => {
  it('round-trips and writes every column', () => {
    const prefs = { ...DEFAULT_PREFS, enabled: false, types: { ...DEFAULT_PREFS.types, merch_pickup: false }, quietStart: '7:05' };
    const row = rowFromPrefs(prefs, 'me');
    expect(row).toEqual({
      profile_id: 'me',
      enabled: false,
      concert_day: true,
      upload_reminder: true,
      merch_pickup: false,
      new_moments: true,
      followed_new_concert: true,
      suggestion_imported: true,
      quiet_start: '07:05',
      quiet_end: '09:00',
      daily_limit: 3,
    });
    expect(prefsFromRow(row)).toEqual({ ...prefs, quietStart: '07:05' });
  });

  it('toClock keeps HH:MM', () => {
    expect(toClock('9:00', 'x')).toBe('09:00');
    expect(toClock('23:59:59', 'x')).toBe('23:59');
    expect(toClock(null, '23:00')).toBe('23:00');
  });
});

describe('device copy', () => {
  it('local notifications follow the switches', () => {
    expect(isNotificationTypeOn('upload_reminder')).toBe(true);
    writeLocalPrefs({ ...DEFAULT_PREFS, types: { ...DEFAULT_PREFS.types, upload_reminder: false } });
    expect(isNotificationTypeOn('upload_reminder')).toBe(false);
    expect(isNotificationTypeOn('followed_new_concert')).toBe(true);
    writeLocalPrefs({ ...DEFAULT_PREFS, enabled: false });
    expect(isNotificationTypeOn('followed_new_concert')).toBe(false);
    expect(readLocalPrefs().enabled).toBe(false);
  });
});

describe('notificationsSummary (row value in Ajustes)', () => {
  it('says Activadas, Desactivadas or Sin permiso', () => {
    expect(notificationsSummary(DEFAULT_PREFS, 'granted')).toBe('Activadas');
    expect(notificationsSummary(DEFAULT_PREFS, 'denied')).toBe('Sin permiso');
    expect(notificationsSummary(DEFAULT_PREFS, 'prompt')).toBe('Sin permiso');
    expect(notificationsSummary({ ...DEFAULT_PREFS, enabled: false }, 'granted')).toBe('Desactivadas');
    expect(notificationsSummary(DEFAULT_PREFS, 'unavailable')).toBe('Activadas');
  });
});
