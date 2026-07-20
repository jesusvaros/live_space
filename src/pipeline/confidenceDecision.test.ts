import { describe, expect, it } from 'vitest';

import type { NormalizedEvent } from '../types/domain';
import { decideByConfidence } from './confidenceDecision';

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
});
