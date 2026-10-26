import { describe, expect, it } from 'vitest';

import type { NormalizedEvent } from '../types/domain';
import { decideByConfidence, type DecisionContext } from './confidenceDecision';

const eventAt = (confidence: number): NormalizedEvent => ({
  canonicalName: 'Zahara en La Riviera',
  normalizedName: 'zahara en la riviera',
  startsAt: '2026-10-10T18:00:00.000Z',
  city: 'Madrid',
  eventType: 'concert',
  sourceUrl: 'https://example.test/events/zahara',
  artists: [
    {
      rawName: 'Zahara',
      normalizedName: 'zahara',
      displayName: 'Zahara',
      confidence: 1,
    },
  ],
  venue: {
    name: 'La Riviera',
    normalizedName: 'la riviera',
    city: 'Madrid',
    confidence: 1,
  },
  confidence,
});

describe('deterministic staging decisions', () => {
  it('auto-approves only confidence at or above 0.95', () => {
    expect(decideByConfidence(eventAt(0.95))).toMatchObject({
      reviewStatus: 'approved',
      shouldPublish: true,
    });
  });

  it('retains confidence from 0.75 through 0.94 for human review', () => {
    expect(decideByConfidence(eventAt(0.75))).toMatchObject({
      reviewStatus: 'pending',
      shouldPublish: false,
    });
    expect(decideByConfidence(eventAt(0.9499))).toMatchObject({
      reviewStatus: 'pending',
      shouldPublish: false,
    });
  });

  it('rejects lower-confidence and incomplete events without publishing', () => {
    expect(decideByConfidence(eventAt(0.7499))).toMatchObject({
      reviewStatus: 'rejected',
      shouldPublish: false,
    });
    expect(decideByConfidence({ ...eventAt(1), startsAt: null })).toMatchObject({
      reviewStatus: 'rejected',
      shouldPublish: false,
    });
  });

  it('applies source context: past and non-music rejected, trusted sources approved from 0.90', () => {
    const context: DecisionContext = {
      structuredDataVerified: true,
      sourceEventId: 'evt-1',
      explicitDate: true,
      now: new Date('2026-09-01T00:00:00Z'),
    };

    expect(decideByConfidence(eventAt(0.92), context)).toMatchObject({
      reviewStatus: 'approved',
      reasons: ['trusted-source-rule'],
    });
    expect(decideByConfidence(eventAt(0.92), { ...context, explicitDate: false }).reviewStatus).toBe('pending');
    expect(decideByConfidence(eventAt(0.99), { ...context, now: new Date('2026-11-01T00:00:00Z') })).toMatchObject({
      reviewStatus: 'rejected',
      reasons: ['past-event'],
    });
    expect(
      decideByConfidence({ ...eventAt(0.99), canonicalName: 'Real Madrid - Liga Endesa Jornada 7' }, context),
    ).toMatchObject({ reviewStatus: 'rejected', reasons: ['non-music'] });
  });
});
