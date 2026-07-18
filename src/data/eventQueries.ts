import { supabase } from '../lib/supabase';
import type { EventListItem } from '../features/events/types';
import { mapArtist, mapEvent, mapVenue } from './canonicalMappers';

const EVENT_CARD_SELECT = `
  *,
  venue_place:venue_places!events_venue_place_id_fkey (
    id,name,city,address,capacity,venue_type,latitude,longitude,website_url,created_by,created_at,updated_at
  ),
  event_artists (
    artist:artists!event_artists_artist_id_fkey (
      id,name,artist_type,city,bio,genres,external_links,created_at,updated_at
    )
  ),
  media_assets!media_assets_event_id_fkey (
    kind,status,secure_url,thumbnail_url,created_at
  )
`;

export const mapEventCard = (row: any): EventListItem => {
  const publishedImages = (row.media_assets || [])
    .filter((asset: any) => asset.kind === 'image' && asset.status === 'published')
    .sort((left: any, right: any) => String(right.created_at).localeCompare(String(left.created_at)));
  const coverImageUrl = publishedImages[0]?.thumbnail_url ?? publishedImages[0]?.secure_url ?? null;

  return {
    ...mapEvent({ ...row, cover_image_url: coverImageUrl }),
    venue_place: row.venue_place ? mapVenue({ ...row.venue_place, photos: [] }) : null,
    event_artists: (row.event_artists || []).map((entry: any) => ({
      artist: entry.artist ? mapArtist({ ...entry.artist, avatar_url: null }) : null,
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
