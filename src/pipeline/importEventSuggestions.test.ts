import { describe, expect, it } from 'vitest';

import { normalizeStagingEvent } from '../normalize/normalizeEvent';
import { readFixture } from '../test/readFixture';
import type { ScrapeSource, StagingEventRecord } from '../types/scrape';
import { buildDecisionContext, decideByConfidence } from './confidenceDecision';
import { extractEventFromHtml } from './eventLinkExtract';
import {
  buildKnownHosts,
  decideExtraction,
  knownHostFor,
  reconcileStatus,
  toRawScrapedEvent,
} from './importEventSuggestions';
import { buildStagingRow } from './scrapeSources';

const source = (overrides: Partial<ScrapeSource>): ScrapeSource => ({
  id: 'src',
  source_type: 'venue',
  name: 'Sala',
  base_url: 'https://sala.example/',
  city: 'Madrid',
  country_code: 'ES',
  parser_key: 'json-ld-agenda',
  frequency: 'daily',
  is_active: true,
  metadata: {},
  ...overrides,
});

const trustedSuggestions = source({
  id: 'suggestions-trusted',
  source_type: 'directory',
  name: 'Sugerencias de usuarios (taquillas conocidas)',
  base_url: 'https://livespace.pages.dev/sugerencias/taquillas',
  city: null,
  is_active: false,
  metadata: { userSuggestions: true, structuredDataVerified: true, fixtureVerified: false },
});
const reviewSuggestions = source({
  ...trustedSuggestions,
  id: 'suggestions-review',
  base_url: 'https://livespace.pages.dev/sugerencias/revision',
  metadata: { userSuggestions: true, structuredDataVerified: false, fixtureVerified: false },
});

describe('known hosts', () => {
  const known = buildKnownHosts([
    trustedSuggestions,
    reviewSuggestions,
    source({ name: 'Loco Club', base_url: 'https://lococlub.es/', city: 'Valencia', metadata: { structuredDataVerified: true } }),
    // Two venues on one site: the site is known, but names no venue.
    source({ name: 'Sala A', base_url: 'https://grupo.example/a', is_active: false }),
    source({ name: 'Sala B', base_url: 'https://grupo.example/b', is_active: false }),
    source({ name: 'Agenda X', source_type: 'directory', base_url: 'https://www.agenda.example/', is_active: true }),
  ]);

  it('ticket sellers are trusted, subdomains included', () => {
    expect(knownHostFor('dice.fm', known)).toEqual({ trusted: true, venue: null });
    expect(knownHostFor('tickets.dice.fm', known)).toEqual({ trusted: true, venue: null });
    expect(knownHostFor('unknown.example', known)).toBeNull();
  });

  it('a single-venue source gives its venue; inactive multi-venue sites are known but not trusted', () => {
    expect(knownHostFor('lococlub.es', known)).toEqual({ trusted: true, venue: { name: 'Loco Club', city: 'Valencia' } });
    expect(knownHostFor('grupo.example', known)).toEqual({ trusted: false, venue: null });
    expect(knownHostFor('agenda.example', known)).toEqual({ trusted: true, venue: null });
    // The suggestion sources themselves are never a "known site".
    expect(knownHostFor('livespace.pages.dev', known)).toBeNull();
  });
});

describe('decideExtraction', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  const html = readFixture('suggestions/dice-like.html');
  const url = 'https://dice.fm/event/av7wpd-agz-siempre-10-aniversario-15th-nov-movistar-arena-madrid-tickets';

  it('stages a complete, upcoming event', () => {
    expect(decideExtraction(extractEventFromHtml(html, url), now)).toMatchObject({ action: 'stage' });
  });

  it('a past concert fails', () => {
    expect(decideExtraction(extractEventFromHtml(html, url), new Date('2026-11-16T00:00:00Z'))).toEqual({
      action: 'failed',
      error: 'past-event',
    });
  });

  it('review keeps the OpenGraph title for the reviewer', () => {
    const result = extractEventFromHtml(readFixture('suggestions/no-json-ld.html'), 'https://entradium.com/es/events/x');
    expect(decideExtraction(result, now)).toEqual({
      action: 'review',
      error: 'no-structured-data · Compra entradas para FRISBI + AGUA DE MADRID, en Sevilla | entradium, por FRISBI',
    });
  });
});

