import { describe, expect, it } from 'vitest';

import { shouldCloseMissingObservation } from './runScraperMaintenance.js';

describe('scraper maintenance decisions', () => {
  const now = new Date('2026-10-26T12:00:00.000Z');

  it('closes observations after their concert date', () => {
    expect(shouldCloseMissingObservation({
      starts_at: '2026-10-25T20:00:00.000Z',
      last_seen_at: '2026-10-25T10:00:00.000Z',
    }, now)).toBe(true);
  });

  it('keeps future observations open', () => {
    expect(shouldCloseMissingObservation({
      starts_at: '2026-11-25T20:00:00.000Z',
      last_seen_at: '2026-09-01T10:00:00.000Z',
    }, now)).toBe(false);
  });

  it('closes undated observations only after thirty days without seeing them', () => {
    expect(shouldCloseMissingObservation({
      starts_at: null,
      last_seen_at: '2026-09-20T10:00:00.000Z',
    }, now)).toBe(true);
    expect(shouldCloseMissingObservation({
      starts_at: null,
      last_seen_at: '2026-10-20T10:00:00.000Z',
    }, now)).toBe(false);
  });
});
