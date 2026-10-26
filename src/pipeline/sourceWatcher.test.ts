import { describe, expect, it } from 'vitest';

import { assessSnapshot, isPastObservation, sourceEventKey } from './sourceWatcher';

describe('source watcher decisions', () => {
  it('does not treat an empty or collapsed snapshot as proof that events disappeared', () => {
    expect(assessSnapshot(0, 20, 0)).toMatchObject({ trustworthy: false, status: 'degraded' });
    expect(assessSnapshot(0, 20, 1)).toMatchObject({ trustworthy: false, status: 'broken' });
    expect(assessSnapshot(2, 20, 0)).toMatchObject({ trustworthy: false, reason: 'count_collapse' });
  });

  it('accepts normal source variation and creates stable fallback identities', () => {
    expect(assessSnapshot(8, 20, 0).trustworthy).toBe(true);
    const event = {
      sourceUrl: 'https://sala.test',
      title: 'Artista',
      dateText: '10/10/2026',
      venueName: 'Sala',
      rawPayload: {},
    };
    expect(sourceEventKey(event)).toBe(sourceEventKey({ ...event }));
  });

  it('only ends observations with valid dates before the maintenance instant', () => {
    const now = new Date('2026-10-26T12:00:00.000Z');
    expect(isPastObservation('2026-10-25T22:00:00.000Z', now)).toBe(true);
    expect(isPastObservation('2026-10-27T22:00:00.000Z', now)).toBe(false);
    expect(isPastObservation(null, now)).toBe(false);
    expect(isPastObservation('not-a-date', now)).toBe(false);
  });
});
