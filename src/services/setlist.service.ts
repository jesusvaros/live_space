import { supabase } from '../lib/supabase';
import { Song, EventSetlistEntry } from '../lib/types';

export const setlistService = {
  async getSongs(query?: string): Promise<Song[]> {
    let builder = supabase.from('songs').select('*');
    if (query) {
      builder = builder.ilike('title', `%${query}%`);
    }
    const { data, error } = await builder
      .order('title', { ascending: true })
      .limit(20);
    if (error) throw error;
    return data || [];
  },

  async createSong(song: Omit<Song, 'id' | 'created_at'>): Promise<Song> {
    const { data, error } = await supabase
      .from('songs')
      .insert(song)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateEventSetlist(eventId: string, entries: Omit<EventSetlistEntry, 'created_at'>[]): Promise<void> {
    // We replace the entire setlist for the event
    const { error: deleteError } = await supabase
      .from('event_setlist')
      .delete()
      .eq('event_id', eventId);

    if (deleteError) throw deleteError;

    if (entries.length === 0) return;

    const { error: insertError } = await supabase
      .from('event_setlist')
      .insert(entries);

    if (insertError) throw insertError;
  },

  async getArtistSongs(artistId: string): Promise<Song[]> {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .eq('artist_id', artistId)
      .order('title', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  async getEventSetlist(eventId: string): Promise<EventSetlistEntry[]> {
    const { data, error } = await supabase
      .from('event_setlist')
      .select(`
        *,
        performer:artists!event_setlist_performer_artist_id_fkey (
          id,
          name,
          avatar_url
        ),
        song:songs (
          id,
          title
        )
      `)
      .eq('event_id', eventId)
      .order('ordinal', { ascending: true });

    if (error) throw error;
    return data || [];
  }
};
