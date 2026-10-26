import { describe, expect, it } from 'vitest';

import type { RawScrapedEvent, ScrapeSource } from '../types/scrape';
import { buildStagingRow } from './scrapeSources';

const source: ScrapeSource = {
  id: 'source-1',
  source_type: 'venue',
  name: 'La Riviera',
  base_url: 'https://example.test/',
  city: 'Madrid',
  country_code: 'ES',
  parser_key: 'generic-agenda',
  frequency: 'daily',
  is_active: true,
  metadata: {},
};

const event: RawScrapedEvent = {
  sourceUrl: source.base_url,
  sourceEventUrl: 'https://example.test/event/zahara',
  sourceEventId: 'zahara-2026',
  title: 'Zahara',
  dateText: '10 octubre 2026 20:00',
  venueName: source.name,
  city: source.city || undefined,
  artistNames: ['Zahara'],
  rawPayload: { html: '<article>Zahara</article>' },
};

describe('canonical staging rows', () => {
  it('generates an identical hash for an identical second capture', () => {
    const first = buildStagingRow(source, 'run-1', event);
    const second = buildStagingRow(source, 'run-2', event);

    expect(first.raw_hash).toBe(second.raw_hash);
    expect(first.source_url).toBe(event.sourceEventUrl);
    expect(first).not.toHaveProperty('source_event_url');
  });

  it('generates a new hash when an extracted field changes', () => {
    const first = buildStagingRow(source, 'run-1', event);
    const changed = buildStagingRow(source, 'run-2', {
      ...event,
      dateText: '10 octubre 2026 21:00',
    });

    expect(changed.raw_hash).not.toBe(first.raw_hash);
  });

  it('ignores volatile parser payload when hashing', () => {
    const first = buildStagingRow(source, 'run-1', {
      ...event,
      rawPayload: { categories: [{ name: 'Jazz', count: 484 }] },
    });
    const recount = buildStagingRow(source, 'run-2', {
      ...event,
      rawPayload: { categories: [{ name: 'Jazz', count: 485 }] },
    });

    expect(recount.raw_hash).toBe(first.raw_hash);
    expect(recount.raw_payload.payload).toEqual({ categories: [{ name: 'Jazz', count: 485 }] });
  });
});
