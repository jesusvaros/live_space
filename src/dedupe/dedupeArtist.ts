import type { SupabaseClient } from '@supabase/supabase-js';

import type { ArtistRow, NormalizedArtist } from '../types/domain.js';
import { stringSimilarity } from '../utils/stringSimilarity.js';

export type ArtistDedupeResult = {
  match: ArtistRow | null;
  strategy: 'normalized_name' | 'fuzzy' | 'none';
  confidence: number;
};

const ARTIST_SELECT = 'id,name,normalized_name,artist_type,city,country_code';

export const dedupeArtist = async (
  supabase: SupabaseClient,
  artist: NormalizedArtist
): Promise<ArtistDedupeResult> => {
  const { data: exactMatches, error: exactError } = await supabase
    .from('artists')
    .select(ARTIST_SELECT)
    .eq('normalized_name', artist.normalizedName)
    .eq('country_code', 'ES')
    .limit(5);

  if (exactError) {
    throw exactError;
  }

  if ((exactMatches || []).length > 0) {
    return {
      match: (exactMatches || [])[0] as ArtistRow,
      strategy: 'normalized_name',
      confidence: 1,
    };
  }

  const prefix = artist.normalizedName.split(' ')[0];
  if (!prefix) {
    return {
      match: null,
      strategy: 'none',
      confidence: 0,
    };
  }

  const { data: candidates, error: candidateError } = await supabase
    .from('artists')
    .select(ARTIST_SELECT)
    .ilike('normalized_name', `${prefix}%`)
    .eq('country_code', 'ES')
    .limit(100);

  if (candidateError) {
    throw candidateError;
  }

  let bestMatch: ArtistRow | null = null;
  let bestScore = 0;

  for (const candidate of (candidates || []) as ArtistRow[]) {
    const score = stringSimilarity(candidate.normalized_name || '', artist.normalizedName);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestMatch && bestScore >= 0.94) {
    return {
      match: bestMatch,
      strategy: 'fuzzy',
      confidence: bestScore,
    };
  }

  return {
    match: null,
    strategy: 'none',
    confidence: 0,
  };
};
