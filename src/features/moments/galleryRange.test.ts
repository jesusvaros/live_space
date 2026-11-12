import { describe, expect, it } from 'vitest';
import { concertGalleryRange, dayLabel, groupByDay, preselectedIds } from './galleryRange';

// Saturday 3 Oct 2026, 21:00–23:30 in Madrid (CEST, UTC+2).
const CONCERT = { startsAt: '2026-10-03T19:00:00Z', endsAt: '2026-10-03T21:30:00Z', timeZone: 'Europe/Madrid' };

describe('concertGalleryRange', () => {
  it('spans from the day before at 00:00 to the day after at 23:59 in the venue zone', () => {
    const range = concertGalleryRange(CONCERT);
    expect(range.from.toISOString()).toBe('2026-10-01T22:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-10-04T21:59:59.999Z');
  });

  it('uses the end day when the night runs past midnight', () => {
    const range = concertGalleryRange({ ...CONCERT, startsAt: '2026-10-03T21:00:00Z', endsAt: '2026-10-03T23:30:00Z' });
    // Ends at 01:30 on Sunday 4 in Madrid: the day after is Monday 5.
    expect(range.from.toISOString()).toBe('2026-10-01T22:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-10-05T21:59:59.999Z');
  });

  it('without an end, the day after the start', () => {
    const range = concertGalleryRange({ ...CONCERT, endsAt: null });
    expect(range.to.toISOString()).toBe('2026-10-04T21:59:59.999Z');
  });

  it('follows a DST change inside the range', () => {
    // Saturday 24 Oct 2026; clocks go back on Sunday 25 (CEST → CET).
    const range = concertGalleryRange({ startsAt: '2026-10-24T19:00:00Z', endsAt: null, timeZone: 'Europe/Madrid' });
    expect(range.from.toISOString()).toBe('2026-10-22T22:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-10-25T22:59:59.999Z');
  });

  it('honours other zones and falls back to Madrid for a missing or bad one', () => {
    const ny = concertGalleryRange({ startsAt: '2026-10-04T01:00:00Z', endsAt: null, timeZone: 'America/New_York' });
    // 21:00 on Saturday 3 in New York (EDT, UTC−4).
    expect(ny.from.toISOString()).toBe('2026-10-02T04:00:00.000Z');
    expect(ny.to.toISOString()).toBe('2026-10-05T03:59:59.999Z');
    expect(concertGalleryRange({ ...CONCERT, timeZone: 'Not/AZone' })).toEqual(concertGalleryRange(CONCERT));
    expect(concertGalleryRange({ ...CONCERT, timeZone: null })).toEqual(concertGalleryRange(CONCERT));
  });
});

describe('groupByDay', () => {
  it('groups oldest first by local day and marks the concert day', () => {
    const days = groupByDay(
      [
        { id: 'sun', createdAt: '2026-10-04T10:00:00Z' },
        { id: 'show', createdAt: '2026-10-03T20:00:00Z' },
        // 00:30 on Saturday in Madrid, still Friday in UTC.
        { id: 'late-fri', createdAt: '2026-10-02T22:30:00Z' },
        { id: 'fri', createdAt: '2026-10-02T09:00:00Z' },
      ],
      CONCERT,
    );
    expect(days.map(day => [day.label, day.assets.map(asset => asset.id)])).toEqual([
      ['Viernes 2 oct', ['fri']],
      ['Sábado 3 oct · día del concierto', ['late-fri', 'show']],
      ['Domingo 4 oct', ['sun']],
    ]);
    expect(days.map(day => day.concertDay)).toEqual([false, true, false]);
  });

  it('labels without the dot of abbreviated months', () => {
    expect(dayLabel('2026-09-05T12:00:00Z', 'Europe/Madrid')).toMatch(/^Sábado 5 sept?$/);
  });
});

describe('preselectedIds', () => {
  it('ticks only what was taken during the concert (doors to an hour after the end)', () => {
    const ids = preselectedIds(
      [
        { id: 'afternoon', createdAt: '2026-10-03T12:00:00Z' },
        { id: 'doors', createdAt: '2026-10-03T17:30:00Z' },
        { id: 'encore', createdAt: '2026-10-03T21:45:00Z' },
        { id: 'next-day', createdAt: '2026-10-04T09:00:00Z' },
      ],
      CONCERT,
    );
    expect([...ids]).toEqual(['doors', 'encore']);
  });
});
