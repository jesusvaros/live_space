import { describe, expect, it } from 'vitest';
import { REEL_NUDGE, shouldNudge } from './reelNudge';

describe('shouldNudge', () => {
  const today = '2026-11-24';
  it('waits for the first few moments', () => {
    expect(shouldNudge(REEL_NUDGE.first - 1, REEL_NUDGE.first, { day: today, shown: 0 }, today)).toBe(false);
    expect(shouldNudge(REEL_NUDGE.first, REEL_NUDGE.first, { day: today, shown: 0 }, today)).toBe(true);
  });

  it('stops after the daily maximum and starts again the next day', () => {
    const full = { day: today, shown: REEL_NUDGE.maxPerDay };
    expect(shouldNudge(50, 15, full, today)).toBe(false);
    expect(shouldNudge(50, 15, full, '2026-11-25')).toBe(true);
  });
});
