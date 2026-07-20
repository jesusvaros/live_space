import type { NormalizedEvent } from '../types/domain.js';

export const AUTO_PUBLISH_CONFIDENCE = 0.95;
export const REVIEW_CONFIDENCE = 0.75;

export type ConfidenceDecision = {
  reviewStatus: 'approved' | 'pending' | 'rejected';
  shouldPublish: boolean;
  reasons: string[];
};

export const decideByConfidence = (event: NormalizedEvent): ConfidenceDecision => {
  const reasons: string[] = [];
  if (!event.startsAt) reasons.push('missing-starts-at');
  if (event.artists.length === 0) reasons.push('missing-artists');
  if (!event.venue.normalizedName) reasons.push('missing-venue');

  if (reasons.length > 0 || event.confidence < REVIEW_CONFIDENCE) {
    if (event.confidence < REVIEW_CONFIDENCE) reasons.push('confidence-below-review-threshold');
    return { reviewStatus: 'rejected', shouldPublish: false, reasons };
  }

  if (event.confidence < AUTO_PUBLISH_CONFIDENCE) {
    return {
      reviewStatus: 'pending',
      shouldPublish: false,
      reasons: ['human-review-required'],
    };
  }

  return { reviewStatus: 'approved', shouldPublish: true, reasons: [] };
};
