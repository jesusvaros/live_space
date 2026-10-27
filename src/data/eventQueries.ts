import { supabase } from '../lib/supabase';
import type { EventListItem } from '../features/events/types';
import { mapArtist, mapEvent, mapVenue } from './canonicalMappers';

const EVENT_CARD_SELECT = `
  *,
  venue_place:venue_places!events_venue_place_id_fkey (
    id,name,city,address,capacity,venue_type,latitude,longitude,website_url,created_by,created_at,updated_at
  ),
  event_artists (
    artist:artists!event_artists_artist_id_fkey (*)
  ),
  media_assets!media_assets_event_id_fkey (
    kind,status,secure_url,thumbnail_url,created_at
  )
`;

export const mapEventCard = (row: any): EventListItem => {
  const publishedImages = (row.media_assets || [])
    .filter((asset: any) => asset.kind === 'image' && asset.status === 'published')
    .sort((left: any, right: any) => String(right.created_at).localeCompare(String(left.created_at)));
  // Fan photos first; the scraped poster only fills the empty state.
  const coverImageUrl =
    publishedImages[0]?.thumbnail_url ?? publishedImages[0]?.secure_url ?? row.image_url ?? null;

  return {
    ...mapEvent({ ...row, cover_image_url: coverImageUrl }),
    venue_place: row.venue_place ? mapVenue({ ...row.venue_place, photos: [] }) : null,
    event_artists: (row.event_artists || []).map((entry: any) => ({
      artist: entry.artist ? mapArtist({ ...entry.artist, avatar_url: entry.artist.image_url ?? null }) : null,
    })),
  };
};

export const fetchEventCards = async (options: {
  startIso?: string;
  endIso?: string;
  eventId?: string;
  eventIds?: string[];
  venueId?: string;
}) => {
  let query = supabase.from('events').select(EVENT_CARD_SELECT).eq('status', 'published');
  if (options.startIso) query = query.gte('starts_at', options.startIso);
  if (options.endIso) query = query.lte('starts_at', options.endIso);
  if (options.eventId) query = query.eq('id', options.eventId);
  if (options.eventIds) {
    if (options.eventIds.length === 0) return [];
    query = query.in('id', options.eventIds);
  }
  if (options.venueId) query = query.eq('venue_place_id', options.venueId);

  const { data, error } = await query.order('starts_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapEventCard);
};

export const fetchEventCardById = async (eventId: string) => {
  const rows = await fetchEventCards({ eventId });
  return rows[0] ?? null;
};

// The map only needs enough to place one pin per venue and list its concerts;
// the full card select is several times heavier.
const MAP_EVENT_SELECT = `
  id,name,starts_at,city,
  venue_place:venue_places!events_venue_place_id_fkey (id,name,latitude,longitude),
  event_artists (
    billing_order,is_headliner,
    artist:artists!event_artists_artist_id_fkey (
      id,name,
      subjects ( media_assets ( kind,status,secure_url,thumbnail_url,created_at ) )
    )
  ),
  media_assets!media_assets_event_id_fkey (kind,status,secure_url,thumbnail_url,created_at)
`;

export type MapEvent = {
  id: string;
  name: string;
  starts_at: string;
  city: string;
  cover_image_url: string | null;
  venue: { id: string; name: string; latitude: number; longitude: number } | null;
  artist: { id: string; name: string; avatar_url: string | null } | null;
  artist_ids: string[];
  artist_names: string[];
};

const latestImageUrl = (assets: any[] | null | undefined): string | null => {
  const image = (assets || [])
    .filter((asset: any) => asset?.kind === 'image' && asset?.status === 'published')
    .sort((left: any, right: any) => String(right.created_at).localeCompare(String(left.created_at)))[0];
  return image?.thumbnail_url ?? image?.secure_url ?? null;
};

const toCoordinate = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const mapMapEvent = (row: any): MapEvent => {
  const lineup = [...(row.event_artists || [])]
    .filter((entry: any) => entry?.artist?.id)
    .sort((left: any, right: any) =>
      Number(Boolean(right.is_headliner)) - Number(Boolean(left.is_headliner))
      || Number(left.billing_order ?? 0) - Number(right.billing_order ?? 0));
  const primary = lineup[0]?.artist ?? null;
  const subjects = primary?.subjects;
  const primaryMedia = Array.isArray(subjects)
    ? subjects.flatMap((subject: any) => subject?.media_assets || [])
    : subjects?.media_assets;
  const venue = row.venue_place;
  const latitude = toCoordinate(venue?.latitude);
  const longitude = toCoordinate(venue?.longitude);

  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    starts_at: String(row.starts_at ?? ''),
    city: String(row.city ?? ''),
    cover_image_url: latestImageUrl(row.media_assets),
    venue:
      venue?.id && latitude !== null && longitude !== null
        ? { id: String(venue.id), name: String(venue.name ?? ''), latitude, longitude }
        : null,
    artist: primary
      ? { id: String(primary.id), name: String(primary.name ?? ''), avatar_url: latestImageUrl(primaryMedia) }
      : null,
    artist_ids: lineup.map((entry: any) => String(entry.artist.id)),
    artist_names: lineup.map((entry: any) => String(entry.artist.name ?? '')),
  };
};

/** Published events for the map: from the start of today on, unless includePast. */
export const fetchMapEvents = async (options: { includePast?: boolean } = {}) => {
  let query = supabase.from('events').select(MAP_EVENT_SELECT).eq('status', 'published');
  if (!options.includePast) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    query = query.gte('starts_at', startOfToday.toISOString());
  }
  const { data, error } = await query.order('starts_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapMapEvent);
};
