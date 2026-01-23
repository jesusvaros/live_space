import { supabase } from '../../../lib/supabase';
import { cached } from '../../../lib/requestCache';
import { EventListItem } from '../../events/types';
import { calculateDistanceKm, toNumber } from '../../events/utils';
import { fetchUpcomingEvents } from './discoverUpcomingEvents';
import { DiscoverArtist, SuggestedSection } from '../types';

const SUGGESTED_LIMIT = 10;
const NEARBY_RADIUS_KM = 50;

const dateWindow = () => {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfTwoWeeks = new Date(startOfToday);
  endOfTwoWeeks.setDate(endOfTwoWeeks.getDate() + 14);
  endOfTwoWeeks.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  endOfWeek.setHours(23, 59, 59, 999);
  return { startOfToday, endOfTwoWeeks, endOfWeek };
};

const mapArtist = (row: any): DiscoverArtist => ({
  id: row.artist_id,
  subject_id: row.subject_id,
  name: row.name,
  avatar_url: row.avatar_url,
  city: row.city,
  genres: row.genres || [],
});

const fetchArtistsByIds = async (artistIds: string[]) => {
  if (artistIds.length === 0) return [];
  const uniqueSorted = Array.from(new Set(artistIds)).sort();
  const idsKey = uniqueSorted.join(',');
  const data = await cached(
    `artists:by_ids:${idsKey}`,
    async () => {
      const { data, error } = await supabase
        .from('v_subject_artists')
        .select('artist_id,subject_id,name,avatar_url,city,genres')
        .in('artist_id', uniqueSorted);
      if (error) throw error;
      return data || [];
    },
    { ttlMs: 60_000 }
  );
  const byId = new Map<string, any>();
  for (const row of data as any[]) byId.set((row as any).artist_id, row);
  return artistIds.map(id => byId.get(id)).filter(Boolean).map(mapArtist) as DiscoverArtist[];
};

const topArtistIdsFromEvents = (events: EventListItem[]) => {
  const counts = new Map<string, number>();
  for (const event of events) {
    for (const item of event.event_artists || []) {
      const id = item.artist?.id;
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, SUGGESTED_LIMIT)
    .map(([id]) => id);
};

export const getSuggestedArtists = async (options?: { location?: { lat: number; lng: number } | null }) => {
  const { startOfToday, endOfTwoWeeks, endOfWeek } = dateWindow();
  const events = await fetchUpcomingEvents(startOfToday.toISOString(), endOfTwoWeeks.toISOString());
  const sections: SuggestedSection<DiscoverArtist>[] = [];

  if (options?.location) {
    const nearEvents: EventListItem[] = [];
    for (const event of events) {
      const eventLat = toNumber(event.latitude ?? event.venue_place?.latitude ?? null);
      const eventLng = toNumber(event.longitude ?? event.venue_place?.longitude ?? null);
      if (eventLat === null || eventLng === null) continue;
      const km = calculateDistanceKm(options.location.lat, options.location.lng, eventLat, eventLng);
      if (km > NEARBY_RADIUS_KM) continue;
      nearEvents.push(event);
    }
    const ids = topArtistIdsFromEvents(nearEvents);
    const items = await fetchArtistsByIds(ids);
    if (items.length > 0) sections.push({ key: 'trending_near_you', title: 'Trending near you', items });
  }

  const weekEvents = events.filter(event => {
    const startsAt = new Date(event.starts_at);
    return startsAt >= startOfToday && startsAt <= endOfWeek;
  });
  const weekIds = topArtistIdsFromEvents(weekEvents);
  const weekItems = await fetchArtistsByIds(weekIds);
  if (weekItems.length > 0) sections.push({ key: 'popular_this_week', title: 'Popular this week', items: weekItems });

  const recentArtists = await cached(
    'discover:artists:recent',
    async () => {
      const { data, error } = await supabase
        .from('v_subject_artists')
        .select('artist_id,subject_id,name,avatar_url,city,genres,updated_at')
        .order('updated_at', { ascending: false })
        .limit(SUGGESTED_LIMIT);
      if (error) throw error;
      return (data || []).map(mapArtist) as DiscoverArtist[];
    },
    { ttlMs: 60_000 }
  );
  if (recentArtists.length > 0) sections.push({ key: 'recently_active', title: 'Recently active', items: recentArtists });

  const seen = new Set<string>();
  return sections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  }));
};
