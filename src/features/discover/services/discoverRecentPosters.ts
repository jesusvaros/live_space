import { supabase } from '../../../lib/supabase';
import { cached } from '../../../lib/requestCache';
import { DiscoverArtist, DiscoverVenue } from '../types';

const MAX_POSTERS = 3;

const unique = (items: string[]) => Array.from(new Set(items));

const buildPostersByArtist = async (artistIds: string[]) => {
  const sortedIds = unique(artistIds).sort();
  if (sortedIds.length === 0) return {} as Record<string, string[]>;

  return cached(
    `discover:artist:posters:${sortedIds.join(',')}`,
    async () => {
      const { data: eventArtistRows, error: eventArtistError } = await supabase
        .from('event_artists')
        .select('artist_entity_id,event_id')
        .in('artist_entity_id', sortedIds);
      if (eventArtistError) throw eventArtistError;

      const eventIds = unique((eventArtistRows || []).map((row: any) => row.event_id).filter(Boolean));
      if (eventIds.length === 0) return {} as Record<string, string[]>;

      const { data: eventRows, error: eventError } = await supabase
        .from('events')
        .select('id,starts_at,cover_image_url')
        .in('id', eventIds)
        .order('starts_at', { ascending: false });
      if (eventError) throw eventError;

      const eventById = new Map<string, { starts_at: string; cover_image_url: string | null }>();
      for (const event of eventRows || []) {
        eventById.set((event as any).id, {
          starts_at: (event as any).starts_at,
          cover_image_url: (event as any).cover_image_url,
        });
      }

      const grouped = new Map<string, { cover: string; starts: number }[]>();
      for (const row of eventArtistRows || []) {
        const artistId = (row as any).artist_entity_id as string | null;
        const eventId = (row as any).event_id as string | null;
        if (!artistId || !eventId) continue;

        const event = eventById.get(eventId);
        const cover = event?.cover_image_url || null;
        if (!cover) continue;

        const starts = Date.parse(event?.starts_at || '');
        const next = grouped.get(artistId) || [];
        next.push({ cover, starts: Number.isFinite(starts) ? starts : 0 });
        grouped.set(artistId, next);
      }

      const postersByArtist: Record<string, string[]> = {};
      for (const [artistId, rows] of grouped.entries()) {
        rows.sort((a, b) => b.starts - a.starts);
        const seen = new Set<string>();
        const posters: string[] = [];
        for (const row of rows) {
          if (seen.has(row.cover)) continue;
          seen.add(row.cover);
          posters.push(row.cover);
          if (posters.length >= MAX_POSTERS) break;
        }
        postersByArtist[artistId] = posters;
      }

      return postersByArtist;
    },
    { ttlMs: 60_000 }
  );
};

const buildPostersByVenue = async (venueIds: string[]) => {
  const sortedIds = unique(venueIds).sort();
  if (sortedIds.length === 0) return {} as Record<string, string[]>;

  return cached(
    `discover:venue:posters:${sortedIds.join(',')}`,
    async () => {
      const { data: eventRows, error: eventError } = await supabase
        .from('events')
        .select('venue_place_id,starts_at,cover_image_url')
        .in('venue_place_id', sortedIds)
        .order('starts_at', { ascending: false });
      if (eventError) throw eventError;

      const grouped = new Map<string, { cover: string; starts: number }[]>();
      for (const row of eventRows || []) {
        const venueId = (row as any).venue_place_id as string | null;
        const cover = (row as any).cover_image_url as string | null;
        if (!venueId || !cover) continue;

        const starts = Date.parse((row as any).starts_at || '');
        const next = grouped.get(venueId) || [];
        next.push({ cover, starts: Number.isFinite(starts) ? starts : 0 });
        grouped.set(venueId, next);
      }

      const postersByVenue: Record<string, string[]> = {};
      for (const [venueId, rows] of grouped.entries()) {
        rows.sort((a, b) => b.starts - a.starts);
        const seen = new Set<string>();
        const posters: string[] = [];
        for (const row of rows) {
          if (seen.has(row.cover)) continue;
          seen.add(row.cover);
          posters.push(row.cover);
          if (posters.length >= MAX_POSTERS) break;
        }
        postersByVenue[venueId] = posters;
      }

      return postersByVenue;
    },
    { ttlMs: 60_000 }
  );
};

export const withArtistRecentPosters = async (artists: DiscoverArtist[]): Promise<DiscoverArtist[]> => {
  if (artists.length === 0) return artists;
  const postersByArtist = await buildPostersByArtist(artists.map(artist => artist.id));
  return artists.map(artist => ({
    ...artist,
    recent_posters: postersByArtist[artist.id] || [],
  }));
};

export const withVenueRecentPosters = async (venues: DiscoverVenue[]): Promise<DiscoverVenue[]> => {
  if (venues.length === 0) return venues;
  const postersByVenue = await buildPostersByVenue(venues.map(venue => venue.id));
  return venues.map(venue => ({
    ...venue,
    recent_posters: postersByVenue[venue.id] || [],
  }));
};
