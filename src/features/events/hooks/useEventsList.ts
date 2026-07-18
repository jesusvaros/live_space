import { useMemo } from 'react';
import { EventListItem } from '../types';
import { useAuth } from '../../../contexts/AuthContext';
import { useQuery } from '../../../shared/hooks/useQuery';
import { fetchEventCards } from '../../../data/eventQueries';

const EMPTY_EVENTS: EventListItem[] = [];

export const useEventsList = (options: { startIso: string; endIso: string }) => {
  const { loading: authLoading } = useAuth();
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
      enabled: !authLoading,
      ttlMs: 10_000,
      initialData: EMPTY_EVENTS,
    }
  );

  return {
    events: data || EMPTY_EVENTS,
    loading: authLoading || loading,
    error: error ? 'Could not load events. Check your Supabase connection.' : '',
  };
};
