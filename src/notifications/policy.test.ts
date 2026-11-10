import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../shared/notifications/prefs';
import { concertDayNotice, dedupeKey, followedNotice, uploadReminderNotice } from './candidates';
import { decide, resolvePrefs, sentInLastDay, userTimezone } from './policy';
import { clockLabel, isInQuietHours, localParts, nightDate } from './time';
import type { Device, EventInfo, SentRow } from './types';

const event: EventInfo = {
  id: 'ev1',
  name: 'Gira 2026',
  startsAt: '2026-11-14T20:30:00Z', // 21:30 in Madrid
  endsAt: null,
  city: 'Madrid',
  venueName: 'La Riviera',
  venuePlaceId: 'v1',
  festivalId: null,
  artistIds: ['a1'],
  headliner: 'Morat',
  announcedAt: '2026-11-01T10:00:00Z',
};
const device = (overrides: Partial<Device> = {}): Device => ({
  id: 'd1',
  token: 't1',
  platform: 'android',
  timezone: 'Europe/Madrid',
  createdAt: '2026-10-01T00:00:00Z',
  lastSeenAt: '2026-11-10T00:00:00Z',
  ...overrides,
});
const prefs = () => resolvePrefs(null);

describe('quiet hours', () => {
  it('handles overnight ranges, same-day ranges and «no quiet hours»', () => {
    const m = (h: number, min = 0) => h * 60 + min;
    expect(isInQuietHours(m(23), '23:00', '09:00')).toBe(true);
    expect(isInQuietHours(m(2), '23:00', '09:00')).toBe(true);
    expect(isInQuietHours(m(8, 59), '23:00', '09:00')).toBe(true);
    expect(isInQuietHours(m(9), '23:00', '09:00')).toBe(false);
    expect(isInQuietHours(m(22, 59), '23:00', '09:00')).toBe(false);
    expect(isInQuietHours(m(14), '13:00', '16:00')).toBe(true);
    expect(isInQuietHours(m(16), '13:00', '16:00')).toBe(false);
    expect(isInQuietHours(m(3), '00:00', '00:00')).toBe(false);
    expect(isInQuietHours(m(3), 'nonsense', '09:00')).toBe(false);
  });

  it('reads the clock in the device timezone', () => {
    const now = new Date('2026-11-14T07:30:00Z');
    expect(localParts(now, 'Europe/Madrid')).toMatchObject({ date: '2026-11-14', hour: 8, minute: 30 });
    expect(localParts(now, 'America/Mexico_City')).toMatchObject({ date: '2026-11-14', hour: 1 });
    expect(localParts(now, 'Atlantic/Canary')).toMatchObject({ hour: 7 });
    // Unknown timezone → Europe/Madrid.
    expect(localParts(now, 'Mars/Olympus')).toMatchObject({ hour: 8 });
    expect(clockLabel(event.startsAt, 'Europe/Madrid')).toBe('21:30');
  });

  it('a show after midnight belongs to the previous night', () => {
    expect(nightDate('2026-11-14T23:30:00Z', 'Europe/Madrid')).toBe('2026-11-14'); // 00:30 on the 15th
    expect(nightDate('2026-11-14T20:30:00Z', 'Europe/Madrid')).toBe('2026-11-14');
  });
});

describe('prefs', () => {
  it('no row = the column defaults; partial rows keep the defaults', () => {
    expect(resolvePrefs(null)).toEqual(DEFAULT_PREFS);
    const partial = resolvePrefs({ concert_day: false, quiet_start: '22:30:00', daily_limit: 99 });
    expect(partial.types.concert_day).toBe(false);
    expect(partial.types.upload_reminder).toBe(true);
    expect(partial.quietStart).toBe('22:30');
    expect(partial.quietEnd).toBe('09:00');
    expect(partial.dailyLimit).toBe(3);
  });

  it('uses the timezone of the most recently seen device', () => {
    expect(
      userTimezone([
        device({ timezone: 'America/Bogota', lastSeenAt: '2026-11-01T00:00:00Z' }),
        device({ timezone: 'Atlantic/Canary', lastSeenAt: '2026-11-09T00:00:00Z' }),
      ]),
    ).toBe('Atlantic/Canary');
    expect(userTimezone([device({ timezone: null })])).toBe('Europe/Madrid');
    expect(userTimezone([])).toBe('Europe/Madrid');
  });
});

