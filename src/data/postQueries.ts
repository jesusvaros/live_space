import { supabase } from '../lib/supabase';
import type { PostWithRelations } from '../lib/types';

export const fetchPostCards = async (options: {
  from?: number;
  to?: number;
  postId?: string;
  authorId?: string;
  eventId?: string;
  eventIds?: string[];
  /** Moments of any concert at this venue. */
  venueId?: string;
} = {}) => {
  let query = supabase.from('v_post_cards').select('*');
  if (options.postId) query = query.eq('id', options.postId);
  if (options.authorId) query = query.eq('user_id', options.authorId);
  if (options.eventId) query = query.eq('event_id', options.eventId);
  if (options.venueId) query = query.eq('events->venue_place->>id', options.venueId);
  if (options.eventIds) {
    if (options.eventIds.length === 0) return [];
    query = query.in('event_id', options.eventIds);
  }
  query = query.order('created_at', { ascending: false });
  if (options.from !== undefined && options.to !== undefined) {
    query = query.range(options.from, options.to);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as PostWithRelations[];
};

export const fetchPostCardById = async (postId: string) => {
  const posts = await fetchPostCards({ postId });
  return posts[0] ?? null;
};
