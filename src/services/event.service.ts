import { supabase } from '../api';
import { PostWithSetlist, EventSetlistEntry } from '../lib/types';
import { setlistService } from './setlist.service';

export const eventService = {
  async getEventPosts(eventId: string): Promise<PostWithSetlist[]> {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        id,author_id,event_id,song_id,caption,captured_at,created_at,updated_at,
        media:media_assets!posts_media_asset_id_fkey (kind,secure_url,thumbnail_url),
        profiles:profiles!posts_author_id_fkey (id,username,display_name,avatar_url)
      `)
      .eq('event_id', eventId)
      .order('captured_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map((row: any) => ({
      ...row,
      user_id: row.author_id,
      actor_subject_id: null,
      event_offset_ms: null,
      performance_artist_id: null,
      song_title: null,
      media_url: row.media?.secure_url ?? '',
      media_type: row.media?.kind ?? 'image',
      thumbnail_url: row.media?.thumbnail_url ?? null,
      capture_source: null,
      resolved_song_id: row.song_id,
      resolved_song_title: null,
      resolved_performer_id: null,
      actor_name: row.profiles?.display_name ?? row.profiles?.username ?? null,
      actor_image_url: row.profiles?.avatar_url ?? null,
      actor_type: 'user',
    })) as PostWithSetlist[];
  },

  async getEventSetlist(eventId: string): Promise<EventSetlistEntry[]> {
    return setlistService.getEventSetlist(eventId);
  },

  async getSetlistEntryForOffset(eventId: string, offsetMs: number) {
    const entries = await setlistService.getEventSetlist(eventId);
    return [...entries]
      .filter(entry => entry.starts_offset_ms !== null && entry.starts_offset_ms <= offsetMs)
      .sort((left, right) => (right.starts_offset_ms ?? 0) - (left.starts_offset_ms ?? 0))[0] ?? null;
  }
};
