import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { cached } from '../../../lib/requestCache';

export const useFollowedArtistIds = (followedSubjectIds: Set<string>) => {
  const [artistIds, setArtistIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const targetIds = Array.from(followedSubjectIds);
    if (targetIds.length === 0) {
      setArtistIds(new Set());
      return;
    }
    let cancelled = false;

    cached(
      `subjects:artist_ids:${targetIds.sort().join(',')}`,
      async () => {
        const { data, error } = await supabase
          .from('subjects')
          .select('id,type,artist_id')
          .in('id', targetIds);
        if (error) throw error;
        return (data || [])
          .filter((row: any) => row.type === 'artist' && row.artist_id)
          .map((row: any) => row.artist_id as string);
      },
      { ttlMs: 10_000 }
    )
      .then(ids => {
        if (cancelled) return;
        setArtistIds(new Set(ids));
      })
      .catch(() => {
        if (cancelled) return;
        setArtistIds(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, [followedSubjectIds]);

  return artistIds;
};
