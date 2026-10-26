import { describe, expect, it } from 'vitest';

import type { ScrapeSource, StagingEventRecord } from '../types/scrape';
import { planTriage } from './stagingTriage';

const now = new Date('2026-10-26T12:00:00Z');

const verified: ScrapeSource = {
  id: 'riviera',
  source_type: 'venue',
  name: 'La Riviera',
  base_url: 'https://salariviera.com/',
  city: 'Madrid',
  country_code: 'ES',
  parser_key: 'tribe-events-api',
  frequency: 'daily',
  is_active: true,
  metadata: { structuredDataVerified: true },
};
const jamboree: ScrapeSource = { ...verified, id: 'jamboree', name: 'Jamboree', city: 'Barcelona' };
const sources = new Map([verified, jamboree].map((source) => [source.id, source]));

let sequence = 0;
const row = (overrides: Partial<StagingEventRecord> = {}): StagingEventRecord => {
  sequence += 1;
  return {
    id: `row-${String(sequence).padStart(3, '0')}`,
    scrape_run_id: 'run',
    source_id: verified.id,
    source_url: `https://salariviera.com/e/${sequence}`,
    raw_payload: {},
    raw_hash: `hash-${sequence}`,
    source_event_id: `evt-${sequence}`,
    extracted_title: 'Love Of Lesbian',
    extracted_date_text: '14/11/2026 21:00',
    extracted_starts_at: null,
    extracted_venue_name: 'La Riviera',
    extracted_city: 'Madrid',
    extracted_artist_names: ['Love Of Lesbian'],
    normalized_payload: null,
    confidence: null,
    review_status: 'pending',
    published_event_id: null,
    processing_error: null,
    created_at: '2026-10-25T04:20:00.000Z',
    updated_at: '2026-10-25T04:20:00.000Z',
    ...overrides,
  };
};

const ruleOf = (plan: ReturnType<typeof planTriage>, id: string) =>
  plan.actions.find((action) => action.id === id)?.rule;

describe('staging triage rules', () => {
  it('merges rows whose key is already published (R1) and older pending copies (R2)', () => {
    const published = row({ source_event_id: 'same', review_status: 'approved', published_event_id: 'event-1' });
    const alreadyPublished = row({ source_event_id: 'same' });
    const older = row({ source_event_id: 'dup', created_at: '2026-10-01T04:20:00.000Z' });
    const newer = row({ source_event_id: 'dup' });

    const plan = planTriage([alreadyPublished, older, newer], [published], sources, { now });

    expect(ruleOf(plan, alreadyPublished.id)).toBe('R1');
    expect(ruleOf(plan, older.id)).toBe('R2');
    expect(ruleOf(plan, newer.id)).toBe('R5');
  });

  it('rejects past events dated against the capture (R3) and non-music (R4)', () => {
    const past = row({ extracted_date_text: '8 septiembre 20:30', created_at: '2026-08-29T04:20:00.000Z' });
    const basket = row({ extracted_title: 'Liga Endesa Jornada 7', extracted_artist_names: ['Real Madrid'] });

    const plan = planTriage([past, basket], [], sources, { now });

    expect(ruleOf(plan, past.id)).toBe('R3');
    expect(ruleOf(plan, basket.id)).toBe('R4');
  });

  it('keeps rows from unverified sources or without a source id in review', () => {
    const unverified = row({ source_id: 'clamores' });
    const noId = row({ source_event_id: null });
    const plan = planTriage(
      [unverified, noId],
      [],
      new Map([...sources, ['clamores', { ...verified, id: 'clamores', metadata: {} }]]),
      { now },
    );

    expect(ruleOf(plan, unverified.id)).toBeNull();
    expect(ruleOf(plan, noId.id)).toBeNull();
  });

  it('approves single-artist sessions only with R6 enabled and never the house series', () => {
    const quartet = row({
      source_id: jamboree.id,
      extracted_title: 'Daniel Ferruz Quartet - Jazz session',
      extracted_venue_name: 'Jamboree',
      extracted_artist_names: ['Daniel Ferruz Quartet'],
    });
    const jam = row({
      source_id: jamboree.id,
      extracted_title: 'Jamboree Jam Session',
      extracted_venue_name: 'Jamboree',
      extracted_artist_names: ['Jamboree Jam Session'],
    });

    expect(ruleOf(planTriage([quartet], [], sources, { now }), quartet.id)).toBeNull();
    const plan = planTriage([quartet, jam], [], sources, { now, includeR6: true });
    expect(ruleOf(plan, quartet.id)).toBe('R6');
    expect(ruleOf(plan, jam.id)).toBeNull();
  });
});
