import type { NormalizedEvent } from '../types/domain.js';
import type { ScrapeSource, StagingEventRecord } from '../types/scrape.js';

export const AUTO_PUBLISH_CONFIDENCE = 0.95;
export const TRUSTED_SOURCE_CONFIDENCE = 0.9;
export const REVIEW_CONFIDENCE = 0.75;

export const NON_MUSIC_RE = /liga endesa|jornada \d+|euroliga|baloncesto|cineclub|\(comedia\)/i;

export type ConfidenceDecision = {
  reviewStatus: 'approved' | 'pending' | 'rejected';
  shouldPublish: boolean;
  reasons: string[];
};

// What the source and the raw row say about how much the event can be
// trusted, beyond the normalized fields themselves.
export type DecisionContext = {
  structuredDataVerified: boolean;
  sourceEventId: string | null;
  explicitDate: boolean;
  now: Date;
};

export const buildDecisionContext = (
  record: Pick<StagingEventRecord, 'source_event_id' | 'extracted_starts_at' | 'extracted_date_text'>,
  source: Pick<ScrapeSource, 'metadata'>,
  now = new Date(),
): DecisionContext => ({
  structuredDataVerified: source.metadata.structuredDataVerified === true,
  sourceEventId: record.source_event_id,
  explicitDate: Boolean(record.extracted_starts_at) || /\b20\d{2}\b/.test(record.extracted_date_text || ''),
  now,
});

const isTrustedSourceRecord = (event: NormalizedEvent, context: DecisionContext): boolean =>
  context.structuredDataVerified &&
  Boolean(context.sourceEventId) &&
  context.explicitDate &&
  event.confidence >= TRUSTED_SOURCE_CONFIDENCE &&
  event.eventType === 'concert';

export const decideByConfidence = (
  event: NormalizedEvent,
  context?: DecisionContext,
): ConfidenceDecision => {
  const reasons: string[] = [];
  if (!event.startsAt) reasons.push('missing-starts-at');
  if (event.artists.length === 0) reasons.push('missing-artists');
  if (!event.venue.normalizedName) reasons.push('missing-venue');

  if (reasons.length > 0 || event.confidence < REVIEW_CONFIDENCE) {
    if (event.confidence < REVIEW_CONFIDENCE) reasons.push('confidence-below-review-threshold');
    return { reviewStatus: 'rejected', shouldPublish: false, reasons };
  }

  if (context) {
    if (event.startsAt && new Date(event.startsAt).getTime() < context.now.getTime()) {
      return { reviewStatus: 'rejected', shouldPublish: false, reasons: ['past-event'] };
    }
    if (NON_MUSIC_RE.test(event.canonicalName)) {
      return { reviewStatus: 'rejected', shouldPublish: false, reasons: ['non-music'] };
    }
  }

  if (event.confidence < AUTO_PUBLISH_CONFIDENCE) {
    if (context && isTrustedSourceRecord(event, context)) {
      return { reviewStatus: 'approved', shouldPublish: true, reasons: ['trusted-source-rule'] };
    }
    return {
      reviewStatus: 'pending',
      shouldPublish: false,
      reasons: ['human-review-required'],
    };
  }

  return { reviewStatus: 'approved', shouldPublish: true, reasons: [] };
};
