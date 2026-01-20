import { supabase } from '../lib/supabase';
import { Artist } from '../lib/types';

export const artistService = {
  async createArtist(artist: Omit<Artist, 'id' | 'created_at' | 'updated_at' | 'subject_id'>): Promise<Artist> {
    // 1. Create artist first (id is deterministic if we provide one, but here we let DB handle or provide uuidv5 if needed)
    const { data, error } = await supabase
      .from('artists')
      .insert(artist)
      .select()
      .single();

    if (error) throw error;

    // 2. Ensure subject exists using RPC
    const { data: subjectId, error: rpcError } = await supabase
      .rpc('get_or_create_artist_subject', { p_artist_id: data.id });

    if (rpcError) throw rpcError;

    return { ...data, subject_id: subjectId };
  },

  async getArtistBySubject(subjectId: string): Promise<Artist | null> {
    const { data, error } = await supabase
      .from('v_subject_artists')
      .select('*')
      .eq('subject_id', subjectId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async updateArtist(id: string, updates: Partial<Artist>): Promise<Artist> {
    const { data, error } = await supabase
      .from('artists')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
