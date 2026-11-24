import { describe, expect, it } from 'vitest';
import { isLive, ticketIsLive } from './ConcertDock';

const HOUR = 60 * 60 * 1000;
const start = Date.parse('2026-11-24T21:00:00Z');
const order = (expiresAt: string | null) => ({
  expiresAt,
  event: { name: 'Lobo', startsAt: new Date(start).toISOString(), endsAt: null, venueName: null, city: null },
});

describe('isLive', () => {
  it('floats the code from three hours before the concert until the reservation is released', () => {
    const o = order('2026-11-25T03:00:00Z');
    expect(isLive(o, start - 4 * HOUR)).toBe(false);
    expect(isLive(o, start - 2 * HOUR)).toBe(true);
    expect(isLive(o, start + 5 * HOUR)).toBe(true);
    expect(isLive(o, start + 7 * HOUR)).toBe(false);
  });

  it('without an expiry, keeps it for ten hours after the start', () => {
    expect(isLive(order(null), start + 9 * HOUR)).toBe(true);
    expect(isLive(order(null), start + 11 * HOUR)).toBe(false);
  });

  it('never floats an order without its concert', () => {
    expect(isLive({ expiresAt: null, event: null }, start)).toBe(false);
  });
});

describe('ticketIsLive', () => {
  const startsAt = '2026-12-01T21:00:00Z';
  const at = (iso: string) => Date.parse(iso);
  it('floats from 3 h before doors to 6 h after', () => {
    expect(ticketIsLive({ startsAt }, at('2026-12-01T17:59:00Z'))).toBe(false);
    expect(ticketIsLive({ startsAt }, at('2026-12-01T18:00:00Z'))).toBe(true);
    expect(ticketIsLive({ startsAt }, at('2026-12-02T03:00:00Z'))).toBe(true);
    expect(ticketIsLive({ startsAt }, at('2026-12-02T03:01:00Z'))).toBe(false);
  });
});
