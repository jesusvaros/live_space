import { supabase } from '../lib/supabase';
import type { EventListItem } from '../features/events/types';
import type { MomentStats } from '../features/events/pastConcerts';
import { mapArtist, mapEvent, mapVenue } from './canonicalMappers';
import { posterChain, posterSourcesFromRow, uniqueImageUrls } from '../lib/eventCover';
import { eventCacheKey, writeCache } from './pageCache';

// Only the columns the card mappers keep (mapEvent / mapVenue / mapArtist):
// the detail screen paints from the cached card, so it opens instantly from
// any list. `*` here used to ship every scraper column of every concert.
const EVENT_CARD_SELECT = `
  id,venue_place_id,name,description,starts_at,ends_at,city,address,latitude,longitude,genres,
  is_free,price_tiers,ticket_url,source_url,status,created_by,created_at,updated_at,image_url,
  poster_thumb_url,poster_url,share_tag,festival_id,room,
  venue_place:venue_places!events_venue_place_id_fkey (id,name,city,address,latitude,longitude),
  event_artists (
    billing_order,is_headliner,
    artist:artists!event_artists_artist_id_fkey (id,name,genres,image_url)
  ),
  media_assets!media_assets_event_id_fkey (
    kind,status,secure_url,thumbnail_url,created_at
  )
`;

// The same, keeping only concerts whose venue matches the venue filters.
const EVENT_CARD_SELECT_BY_VENUE = EVENT_CARD_SELECT.replace(
  'venue_places!events_venue_place_id_fkey',
  'venue_places!events_venue_place_id_fkey!inner',
);

// The same, keeping only concerts that list this artist. The filter runs on
// its own alias so the card still carries the whole lineup.
const EVENT_CARD_SELECT_BY_ARTIST = `${EVENT_CARD_SELECT},
  artist_filter:event_artists!inner(artist_id)`;

// PostgREST caps a response at 1000 rows; longer lists are read in pages.
const MAX_ROWS = 1000;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, match => `\\${match}`);

const inList = (ids: string[]) => `(${ids.map(id => `"${id}"`).join(',')})`;

const toCoordinate = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Headliner first, then billing order (the order the scrapers saved). */
export const byBilling = (
  left: { is_headliner?: boolean | null; billing_order?: number | null },
  right: { is_headliner?: boolean | null; billing_order?: number | null },
) =>
  Number(Boolean(right.is_headliner)) - Number(Boolean(left.is_headliner))
  || (left.billing_order ?? 99) - (right.billing_order ?? 99);

export const mapEventCard = (row: any): EventListItem => {
  const publishedImages = (row.media_assets || [])
    .filter((asset: any) => asset.kind === 'image' && asset.status === 'published')
    .sort((left: any, right: any) => String(right.created_at).localeCompare(String(left.created_at)));
  // Fan photos first; the poster (our R2 copy, else the source's https URL)
  // only fills the empty state. Lists ask for poster_sources.thumb instead.
  const posterSources = posterSourcesFromRow(row);
  const coverImageUrl =
    uniqueImageUrls([publishedImages[0]?.thumbnail_url, publishedImages[0]?.secure_url])[0]
    ?? posterChain(posterSources, 'card')[0]
    ?? null;

  return {
    ...mapEvent({ ...row, cover_image_url: coverImageUrl }),
    poster_sources: posterSources,
    venue_place: row.venue_place ? mapVenue({ ...row.venue_place, photos: [] }) : null,
    // Headliner first: PostgREST returns the lineup in no particular order.
    event_artists: [...(row.event_artists || [])].sort(byBilling).map((entry: any) => ({
      artist: entry.artist ? mapArtist({ ...entry.artist, avatar_url: entry.artist.image_url ?? null }) : null,
    })),
  };
};

export type EventCardQuery = {
  startIso?: string;
  endIso?: string;
  eventId?: string;
  eventIds?: string[];
  venueId?: string;
  /** Only concerts whose lineup lists this artist. */
  artistId?: string;
  festivalId?: string;
  /** Only this city's concerts (the event's city, any case). */
  city?: string;
  /** Only concerts whose venue lies inside this box. */
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  /** Any of these: what followed artists, venues and festivals have on. */
  anyOf?: { eventIds?: string[]; venueIds?: string[]; festivalIds?: string[] };
  /** One page: rows [offset, offset + limit). Without it every row is read. */
  offset?: number;
  limit?: number;
};

