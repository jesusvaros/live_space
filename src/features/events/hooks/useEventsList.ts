import { useMemo } from 'react';
import { EventListItem } from '../types';
import { useQuery } from '../../../shared/hooks/useQuery';
import { fetchEventCards, fetchUpcomingCities, type UpcomingCity } from '../../../data/eventQueries';

const EMPTY_EVENTS: EventListItem[] = [];
const EMPTY_CITIES: UpcomingCity[] = [];

/**
 * Concert cards in the window. With a city, only that city's (what Inicio
 * shows); without one, every city.
 */
export const useEventsList = (options: { startIso: string; endIso: string; city?: string | null; enabled?: boolean }) => {
  const cityKey = options.city ? options.city.trim().toLocaleLowerCase('es') : '';
  const queryKey = useMemo(
    () => ['events:list', options.startIso, options.endIso, cityKey] as const,
    [cityKey, options.endIso, options.startIso]
  );

  const { data, loading, error } = useQuery<EventListItem[]>(
    queryKey,
    async () => fetchEventCards({ startIso: options.startIso, endIso: options.endIso, city: options.city || undefined }),
    {
      // Public listings: no need to wait for the session.
      ttlMs: 60_000,
      initialData: EMPTY_EVENTS,
      enabled: options.enabled ?? true,
    }
  );

  return {
    events: data || EMPTY_EVENTS,
    loading,
    error: error ? 'No se pudieron cargar los eventos. Revisa tu conexión.' : '',
  };
};

/** Cities with concerts in the window, busiest first: the city picker. */
export const useUpcomingCities = (options: { startIso: string; endIso: string }) => {
  const queryKey = useMemo(() => ['events:cities', options.startIso, options.endIso] as const, [options.endIso, options.startIso]);
  const { data, status } = useQuery<UpcomingCity[]>(queryKey, () => fetchUpcomingCities(options.startIso, options.endIso), {
    ttlMs: 5 * 60_000,
  });
  return { cities: data || EMPTY_CITIES, ready: status === 'success' || status === 'error', failed: status === 'error' };
};
