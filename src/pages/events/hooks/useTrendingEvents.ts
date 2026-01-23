import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { cached } from '../../../lib/requestCache';
import { EventListItem } from '../types';

type TrendingMeta = Record<string, { saves: number; going: number; attended: number; moments: number }>;

export const useTrendingEvents = (events: EventListItem[], startOfToday: Date) => {
  const [trending, setTrending] = useState<EventListItem[]>([]);
  const [meta, setMeta] = useState<TrendingMeta>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (events.length === 0) {
      setTrending([]);
      setMeta({});
      return;
    }
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString();
        const [saves, attendance, posts] = await cached(
          `trending:since:${since}`,
          async () => {
            const [savesRes, attendanceRes, postsRes] = await Promise.all([
              supabase.from('event_saves').select('event_id,created_at').gte('created_at', since).limit(1000),
              supabase.from('event_attendance').select('event_id,status,created_at').gte('created_at', since).limit(1000),
              supabase.from('posts').select('event_id,created_at').gte('created_at', since).limit(1000),
            ]);
            return [savesRes.data || [], attendanceRes.data || [], postsRes.data || []] as const;
          },
          { ttlMs: 10_000 }
        );

        const counts: Record<string, { saves: number; going: number; attended: number; moments: number; score: number }> = {};
        const bump = (eventId: string, kind: 'saves' | 'going' | 'attended' | 'moments') => {
          counts[eventId] ||= { saves: 0, going: 0, attended: 0, moments: 0, score: 0 };
          counts[eventId][kind] += 1;
        };

        for (const row of saves as any[]) if (row?.event_id) bump(row.event_id, 'saves');
        for (const row of attendance as any[]) {
          if (!row?.event_id) continue;
          bump(row.event_id, row.status === 'attended' ? 'attended' : 'going');
        }
        for (const row of posts as any[]) if (row?.event_id) bump(row.event_id, 'moments');

        for (const [eventId, item] of Object.entries(counts)) {
          item.score = item.saves * 2 + item.going * 3 + item.attended * 4 + item.moments * 4;
          const ev = events.find(e => e.id === eventId);
          if (!ev) {
            item.score = 0;
            continue;
          }
          const startsAt = new Date(ev.starts_at);
          const inWeek =
            startsAt.getTime() >= startOfToday.getTime() - 1000 * 60 * 60 * 24 &&
            startsAt.getTime() <= startOfToday.getTime() + 1000 * 60 * 60 * 24 * 7;
          if (!inWeek) item.score = 0;
        }

        const rankedIds = Object.entries(counts)
          .filter(([, c]) => c.score > 0)
          .sort((a, b) => b[1].score - a[1].score)
          .slice(0, 6)
          .map(([id]) => id);

        const nextTrending = rankedIds
          .map(id => events.find(e => e.id === id))
          .filter(Boolean) as EventListItem[];

        const nextMeta: TrendingMeta = {};
        for (const eventId of rankedIds) {
          const item = counts[eventId];
          if (!item) continue;
          nextMeta[eventId] = { saves: item.saves, going: item.going, attended: item.attended, moments: item.moments };
        }

        if (cancelled) return;
        setTrending(nextTrending);
        setMeta(nextMeta);
      } catch {
        if (cancelled) return;
        setTrending([]);
        setMeta({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [events, startOfToday]);

  return { trending, meta, loading };
};

