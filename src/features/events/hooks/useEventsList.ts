import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { cached } from '../../../lib/requestCache';
import { EventListItem } from '../types';
import { useAuth } from '../../../contexts/AuthContext';
import { useAppResume } from '../../../shared/hooks/useAppResume';

export const useEventsList = (options: { startIso: string; endIso: string }) => {
  const { loading: authLoading } = useAuth();
  const resumeTick = useAppResume();
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoading(true);
    setError('');

    cached(
      `events:list:${options.startIso}:${options.endIso}`,
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
      { ttlMs: 10_000 }
    )
      .then(rows => {
        if (cancelled) return;
        setEvents(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Could not load events. Check your Supabase connection.');
        setEvents([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, options.endIso, options.startIso, resumeTick]);

  return { events, loading, error };
};
