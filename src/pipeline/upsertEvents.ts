import type { SupabaseClient } from '@supabase/supabase-js';

import { dedupeEvent } from '../dedupe/dedupeEvent.js';
import type { EventRow, NormalizedEvent } from '../types/domain.js';
import { Logger } from '../utils/logger.js';

const EVENT_SELECT =
  'id,name,normalized_name,venue_place_id,starts_at,source_url,source_id,source_external_id,image_url,image_source,tour_name';

// Only facts the source states overwrite the event; an empty capture never
// clears a ticket link or prices set earlier.
export const offerUpdates = (event: NormalizedEvent): Record<string, unknown> => {
  const updates: Record<string, unknown> = {};
  if (event.offer?.ticketUrl) updates.ticket_url = event.offer.ticketUrl;
  if (event.offer?.priceTiers.length) updates.price_tiers = event.offer.priceTiers;
  if (event.offer?.isFree) updates.is_free = true;
  if (event.offer?.endsAt) updates.ends_at = event.offer.endsAt;
  return updates;
};

// The poster follows the source (a venue may swap a placeholder for the real
// artwork), but a capture without an image never clears one, and a manually
// chosen image is never replaced.
export const imageUpdates = (
  event: Pick<NormalizedEvent, 'imageUrl' | 'tourName'>,
  current: Pick<EventRow, 'image_url' | 'image_source' | 'tour_name'>,
): Record<string, unknown> => {
  const updates: Record<string, unknown> = {};
  if (event.imageUrl && current.image_source !== 'manual' && current.image_url !== event.imageUrl) {
    updates.image_url = event.imageUrl;
    updates.image_source = 'source';
  }
  if (event.tourName && !current.tour_name) updates.tour_name = event.tourName;
  return updates;
};

export type UpsertEventResult = {
  row: EventRow;
  created: boolean;
  updated: boolean;
};

export const upsertEvent = async (
  supabase: SupabaseClient,
  event: NormalizedEvent,
  venueId: string,
  sourceId: string,
  logger: Logger
): Promise<UpsertEventResult> => {
  if (!event.startsAt) {
    throw new Error('Cannot upsert an event without startsAt.');
  }

  const match = await dedupeEvent(supabase, event, venueId, sourceId);
  if (match.match) {
    const updates: Record<string, unknown> = {};

    if (!match.match.normalized_name) {
      updates.normalized_name = event.normalizedName;
    }
    if (!match.match.source_url && event.sourceUrl) {
      updates.source_url = event.sourceUrl;
    }
    if (!match.match.source_id) {
      updates.source_id = sourceId;
    }
    if (!match.match.source_external_id && event.sourceExternalId) {
      updates.source_external_id = event.sourceExternalId;
    }
    if (event.description) {
      updates.description = event.description;
    }
    Object.assign(updates, offerUpdates(event));
    Object.assign(updates, imageUpdates(event, match.match));
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
      source_url: event.sourceUrl || null,
      source_id: sourceId,
      source_external_id: event.sourceExternalId || null,
      normalized_name: event.normalizedName,
      city,
      starts_at: event.startsAt,
      genres: [],
      is_free: event.offer?.isFree ?? false,
      price_tiers: event.offer?.priceTiers ?? [],
      ticket_url: event.offer?.ticketUrl ?? null,
      ends_at: event.offer?.endsAt ?? null,
      image_url: event.imageUrl ?? null,
      image_source: event.imageUrl ? 'source' : null,
      tour_name: event.tourName ?? null,
      status: 'published',
      published_at: new Date().toISOString(),
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
