import type { SupabaseClient } from '@supabase/supabase-js';

import { dedupeVenue } from '../dedupe/dedupeVenue.js';
import type { NormalizedVenue, VenueRow } from '../types/domain.js';
import { Logger } from '../utils/logger.js';

export type UpsertVenueResult = {
  row: VenueRow;
  created: boolean;
  updated: boolean;
};

const VENUE_SELECT = 'id,name,city,website_url,normalized_name';

export const upsertVenue = async (
  supabase: SupabaseClient,
  venue: NormalizedVenue,
  logger: Logger
): Promise<UpsertVenueResult> => {
  const match = await dedupeVenue(supabase, venue);
  if (match.match) {
    const updates: Record<string, unknown> = {};

    if (!match.match.normalized_name && venue.normalizedName) {
      updates.normalized_name = venue.normalizedName;
    }
    if (!match.match.website_url && (venue.websiteUrl || venue.sourceUrl)) {
      updates.website_url = venue.websiteUrl || venue.sourceUrl;
    }
    if ((!match.match.city || match.match.city === 'Unknown') && venue.city) {
      updates.city = venue.city;
    }

    if (Object.keys(updates).length === 0) {
      return {
        row: match.match,
        created: false,
        updated: false,
      };
    }

    const { data, error } = await supabase
      .from('venue_places')
      .update(updates)
      .eq('id', match.match.id)
      .select(VENUE_SELECT)
      .single();

    if (error) {
      throw error;
    }

    logger.info('Updated venue from scraper', {
      venueId: match.match.id,
      strategy: match.strategy,
    });

    return {
      row: data as VenueRow,
      created: false,
      updated: true,
    };
  }

  const { data, error } = await supabase
    .from('venue_places')
    .insert({
      name: venue.name,
      city: venue.city || 'Unknown',
      website_url: venue.websiteUrl || venue.sourceUrl || null,
      normalized_name: venue.normalizedName,
      country_code: 'ES',
      status: 'published',
    })
    .select(VENUE_SELECT)
    .single();

  if (error) {
    if (error.code === '23505') {
      const concurrentMatch = await dedupeVenue(supabase, venue);
      if (concurrentMatch.match) {
        logger.info('Reused venue created by concurrent scraper item', {
          venueId: concurrentMatch.match.id,
        });
        return {
          row: concurrentMatch.match,
          created: false,
          updated: false,
        };
      }
    }
    throw error;
  }

  logger.info('Inserted venue from scraper', {
    venueId: (data as VenueRow).id,
  });

  return {
    row: data as VenueRow,
    created: true,
    updated: false,
  };
};
