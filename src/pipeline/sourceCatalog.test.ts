import { describe, expect, it } from 'vitest';

import { seedSources } from './sourceCatalog.js';

describe('pilot source catalog', () => {
  it('contains 45 unique official venue sources for the pilot cities', () => {
    expect(seedSources).toHaveLength(45);
    expect(new Set(seedSources.map((source) => source.base_url)).size).toBe(45);
    expect(new Set(seedSources.map((source) => source.city))).toEqual(new Set(['Madrid', 'Barcelona', 'Sevilla', 'Valencia']));
    expect(seedSources.every((source) => source.source_type === 'venue')).toBe(true);
  });

  it('activates only sources with reviewed terms and live parser probes', () => {
    const active = seedSources.filter((source) => source.is_active);
    expect(active.map((source) => source.name).sort()).toEqual([
      '16 Toneladas',
      'Black Note Club',
      'Café Central',
      'Café La Palma',
      'Café Libertad 8',
      'El Intruso',
      'Freedonia',
      'Fun Club',
      'Gruta 77',
      'Heliogàbal',
      'Honky Tonk',
      'Independance Club',
      'Jamboree',
      'Jimmy Glass Jazz Bar',
      'La Riviera',
      'Loco Club',
      'Luz de Gas',
      'Maravillas Club',
      'Marula Café',
      'Moby Dick Club',
      'Movistar Arena',
      'Radio City',
      'Razzmatazz',
      'Sala Apolo',
      'Sala But',
      'Sala Custom',
      'Sala El Sol',
      'Sala Galileo Galilei',
      'Sala Malandar',
      'Sala Pandora',
      'Sala Repvblicca',
      'Sala Vol',
      'Sidecar',
      'Siroco',
      'Soda Acústic',
      'Supra Music Hall',
      'Tempo Club',
      'Wolf Barcelona',
      'Wurlitzer Ballroom',
    ]);
    expect(active.every((source) => Boolean(source.terms_reviewed_at))).toBe(true);
    expect(active.every((source) => source.metadata.termsReviewStatus === 'approved')).toBe(true);
    expect(active.every((source) => source.metadata.fixtureVerified === true)).toBe(true);

    const pending = seedSources.filter((source) => !source.is_active);
    expect(pending.every((source) => source.terms_reviewed_at === null)).toBe(true);
    expect(pending.every((source) => source.metadata.fixtureVerified === false)).toBe(true);
  });
});
