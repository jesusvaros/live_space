import { describe, expect, it } from 'vitest';
import { wrappedSeason } from './WrappedCard';

describe('wrappedSeason', () => {
  it('is last year until Spotify publishes the new Wrapped in December', () => {
    expect(wrappedSeason(new Date(2026, 10, 13))).toBe(2025);
    expect(wrappedSeason(new Date(2026, 10, 30, 23, 59))).toBe(2025);
    expect(wrappedSeason(new Date(2026, 11, 1))).toBe(2026);
    expect(wrappedSeason(new Date(2027, 0, 10))).toBe(2026);
  });
});
