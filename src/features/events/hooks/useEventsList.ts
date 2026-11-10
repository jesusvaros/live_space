import { useEffect, useMemo } from 'react';
import { EventListItem } from '../types';
import { useQuery } from '../../../shared/hooks/useQuery';
import { fetchEventCards, fetchUpcomingCities, type UpcomingCity } from '../../../data/eventQueries';
import { eventCacheKey, primeCache } from '../../../data/pageCache';
import { PERSIST_MAX_AGE } from '../../../lib/persistentCache';

const EMPTY_EVENTS: EventListItem[] = [];
const EMPTY_CITIES: UpcomingCity[] = [];
const DAY_MS = 24 * 60 * 60 * 1000;

const cityKeyOf = (city?: string | null) => (city ? city.trim().toLocaleLowerCase('es') : '');

/**
 * Inicio's queries, shared with the tab prefetch (app/prefetchTabs) so both
 * use the same keys. The window moves every day; the saved copy is kept per
 * city (and per window length) so yesterday's list still paints today while
 * the new one loads.
 */
export const eventsListQuery = (options: { startIso: string; endIso: string; city?: string | null }) => {
  const cityKey = cityKeyOf(options.city);
  return {
    key: ['events:list', options.startIso, options.endIso, cityKey] as const,
    fn: () => fetchEventCards({ startIso: options.startIso, endIso: options.endIso, city: options.city || undefined }),
    options: {
      ttlMs: 60_000,
      persist: { maxAgeMs: PERSIST_MAX_AGE.publicList, key: `inicio:events:${cityKey}` },
    },
  };
};

export const upcomingCitiesQuery = (options: { startIso: string; endIso: string }) => {
  const days = Math.round((Date.parse(options.endIso) - Date.parse(options.startIso)) / DAY_MS);
  return {
    key: ['events:cities', options.startIso, options.endIso] as const,
    fn: () => fetchUpcomingCities(options.startIso, options.endIso),
    options: {
      ttlMs: 5 * 60_000,
      persist: { maxAgeMs: PERSIST_MAX_AGE.publicList, key: `inicio:cities:${days}` },
    },
  };
};

/**
 * Concert cards in the window. With a city, only that city's (what Inicio
 * shows); without one, every city.
 */
export const useEventsList = (options: { startIso: string; endIso: string; city?: string | null; enabled?: boolean }) => {
  const cityKey = cityKeyOf(options.city);
  const query = useMemo(
    () => eventsListQuery({ startIso: options.startIso, endIso: options.endIso, city: options.city }),
    // The city counts by its key (case and spaces do not refetch).
    [cityKey, options.endIso, options.startIso]
  );

  const { data, loading, error } = useQuery<EventListItem[]>(query.key, query.fn, {
    // Public listings: no need to wait for the session.
    ...query.options,
    initialData: EMPTY_EVENTS,
    enabled: options.enabled ?? true,
  });

  // A copy saved yesterday may still list concerts that are over.
  const events = useMemo(() => {
    const list = data || EMPTY_EVENTS;
    const from = Date.parse(options.startIso);
    return list.some(event => Date.parse(event.starts_at) < from)
      ? list.filter(event => Date.parse(event.starts_at) >= from)
      : list;
  }, [data, options.startIso]);

  // Cards restored from the saved copy open their concert at once too.
  useEffect(() => {
    primeCache(events, eventCacheKey);
  }, [events]);

  return {
    events,
    loading,
    error: error ? 'No se pudieron cargar los eventos. Revisa tu conexión.' : '',
  };
};

/** Cities with concerts in the window, busiest first: the city picker. */
export const useUpcomingCities = (options: { startIso: string; endIso: string }) => {
  const query = useMemo(
    () => upcomingCitiesQuery({ startIso: options.startIso, endIso: options.endIso }),
    [options.endIso, options.startIso]
  );
  const { data, status } = useQuery<UpcomingCity[]>(query.key, query.fn, query.options);
  return { cities: data || EMPTY_CITIES, ready: status === 'success' || status === 'error', failed: status === 'error' };
};
