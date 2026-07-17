import type { SupabaseClient } from '@supabase/supabase-js';

import { dedupeEvent } from '../dedupe/dedupeEvent.js';
import type { EventRow, NormalizedEvent } from '../types/domain.js';
import { Logger } from '../utils/logger.js';

const EVENT_SELECT =
  'id,name,normalized_name,venue_place_id,starts_at,source_url,external_source,external_source_id';

export type UpsertEventResult = {
  row: EventRow;
  created: boolean;
  updated: boolean;
};

export const upsertEvent = async (
  supabase: SupabaseClient,
  event: NormalizedEvent,
  venueId: string,
  externalSource: string,
  logger: Logger
): Promise<UpsertEventResult> => {
  if (!event.startsAt) {
    throw new Error('Cannot upsert an event without startsAt.');
  }

  const match = await dedupeEvent(supabase, event, venueId, externalSource);
  if (match.match) {
    const updates: Record<string, unknown> = {};

    if (!match.match.normalized_name) {
      updates.normalized_name = event.normalizedName;
    }
    if (!match.match.source_url && event.sourceUrl) {
      updates.source_url = event.sourceUrl;
      updates.event_url = event.sourceUrl;
    }
    if (!match.match.external_source && event.sourceExternalId) {
      updates.external_source = externalSource;
    }
    if (!match.match.external_source_id && event.sourceExternalId) {
      updates.external_source_id = event.sourceExternalId;
    }
    if (event.description) {
      updates.description = event.description;
    }
    if (event.eventType) {
      updates.event_type = event.eventType;
    }

    if (Object.keys(updates).length === 0) {
      return {
        row: match.match,
        created: false,
        updated: false,
      };
    }

    const { data, error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', match.match.id)
      .select(EVENT_SELECT)
      .single();

    if (error) {
      throw error;
    }

    logger.info('Updated event from scraper', {
      eventId: match.match.id,
      strategy: match.strategy,
    });

    return {
      row: data as EventRow,
      created: false,
      updated: true,
    };
  }

  const city = event.city || event.venue.city || 'Unknown';
  const { data, error } = await supabase
    .from('events')
    .insert({
      venue_place_id: venueId,
      name: event.canonicalName,
      description: event.description || null,
      event_url: event.sourceUrl || null,
      source_url: event.sourceUrl || null,
      external_source: externalSource,
      external_source_id: event.sourceExternalId || null,
      normalized_name: event.normalizedName,
      event_type: event.eventType,
      city,
      starts_at: event.startsAt,
      genres: [],
      is_free: true,
      price_tiers: [],
      is_public: true,
    })
    .select(EVENT_SELECT)
    .single();

  if (error) {
    throw error;
  }

  logger.info('Inserted event from scraper', {
    eventId: (data as EventRow).id,
  });

  return {
    row: data as EventRow,
    created: true,
    updated: false,
  };
};
