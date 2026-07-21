import { describe, expect, it } from 'vitest';

import { assessSnapshot, sourceEventKey } from './sourceWatcher';

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
});
