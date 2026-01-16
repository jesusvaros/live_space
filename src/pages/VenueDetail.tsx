import React, { useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent, IonSpinner } from '@ionic/react';
import { useHistory, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, Profile, VenuePlace } from '../lib/types';
import AppHeader from '../components/AppHeader';
import EventCard from '../components/EventCard';

type VenueEvent = Event & {
  organizer?: Profile | null;
  venue?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Profile | null }[];
};

type VenueMoment = {
  id: string;
  media_url: string;
  media_type: 'video' | 'image';
  caption: string | null;
  event_id: string;
  created_at: string;
};

const VenueDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const [venue, setVenue] = useState<VenuePlace | null>(null);
  const [events, setEvents] = useState<VenueEvent[]>([]);
  const [moments, setMoments] = useState<VenueMoment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadVenue = async () => {
      setLoading(true);
      setError('');
      try {
        const { data: venueData, error: venueError } = await supabase
          .from('venue_places')
          .select('*')
          .eq('id', id)
          .single();

        if (venueError || !venueData) {
          throw venueError;
        }

        const { data: eventsData, error: eventsError } = await supabase
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
          `
          )
          .eq('venue_place_id', id)
          .order('starts_at', { ascending: false });

        if (eventsError) {
          throw eventsError;
        }

        setVenue(venueData as VenuePlace);
        setEvents((eventsData || []) as VenueEvent[]);

        const eventIds = (eventsData || []).map(event => event.id);
        if (eventIds.length > 0) {
          const { data: momentsData } = await supabase
            .from('posts')
            .select('id, media_url, media_type, caption, event_id, created_at')
            .in('event_id', eventIds)
            .order('created_at', { ascending: false })
            .limit(18);
          setMoments((momentsData || []) as VenueMoment[]);
        } else {
          setMoments([]);
        }
      } catch (err) {
        setError('Venue not found.');
        setVenue(null);
        setEvents([]);
        setMoments([]);
      } finally {
        setLoading(false);
      }
    };

    loadVenue();
  }, [id]);

  const addressLine = useMemo(() => {
    if (!venue) return '';
    if (venue.address && venue.city) {
      return `${venue.address} · ${venue.city}`;
    }
    return venue.address || venue.city || '';
  }, [venue]);

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="app-layout">
          <AppHeader />
          <div className="app-screen">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <IonSpinner name="crescent" />
              </div>
            )}

            {!loading && error && (
              <p className="text-sm text-rose-400">{error}</p>
            )}

            {!loading && venue && (
              <>
                <section className="venue-hero">
                  <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">
                    Venue
                  </p>
                  <h1 className="mt-2 font-display text-2xl text-slate-50">
                    {venue.name}
                  </h1>
                  {addressLine && (
                    <p className="text-sm text-slate-400">{addressLine}</p>
                  )}
                  {(venue.venue_type || venue.capacity) && (
                    <p className="text-xs text-slate-500">
                      {venue.venue_type || 'Venue'}
                      {venue.capacity ? ` · ${venue.capacity} cap` : ''}
                    </p>
                  )}
                  {venue.website_url && (
                    <a
                      className="venue-link"
                      href={venue.website_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {venue.website_url.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </section>

                {venue.photos.length > 0 && (
                  <section className="venue-photo-row">
                    {venue.photos.map((url, index) => (
                      <div key={`${url}-${index}`} className="venue-photo">
                        <img src={url} alt={`Venue ${venue.name}`} />
                      </div>
                    ))}
                  </section>
                )}

                <section className="space-y-3">
                  <div>
                    <h2 className="font-display text-lg text-slate-50">Events</h2>
                    <p className="text-xs text-slate-500">
                      All shows hosted here.
                    </p>
                  </div>
                  {events.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No events yet at this venue.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {events.map(event => (
                        <EventCard
                          key={event.id}
                          event={event}
                          onSelect={() => history.push(`/event/${event.id}`)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div>
                    <h2 className="font-display text-lg text-slate-50">Recent moments</h2>
                    <p className="text-xs text-slate-500">Latest media from this space.</p>
                  </div>
                  {moments.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No moments shared here yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {moments.map(moment => (
                        <div key={moment.id} className="venue-moment">
                          {moment.media_type === 'video' ? (
                            <video className="h-full w-full object-cover" muted>
                              <source src={moment.media_url} />
                            </video>
                          ) : (
                            <img
                              src={moment.media_url}
                              alt={moment.caption || 'Moment'}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default VenueDetail;