export const fetchEventCards = async (options: EventCardQuery): Promise<EventListItem[]> => {
  if (options.eventIds && options.eventIds.length === 0) return [];
  const anyOfClauses = options.anyOf
    ? [
        options.anyOf.eventIds?.length ? `id.in.${inList(options.anyOf.eventIds)}` : null,
        options.anyOf.venueIds?.length ? `venue_place_id.in.${inList(options.anyOf.venueIds)}` : null,
        options.anyOf.festivalIds?.length ? `festival_id.in.${inList(options.anyOf.festivalIds)}` : null,
      ].filter((clause): clause is string => Boolean(clause))
    : null;
  if (anyOfClauses && anyOfClauses.length === 0) return [];

  const build = () => {
    let query = supabase
      .from('events')
      .select(
        options.bounds ? EVENT_CARD_SELECT_BY_VENUE : options.artistId ? EVENT_CARD_SELECT_BY_ARTIST : EVENT_CARD_SELECT,
      )
      .eq('status', 'published');
    if (options.startIso) query = query.gte('starts_at', options.startIso);
    if (options.endIso) query = query.lte('starts_at', options.endIso);
    if (options.eventId) query = query.eq('id', options.eventId);
    if (options.eventIds) query = query.in('id', options.eventIds);
    if (options.venueId) query = query.eq('venue_place_id', options.venueId);
    if (options.artistId) query = query.eq('artist_filter.artist_id', options.artistId);
    if (options.festivalId) query = query.eq('festival_id', options.festivalId);
    if (options.city) query = query.ilike('city', escapeLike(options.city.trim()));
    if (options.bounds) {
      query = query
        .gte('venue_place.latitude', options.bounds.minLat)
        .lte('venue_place.latitude', options.bounds.maxLat)
        .gte('venue_place.longitude', options.bounds.minLng)
        .lte('venue_place.longitude', options.bounds.maxLng);
    }
    if (anyOfClauses) query = query.or(anyOfClauses.join(','));
    // id breaks ties so pages never overlap or skip a concert.
    return query.order('starts_at', { ascending: true }).order('id', { ascending: true });
  };

  const rows: any[] = [];
  if (options.limit !== undefined) {
    const from = options.offset ?? 0;
    const { data, error } = await build().range(from, from + options.limit - 1);
    if (error) throw error;
    rows.push(...(data || []));
  } else {
    for (let from = 0; ; from += MAX_ROWS) {
      const { data, error } = await build().range(from, from + MAX_ROWS - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < MAX_ROWS) break;
    }
  }

  const cards = rows.map(mapEventCard);
  // Any listed concert opens instantly: the card holds everything its detail
  // screen needs first.
  // In memory only: the lists themselves are what the persistent cache keeps.
  for (const card of cards) writeCache(eventCacheKey(card.id), card, { persist: false });
  return cards;
};

// A past concert as a row of «Conciertos pasados»: date, venue, lineup and
// the cover (the newest fan photo, else the poster). Half the bytes of a full
// card; the concert page reads the rest when it opens.
const PAST_CARD_SELECT = `
  id,name,starts_at,city,address,status,image_url,poster_thumb_url,poster_url,
  venue_place:venue_places!events_venue_place_id_fkey (id,name,city),
  event_artists (
    billing_order,is_headliner,
    artist:artists!event_artists_artist_id_fkey (id,name,image_url)
  ),
  media_assets!media_assets_event_id_fkey (kind,status,secure_url,thumbnail_url,created_at)
`;

/**
 * One page of a venue's or an artist's concerts that started before
 * `beforeIso`, most recent first (id breaks ties so pages never overlap).
 * Slim rows: not written to the card cache.
 */
export const fetchPastEventCards = async (options: {
  venueId?: string;
  artistId?: string;
  beforeIso: string;
  offset: number;
  limit: number;
}): Promise<EventListItem[]> => {
  if (!options.venueId && !options.artistId) return [];
  let query = supabase
    .from('events')
    .select(options.artistId ? `${PAST_CARD_SELECT}, artist_filter:event_artists!inner(artist_id)` : PAST_CARD_SELECT)
    .eq('status', 'published')
    .lt('starts_at', options.beforeIso)
    .eq('media_assets.kind', 'image')
    .eq('media_assets.status', 'published')
    .order('created_at', { referencedTable: 'media_assets', ascending: false })
    .limit(1, { referencedTable: 'media_assets' });
  if (options.venueId) query = query.eq('venue_place_id', options.venueId);
  if (options.artistId) query = query.eq('artist_filter.artist_id', options.artistId);
  const { data, error } = await query
    .order('starts_at', { ascending: false })
    .order('id', { ascending: false })
    .range(options.offset, options.offset + options.limit - 1);
  if (error) throw error;
  return (data || []).map(mapEventCard);
};

