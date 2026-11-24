import { describe, expect, it } from 'vitest';
import { FEED_MIN_MOMENTS, showThisWeek, thisWeekEvents } from './thisWeekRules';
import { goingLabel } from '../events/goingCounts';

const now = Date.parse('2026-11-24T18:00:00Z');
const at = (iso: string) => ({ starts_at: iso });

describe('showThisWeek', () => {
  it('waits for the count, then shows the week while moments are few', () => {
    expect(showThisWeek(null)).toBe(false);
    expect(showThisWeek(0)).toBe(true);
    expect(showThisWeek(FEED_MIN_MOMENTS - 1)).toBe(true);
    expect(showThisWeek(FEED_MIN_MOMENTS)).toBe(false);
  });
});

describe('thisWeekEvents', () => {
  it('keeps tonight and the next 7 days, soonest first', () => {
    const list = thisWeekEvents(
      [
        at('2026-12-02T20:00:00Z'), // 8 days ahead: out
        at('2026-11-25T21:00:00Z'),
        at('2026-11-24T15:00:00Z'), // 3 h ago: still tonight
        at('2026-11-24T10:00:00Z'), // 8 h ago: out
      ],
      now,
    );
    expect(list.map(event => event.starts_at)).toEqual(['2026-11-24T15:00:00Z', '2026-11-25T21:00:00Z']);
  });
});

describe('goingLabel', () => {
  it('only from 2 people', () => {
    expect(goingLabel(undefined)).toBeNull();
    expect(goingLabel(1)).toBeNull();
    expect(goingLabel(2)).toBe('2 van');
  });
});
