import { describe, expect, it } from 'vitest';

import { mapShopifyConcert } from './shopifyConcertsParser.js';

const source = {
  base_url: 'https://independanceclub.com/pages/conciertos',
  name: 'Independance Club',
  city: 'Madrid',
};

describe('mapShopifyConcert', () => {
  it('maps an official Shopify concert and isolates the artist from the ticket title', () => {
    expect(mapShopifyConcert({
      id: 15348385022275,
      title: '2026 BANG YOUGGUK WORLD TOUR - JUEVES 10 SEPTIEMBRE',
      handle: '2026-bang-yougguk-world-tour-jueves-10-septiembre',
      body_html: '<p>Única fecha en Madrid &amp; acceso desde las 19H.</p>',
    }, source)).toMatchObject({
      sourceEventId: '15348385022275',
      title: '2026 BANG YOUGGUK WORLD TOUR - JUEVES 10 SEPTIEMBRE',
      description: 'Única fecha en Madrid & acceso desde las 19H.',
      dateText: '2026 BANG YOUGGUK WORLD TOUR - JUEVES 10 SEPTIEMBRE',
      artistNames: ['BANG YOUGGUK'],
      venueName: 'Independance Club',
      city: 'Madrid',
    });
  });

  it('keeps multi-artist bills ambiguous for human review', () => {
    expect(mapShopifyConcert({
      id: 2,
      title: 'ARPAVIEJAS + SUZIO 13 - SABADO 24 DE OCTUBRE A LAS 19H',
      handle: 'arpaviejas-suzio-13',
    }, source)?.artistNames).toEqual(['ARPAVIEJAS + SUZIO 13']);
  });

  it('rejects products without a dated concert title', () => {
    expect(mapShopifyConcert({ id: 3, title: 'Entrada genérica', handle: 'entrada' }, source)).toBeNull();
  });

  it('keeps volatile Shopify timestamps out of the staging payload', () => {
    const product = {
      id: 4,
      title: 'TORO - VIERNES 06 NOVIEMBRE A LAS 20H',
      handle: 'toro-viernes-06-noviembre-a-las-20h',
      updated_at: '2026-07-21T00:14:00+02:00',
      variants: [{ updated_at: '2026-07-21T00:14:00+02:00' }],
    };
    const event = mapShopifyConcert(product, source);

    expect(event?.rawPayload).toEqual({
      id: 4,
      title: 'TORO - VIERNES 06 NOVIEMBRE A LAS 20H',
      handle: 'toro-viernes-06-noviembre-a-las-20h',
      body_html: undefined,
      product_type: undefined,
      tags: undefined,
    });
  });
});
