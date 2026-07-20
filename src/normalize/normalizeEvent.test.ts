import { describe, expect, it } from 'vitest';
import type { ScrapeSource, StagingEventRecord } from '../types/scrape';
import { normalizeStagingEvent, parseDateTextToIso } from './normalizeEvent';

describe('Madrid event dates', () => {
  it('uses the Europe/Madrid summer offset', () => {
    expect(parseDateTextToIso('17 julio 2026 20:30')).toBe('2026-07-17T18:30:00.000Z');
  });

  it('uses the Europe/Madrid winter offset', () => {
    expect(parseDateTextToIso('10 diciembre 2026 20:30')).toBe('2026-12-10T19:30:00.000Z');
  });

  it('rolls an undated past month into the next year', () => {
    expect(parseDateTextToIso('10 enero 20:00', new Date('2026-07-17T12:00:00Z'))).toBe(
      '2027-01-10T19:00:00.000Z',
    );
  });
});

describe('verified structured events', () => {
  it('auto-publish confidence applies only to complete, unambiguous official records', () => {
    const source = {
      id: 'source',
      source_type: 'venue',
      name: 'La Riviera',
      base_url: 'https://salariviera.com/conciertossalariviera/',
      city: 'Madrid',
      country_code: 'ES',
      parser_key: 'tribe-events-api',
      frequency: 'daily',
      is_active: true,
      metadata: { structuredDataVerified: true },
    } satisfies ScrapeSource;
    const record = {
      source_event_id: '40643',
      extracted_title: 'Jet',
      extracted_date_text: '23/07/2026 20:30',
      extracted_starts_at: null,
      extracted_venue_name: 'La Riviera',
      extracted_city: 'Madrid',
      extracted_artist_names: ['Jet'],
      raw_payload: {},
    } as StagingEventRecord;

    expect(normalizeStagingEvent(record, source).normalizedEvent.confidence).toBe(0.97);
    expect(normalizeStagingEvent({
      ...record,
      extracted_artist_names: ['Editors + Big Sleep'],
    }, source).normalizedEvent.confidence).toBeLessThan(0.95);
  });
});
