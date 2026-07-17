import type { SupabaseClient } from '@supabase/supabase-js';

import type { EventRow, NormalizedEvent } from '../types/domain.js';
import { stringSimilarity } from '../utils/stringSimilarity.js';

export type EventDedupeResult = {
  match: EventRow | null;
  strategy:
    | 'source_url'
    | 'external_source'
    | 'venue_starts_at_normalized_name'
    | 'fuzzy'
    | 'none';
  confidence: number;
};

const EVENT_SELECT =
  'id,name,normalized_name,venue_place_id,starts_at,source_url,external_source,external_source_id';

const buildDayBounds = (isoString: string): { from: string; to: string } => {
  const date = new Date(isoString);
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
};

export const dedupeEvent = async (
  supabase: SupabaseClient,
  event: NormalizedEvent,
  venueId: string,
  externalSource: string
): Promise<EventDedupeResult> => {
  if (event.sourceUrl) {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('source_url', event.sourceUrl)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return {
        match: data as EventRow,
        strategy: 'source_url',
        confidence: 1,
      };
    }
  }

  if (event.sourceExternalId) {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('external_source', externalSource)
      .eq('external_source_id', event.sourceExternalId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return {
        match: data as EventRow,
        strategy: 'external_source',
        confidence: 0.99,
      };
    }
  }

  if (event.startsAt) {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('venue_place_id', venueId)
      .eq('starts_at', event.startsAt)
      .eq('normalized_name', event.normalizedName)
      .limit(5);

    if (error) {
      throw error;
    }

    if ((data || []).length > 0) {
      return {
        match: (data || [])[0] as EventRow,
        strategy: 'venue_starts_at_normalized_name',
        confidence: 0.98,
      };
    }

    const bounds = buildDayBounds(event.startsAt);
    const { data: dayCandidates, error: dayCandidatesError } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('venue_place_id', venueId)
      .gte('starts_at', bounds.from)
      .lt('starts_at', bounds.to)
      .limit(50);

    if (dayCandidatesError) {
      throw dayCandidatesError;
    }

    let bestMatch: EventRow | null = null;
    let bestScore = 0;
    for (const candidate of (dayCandidates || []) as EventRow[]) {
      const score = stringSimilarity(candidate.normalized_name || '', event.normalizedName);
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
  }

  return {
    match: null,
    strategy: 'none',
    confidence: 0,
  };
};
