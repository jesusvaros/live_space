import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IonPage,
  IonContent,
  IonSpinner,
} from '@ionic/react';
import { supabase } from '../lib/supabase';
import { Event, Profile, VenuePlace } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { useHistory } from 'react-router-dom';
import EventCard from '../components/EventCard';
import AppHeader from '../components/AppHeader';

type EventListItem = Event & {
  organizer?: Profile | null;
  venue?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Profile | null }[];
};

const EVENT_SELECT = `
  *,
  organizer:profiles!events_organizer_id_fkey (
    id,
    username,
    display_name,
    role
  ),
  venue:profiles!events_venue_id_fkey (
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
    artist:profiles!event_artists_artist_id_fkey (
      id,
      username,
      display_name,
      role
    )
  )
`;

const OrganizerEventsTab: React.FC = () => {
  const history = useHistory();
  const { user, profile } = useAuth();
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const upcomingEvents = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [events]);

  const fetchEvents = useCallback(async () => {
    if (!user || !profile) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');

    try {
      let results: EventListItem[] = [];

      if (profile.role === 'artist') {
        const { data: eventArtistLinks, error: linkError } = await supabase
          .from('event_artists')
          .select('event_id')
          .eq('artist_id', user.id);
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
      } else if (profile.role === 'venue') {
        const { data: eventData, error: eventsError } = await supabase
          .from('events')
          .select(EVENT_SELECT)
          .eq('venue_id', user.id)
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
  }, [profile?.role, user?.id]);

  useEffect(() => {
    if (profile?.role && ['artist', 'venue'].includes(profile.role)) {
      fetchEvents();
    }
  }, [fetchEvents, profile?.role]);


  const organizerLabel = profile?.display_name || profile?.username || 'your profile';

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="min-h-full">
          <AppHeader />
          <div className="flex flex-col gap-6 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            <div className="animate-fade-up motion-reduce:animate-none">
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Events</p>
              <h2 className="mt-2 font-display text-2xl text-slate-50">
                Next events for {organizerLabel}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Tap an event to review it or share new moments in its timeline.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {profile?.role === 'venue' ? 'Shows at your venue' : 'Upcoming gigs you are booked on'}
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 text-xs font-semibold text-[#ffd1c4]"
                onClick={() => history.push('/create-event')}
              >
                Create event
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <IonSpinner name="crescent" />
              </div>
            ) : (
              <div className="space-y-4">
                {error && <p className="text-sm text-rose-400">{error}</p>}
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No upcoming events yet. Hit create to add your next show.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {upcomingEvents.map(event => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onSelect={() => history.push(`/event/${event.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </IonContent>
    </IonPage>
  );
};

export default OrganizerEventsTab;
