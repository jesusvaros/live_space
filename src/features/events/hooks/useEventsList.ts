import { useMemo } from 'react';
import { EventListItem } from '../types';
import { useQuery } from '../../../shared/hooks/useQuery';
import { fetchEventCards } from '../../../data/eventQueries';

const EMPTY_EVENTS: EventListItem[] = [];

export const useEventsList = (options: { startIso: string; endIso: string }) => {
  const queryKey = useMemo(
    () => ['events:list', options.startIso, options.endIso] as const,
    [options.endIso, options.startIso]
  );

  const { data, loading, error } = useQuery<EventListItem[]>(
    queryKey,
    async () => {
      return fetchEventCards({ startIso: options.startIso, endIso: options.endIso });
    },
    {
      // Public listings: no need to wait for the session.
      ttlMs: 60_000,
      initialData: EMPTY_EVENTS,
    }
  );

  return {
    events: data || EMPTY_EVENTS,
    loading,
    error: error ? 'No se pudieron cargar los eventos. Revisa tu conexión.' : '',
  };
};
