import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { invalidateQueries } from '../../lib/queryClient';

// The signed-in person's blocks (user_blocks: blocker_id = me). RLS
// (blocks_own_all) lets each person read, add and remove only their own rows.

type State = { userId: string | null; ids: ReadonlySet<string>; loading: boolean };

const EMPTY: ReadonlySet<string> = new Set();
let state: State = { userId: null, ids: EMPTY, loading: false };
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
  setState({ userId, ids: EMPTY, loading: true });
  const { data, error } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', userId);
  if (state.userId !== userId) return;
  setState({ ids: error ? EMPTY : new Set((data || []).map(row => row.blocked_id as string)), loading: false });
};

/** Profile ids the signed-in person has blocked (empty when signed out). */
export const useBlockedUserIds = (): ReadonlySet<string> => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) {
      if (state.userId) setState({ userId: null, ids: EMPTY, loading: false });
      return;
    }
    if (state.userId !== userId) void load(userId);
  }, [userId]);
  const snapshot = useSyncExternalStore(subscribe, () => state);
  return snapshot.userId && snapshot.userId === userId ? snapshot.ids : EMPTY;
};

// Every screen refetches after a change: the server filter is the one that
// counts, the local set only hides what is already on screen.
const afterChange = () => invalidateQueries();

export const blockUser = async (blockerId: string, blockedId: string) => {
  if (blockerId === blockedId) throw new Error('No puedes bloquearte a ti.');
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  // Already blocked: same outcome.
  if (error && error.code !== '23505') throw error;
  if (state.userId === blockerId) setState({ ids: new Set([...state.ids, blockedId]) });
  afterChange();
};

export const unblockUser = async (blockerId: string, blockedId: string) => {
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
  if (error) throw error;
  if (state.userId === blockerId) setState({ ids: new Set([...state.ids].filter(id => id !== blockedId)) });
  afterChange();
};

export type BlockedProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  blocked_at: string;
};

export const fetchBlockedProfiles = async (blockerId: string): Promise<BlockedProfile[]> => {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id, created_at, profile:profiles!user_blocks_blocked_id_fkey(username, display_name, avatar_url)')
    .eq('blocker_id', blockerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data || []) as any[]).map(row => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return {
      id: row.blocked_id as string,
      // A private profile is not readable: the row stays, without a name.
      username: profile?.username ?? null,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      blocked_at: row.created_at as string,
    };
  });
};