/**
 * Moments per concert (count and the newest one's thumbnail), for a page of
 * ids. One small RPC; until that function is deployed (or if it fails) the
 * map stays empty and the cards just show no count.
 */
let momentStatsRpcMissing = false;

export const fetchEventMomentStats = async (eventIds: string[]): Promise<Map<string, MomentStats>> => {
  const stats = new Map<string, MomentStats>();
  if (eventIds.length === 0 || momentStatsRpcMissing) return stats;
  const { data, error } = await supabase.rpc('get_event_moment_stats', { p_event_ids: eventIds });
  if (error) {
    // PGRST202: not in the schema cache yet. Do not ask again this session.
    if (error.code === 'PGRST202' || error.code === '42883') momentStatsRpcMissing = true;
    return stats;
  }
  for (const row of (data || []) as any[]) {
    const count = Number(row.moment_count ?? 0);
    if (!row.event_id || !(count > 0)) continue;
    stats.set(String(row.event_id), { count, latestThumbnailUrl: row.latest_thumbnail_url ?? null });
  }
  return stats;
};

export const fetchEventCardById = async (eventId: string) => {
  const rows = await fetchEventCards({ eventId });
  const card = rows[0] ?? null;
  // An opened concert is kept across restarts: it opens at once next time.
  if (card) writeCache(eventCacheKey(card.id), card);
  return card;
};

// The upload screen's concert picker: what a row shows (artist, venue, date),
// what detection needs (starts_at, ends_at, the venue's coordinates to compare
// with where the media was taken, on the device) and the poster of
// the chosen one (the scraped image or the newest fan photo, not all of them).
const UPLOAD_CANDIDATE_SELECT = `
  id,name,starts_at,ends_at,city,image_url,latitude,longitude,
  venue_place:venue_places!events_venue_place_id_fkey (id,name,city,latitude,longitude),
  event_artists (
    billing_order,is_headliner,
    artist:artists!event_artists_artist_id_fkey (id,name)
  ),
  media_assets!media_assets_event_id_fkey (kind,status,secure_url,thumbnail_url,created_at)
`;

/**
 * Concerts in the window, every city, as slim cards. They are not written to
 * the card cache (the concert page needs the full card): use
 * fetchEventCardById for anything beyond the picker.
 */
export const fetchUploadCandidates = async (options: { startIso: string; endIso: string }): Promise<EventListItem[]> => {
  const rows: any[] = [];
  for (let from = 0; ; from += MAX_ROWS) {
    const { data, error } = await supabase
      .from('events')
      .select(UPLOAD_CANDIDATE_SELECT)
      .eq('status', 'published')
      .gte('starts_at', options.startIso)
      .lte('starts_at', options.endIso)
      .eq('media_assets.kind', 'image')
      .eq('media_assets.status', 'published')
      .order('created_at', { referencedTable: 'media_assets', ascending: false })
      .limit(1, { referencedTable: 'media_assets' })
      .order('starts_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + MAX_ROWS - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < MAX_ROWS) break;
  }
  return rows.map(mapEventCard);
};

/** Concerts of followed artists, venues and festivals in the window, any city. */
export const fetchFollowedEventCards = async (options: {
  artistIds: string[];
  venueIds: string[];
  festivalIds: string[];
  startIso: string;
  endIso: string;
}) => {
  const { artistIds, venueIds, festivalIds, startIso, endIso } = options;
  if (artistIds.length === 0 && venueIds.length === 0 && festivalIds.length === 0) return [];
  let artistEventIds: string[] = [];
  if (artistIds.length > 0) {
    // Which concerts in the window list a followed artist: ids only.
    const { data, error } = await supabase
      .from('event_artists')
      .select('event_id,events!inner(starts_at,status)')
      .in('artist_id', artistIds)
      .eq('events.status', 'published')
      .gte('events.starts_at', startIso)
      .lte('events.starts_at', endIso);
    if (error) throw error;
    artistEventIds = [...new Set((data || []).map((row: any) => String(row.event_id)))];
  }
  return fetchEventCards({ startIso, endIso, anyOf: { eventIds: artistEventIds, venueIds, festivalIds } });
};

export type UpcomingCity = { name: string; count: number; latitude: number | null; longitude: number | null };

// Set once the RPC is known to be missing, so the fallback does not pay a
// failed round trip every time.
let citiesRpcMissing = false;

const sortCities = (cities: UpcomingCity[]) =>
  cities.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'es'));

