import { useEffect, useMemo, useState } from 'react';
import { fetchEventCards } from '../../data/eventQueries';
import type { EventListItem } from '../events/types';

/**
 * The concert cards (lineup, poster) for the moments a gallery groups by
 * concert, so every header shows the real poster. Loaded once per set of
 * concerts.
 */
export const useMomentConcertCards = (moments: ReadonlyArray<{ event_id: string | null }>) => {
  const eventIds = useMemo(
    () => Array.from(new Set(moments.flatMap(moment => (moment.event_id ? [moment.event_id] : [])))).sort(),
    [moments],
  );
  const key = eventIds.join(',');
  const [cards, setCards] = useState<ReadonlyMap<string, EventListItem>>(() => new Map());

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetchEventCards({ eventIds: key.split(',') })
      .then(rows => {
        if (!cancelled) setCards(new Map(rows.map(row => [row.id, row as EventListItem])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);

  return cards;
};
