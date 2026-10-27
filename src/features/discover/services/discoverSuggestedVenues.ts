import { supabase } from '../../../lib/supabase';
import { cached } from '../../../lib/requestCache';
import { EventListItem } from '../../events/types';
import { calculateDistanceKm, toNumber } from '../../events/utils';
import { fetchUpcomingEvents } from './discoverUpcomingEvents';
import { DiscoverVenue, SuggestedSection } from '../types';
import { withVenueRecentPosters } from './discoverRecentPosters';

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

const mapVenue = (row: any): DiscoverVenue => ({
  id: row.venue_place_id,
  subject_id: row.subject_id,
  name: row.name,
  city: row.city,
  address: row.address,
  photos: row.photos || [],
  cover_image_url: row.cover_image_url ?? null,
  venue_type: row.venue_type ?? null,
  capacity: row.capacity ?? null,
});

const fetchVenuesByIds = async (venuePlaceIds: string[]) => {
  if (venuePlaceIds.length === 0) return [];
  const uniqueSorted = Array.from(new Set(venuePlaceIds)).sort();
  const idsKey = uniqueSorted.join(',');
  const data = await cached(
    `venues:by_place_ids:${idsKey}`,
    async () => {
      const { data, error } = await supabase
        .from('v_subject_venues')
        .select('venue_place_id,subject_id,name,city,address,photos,cover_image_url,venue_type,capacity')
        .in('venue_place_id', uniqueSorted);
      if (error) throw error;
      return data || [];
    },
    { ttlMs: 60_000 }
  );
  const byId = new Map<string, any>();
  for (const row of data as any[]) byId.set((row as any).venue_place_id, row);
  const venues = venuePlaceIds.map(id => byId.get(id)).filter(Boolean).map(mapVenue) as DiscoverVenue[];
  return withVenueRecentPosters(venues);
};

const topVenueIdsFromEvents = (events: EventListItem[]) => {
  const counts = new Map<string, number>();
  for (const event of events) {
    const venuePlaceId = event.venue_place?.id;
    if (!venuePlaceId) continue;
    counts.set(venuePlaceId, (counts.get(venuePlaceId) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, SUGGESTED_LIMIT)
    .map(([id]) => id);
};

export const getSuggestedVenues = async (options?: { location?: { lat: number; lng: number } | null }) => {
  const { startOfToday, endOfTwoWeeks, endOfWeek } = dateWindow();
  // Independent requests run together: events, then both id lookups at once.
  const recentPromise = cached(
    'discover:venues:recent',
    async () => {
      const { data, error } = await supabase
        .from('v_subject_venues')
        .select('venue_place_id,subject_id,name,city,address,photos,cover_image_url,venue_type,capacity,created_at')
        .order('created_at', { ascending: false })
        .limit(SUGGESTED_LIMIT);
      if (error) throw error;
      return (data || []).map(mapVenue) as DiscoverVenue[];
    },
    { ttlMs: 60_000 }
  ).then(withVenueRecentPosters);
  const events = await fetchUpcomingEvents(startOfToday.toISOString(), endOfTwoWeeks.toISOString());

  const nearEvents: EventListItem[] = [];
  if (options?.location) {
    for (const event of events) {
      const eventLat = toNumber(event.latitude ?? event.venue_place?.latitude ?? null);
      const eventLng = toNumber(event.longitude ?? event.venue_place?.longitude ?? null);
      if (eventLat === null || eventLng === null) continue;
      const km = calculateDistanceKm(options.location.lat, options.location.lng, eventLat, eventLng);
      if (km > NEARBY_RADIUS_KM) continue;
      nearEvents.push(event);
    }
  }
  const weekEvents = events.filter(event => {
    const startsAt = new Date(event.starts_at);
    return startsAt >= startOfToday && startsAt <= endOfWeek;
  });

  const [nearItems, weekItems, recentWithPosters] = await Promise.all([
    options?.location ? fetchVenuesByIds(topVenueIdsFromEvents(nearEvents)) : Promise.resolve([]),
    fetchVenuesByIds(topVenueIdsFromEvents(weekEvents)),
    recentPromise,
  ]);

  const sections: SuggestedSection<DiscoverVenue>[] = [];
  if (nearItems.length > 0) sections.push({ key: 'venues_near_you', title: 'Salas cerca de ti', items: nearItems });
  if (weekItems.length > 0) sections.push({ key: 'popular_venues_this_week', title: 'Salas populares esta semana', items: weekItems });
  if (recentWithPosters.length > 0) {
    sections.push({ key: 'recently_added', title: 'Salas añadidas hace poco', items: recentWithPosters });
  }

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
