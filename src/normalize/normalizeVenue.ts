import type { NormalizedVenue } from '../types/domain.js';
import { cleanupDisplayText, normalizeForMatching } from './normalizeText.js';

type NormalizeVenueInput = {
  name?: string | null;
  city?: string | null;
  websiteUrl?: string | null;
  sourceUrl?: string | null;
};

export const normalizeVenue = (input: NormalizeVenueInput): NormalizedVenue => {
  const name = cleanupDisplayText(input.name);
  const city = cleanupDisplayText(input.city);
  const normalizedName = normalizeForMatching(name);

  return {
    name: name || 'Venue TBA',
    normalizedName,
    city: city || undefined,
    websiteUrl: input.websiteUrl || undefined,
    sourceUrl: input.sourceUrl || undefined,
    confidence: normalizedName ? (city ? 0.92 : 0.82) : 0.3,
  };
};
