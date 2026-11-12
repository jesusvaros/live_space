import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

// The signed-in person's own sets of moments:
//  - saved: their likes (post_likes, ♥). Liking a moment is saving it to
//    «Guardadas» (Perfil → Fotos guardadas); likes also rank overlapping clips
//    in the concert player.
//  - hidden: hidden_posts, moments they hid from their own view («Ocultar»).
//    While that table is not live the set still works on this device for the
//    session, so «Ocultar» never looks broken.
// One shared store per set, so the viewer, the albums and the player agree.

type Table = 'post_likes' | 'hidden_posts';
// ready: the server's list for userId has arrived (or failed).
type State = { userId: string | null; ids: ReadonlySet<string>; local: boolean; ready: boolean };

const EMPTY: ReadonlySet<string> = new Set();
// Enough for any person's likes; older ones only matter on «Guardadas», which
// pages through the table itself.
const MAX_ROWS = 2000;

const createStore = (table: Table) => {
  let state: State = { userId: null, ids: EMPTY, local: false, ready: false };
  const listeners = new Set<() => void>();
  const setState = (next: Partial<State>) => {
    state = { ...state, ...next };
    listeners.forEach(listener => listener());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const load = async (userId: string) => {
    setState({ userId, ids: EMPTY, local: false, ready: false });
    const { data, error } = await supabase
      .from(table)
      .select('post_id')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    if (state.userId !== userId) return;
    if (error) {
      setState({ local: true, ready: true });
      return;
    }
    setState({ ready: true, ids: new Set((data || []).map(row => (row as { post_id: string }).post_id)) });
  };

  const useIds = (): ReadonlySet<string> => {
    const { user } = useAuth();
    const userId = user?.id ?? null;
    useEffect(() => {
      if (!userId) {
        if (state.userId) setState({ userId: null, ids: EMPTY, local: false, ready: false });
        return;
      }
      if (state.userId !== userId) void load(userId);
    }, [userId]);
    const snapshot = useSyncExternalStore(subscribe, () => state);
    return snapshot.userId && snapshot.userId === userId ? snapshot.ids : EMPTY;
  };

  /** Whether useIds already reflects the server (not the empty set of a load in flight). */
  const useReady = (): boolean => {
    const { user } = useAuth();
    const snapshot = useSyncExternalStore(subscribe, () => state);
    return Boolean(user && snapshot.userId === user.id && snapshot.ready);
  };

  const apply = (postId: string, on: boolean) => {
    const next = new Set(state.ids);
    if (on) next.add(postId);
    else next.delete(postId);
    setState({ ids: next });
  };

  /** Adds or removes a post; optimistic, rolled back on a server error. */
  const set = async (userId: string, postId: string, on: boolean) => {
    if (state.userId !== userId) return;
    const before = state.ids.has(postId);
    if (before === on) return;
    apply(postId, on);
    if (state.local && table === 'hidden_posts') return;
    const { error } = on
      ? await supabase.from(table).insert({ post_id: postId, profile_id: userId })
      : await supabase.from(table).delete().eq('post_id', postId).eq('profile_id', userId);
    // Already there: same outcome.
    if (!error || error.code === '23505') return;
    if (table === 'hidden_posts' && (error.code === '42P01' || error.code === 'PGRST205')) {
      // Migration not live yet: keep it on this device.
      setState({ local: true });
      return;
    }
    if (state.userId === userId) apply(postId, before);
    throw error;
  };

  return { useIds, useReady, set };
};

const saved = createStore('post_likes');
const hidden = createStore('hidden_posts');

export const useSavedPostIds = saved.useIds;
export const setPostSaved = saved.set;
export const useSavedPostIdsReady = saved.useReady;
export const useHiddenPostIds = hidden.useIds;
export const setPostHidden = hidden.set;

/**
 * The author deletes their moment and its files (delete_my_post, migration
 * 20261112010100). Throws when it could not be deleted.
 */
export const deleteMyPost = async (postId: string) => {
  const { data, error } = await supabase.rpc('delete_my_post', { p_post_id: postId });
  if (error) throw error;
  if (!(data as { deleted?: boolean } | null)?.deleted) throw new Error('not_found');
};
