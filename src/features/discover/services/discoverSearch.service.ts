import { supabase } from '../../../lib/supabase';
import { cached } from '../../../lib/requestCache';
import { DiscoverArtist, DiscoverVenue } from '../types';

export const searchArtists = async (query: string, limit = 20): Promise<DiscoverArtist[]> => {
  const q = query.trim();
  if (!q) return [];
  return cached(
    `discover:artists:search:${q}:${limit}`,
    async () => {
      const { data, error } = await supabase
        .from('v_subject_artists')
        .select('artist_id,subject_id,name,avatar_url,city,genres')
        .or(`name.ilike.%${q}%,city.ilike.%${q}%`)
        .limit(limit);
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.artist_id,
        subject_id: row.subject_id,
        name: row.name,
        avatar_url: row.avatar_url,
        city: row.city,
        genres: row.genres || [],
      })) as DiscoverArtist[];
    },
    { ttlMs: 10_000 }
  );
};

export const searchVenues = async (query: string, limit = 20): Promise<DiscoverVenue[]> => {
  const q = query.trim();
  if (!q) return [];
  return cached(
    `discover:venues:search:${q}:${limit}`,
    async () => {
      const { data, error } = await supabase
        .from('v_subject_venues')
        .select('venue_place_id,subject_id,name,city,address,photos,venue_type,capacity')
        .or(`name.ilike.%${q}%,city.ilike.%${q}%`)
        .limit(limit);
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.venue_place_id,
        subject_id: row.subject_id,
        name: row.name,
        city: row.city,
        address: row.address,
        photos: row.photos || [],
        venue_type: row.venue_type ?? null,
        capacity: row.capacity ?? null,
      })) as DiscoverVenue[];
    },
    { ttlMs: 10_000 }
  );
};
