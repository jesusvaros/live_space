import React, { useEffect, useMemo, useState } from 'react';
import {
  IonPage,
  IonContent,
  IonSpinner,
  IonModal,
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

const Events: React.FC = () => {
  const history = useHistory();
  const { profile } = useAuth();
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showNearby, setShowNearby] = useState(false);
  const [nearbyEvents, setNearbyEvents] = useState<EventListItem[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return events;
    return events.filter(event =>
      event.name.toLowerCase().includes(query) ||
      event.city.toLowerCase().includes(query) ||
      event.venue_place?.name?.toLowerCase().includes(query) ||
      event.venue_place?.city?.toLowerCase().includes(query) ||
      event.address?.toLowerCase().includes(query)
    );
  }, [events, search]);

  const now = useMemo(() => new Date(), []);
  const startOfToday = useMemo(() => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date;
  }, [now]);
  const endOfToday = useMemo(() => {
    const date = new Date(now);
    date.setHours(23, 59, 59, 999);
    return date;
  }, [now]);
  const endOfWeek = useMemo(() => {
    const date = new Date(now);
    date.setDate(date.getDate() + 7);
    return date;
  }, [now]);

  const tonightEvents = useMemo(
    () =>
      filteredEvents.filter(event => {
        const startsAt = new Date(event.starts_at);
        return startsAt >= startOfToday && startsAt <= endOfToday;
      }),
    [filteredEvents, startOfToday, endOfToday]
  );

  const weekEvents = useMemo(
    () =>
      filteredEvents.filter(event => {
        const startsAt = new Date(event.starts_at);
        return startsAt > endOfToday && startsAt <= endOfWeek;
      }),
    [filteredEvents, endOfToday, endOfWeek]
  );

  const getUserLocation = () => {
    if (!navigator.geolocation) {
      setLoadError('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        fetchNearbyEvents(latitude, longitude);
      },
      (error) => {
        console.error('Error getting location:', error);
        setLoadError('Unable to get your location. Please enable location services.');
      }
    );
  };

  const toNumber = (value: number | string | null | undefined) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const fetchNearbyEvents = async (lat: number, lng: number) => {
    setNearbyLoading(true);
    try {
      const eventsWithDistance = events.filter(event => {
        const eventLat = toNumber(event.latitude ?? event.venue_place?.latitude ?? null);
        const eventLng = toNumber(event.longitude ?? event.venue_place?.longitude ?? null);
        if (eventLat === null || eventLng === null) return false;

        const distance = calculateDistance(lat, lng, eventLat, eventLng);
        return distance <= 50;
      });

      setNearbyEvents(eventsWithDistance);
      setShowNearby(true);
    } catch (error) {
      console.error('Error fetching nearby events:', error);
      setLoadError('Failed to fetch nearby events');
    } finally {
      setNearbyLoading(false);
    }
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const fetchEvents = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setLoadError('');
    try {
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
        .order('starts_at', { ascending: true });
      if (error) throw error;
      setEvents((data || []) as EventListItem[]);
    } catch (err) {
      setLoadError('Could not load events. Check your Supabase connection.');
      setEvents([]);
    }
    if (showLoading) {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const organizerAllowed = Boolean(profile && ['artist', 'venue', 'label'].includes(profile.role));


  const renderEventCard = (event: EventListItem) => (
    <EventCard
      key={event.id}
      event={event}
      onSelect={selected => history.push(`/event/${selected.id}`)}
    />
  );

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="min-h-full">
          <AppHeader />
          <div className="flex flex-col gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            <div className="animate-fade-up motion-reduce:animate-none">
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Events</p>
              <h2 className="mt-2 font-display text-2xl text-slate-50">Find your next night</h2>
              <p className="mt-2 text-sm text-slate-500">Tap an event to enter its timeline.</p>
            </div>

            <div
              className="mt-4 animate-fade-up motion-reduce:animate-none"
              style={{ animationDelay: '0.08s' }}
            >
              <input
                type="search"
                placeholder="Search events"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 shadow-[0_16px_32px_rgba(0,0,0,0.4)] placeholder:text-slate-500"
              />
            </div>

            <div
              className="mt-4 flex items-center justify-between gap-3 animate-fade-up motion-reduce:animate-none"
              style={{ animationDelay: '0.16s' }}
            >
              <p className="text-xs text-slate-500">Tonight and beyond.</p>
              {organizerAllowed && (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 text-xs font-semibold text-[#ffd1c4]"
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
            <div className="mt-4 space-y-8">
              {loadError && (
                <p className="text-sm text-rose-400">{loadError}</p>
              )}
              <section className="space-y-4">
                <div>
                  <h3 className="font-display text-lg text-slate-50">Tonight</h3>
                  <p className="text-xs text-slate-500">Happening now.</p>
                </div>
                {tonightEvents.length === 0 ? (
                  <p className="text-sm text-slate-500">No events tonight.</p>
                ) : (
                  <div className="space-y-4">
                    {tonightEvents.map(event => renderEventCard(event))}
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div>
                  <h3 className="font-display text-lg text-slate-50">This week</h3>
                  <p className="text-xs text-slate-500">Upcoming sets.</p>
                </div>
                {weekEvents.length === 0 ? (
                  <p className="text-sm text-slate-500">No upcoming events this week.</p>
                ) : (
                  <div className="space-y-4">
                    {weekEvents.map(event => renderEventCard(event))}
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-lg text-slate-50">Near You</h3>
                    <p className="text-xs text-slate-500">Events in your area.</p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 text-xs font-semibold text-[#ffd1c4]"
                    onClick={getUserLocation}
                    disabled={nearbyLoading}
                  >
                    {nearbyLoading ? 'Finding...' : 'Find Nearby'}
                  </button>
                </div>
                {nearbyEvents.length === 0 && userLocation ? (
                  <p className="text-sm text-slate-500">No events found within 50km.</p>
                ) : nearbyEvents.length > 0 ? (
                  <div className="space-y-4">
                    {nearbyEvents.map(event => renderEventCard(event))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Click &quot;Find Nearby&quot; to see events near you.</p>
                )}
              </section>
            </div>
          )}
          </div>
        </div>

        <IonModal
          isOpen={showNearby}
          onDidDismiss={() => setShowNearby(false)}
        >
          <IonContent fullscreen>
            <div className="flex flex-col gap-4 rounded-3xl bg-[#141824] p-5 shadow-[0_24px_50px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-lg font-semibold text-slate-50">Events Near You</h2>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 text-xs font-semibold text-[#ffd1c4]"
                  onClick={() => setShowNearby(false)}
                >
                  Close
                </button>
              </div>

              {nearbyLoading && (
                <div className="flex items-center justify-center py-10">
                  <IonSpinner name="crescent" />
                  <p className="ml-3 text-sm text-slate-400">Finding nearby events...</p>
                </div>
              )}

              {!nearbyLoading && nearbyEvents.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-sm text-slate-500">No events found within 50km of your location.</p>
                </div>
              )}

              {!nearbyLoading && nearbyEvents.length > 0 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">
                    {nearbyEvents.length} event{nearbyEvents.length !== 1 ? 's' : ''} found nearby
                  </p>
                  {nearbyEvents.map(event => renderEventCard(event))}
                </div>
              )}
            </div>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default Events;