describe('staged suggestion through the normal pipeline', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  const pageUrl = 'https://entradium.com/es/events/frisbi-agua-de-madrid';
  const extraction = extractEventFromHtml(readFixture('suggestions/entradium-like.html'), pageUrl);
  if (extraction.kind !== 'event') throw new Error('fixture must extract');

  const stagingFor = (owner: ScrapeSource): StagingEventRecord => ({
    ...buildStagingRow(owner, 'run-1', toRawScrapedEvent(extraction.event, pageUrl)),
    id: 'stg-1',
    normalized_payload: null,
    confidence: null,
    review_status: 'pending',
    published_event_id: null,
    processing_error: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });

  it('keeps the same shape as other sources and carries ticket link and prices', () => {
    const row = stagingFor(trustedSuggestions);
    expect(row).toMatchObject({
      source_id: 'suggestions-trusted',
      source_url: pageUrl,
      source_event_id: pageUrl,
      extracted_title: 'Frisbi & Agua de Madrid',
      extracted_starts_at: '2026-12-12T20:00:00.000Z',
      extracted_venue_name: 'Fun Club',
      extracted_city: 'Sevilla',
      extracted_artist_names: ['Frisbi'],
    });
    const { normalizedEvent } = normalizeStagingEvent(row, trustedSuggestions);
    expect(normalizedEvent.offer).toMatchObject({
      ticketUrl: pageUrl,
      priceTiers: [
        { label: 'Entrada', price: 12 },
        { label: 'Entrada', price: 15 },
      ],
    });
    expect(normalizedEvent.imageUrl).toBe('https://cdn.entradium.example/uploads/event/poster/frisbi_l.png');
    // A ticket page is not the venue's website.
    expect(normalizedEvent.venue).toMatchObject({ name: 'Fun Club', city: 'Sevilla', websiteUrl: undefined, sourceUrl: undefined });
  });

  it('publishes from a trusted ticket site, waits for review otherwise', () => {
    for (const [owner, expected] of [
      [trustedSuggestions, { reviewStatus: 'approved', shouldPublish: true }],
      [reviewSuggestions, { reviewStatus: 'pending', shouldPublish: false }],
    ] as const) {
      const row = stagingFor(owner);
      const { normalizedEvent } = normalizeStagingEvent(row, owner);
      expect(decideByConfidence(normalizedEvent, buildDecisionContext(row, owner, now))).toMatchObject(expected);
    }
  });
});

describe('reconcileStatus', () => {
  const suggestion = { created_at: '2026-11-12T08:00:00Z' };
  const staging = { id: 'stg', review_status: 'approved', published_event_id: 'ev1', processing_error: null };

  it('published: imported when the event was created for it, duplicate when it already existed', () => {
    expect(reconcileStatus(suggestion, staging, { id: 'ev1', status: 'published', created_at: '2026-11-12T09:00:00Z' })).toEqual({
      status: 'imported',
      resultEventId: 'ev1',
      error: null,
    });
    expect(reconcileStatus(suggestion, staging, { id: 'ev1', status: 'published', created_at: '2026-10-01T09:00:00Z' })).toMatchObject({
      status: 'duplicate',
      resultEventId: 'ev1',
    });
    expect(reconcileStatus(suggestion, staging, { id: 'ev1', status: 'review', created_at: '2026-11-12T09:00:00Z' })).toBeNull();
  });

  it('rejected → failed, merged → duplicate, still pending → no change', () => {
    const base = { ...staging, published_event_id: null };
    expect(reconcileStatus(suggestion, { ...base, review_status: 'rejected' }, undefined)).toMatchObject({ status: 'failed' });
    expect(reconcileStatus(suggestion, { ...base, review_status: 'merged' }, undefined)).toMatchObject({ status: 'duplicate' });
    expect(reconcileStatus(suggestion, { ...base, review_status: 'pending' }, undefined)).toBeNull();
    expect(reconcileStatus(suggestion, undefined, undefined)).toBeNull();
  });
});