const fetchUpcomingCitiesFallback = async (startIso: string, endIso: string) => {
  const counts = new Map<string, { name: string; count: number; latSum: number; lngSum: number; geo: number }>();
  for (let from = 0; ; from += MAX_ROWS) {
    const { data, error } = await supabase
      .from('events')
      .select('city,venue_place:venue_places!events_venue_place_id_fkey(city,latitude,longitude)')
      .eq('status', 'published')
      .gte('starts_at', startIso)
      .lte('starts_at', endIso)
      .order('id', { ascending: true })
      .range(from, from + MAX_ROWS - 1);
    if (error) throw error;
    for (const row of (data || []) as any[]) {
      const venue = Array.isArray(row.venue_place) ? row.venue_place[0] : row.venue_place;
      const name = String(row.city || venue?.city || '').trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase('es');
      const current = counts.get(key) || { name, count: 0, latSum: 0, lngSum: 0, geo: 0 };
      current.count += 1;
      const lat = toCoordinate(venue?.latitude);
      const lng = toCoordinate(venue?.longitude);
      if (lat !== null && lng !== null) {
        current.latSum += lat;
        current.lngSum += lng;
        current.geo += 1;
      }
      counts.set(key, current);
    }
    if (!data || data.length < MAX_ROWS) break;
  }
  return sortCities(
    [...counts.values()].map(city => ({
      name: city.name,
      count: city.count,
      latitude: city.geo ? city.latSum / city.geo : null,
      longitude: city.geo ? city.lngSum / city.geo : null,
    })),
  );
};

/**
 * Cities with published concerts in the window, busiest first, each with a
 * representative point (the average of its venues). One small RPC; until that
 * function is deployed, a slim select aggregated here.
 */
export const fetchUpcomingCities = async (startIso: string, endIso: string): Promise<UpcomingCity[]> => {
  if (!citiesRpcMissing) {
    const { data, error } = await supabase.rpc('get_upcoming_cities', { p_from: startIso, p_to: endIso });
    if (!error) {
      return sortCities(
        ((data || []) as any[])
          .map(row => ({
            name: String(row.city ?? '').trim(),
            count: Number(row.event_count ?? 0),
            latitude: toCoordinate(row.latitude),
            longitude: toCoordinate(row.longitude),
          }))
          .filter(city => city.name),
      );
    }
    citiesRpcMissing = true;
  }
  return fetchUpcomingCitiesFallback(startIso, endIso);
};

// The map only needs enough to place one pin per venue and list its concerts.
// Venues and artist photos are read once on their own instead of being
// repeated inside every concert.
// The app runs on https: an http:// image is blocked as mixed content.
const httpsOnly = (url: string | null | undefined) => (url && url.startsWith('https://') ? url : null);

const MAP_EVENT_SELECT = `
  id,name,starts_at,city,venue_place_id,image_url,poster_thumb_url,poster_url,
  event_artists (
    billing_order,is_headliner,
    artist:artists!event_artists_artist_id_fkey (id,name)
  ),
  media_assets!media_assets_event_id_fkey (kind,status,secure_url,thumbnail_url,created_at)
`;

export type MapEvent = {
  id: string;
  name: string;
  starts_at: string;
  city: string;
  cover_image_url: string | null;
  /** Fan photo, then the R2 poster thumbnail and card size (never the original). */
  cover_sources: string[];
  venue: { id: string; name: string; latitude: number; longitude: number } | null;
  artist: { id: string; name: string; avatar_url: string | null } | null;
  artist_ids: string[];
  artist_names: string[];
};

type MapVenue = { id: string; name: string; latitude: number; longitude: number };

