import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { socialService } from '../services/social.service';
import { useAuth } from '../contexts/AuthContext';
import { cached, setCached } from '../lib/requestCache';

export const useFollowedSubjects = () => {
  const { user, profile } = useAuth();
  const followerSubjectId = profile?.subject_id || null;

  const [followedSubjectIds, setFollowedSubjectIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const canFollow = Boolean(user && followerSubjectId);

  useEffect(() => {
    if (!followerSubjectId) return;
    let cancelled = false;
    setLoading(true);
    cached(
      `follows:${followerSubjectId}`,
      async () => {
        const { data: rows, error } = await supabase
          .from('follows')
          .select('target_subject_id')
          .eq('follower_subject_id', followerSubjectId);
        if (error) throw error;
        return (rows || []).map((row: any) => row.target_subject_id).filter(Boolean) as string[];
      },
      { ttlMs: 10_000 }
    )
      .then(targetIds => {
        if (cancelled) return;
        setFollowedSubjectIds(new Set(targetIds));
      })
      .catch(() => {
        if (cancelled) return;
        setFollowedSubjectIds(new Set());
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [followerSubjectId]);

  const isFollowing = useCallback(
    (subjectId: string) => followedSubjectIds.has(subjectId),
    [followedSubjectIds]
  );

  const isToggling = useCallback(
    (subjectId: string) => togglingIds.has(subjectId),
    [togglingIds]
  );

  const toggleFollowSubject = useCallback(
    async (targetSubjectId: string) => {
      if (!user || !followerSubjectId) return { ok: false as const, reason: 'not-authenticated' as const };
      if (!targetSubjectId) return { ok: false as const, reason: 'invalid-target' as const };

      const next = new Set(followedSubjectIds);
      const wasFollowing = next.has(targetSubjectId);
      if (wasFollowing) next.delete(targetSubjectId);
      else next.add(targetSubjectId);

      setFollowedSubjectIds(next);
      setTogglingIds(prev => new Set(prev).add(targetSubjectId));

      try {
        if (wasFollowing) await socialService.unfollow(followerSubjectId, targetSubjectId);
        else await socialService.follow(followerSubjectId, targetSubjectId);

        setCached(`follows:${followerSubjectId}`, Array.from(next), { ttlMs: 10_000 });
        return { ok: true as const };
      } catch (err) {
        // revert
        const reverted = new Set(next);
        if (wasFollowing) reverted.add(targetSubjectId);
        else reverted.delete(targetSubjectId);
        setFollowedSubjectIds(reverted);
        setCached(`follows:${followerSubjectId}`, Array.from(reverted), { ttlMs: 2_000 });
        return { ok: false as const, reason: 'network' as const };
      } finally {
        setTogglingIds(prev => {
          const copy = new Set(prev);
          copy.delete(targetSubjectId);
          return copy;
        });
      }
    },
    [followerSubjectId, followedSubjectIds, user]
  );

  return useMemo(
    () => ({
      canFollow,
      loading,
      followedSubjectIds,
      isFollowing,
      isToggling,
      toggleFollowSubject,
    }),
    [canFollow, followedSubjectIds, isFollowing, isToggling, loading, toggleFollowSubject]
  );
};

