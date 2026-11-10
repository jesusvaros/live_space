import { supabase } from '../../../lib/supabase';
import { cached } from '../../../lib/requestCache';

/** Where and when each concert is: all the venue shelves count. */
export type UpcomingVenueEvent = {
  starts_at: string;
  latitude: number | string | null;
  longitude: number | string | null;
  venue_place: { id: string; latitude: number | string | null; longitude: number | string | null } | null;
};

// The full card select (posters, lineups, media) is many times heavier and
// none of it is used here.
const UPCOMING_VENUE_EVENT_SELECT =
  'starts_at,latitude,longitude,venue_place:venue_places!events_venue_place_id_fkey(id,latitude,longitude)';

const PAGE = 1000;

export const fetchUpcomingEvents = async (startIso: string, endIso: string) => {
  return cached(
    `events:venue_agenda:${startIso}:${endIso}`,
    async () => {
      const rows: UpcomingVenueEvent[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('events')
          .select(UPCOMING_VENUE_EVENT_SELECT)
          .eq('status', 'published')
          .gte('starts_at', startIso)
          .lte('starts_at', endIso)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...((data || []) as unknown as UpcomingVenueEvent[]));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
    { ttlMs: 60_000 }
  );
};
