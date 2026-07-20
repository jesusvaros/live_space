import { supabase } from '../api';
import { Song, EventSetlistEntry } from '../lib/types';

const mapSong = (row: any): Song => ({
  id: row.id,
  title: row.title,
  artist_id: row.primary_artist_id ?? null,
  created_at: row.created_at,
});

const mapSetlistEntry = (row: any): EventSetlistEntry => ({
  event_id: row.event_id,
  ordinal: row.position,
  performer_artist_id: row.artist_id ?? null,
  song_id: row.song_id ?? null,
  song_title: row.title_override ?? row.song?.title ?? null,
  starts_offset_ms: row.performed_at_offset_seconds == null ? null : row.performed_at_offset_seconds * 1000,
  ends_offset_ms: null,
  created_at: row.created_at,
  ...(row.performer ? { performer: row.performer } : {}),
  ...(row.song ? { song: row.song } : {}),
}) as EventSetlistEntry;

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
    return (data || []).map(mapSong);
  },

  async createSong(song: Omit<Song, 'id' | 'created_at'>): Promise<Song> {
    const { data, error } = await supabase
      .from('songs')
      .insert({
        title: song.title,
        normalized_title: song.title.trim().toLocaleLowerCase('es'),
        primary_artist_id: song.artist_id,
      })
      .select()
      .single();
    if (error) throw error;
    return mapSong(data);
  },

  async updateEventSetlist(eventId: string, entries: Omit<EventSetlistEntry, 'created_at'>[]): Promise<void> {
    // We replace the entire setlist for the event
    const { error: deleteError } = await supabase
      .from('event_setlist_items')
      .delete()
      .eq('event_id', eventId);

    if (deleteError) throw deleteError;

    if (entries.length === 0) return;

    const { error: insertError } = await supabase
      .from('event_setlist_items')
      .insert(entries.map(entry => ({
        event_id: eventId,
        position: entry.ordinal,
        artist_id: entry.performer_artist_id,
        song_id: entry.song_id,
        title_override: entry.song_title,
        performed_at_offset_seconds: entry.starts_offset_ms == null ? null : Math.floor(entry.starts_offset_ms / 1000),
      })));

    if (insertError) throw insertError;
  },

  async getArtistSongs(artistId: string): Promise<Song[]> {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .eq('primary_artist_id', artistId)
      .order('title', { ascending: true });
    
    if (error) throw error;
    return (data || []).map(mapSong);
  },

  async getEventSetlist(eventId: string): Promise<EventSetlistEntry[]> {
    const { data, error } = await supabase
      .from('event_setlist_items')
      .select(`
        *,
        performer:artists!event_setlist_items_artist_id_fkey (
          id,
          name
        ),
        song:songs (
          id,
          title
        )
      `)
      .eq('event_id', eventId)
      .order('position', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapSetlistEntry);
  }
};