const latestImageUrl = (assets: any[] | null | undefined): string | null => {
  const image = (assets || [])
    .filter((asset: any) => asset?.kind === 'image' && asset?.status === 'published')
    .sort((left: any, right: any) => String(right.created_at).localeCompare(String(left.created_at)))[0];
  return image?.thumbnail_url ?? image?.secure_url ?? null;
};

export const mapMapEvent = (
  row: any,
  venues: Map<string, MapVenue>,
  artistImages: Map<string, string>,
): MapEvent => {
  const lineup = [...(row.event_artists || [])]
    .filter((entry: any) => entry?.artist?.id)
    .sort((left: any, right: any) =>
      Number(Boolean(right.is_headliner)) - Number(Boolean(left.is_headliner))
      || Number(left.billing_order ?? 0) - Number(right.billing_order ?? 0));
  const primary = lineup[0]?.artist ?? null;
  const venue = row.venue_place_id ? venues.get(String(row.venue_place_id)) ?? null : null;

  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    starts_at: String(row.starts_at ?? ''),
    city: String(row.city ?? ''),
    // Fan photos first, then the venue's poster: our R2 copies (small, then
    // card size) and, until it is mirrored, the original if it is https.
    cover_image_url: latestImageUrl(row.media_assets) ?? httpsOnly(row.image_url),
    // The heavy original only while there is no R2 copy yet.
    cover_sources: uniqueImageUrls([
      latestImageUrl(row.media_assets),
      row.poster_thumb_url,
      row.poster_url,
      row.poster_thumb_url || row.poster_url ? null : httpsOnly(row.image_url),
    ]),
    venue,
    artist: primary
      ? { id: String(primary.id), name: String(primary.name ?? ''), avatar_url: artistImages.get(String(primary.id)) ?? null }
      : null,
    artist_ids: lineup.map((entry: any) => String(entry.artist.id)),
    artist_names: lineup.map((entry: any) => String(entry.artist.name ?? '')),
  };
};

const fetchAllPages = async (page: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>) => {
  const rows: any[] = [];
  for (let from = 0; ; from += MAX_ROWS) {
    const { data, error } = await page(from, from + MAX_ROWS - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < MAX_ROWS) break;
  }
  return rows;
};

const fetchMapVenues = async () => {
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('venue_places')
      .select('id,name,latitude,longitude')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('id', { ascending: true })
      .range(from, to),
  );
  const venues = new Map<string, MapVenue>();
  for (const row of rows) {
    const latitude = toCoordinate(row.latitude);
    const longitude = toCoordinate(row.longitude);
    if (!row.id || latitude === null || longitude === null) continue;
    venues.set(String(row.id), { id: String(row.id), name: String(row.name ?? ''), latitude, longitude });
  }
  return venues;
};

// Artists' own published photos (their profile's media), newest first: the
// sheet's thumbnail when a concert has no fan photo yet.
const fetchArtistImages = async () => {
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('media_assets')
      .select('secure_url,thumbnail_url,created_at,subject:subjects!inner(artist_id)')
      .eq('kind', 'image')
      .eq('status', 'published')
      .not('subject.artist_id', 'is', null)
      .order('created_at', { ascending: false })
      .range(from, to),
  );
  const images = new Map<string, string>();
  for (const row of rows) {
    const subject = Array.isArray(row.subject) ? row.subject[0] : row.subject;
    const artistId = subject?.artist_id ? String(subject.artist_id) : null;
    const url = row.thumbnail_url ?? row.secure_url ?? null;
    if (artistId && url && !images.has(artistId)) images.set(artistId, url);
  }
  return images;
};

/**
 * Published events for the map: from the start of today on (or every date
 * with includePast), up to endIso when given.
 */
export const fetchMapEvents = async (options: { includePast?: boolean; endIso?: string } = {}) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const [rows, venues, artistImages] = await Promise.all([
    fetchAllPages((from, to) => {
      let query = supabase.from('events').select(MAP_EVENT_SELECT).eq('status', 'published');
      if (!options.includePast) query = query.gte('starts_at', startOfToday.toISOString());
      if (options.endIso) query = query.lte('starts_at', options.endIso);
      return query.order('starts_at', { ascending: true }).order('id', { ascending: true }).range(from, to);
    }),
    fetchMapVenues(),
    fetchArtistImages(),
  ]);
  return rows.map(row => mapMapEvent(row, venues, artistImages));
};
