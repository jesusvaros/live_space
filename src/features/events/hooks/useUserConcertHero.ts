import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { cached, clearCached } from '../../../lib/requestCache';
import { useAuth } from '../../../contexts/AuthContext';
import { EventListItem } from '../types';

export type UserConcertHeroState =
  | { kind: 'loading' }
  | { kind: 'cold_start' }
  | { kind: 'upcoming'; event: EventListItem }
  | {
      kind: 'just_attended';
      event: EventListItem;
      hoursSinceEnd: number;
      timeLabel: string;
      size: 'hero' | 'compact';
    };

const DISMISS_KEY = 'live_space.pending_moments.dismissed';

const readDismissed = () => {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return {} as Record<string, number>;
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : ({} as Record<string, number>);
  } catch {
    return {} as Record<string, number>;
  }
};

const writeDismissed = (map: Record<string, number>) => {
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
};

const getEventEnd = (event: EventListItem) => {
  const start = new Date(event.starts_at);
  if (event.ends_at) return new Date(event.ends_at);
  return new Date(start.getTime() + 6 * 60 * 60 * 1000);
};

const relativeTimeLabel = (hoursSinceEnd: number) => {
  if (hoursSinceEnd < 24) return 'You attended yesterday';
  if (hoursSinceEnd < 48) return 'You attended 2 days ago';
  return 'You attended recently';
};

const hasUserMomentsForEvent = async (userId: string, eventId: string) => {
  const count = await cached(
    `posts:count:user:${userId}:event:${eventId}`,
    async () => {
      const { count, error } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('event_id', eventId);
      if (error) throw error;
      return count || 0;
    },
    { ttlMs: 10_000 }
  );
  return count > 0;
};

const fetchAttendanceRows = async (userId: string) => {
  return cached(
    `attendance:user:${userId}`,
    async () => {
      const { data, error } = await supabase
        .from('event_attendance')
        .select('event_id,status,created_at')
        .eq('user_id', userId)
        .in('status', ['going', 'attended'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as { event_id: string; status: 'going' | 'attended'; created_at: string }[];
    },
    { ttlMs: 10_000 }
  );
};

const fetchEventById = async (eventId: string) => {
  return cached(
    `event:detail:${eventId}`,
    async () => {
      const { data, error } = await supabase
        .from('events')
        .select(
          `
          *,
          venue_place:venue_places!events_venue_place_id_fkey (
            id,
            name,
            city,
            address,
            latitude,
            longitude
          ),
          event_artists (
            artist:artists!event_artists_artist_entity_fk (
              id,
              name,
              avatar_url
            )
          )
        `
        )
        .eq('id', eventId)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as EventListItem | null;
    },
    { ttlMs: 60_000 }
  );
};

export const useUserConcertHero = (options: { events: EventListItem[]; now?: Date }) => {
  const { user } = useAuth();
  const userId = user?.id || null;
  const nowMs = options.now ? options.now.getTime() : null;
  const [dismissedMap, setDismissedMap] = useState<Record<string, number>>({});

  useEffect(() => {
    setDismissedMap(readDismissed());
  }, []);

  const dismissPendingMoments = (eventId: string) => {
    const next = { ...dismissedMap, [eventId]: Date.now() };
    setDismissedMap(next);
    writeDismissed(next);
  };

  const [hero, setHero] = useState<UserConcertHeroState>({ kind: 'loading' });
  const [nextUpcoming, setNextUpcoming] = useState<EventListItem | null>(null);

  useEffect(() => {
    if (!userId) {
      setHero({ kind: 'cold_start' });
      setNextUpcoming(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setHero({ kind: 'loading' });
      setNextUpcoming(null);
      try {
        const now = new Date(nowMs ?? Date.now());
        const attendance = await fetchAttendanceRows(userId);
        if (cancelled) return;

        const byId = new Map<string, EventListItem>();
        for (const event of options.events) byId.set(event.id, event);

        const ensureEvent = async (eventId: string) => {
          const existing = byId.get(eventId);
          if (existing) return existing;
          const fetched = await fetchEventById(eventId);
          if (fetched) byId.set(eventId, fetched);
          return fetched;
        };

        // Find most recent attended event ended in last 72h, with no moments and not dismissed.
        const attendedRows = attendance.filter(row => row.status === 'attended');
        const attendedCandidates: { event: EventListItem; hoursSinceEnd: number }[] = [];

        for (const row of attendedRows) {
          const ev = await ensureEvent(row.event_id);
          if (!ev) continue;
          const end = getEventEnd(ev);
          const hoursSinceEnd = (now.getTime() - end.getTime()) / (1000 * 60 * 60);
          if (hoursSinceEnd < 0 || hoursSinceEnd > 72) continue;
          attendedCandidates.push({ event: ev, hoursSinceEnd });
        }

        attendedCandidates.sort((a, b) => a.hoursSinceEnd - b.hoursSinceEnd);

        const computeUpcoming = async () => {
          const goingRows = attendance.filter(row => row.status === 'going');
          const upcomingCandidates: EventListItem[] = [];
          for (const row of goingRows) {
            const ev = await ensureEvent(row.event_id);
            if (!ev) continue;
            const start = new Date(ev.starts_at);
            if (start.getTime() < now.getTime()) continue;
            upcomingCandidates.push(ev);
          }
          upcomingCandidates.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
          return upcomingCandidates;
        };

        for (const candidate of attendedCandidates) {
          const dismissedAt = dismissedMap[candidate.event.id];
          if (dismissedAt && Date.now() - dismissedAt < 1000 * 60 * 60 * 24 * 7) continue;
          const alreadyHasMoments = await hasUserMomentsForEvent(userId, candidate.event.id);
          if (alreadyHasMoments) continue;

          const upcomingCandidates = await computeUpcoming();
          setNextUpcoming(upcomingCandidates[0] || null);

          const size = candidate.hoursSinceEnd <= 36 ? 'hero' : 'compact';
          const timeLabel = relativeTimeLabel(candidate.hoursSinceEnd);
          setHero({
            kind: 'just_attended',
            event: candidate.event,
            hoursSinceEnd: candidate.hoursSinceEnd,
            timeLabel,
            size,
          });
          return;
        }

        // Upcoming (going)
        const upcomingCandidates = await computeUpcoming();
        const upcoming = upcomingCandidates[0] || null;
        setNextUpcoming(upcomingCandidates[1] || null);

        if (upcoming) {
          setHero({ kind: 'upcoming', event: upcoming });
          return;
        }

        setHero({ kind: 'cold_start' });
      } catch {
        if (cancelled) return;
        setHero({ kind: 'cold_start' });
        setNextUpcoming(null);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [dismissedMap, nowMs, options.events, userId]);

  const refreshMomentsForEvent = (eventId: string) => {
    if (!userId) return;
    clearCached(`posts:count:user:${userId}:event:${eventId}`);
  };

  return useMemo(
    () => ({
      hero,
      nextUpcoming,
      dismissPendingMoments,
      refreshMomentsForEvent,
    }),
    [dismissPendingMoments, hero, nextUpcoming]
  );
};
