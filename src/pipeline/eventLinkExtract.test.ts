import { describe, expect, it } from 'vitest';

import { readFixture } from '../test/readFixture';
import { extractEventFromHtml, schemaDateToIso } from './eventLinkExtract';

const fixture = (name: string) => readFixture(`suggestions/${name}`);

describe('extractEventFromHtml', () => {
  it('reads a ticket-site Event (Entradium-like JSON-LD)', () => {
    const result = extractEventFromHtml(fixture('entradium-like.html'), 'https://entradium.com/es/events/frisbi-agua-de-madrid');
    expect(result.kind).toBe('event');
    if (result.kind !== 'event') return;
    expect(result.event).toMatchObject({
      url: 'https://entradium.com/es/events/frisbi-agua-de-madrid',
      title: 'Frisbi & Agua de Madrid',
      startsAt: '2026-12-12T20:00:00.000Z',
      schemaType: 'Event',
      venueName: 'Fun Club',
      venueFromSource: false,
      city: 'Sevilla',
      countryCode: 'ES',
      streetAddress: 'Alameda de Hércules, 61',
      artistNames: ['Frisbi'],
      imageUrl: 'https://cdn.entradium.example/uploads/event/poster/frisbi_l.png',
      ticketUrl: 'https://entradium.com/es/events/frisbi-agua-de-madrid',
      prices: [12, 15],
      isFree: false,
    });
  });

  it('finds a MusicEvent inside @graph, with several performers, a text address and geo', () => {
    const result = extractEventFromHtml(fixture('graph-music-event.html'), 'https://salaejemplo.es/eventos/noche-de-bandas/?utm_source=x');
    expect(result.kind).toBe('event');
    if (result.kind !== 'event') return;
    expect(result.event).toMatchObject({
      // The @id carries a fragment: the fetched page is the identity.
      url: 'https://salaejemplo.es/eventos/noche-de-bandas/?utm_source=x',
      title: 'Noche de Bandas: Los Planetas Menores, Rayo Verde y Tú',
      // No offset → Madrid time (21:30 CET = 20:30 UTC).
      startsAt: '2026-12-05T20:30:00.000Z',
      schemaType: 'MusicEvent',
      venueName: 'Sala Ejemplo',
      city: 'Madrid',
      latitude: 40.4251,
      longitude: -3.7012,
      // A repeat in another case is dropped; strings count as names.
      artistNames: ['Los Planetas Menores', 'Rayo Verde', 'Tú'],
      imageUrl: 'https://salaejemplo.es/wp-content/uploads/2026/10/noche-de-bandas.jpg',
      ticketUrl: 'https://tickets.example/noche-de-bandas',
      prices: [10, 18.5],
    });
  });

  it('reads a DICE-like MusicEvent next to Organization and WebSite blocks', () => {
    const pageUrl = 'https://dice.fm/event/av7wpd-agz-siempre-10-aniversario-15th-nov-movistar-arena-madrid-tickets';
    const result = extractEventFromHtml(fixture('dice-like.html'), pageUrl);
    expect(result.kind).toBe('event');
    if (result.kind !== 'event') return;
    expect(result.event).toMatchObject({
      url: pageUrl,
      title: 'AGZ "Siempre" 10º Aniversario',
      startsAt: '2026-11-15T18:30:00.000Z',
      venueName: 'Movistar Arena',
      city: 'Madrid',
      artistNames: ['Agorazein'],
      prices: [47.4],
      // No offer URL: the ticket link falls back to the page at staging time.
      ticketUrl: undefined,
    });
  });

  it('a venue website with an empty location uses the venue of the source we scrape there', () => {
    const html = fixture('venue-site-empty-location.html');
    const pageUrl = 'https://lococlub.es/events/axolotes-mexicanos/';

    const withoutFallback = extractEventFromHtml(html, pageUrl);
    expect(withoutFallback).toMatchObject({ kind: 'review', reason: 'missing-venue' });

    const result = extractEventFromHtml(html, pageUrl, { venueFallback: { name: 'Loco Club', city: 'Valencia' } });
    expect(result.kind).toBe('event');
    if (result.kind !== 'event') return;
    expect(result.event).toMatchObject({
      title: 'AXOLOTES MEXICANOS',
      venueName: 'Loco Club',
      venueFromSource: true,
      city: 'Valencia',
      // Raw line breaks inside the JSON string do not break the parse.
      description: 'APERTURA/DOORS 21:00 H. Vuelven AXOLOTES MEXICANOS a València.',
      // From the title (no performer); casing is fixed by the normalizer.
      artistNames: ['AXOLOTES MEXICANOS'],
      prices: [16, 20],
    });
  });

  it('a page without JSON-LD goes to review with its OpenGraph title and image (never published)', () => {
    const result = extractEventFromHtml(fixture('no-json-ld.html'), 'https://entradium.com/es/events/frisbi-agua-de-madrid');
    expect(result).toMatchObject({
      kind: 'review',
      reason: 'no-structured-data',
      openGraph: {
        title: 'Compra entradas para FRISBI + AGUA DE MADRID, en Sevilla | entradium, por FRISBI',
        imageUrl: 'https://d2il8hfach02z9.cloudfront.example/uploads/event/poster/event_l_cartel.png?v=1791881182',
      },
    });
  });

  it('a page whose JSON-LD describes something else fails', () => {
    const result = extractEventFromHtml(fixture('non-event.html'), 'https://dice.fm/browse/madrid');
    expect(result).toMatchObject({ kind: 'failed', reason: 'not-an-event' });
  });

  it('an agenda with several events goes to review', () => {
    const result = extractEventFromHtml(fixture('agenda-several-events.html'), 'https://salaejemplo.es/agenda/');
    expect(result).toMatchObject({ kind: 'review', reason: 'several-events:2' });
  });

  it('an agenda page still resolves the event whose url is the link', () => {
    const result = extractEventFromHtml(fixture('agenda-several-events.html'), 'https://salaejemplo.es/eventos/banda-dos/');
    expect(result).toMatchObject({ kind: 'event', event: { title: 'Banda Dos' } });
  });

  it('cancelled → failed; postponed or abroad → review; online only → failed', () => {
    const page = (event: Record<string, unknown>) =>
      `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'MusicEvent',
        name: 'Banda',
        startDate: '2026-12-01T21:00:00+01:00',
        location: { '@type': 'Place', name: 'Sala', address: { addressLocality: 'Madrid' } },
        ...event,
      })}</script>`;
    const url = 'https://tickets.example/e/1';
    expect(extractEventFromHtml(page({ eventStatus: 'https://schema.org/EventCancelled' }), url)).toMatchObject({
      kind: 'failed',
      reason: 'cancelled',
    });
    expect(extractEventFromHtml(page({ eventStatus: 'EventPostponed' }), url)).toMatchObject({ kind: 'review' });
    expect(
      extractEventFromHtml(page({ location: { '@type': 'Place', name: 'Paradiso', address: { addressCountry: 'NL' } } }), url),
    ).toMatchObject({ kind: 'review', reason: 'outside-spain:NL' });
    expect(extractEventFromHtml(page({ location: { '@type': 'VirtualLocation', url: 'https://stream.example' } }), url)).toMatchObject({
      kind: 'failed',
      reason: 'online-event',
    });
    expect(extractEventFromHtml(page({ startDate: undefined }), url)).toMatchObject({ kind: 'review', reason: 'missing-start-date' });
    expect(extractEventFromHtml(page({ isAccessibleForFree: true }), url)).toMatchObject({ kind: 'event', event: { isFree: true } });
  });
});

describe('schemaDateToIso', () => {
  it('reads dates without an offset in Madrid time', () => {
    expect(schemaDateToIso('2026-07-04')).toBe('2026-07-04T18:00:00.000Z');
    expect(schemaDateToIso('2026-07-04T21:30:00')).toBe('2026-07-04T19:30:00.000Z');
    expect(schemaDateToIso('2026-07-04T21:30:00+2:00')).toBe('2026-07-04T19:30:00.000Z');
    expect(schemaDateToIso('2026-07-04T19:30:00Z')).toBe('2026-07-04T19:30:00.000Z');
    expect(schemaDateToIso('pronto')).toBeNull();
  });
});
