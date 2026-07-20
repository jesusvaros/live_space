import { supabase } from '../api';
import { Artist } from '../lib/types';
import { mapArtist } from '../data/canonicalMappers';
import { normalizeForMatching } from '../normalize/normalizeText';

export const artistService = {
  async createArtist(artist: Omit<Artist, 'id' | 'created_at' | 'updated_at' | 'subject_id'>): Promise<Artist> {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw authError ?? new Error('Authentication required');

    const { data, error } = await supabase
      .from('artists')
      .insert({
        name: artist.name,
        normalized_name: normalizeForMatching(artist.name),
        artist_type: artist.artist_type,
        city: artist.city,
        bio: artist.bio,
        genres: artist.genres,
        external_links: artist.external_links,
        created_by: authData.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // 2. Ensure subject exists using RPC
    const { data: subjectId, error: rpcError } = await supabase
      .rpc('get_or_create_artist_subject', { p_artist_id: data.id });

    if (rpcError) throw rpcError;

    return mapArtist({ ...data, subject_id: subjectId, avatar_url: artist.avatar_url });
  },

  async getArtistBySubject(subjectId: string): Promise<Artist | null> {
    const { data, error } = await supabase
      .from('v_subject_artists')
      .select('*')
      .eq('subject_id', subjectId)
      .maybeSingle();

    if (error) throw error;
    return data ? mapArtist(data) : null;
  },

  async updateArtist(id: string, updates: Partial<Artist>): Promise<Artist> {
    const payload = {
      ...(updates.name === undefined ? {} : { name: updates.name, normalized_name: normalizeForMatching(updates.name) }),
      ...(updates.artist_type === undefined ? {} : { artist_type: updates.artist_type }),
      ...(updates.city === undefined ? {} : { city: updates.city }),
      ...(updates.bio === undefined ? {} : { bio: updates.bio }),
      ...(updates.genres === undefined ? {} : { genres: updates.genres }),
      ...(updates.external_links === undefined ? {} : { external_links: updates.external_links }),
    };
    const { data, error } = await supabase
      .from('artists')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapArtist(data);
  }
};
