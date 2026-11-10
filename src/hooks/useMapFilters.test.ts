import { describe, expect, it } from 'vitest';
import { getWhenRange, toDateInputValue } from './useMapFilters';

// Wednesday 12 November 2026, 18:00 local time.
const NOW = new Date(2026, 10, 12, 18, 0, 0);
const day = (date: Date) => toDateInputValue(date);

describe('map date ranges', () => {
  it('today and tomorrow cover the whole local day', () => {
    const [todayStart, todayEnd] = getWhenRange('today', NOW)!;
    expect([day(todayStart), todayStart.getHours(), day(todayEnd), todayEnd.getHours()]).toEqual(['2026-11-12', 0, '2026-11-12', 23]);
    const [start, end] = getWhenRange('tomorrow', NOW)!;
    expect([day(start), day(end)]).toEqual(['2026-11-13', '2026-11-13']);
  });

  it('this week runs from today to Sunday', () => {
    const [start, end] = getWhenRange('week', NOW)!;
    expect([day(start), day(end)]).toEqual(['2026-11-12', '2026-11-15']);
    // On a Sunday it is just that day.
    const [sunStart, sunEnd] = getWhenRange('week', new Date(2026, 10, 15, 10))!;
    expect([day(sunStart), day(sunEnd)]).toEqual(['2026-11-15', '2026-11-15']);
  });

  it('a picked day is that local day, and nothing without a day', () => {
    const [start, end] = getWhenRange('day', NOW, '2026-12-31')!;
    expect([day(start), day(end), end.getHours()]).toEqual(['2026-12-31', '2026-12-31', 23]);
    expect(getWhenRange('day', NOW, null)).toBeNull();
    expect(getWhenRange('all', NOW)).toBeNull();
  });
});
