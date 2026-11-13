import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { socialService } from '../services/social.service';
import { useAuth } from '../contexts/AuthContext';
import { cached, setCached } from '../lib/requestCache';
import { enableConcertAlerts } from '../features/alerts/concertAlerts';
import { PERSIST_MAX_AGE, readPersisted, writePersisted } from '../lib/persistentCache';
import { track } from '../features/analytics/analytics';

/** What is followed, for the `follow` event. */
export type FollowKind = 'artist' | 'venue' | 'festival' | 'profile' | 'subject';

// Who someone follows is kept across restarts under their account: «Lo que
// sigues» and the follow buttons are right on the first paint.
const FOLLOWS_KEY = 'follows';

const readSavedFollows = (userId: string | null) =>
  new Set(userId ? readPersisted<string[]>(FOLLOWS_KEY, { userId, maxAgeMs: PERSIST_MAX_AGE.user })?.value ?? [] : []);

const saveFollows = (userId: string | null, ids: Iterable<string>) => {
  if (userId) writePersisted(FOLLOWS_KEY, Array.from(ids), { userId });
};

export const useFollowedSubjects = () => {
  const { user, profile } = useAuth();
  const followerSubjectId = profile?.subject_id || null;
  const userId = user?.id ?? null;

  const [followedSubjectIds, setFollowedSubjectIds] = useState<Set<string>>(() => readSavedFollows(userId));
  const [loading, setLoading] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const canFollow = Boolean(user && followerSubjectId);

  // Signed out: nothing of the previous account stays.
  useEffect(() => {
    if (!userId) setFollowedSubjectIds(previous => (previous.size ? new Set() : previous));
  }, [userId]);

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
        saveFollows(userId, targetIds);
        setFollowedSubjectIds(previous =>
          previous.size === targetIds.length && targetIds.every(id => previous.has(id)) ? previous : new Set(targetIds),
        );
      })
      .catch(() => {
        // Offline: keep the saved list rather than emptying it.
        if (cancelled) return;
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [followerSubjectId, userId]);

  const isFollowing = useCallback(
    (subjectId: string) => followedSubjectIds.has(subjectId),
    [followedSubjectIds]
  );

  const isToggling = useCallback(
    (subjectId: string) => togglingIds.has(subjectId),
    [togglingIds]
  );

  const toggleFollowSubject = useCallback(
    async (targetSubjectId: string, kind: FollowKind = 'subject') => {
      if (!user || !followerSubjectId) return { ok: false as const, reason: 'not-authenticated' as const };
      if (!targetSubjectId) return { ok: false as const, reason: 'invalid-target' as const };

      const next = new Set(followedSubjectIds);
      const wasFollowing = next.has(targetSubjectId);
      if (wasFollowing) next.delete(targetSubjectId);
      else next.add(targetSubjectId);

      setFollowedSubjectIds(next);
      setTogglingIds(prev => new Set(prev).add(targetSubjectId));

      try {
        if (wasFollowing) {
          await socialService.unfollow(followerSubjectId, targetSubjectId);
          track('unfollow', { kind });
        } else {
          await socialService.follow(followerSubjectId, targetSubjectId);
          track('follow', { kind });
          void enableConcertAlerts();
        }

        setCached(`follows:${followerSubjectId}`, Array.from(next), { ttlMs: 10_000 });
        saveFollows(userId, next);
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
    [followerSubjectId, followedSubjectIds, user, userId]
  );

  // Follows several subjects at once (e.g. the artists of a Spotify Wrapped).
  const followMany = useCallback(
    async (targetSubjectIds: string[]) => {
      if (!user || !followerSubjectId) return { ok: false as const, reason: 'not-authenticated' as const };
      const targets = targetSubjectIds.filter(id => id && !followedSubjectIds.has(id));
      if (targets.length === 0) return { ok: true as const };
      setTogglingIds(prev => new Set([...prev, ...targets]));
      try {
        await socialService.followMany(followerSubjectId, targets);
        track('follow', { kind: 'artist', count: targets.length, source: 'bulk' });
        const next = new Set([...followedSubjectIds, ...targets]);
        setFollowedSubjectIds(next);
        setCached(`follows:${followerSubjectId}`, Array.from(next), { ttlMs: 10_000 });
        saveFollows(userId, next);
        void enableConcertAlerts();
        return { ok: true as const };
      } catch {
        return { ok: false as const, reason: 'network' as const };
      } finally {
        setTogglingIds(prev => {
          const copy = new Set(prev);
          targets.forEach(id => copy.delete(id));
          return copy;
        });
      }
    },
    [followerSubjectId, followedSubjectIds, user, userId]
  );

  return useMemo(
    () => ({
      canFollow,
      loading,
      followedSubjectIds,
      isFollowing,
      isToggling,
      toggleFollowSubject,
      followMany,
    }),
    [canFollow, followMany, followedSubjectIds, isFollowing, isToggling, loading, toggleFollowSubject]
  );
};

