import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cached } from '../lib/requestCache';
import { useAuth } from '../contexts/AuthContext';
import { PERSIST_MAX_AGE, readPersisted, writePersisted } from '../lib/persistentCache';

export type FollowedEntity = {
  subjectId: string;
  kind: 'artist' | 'venue' | 'festival';
  id: string;
  name: string;
  imageUrl: string | null;
  city: string | null;
};

const EMPTY: FollowedEntity[] = [];

// Saved per account with the ids they were read for.
const ENTITIES_KEY = 'follows:entities';
type SavedEntities = { ids: string; entities: FollowedEntity[] };

const idsKey = (followedSubjectIds: Set<string>) => Array.from(followedSubjectIds).sort().join(',');

const readSavedEntities = (userId: string | null, ids: string) => {
  if (!userId || !ids) return EMPTY;
  const saved = readPersisted<SavedEntities>(ENTITIES_KEY, { userId, maxAgeMs: PERSIST_MAX_AGE.user })?.value;
  return saved && saved.ids === ids ? saved.entities : EMPTY;
};

// Artists, venues and festivals behind the followed subject ids, with name and picture.
export const useFollowedEntities = (followedSubjectIds: Set<string>) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [entities, setEntities] = useState<FollowedEntity[]>(() => readSavedEntities(userId, idsKey(followedSubjectIds)));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ids = Array.from(followedSubjectIds).sort();
    if (ids.length === 0) {
      setEntities(EMPTY);
      return;
    }
    const saved = readSavedEntities(userId, ids.join(','));
    if (saved.length) setEntities(current => (current === saved || current.length ? current : saved));
    let cancelled = false;
    setLoading(true);
    cached(
      `followed-entities:${ids.join(',')}`,
      async () => {
        const [artists, venues, festivals] = await Promise.all([
          supabase.from('v_subject_artists').select('subject_id,id,name,city,avatar_url').in('subject_id', ids),
          supabase.from('v_subject_venues').select('subject_id,id,name,city,photos,cover_image_url').in('subject_id', ids),
          supabase.from('v_subject_festivals').select('subject_id,id,name,city,cover_image_url').in('subject_id', ids),
        ]);
        if (artists.error) throw artists.error;
        if (venues.error) throw venues.error;
        const list: FollowedEntity[] = [
          ...(artists.data || []).map((row: any) => ({
            subjectId: String(row.subject_id),
            kind: 'artist' as const,
            id: String(row.id),
            name: String(row.name ?? ''),
            imageUrl: row.avatar_url ?? null,
            city: row.city ?? null,
          })),
          ...(venues.data || []).map((row: any) => ({
            subjectId: String(row.subject_id),
            kind: 'venue' as const,
            id: String(row.id),
            name: String(row.name ?? ''),
            imageUrl: row.cover_image_url ?? (row.photos || [])[0] ?? null,
            city: row.city ?? null,
          })),
          // Before the festivals migration the view is missing; skip it.
          ...(festivals.error ? [] : festivals.data || []).map((row: any) => ({
            subjectId: String(row.subject_id),
            kind: 'festival' as const,
            id: String(row.id),
            name: String(row.name ?? ''),
            imageUrl: row.cover_image_url ?? null,
            city: row.city ?? null,
          })),
        ];
        // Callers reorder by upcoming concerts; alphabetical keeps it stable.
        return list.sort((left, right) => left.name.localeCompare(right.name, 'es'));
      },
      { ttlMs: 30_000 },
    )
      .then(list => {
        if (cancelled) return;
        if (userId) writePersisted<SavedEntities>(ENTITIES_KEY, { ids: ids.join(','), entities: list }, { userId });
        setEntities(list);
      })
      .catch(() => {
        // Offline: keep what is on screen (the saved copy, if any).
        if (!cancelled && !saved.length) setEntities(EMPTY);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [followedSubjectIds, userId]);

  return { entities, loading };
};
