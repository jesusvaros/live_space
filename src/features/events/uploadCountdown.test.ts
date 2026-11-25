import { describe, expect, it } from 'vitest';
import { uploadCountdown } from './uploadCountdown';

const at = (iso: string) => new Date(iso);

describe('uploadCountdown', () => {
  const start = at('2026-11-28T21:00:00Z');
  it('counts days and hours', () => {
    expect(uploadCountdown(start, at('2026-11-25T17:00:00Z'))).toBe('en 3 d 4 h');
    expect(uploadCountdown(start, at('2026-11-26T21:00:00Z'))).toBe('en 2 d');
  });
  it('counts hours and minutes on the day', () => {
    expect(uploadCountdown(start, at('2026-11-28T18:55:00Z'))).toBe('en 2 h 05 min');
    expect(uploadCountdown(start, at('2026-11-28T20:48:30Z'))).toBe('en 12 min');
  });
  it('is null once it has started', () => {
    expect(uploadCountdown(start, start)).toBeNull();
  });
});
