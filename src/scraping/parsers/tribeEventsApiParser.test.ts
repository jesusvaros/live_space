import { describe, expect, it } from 'vitest';
import { mapTribeEvent } from './tribeEventsApiParser.js';

describe('mapTribeEvent', () => {
  it('maps an official Tribe event and preserves the Madrid wall-clock time', () => {
    expect(mapTribeEvent({
      id: 40643,
      title: 'Jet',
      description: '<p>Apertura de puertas &amp; concierto</p>',
      url: 'https://salariviera.com/event/jet/',
      start_date: '2026-07-23 20:30:00',
    }, 'https://salariviera.com/conciertossalariviera/', 'La Riviera', 'Madrid')).toMatchObject({
      sourceEventId: '40643',
      title: 'Jet',
      description: 'Apertura de puertas & concierto',
      dateText: '23/07/2026 20:30',
      venueName: 'La Riviera',
      city: 'Madrid',
      artistNames: ['Jet'],
    });
  });

  it('rejects entries without a title or date', () => {
    expect(mapTribeEvent({ id: 1, title: 'Sin fecha' }, 'https://example.com', 'Sala')).toBeNull();
  });

  it('keeps status labels out of artist identities and decodes ampersands', () => {
    expect(mapTribeEvent({
      id: 2,
      title: 'Jesse &#038; Joy (Sold Out)',
      start_date: '2026-10-10 21:00:00',
    }, 'https://example.com', 'La Riviera')?.artistNames).toEqual(['Jesse & Joy']);
  });
});
