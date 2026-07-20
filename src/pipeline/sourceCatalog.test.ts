import { describe, expect, it } from 'vitest';

import { seedSources } from './sourceCatalog.js';

describe('pilot source catalog', () => {
  it('contains 18 unique official venue sources for Madrid and Barcelona', () => {
    expect(seedSources).toHaveLength(18);
    expect(new Set(seedSources.map((source) => source.base_url)).size).toBe(18);
    expect(new Set(seedSources.map((source) => source.city))).toEqual(new Set(['Madrid', 'Barcelona']));
    expect(seedSources.every((source) => source.source_type === 'venue')).toBe(true);
  });

  it('activates only sources with reviewed terms and live parser probes', () => {
    const active = seedSources.filter((source) => source.is_active);
    expect(active.map((source) => source.name).sort()).toEqual([
      'Independance Club',
      'Jamboree',
      'La Riviera',
      'Movistar Arena',
      'Razzmatazz',
      'Sala Apolo',
      'Sala But',
      'Sala El Sol',
      'Siroco',
    ]);
    expect(active.every((source) => Boolean(source.terms_reviewed_at))).toBe(true);
    expect(active.every((source) => source.metadata.termsReviewStatus === 'approved')).toBe(true);
    expect(active.every((source) => source.metadata.fixtureVerified === true)).toBe(true);

    const pending = seedSources.filter((source) => !source.is_active);
    expect(pending.every((source) => source.terms_reviewed_at === null)).toBe(true);
    expect(pending.every((source) => source.metadata.fixtureVerified === false)).toBe(true);
  });
});
