import { cached } from '../../../lib/requestCache';
import { fetchEventCards } from '../../../data/eventQueries';

export const fetchUpcomingEvents = async (startIso: string, endIso: string) => {
  return cached(
    `events:list:${startIso}:${endIso}`,
    async () => {
      return fetchEventCards({ startIso, endIso });
    },
    { ttlMs: 10_000 }
  );
};
