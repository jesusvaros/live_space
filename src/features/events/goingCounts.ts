import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

// «12 van»: how many people marked «Voy» on a concert, as a number only
// (RPC event_going_counts; counts under 2 are never returned, so one
// person's plan is never revealed). Cached per session and fetched in one
// batch per list.

const cache = new Map<string, number>();
const MAX_IDS = 200;

/** People going worth showing: at least 2. */
export const GOING_MIN = 2;

export const goingLabel = (count: number | null | undefined) =>
  count && count >= GOING_MIN ? `${count} van` : null;

export const fetchGoingCounts = async (eventIds: string[]): Promise<Map<string, number>> => {
  const missing = Array.from(new Set(eventIds)).filter(id => !cache.has(id)).slice(0, MAX_IDS);
  if (missing.length > 0) {
    const { data, error } = await supabase.rpc('event_going_counts', { p_event_ids: missing });
    if (!error) {
      missing.forEach(id => cache.set(id, 0));
      ((data || []) as { event_id: string; going: number }[]).forEach(row => cache.set(row.event_id, row.going));
    }
  }
  return new Map(eventIds.map(id => [id, cache.get(id) ?? 0]));
};

export const useGoingCounts = (eventIds: string[]) => {
  const key = useMemo(() => Array.from(new Set(eventIds)).sort().join(','), [eventIds]);
  const [counts, setCounts] = useState<Map<string, number>>(() => new Map());

  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    fetchGoingCounts(key.split(','))
      .then(next => {
        if (live) setCounts(next);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);

  return counts;
};

/** Test helper. */
export const resetGoingCountsCache = () => cache.clear();
