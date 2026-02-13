import { supabase } from '../../../lib/supabase';
import { cached } from '../../../lib/requestCache';
import { EventListItem } from '../../events/types';

export const fetchUpcomingEvents = async (startIso: string, endIso: string) => {
  return cached(
    `events:list:${startIso}:${endIso}`,
    async () => {
      const { data, error } = await supabase
        .from('events')
        .select(
          `
          id,
          name,
          city,
          address,
          latitude,
          longitude,
          starts_at,
          venue_place:venue_places!events_venue_place_id_fkey (
            id,
            name,
            city,
            address,
            latitude,
            longitude
          ),
          event_artists (
            artist:artists!event_artists_artist_entity_fk (
              id,
              name,
              avatar_url,
              city,
              genres
            )
          )
        `
        )
        .gte('starts_at', startIso)
        .lte('starts_at', endIso)
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as EventListItem[];
    },
    { ttlMs: 10_000 }
  );
};