describe('dedupe keys', () => {
  it('are stable per type and object', () => {
    expect(dedupeKey('concert_day', 'ev1')).toBe('concert_day:ev1');
    expect(concertDayNotice('p1', event, 'Europe/Madrid').dedupeKey).toBe('concert_day:ev1');
    expect(uploadReminderNotice('p1', event).dedupeKey).toBe('upload_reminder:ev1');
    const second = { ...event, id: 'ev2' };
    const one = followedNotice('p1', [event, second], 'Europe/Madrid').dedupeKey;
    expect(one).toMatch(/^followed_new_concert:batch:/);
    expect(followedNotice('p1', [second, event], 'Europe/Madrid').dedupeKey).toBe(one);
    expect(followedNotice('p1', [event], 'Europe/Madrid').dedupeKey).toBe('followed_new_concert:ev1');
  });
});

describe('decide', () => {
  // 14:00 in Madrid on the day of the concert.
  const now = new Date('2026-11-14T13:00:00Z');
  const notice = concertDayNotice('p1', event, 'Europe/Madrid');
  const base = { notices: [notice], devices: [device()], prefs: prefs(), sent: [] as SentRow[], timezone: 'Europe/Madrid', now };
  const reason = (input: Partial<typeof base>) => {
    const [decision] = decide({ ...base, ...input });
    return decision.send ? 'send' : decision.reason;
  };

  it('sends inside the window with defaults', () => {
    expect(reason({})).toBe('send');
  });

  it('skips people without devices, with everything off, or with the type off', () => {
    expect(reason({ devices: [] })).toBe('no_device');
    expect(reason({ prefs: { ...prefs(), enabled: false } })).toBe('disabled');
    expect(reason({ prefs: { ...prefs(), types: { ...prefs().types, concert_day: false } } })).toBe('type_off');
  });

  it('never repeats a dedupe key', () => {
    expect(reason({ sent: [{ type: 'concert_day', dedupeKey: 'concert_day:ev1', sentAt: '2026-11-14T12:00:00Z', payload: {} }] })).toBe(
      'already_sent',
    );
  });

  it('respects the local window and quiet hours', () => {
    expect(reason({ now: new Date('2026-11-14T09:00:00Z') })).toBe('outside_window'); // 10:00
    expect(reason({ now: new Date('2026-11-14T17:30:00Z') })).toBe('outside_window'); // 18:30
    // 14:00 Madrid, but the person set quiet hours 13:00–16:00.
    expect(reason({ prefs: { ...prefs(), quietStart: '13:00', quietEnd: '16:00' } })).toBe('quiet_hours');
    // Same instant read in Mexico City is 07:00 → outside the window.
    expect(reason({ timezone: 'America/Mexico_City' })).toBe('outside_window');
  });

  it('does not announce a concert that already started', () => {
    const early = { ...notice, expiresAt: '2026-11-14T12:00:00Z' };
    expect(reason({ notices: [early] })).toBe('expired');
  });

  it('counts the last 24 h for daily_limit, ignoring failed sends', () => {
    const row = (hoursAgo: number, status = 'sent'): SentRow => ({
      type: 'followed_new_concert',
      dedupeKey: `x:${hoursAgo}:${status}`,
      sentAt: new Date(now.getTime() - hoursAgo * 3600_000).toISOString(),
      payload: { status },
    });
    const sent = [row(1), row(5), row(20, 'failed'), row(30)];
    expect(sentInLastDay(sent, now)).toBe(2);
    expect(reason({ sent, prefs: { ...prefs(), dailyLimit: 2 } })).toBe('daily_limit');
    expect(reason({ sent, prefs: { ...prefs(), dailyLimit: 3 } })).toBe('send');
    expect(reason({ prefs: { ...prefs(), dailyLimit: 0 } })).toBe('daily_limit');
  });

  it('sends at most one notice per person per run', () => {
    const other = { ...notice, dedupeKey: 'concert_day:ev2' };
    const decisions = decide({ ...base, notices: [notice, other] });
    expect(decisions.map(decision => (decision.send ? 'send' : decision.reason))).toEqual(['send', 'one_per_run']);
  });
});
