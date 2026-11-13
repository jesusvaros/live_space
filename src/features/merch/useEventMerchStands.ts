import { useEffect, useState } from 'react';
import { EventMerchStand, merchService } from '../../services/merch.service';
import { reservationsClosed } from './merchRules';

/**
 * The concert's merch stands while reservations are open ([] otherwise, or
 * while `enabled` is false). Lets a page know whether there is merch before
 * mounting EventMerchSection (e.g. to offer it behind a button); pass the
 * result as its `initialStands` so it does not fetch again.
 */
export const useEventMerchStands = (eventId: string, startsAt: string | null, enabled = true) => {
  const [stands, setStands] = useState<EventMerchStand[] | null>(null);
  const closed = !startsAt || reservationsClosed(startsAt);

  useEffect(() => {
    setStands(null);
    if (!enabled || closed || !eventId) return undefined;
    let cancelled = false;
    merchService
      .forEvent(eventId)
      .then(list => {
        if (!cancelled) setStands(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [eventId, closed, enabled]);

  return enabled && !closed ? stands ?? [] : [];
};
