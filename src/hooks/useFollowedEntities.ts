import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cached } from '../lib/requestCache';

export type FollowedEntity = {
  subjectId: string;
  kind: 'artist' | 'venue' | 'festival';
  id: string;
  name: string;
  imageUrl: string | null;
  city: string | null;
};

const EMPTY: FollowedEntity[] = [];

// Artists, venues and festivals behind the followed subject ids, with name and picture.
export const useFollowedEntities = (followedSubjectIds: Set<string>) => {
  const [entities, setEntities] = useState<FollowedEntity[]>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ids = Array.from(followedSubjectIds).sort();
    if (ids.length === 0) {
      setEntities(EMPTY);
      return;
    }
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
        if (!cancelled) setEntities(list);
      })
      .catch(() => {
        if (!cancelled) setEntities(EMPTY);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [followedSubjectIds]);

  return { entities, loading };
};
