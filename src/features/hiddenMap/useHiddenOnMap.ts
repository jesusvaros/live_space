import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  addHidden,
  readLocalHidden,
  removeHidden,
  toHiddenSets,
  writeLocalHidden,
  type HiddenMapItem,
  type HiddenMapType,
} from './hiddenMap';

// Where the list lives: signed out (or before the table exists) on the
// device; signed in in hidden_map_subjects. What a visitor hid before signing
// in is copied to the account once, then the local copy is cleared.

type Mode = 'local' | 'account';
type State = { key: string | null; mode: Mode; items: HiddenMapItem[]; ready: boolean };

let state: State = { key: null, mode: 'local', items: [], ready: false };
const listeners = new Set<() => void>();
const setState = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach(listener => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const SELECT = 'subject_type, artist_id, venue_place_id, created_at, artist:artists(name, image_url), venue:venue_places(name, image_url)';

const rowToItem = (row: any): HiddenMapItem | null => {
  const isArtist = row.subject_type === 'artist';
  const id = isArtist ? row.artist_id : row.venue_place_id;
  if (!id) return null;
  const entity = Array.isArray(isArtist ? row.artist : row.venue) ? (isArtist ? row.artist : row.venue)[0] : isArtist ? row.artist : row.venue;
  return {
    type: isArtist ? 'artist' : 'venue',
    id,
    name: entity?.name || (isArtist ? 'Artista' : 'Sala'),
    imageUrl: entity?.image_url ?? null,
    hiddenAt: row.created_at,
  };
};

const rowFor = (profileId: string, item: { type: HiddenMapType; id: string }) => ({
  profile_id: profileId,
  subject_type: item.type,
  artist_id: item.type === 'artist' ? item.id : null,
  venue_place_id: item.type === 'venue' ? item.id : null,
});

const loadLocal = () => setState({ key: 'local', mode: 'local', items: readLocalHidden(), ready: true });

const loadAccount = async (profileId: string) => {
  const key = `user:${profileId}`;
  setState({ key, mode: 'account', items: [], ready: false });
  const local = readLocalHidden();
  if (local.length > 0) {
    // One by one: a row already in the account (23505) is fine; any other
    // failure keeps the local copy for next time.
    let failed = false;
    for (const item of local) {
      const { error } = await supabase.from('hidden_map_subjects').insert(rowFor(profileId, item));
      if (error && error.code !== '23505') {
        failed = true;
        break;
      }
    }
    if (!failed) writeLocalHidden([]);
  }
  const { data, error } = await supabase
    .from('hidden_map_subjects')
    .select(SELECT)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (state.key !== key) return;
  if (error) {
    // Migration not live yet (or offline): keep working on the device.
    setState({ key, mode: 'local', items: readLocalHidden(), ready: true });
    return;
  }
  setState({ items: (data || []).map(rowToItem).filter((item): item is HiddenMapItem => Boolean(item)), ready: true });
};

export const useHiddenOnMap = () => {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  useEffect(() => {
    if (loading) return;
    const key = userId ? `user:${userId}` : 'local';
    if (state.key === key) return;
    if (userId) void loadAccount(userId);
    else loadLocal();
  }, [userId, loading]);

  const snapshot = useSyncExternalStore(subscribe, () => state);
  const sets = useMemo(() => toHiddenSets(snapshot.items), [snapshot.items]);

  const hide = async (item: Omit<HiddenMapItem, 'hiddenAt'>) => {
    const next = { ...item, hiddenAt: new Date().toISOString() };
    if (state.mode === 'account' && userId) {
      const { error } = await supabase.from('hidden_map_subjects').insert(rowFor(userId, item));
      if (error && error.code !== '23505') throw error;
      setState({ items: addHidden(state.items, next) });
      return;
    }
    const items = addHidden(state.items, next);
    writeLocalHidden(items);
    setState({ items });
  };

  const show = async (type: HiddenMapType, id: string) => {
    if (state.mode === 'account' && userId) {
      const column = type === 'artist' ? 'artist_id' : 'venue_place_id';
      const { error } = await supabase.from('hidden_map_subjects').delete().eq('profile_id', userId).eq(column, id);
      if (error) throw error;
      setState({ items: removeHidden(state.items, type, id) });
      return;
    }
    const items = removeHidden(state.items, type, id);
    writeLocalHidden(items);
    setState({ items });
  };

  const isHidden = (type: HiddenMapType, id: string | null | undefined) =>
    Boolean(id) && (type === 'artist' ? sets.artists : sets.venues).has(id as string);

  return { items: snapshot.items, ready: snapshot.ready, sets, hide, show, isHidden };
};
