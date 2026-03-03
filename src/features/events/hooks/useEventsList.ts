import { useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { EventListItem } from '../types';
import { useAuth } from '../../../contexts/AuthContext';
import { useQuery } from '../../../shared/hooks/useQuery';

export const useEventsList = (options: { startIso: string; endIso: string }) => {
  const { loading: authLoading } = useAuth();
  const queryKey = useMemo(
    () => ['events:list', options.startIso, options.endIso] as const,
    [options.endIso, options.startIso]
  );

  const { data, loading, error } = useQuery<EventListItem[]>(
    queryKey,
    async () => {
      const { data, error } = await supabase
        .from('events')
        .select(
          `
          *,
          organizer:profiles!events_organizer_id_fkey (
            id,
            username,
            display_name,
            role
          ),
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
        .gte('starts_at', options.startIso)
        .lte('starts_at', options.endIso)
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return (data || []) as EventListItem[];
    },
    {
      enabled: !authLoading,
      ttlMs: 10_000,
      initialData: [],
    }
  );

  return {
    events: data || [],
    loading: authLoading || loading,
    error: error ? 'Could not load events. Check your Supabase connection.' : '',
  };
};
