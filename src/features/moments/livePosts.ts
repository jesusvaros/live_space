import { useEffect, useRef, useState } from 'react';
import { invalidateQueries } from '../../lib/queryClient';
import { clearCached } from '../../lib/requestCache';
import { supabase } from '../../lib/supabase';

// New moments while a screen is open.
//
// - Your own: the upload queue calls notifyOwnPostPublished() as soon as a
//   post exists, and the screens that show it (the concert, your profile,
//   Momentos) reload it at once.
// - Everybody else's: Supabase Realtime sends each new published post (the
//   table is in the supabase_realtime publication, and RLS — posts_read —
//   decides who gets which row, blocks included). The screens count them
//   and show «N momentos nuevos»; tapping it loads them, so nothing jumps
//   while someone is watching or scrolling. Coming back to the app also
//   reloads (useAppResume), which covers a socket the phone closed while
//   the app was in the background.

export type PublishedPost = {
  postId: string;
  eventId: string;
  authorId: string;
};

type Listener = (post: PublishedPost) => void;
const listeners = new Set<Listener>();

/** Called by the upload queue once a post of this user exists. */
export const notifyOwnPostPublished = (post: PublishedPost) => {
  // Cached reads that include it: the profile's moments and the
  // «did you upload to this concert» counts.
  invalidateQueries('["profile:data"');
  clearCached('posts:count:user:');
  for (const listener of Array.from(listeners)) {
    try {
      listener(post);
    } catch {
      // A screen's refresh never breaks the queue.
    }
  }
};

export const onOwnPostPublished = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Runs `listener` for each post this user publishes while the screen is mounted. */
export const useOwnPostPublished = (listener: Listener, enabled = true) => {
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => {
    if (!enabled) return undefined;
    return onOwnPostPublished(post => ref.current(post));
  }, [enabled]);
};

// ---------------------------------------------------------------------------
// Other people's posts (Realtime)

export type IncomingPostRow = {
  id?: string | null;
  author_id?: string | null;
  event_id?: string | null;
  status?: string | null;
};

/**
 * Whether a row sent by Realtime is a new moment worth announcing: published,
 * not yours (yours reload by themselves), of this concert when watching one,
 * and not counted already.
 */
export const isNewOthersPost = (
  row: IncomingPostRow | null | undefined,
  options: { currentUserId: string | null; eventId?: string | null; seen: ReadonlySet<string> },
) => {
  if (!row?.id) return false;
  if (row.status && row.status !== 'published') return false;
  if (options.currentUserId && row.author_id === options.currentUserId) return false;
  if (options.eventId && row.event_id !== options.eventId) return false;
  return !options.seen.has(row.id);
};

let channelCounter = 0;

/** Listens to new posts (one concert's, or all). Returns the cleanup. */
export const subscribeToNewPosts = (
  options: { eventId?: string | null },
  onRow: (row: IncomingPostRow) => void,
) => {
  if (typeof supabase.channel !== 'function') return () => undefined;
  channelCounter += 1;
  const channel = supabase
    .channel(`posts-new:${options.eventId ?? 'all'}:${channelCounter}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'posts',
        ...(options.eventId ? { filter: `event_id=eq.${options.eventId}` } : {}),
      },
      payload => onRow((payload.new ?? {}) as IncomingPostRow),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
};

/**
 * How many new moments by other people arrived since the screen loaded (or
 * since reset()). `eventId` limits it to one concert.
 */
export const useNewPostsNotice = (options: {
  eventId?: string | null;
  currentUserId: string | null;
  enabled?: boolean;
}) => {
  const { eventId = null, currentUserId, enabled = true } = options;
  const [count, setCount] = useState(0);
  const seen = useRef(new Set<string>());
  const userRef = useRef(currentUserId);
  userRef.current = currentUserId;

  useEffect(() => {
    seen.current = new Set();
    setCount(0);
    if (!enabled) return undefined;
    return subscribeToNewPosts({ eventId }, row => {
      if (!isNewOthersPost(row, { currentUserId: userRef.current, eventId, seen: seen.current })) return;
      seen.current.add(row.id as string);
      setCount(value => value + 1);
    });
  }, [enabled, eventId]);

  const reset = () => {
    seen.current = new Set();
    setCount(0);
  };

  return { count, reset };
};

/** «1 momento nuevo» / «3 momentos nuevos»; without a reliable number, «Momentos nuevos». */
export const newMomentsLabel = (count: number, exact = true) => {
  if (!exact) return 'Momentos nuevos';
  return count === 1 ? '1 momento nuevo' : `${count} momentos nuevos`;
};
