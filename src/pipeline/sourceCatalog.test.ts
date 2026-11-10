import { describe, expect, it } from 'vitest';

import { seedSources } from './sourceCatalog.js';

describe('pilot source catalog', () => {
  it('contains 53 unique official venue sources', () => {
    expect(seedSources).toHaveLength(53);
    expect(new Set(seedSources.map((source) => source.base_url)).size).toBe(53);
    expect(new Set(seedSources.map((source) => source.city))).toEqual(new Set([
      'Madrid', 'Barcelona', 'Sevilla', 'Valencia',
      'Bilbao', 'Granada', 'Murcia', 'San Sebastián', 'Santander', 'Vigo', 'Zaragoza',
    ]));
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
      'Dabadaba',
      'El Intruso',
      'Escenario Santander',
      'Freedonia',
      'Fun Club',
      'Garaje Beat Club',
      'Gruta 77',
      'Heliogàbal',
      'Honky Tonk',
      'Independance Club',
      'Jamboree',
      'Jimmy Glass Jazz Bar',
      'Kafe Antzokia',
      'La Riviera',
      'Loco Club',
      'Luz de Gas',
      'Maravillas Club',
      'Marula Café',
      'Moby Dick Club',
      'Movistar Arena',
      'Radio City',
      'Razzmatazz',
      'Rock & Blues Café',
      'Sala Apolo',
      'Sala But',
      'Sala Custom',
      'Sala El Sol',
      'Sala Galileo Galilei',
      'Sala Malandar',
      'Sala Pandora',
      'Sala Planta Baja',
      'Sala Repvblicca',
      'Sala Vol',
      'Sidecar',
      'Siroco',
      'Soda Acústic',
      'Supersonic Vigo',
      'Supra Music Hall',
      'Taberna J&J',
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

  it('activates the eight local-scene sources outside the pilot cities, reviewed', () => {
    const elsewhere = seedSources.filter((source) => !['Madrid', 'Barcelona', 'Sevilla', 'Valencia'].includes(source.city));
    expect(elsewhere).toHaveLength(8);
    expect(elsewhere.every((source) => source.is_active && source.metadata.termsReviewStatus === 'approved')).toBe(true);
  });
});
