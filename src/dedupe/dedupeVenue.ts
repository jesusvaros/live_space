import type { SupabaseClient } from '@supabase/supabase-js';

import type { NormalizedVenue, VenueRow } from '../types/domain.js';
import { stringSimilarity } from '../utils/stringSimilarity.js';

export type DedupeResult<T> = {
  match: T | null;
  strategy: 'source_url' | 'website_url' | 'normalized_name_city' | 'fuzzy' | 'none';
  confidence: number;
};

const VENUE_SELECT = 'id,name,city,website_url,source_url,normalized_name';

export const dedupeVenue = async (
  supabase: SupabaseClient,
  venue: NormalizedVenue
): Promise<DedupeResult<VenueRow>> => {
  if (venue.sourceUrl) {
    const { data, error } = await supabase
      .from('venue_places')
      .select(VENUE_SELECT)
      .eq('source_url', venue.sourceUrl)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return { match: data as VenueRow, strategy: 'source_url', confidence: 1 };
    }
  }

  if (venue.websiteUrl) {
    const { data, error } = await supabase
      .from('venue_places')
      .select(VENUE_SELECT)
      .eq('website_url', venue.websiteUrl)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return { match: data as VenueRow, strategy: 'website_url', confidence: 1 };
    }
  }

  if (venue.normalizedName) {
    let query = supabase
      .from('venue_places')
      .select(VENUE_SELECT)
      .eq('normalized_name', venue.normalizedName)
      .limit(5);

    if (venue.city) {
      query = query.eq('city', venue.city);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    if ((data || []).length > 0) {
      return {
        match: (data || [])[0] as VenueRow,
        strategy: 'normalized_name_city',
        confidence: 0.98,
      };
    }
  }

  if (venue.city && venue.normalizedName) {
    const { data, error } = await supabase
      .from('venue_places')
      .select(VENUE_SELECT)
      .eq('city', venue.city)
      .limit(50);

    if (error) {
      throw error;
    }

    let bestMatch: VenueRow | null = null;
    let bestScore = 0;

    for (const candidate of (data || []) as VenueRow[]) {
      const score = stringSimilarity(candidate.normalized_name || '', venue.normalizedName);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    if (bestMatch && bestScore >= 0.93) {
      return {
        match: bestMatch,
        strategy: 'fuzzy',
        confidence: bestScore,
      };
    }
  }

  return {
    match: null,
    strategy: 'none',
    confidence: 0,
  };
};
