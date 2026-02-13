import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IonSpinner } from '@ionic/react';
import { supabase } from '../lib/supabase';
import { Event, Profile, VenuePlace, Artist } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useHistory } from 'react-router-dom';
import EventPosterTile from '../features/events/components/EventPosterTile';
import AppShell from '../components/AppShell';

type EventListItem = Event & {
  organizer?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Artist | null }[];
};

const EVENT_SELECT = `
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
`;

const OrganizerEventsTab: React.FC = () => {
  const history = useHistory();
  const { user } = useAuth();
  const { activeWorkspace, canCreateEvent } = useWorkspace();
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const upcomingEvents = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [events]);

  const fetchEvents = useCallback(async () => {
    if (!user || !activeWorkspace) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');

    try {
      let results: EventListItem[] = [];

      if (activeWorkspace.type === 'artist') {
        if (!activeWorkspace.artist?.id) {
          setEvents([]);
          setLoading(false);
          return;
        }
        const { data: eventArtistLinks, error: linkError } = await supabase
          .from('event_artists')
          .select('event_id')
          .eq('artist_entity_id', activeWorkspace.artist?.id);
        if (linkError) throw linkError;
        const eventIds = (eventArtistLinks || []).map((item: any) => item.event_id);
        if (eventIds.length > 0) {
          const { data: eventData, error: eventsError } = await supabase
            .from('events')
            .select(EVENT_SELECT)
            .in('id', eventIds)
            .order('starts_at', { ascending: true });
          if (eventsError) throw eventsError;
          results = (eventData || []) as EventListItem[];
        }
      } else if (activeWorkspace.type === 'venue') {
        if (!activeWorkspace.venue?.id) {
          setEvents([]);
          setLoading(false);
          return;
        }
        const { data: eventData, error: eventsError } = await supabase
          .from('events')
          .select(EVENT_SELECT)
          .eq('venue_place_id', activeWorkspace.venue?.id)
          .order('starts_at', { ascending: true });
        if (eventsError) throw eventsError;
        results = (eventData || []) as EventListItem[];
      }

      setEvents(results);
    } catch (fetchError) {
      console.error('Unable to load organizer events', fetchError);
      setError('Could not load your upcoming events right now.');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, user?.id]);

  useEffect(() => {
    if (activeWorkspace) {
      fetchEvents();
    }
  }, [fetchEvents, activeWorkspace]);

  const organizerLabel = activeWorkspace?.artist?.name || activeWorkspace?.venue?.name || 'your workspace';

  return (
    <AppShell>
      <div className="flex flex-col gap-6 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            <div className="animate-fade-up motion-reduce:animate-none">
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">Events</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-white">
                Next events for {organizerLabel}
              </h2>
              <p className="mt-2 text-sm text-white/70">
                Open a show to keep its timeline alive.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-white/60">
                {activeWorkspace?.type === 'venue' ? 'Shows at your venue' : 'Upcoming gigs you are booked on'}
              </p>
              {canCreateEvent && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
                  onClick={() => history.push('/create-event')}
                >
                  Create event
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <IonSpinner name="crescent" />
              </div>
            ) : (
              <div className="space-y-4">
                {error && <p className="text-sm text-rose-400">{error}</p>}
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm text-white/70">
                    No upcoming events yet. Hit create to add your next show.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {upcomingEvents.map(event => (
                      <EventPosterTile
                        key={event.id}
                        event={event}
                        className="w-full"
                        onSelect={selected => history.push(`/event/${selected.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
      </div>
    </AppShell>
  );
};

export default OrganizerEventsTab;
