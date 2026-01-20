import { supabase } from '../lib/supabase';
import { PostWithSetlist, EventSetlistEntry } from '../lib/types';

export const eventService = {
  async getEventPosts(eventId: string): Promise<PostWithSetlist[]> {
    const { data, error } = await supabase
      .from('v_posts_with_setlist')
      .select('*')
      .eq('event_id', eventId)
      .order('event_offset_ms', { ascending: true, nullsFirst: false })
      .order('captured_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getEventSetlist(eventId: string): Promise<EventSetlistEntry[]> {
    const { data, error } = await supabase
      .from('event_setlist')
      .select('*')
      .eq('event_id', eventId)
      .order('ordinal', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getSetlistEntryForOffset(eventId: string, offsetMs: number) {
    const { data, error } = await supabase
      .rpc('get_setlist_entry_for_offset', {
        p_event_id: eventId,
        p_offset_ms: offsetMs
      });

    if (error) throw error;
    return data?.[0] || null;
  }
};
