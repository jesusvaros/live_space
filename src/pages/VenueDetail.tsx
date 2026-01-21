import React, { useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent, IonSpinner } from '@ionic/react';
import { useHistory, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, Profile, VenuePlace, PostWithSetlist, Artist } from '../lib/types';
import { socialService } from '../services/social.service';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
import EventCard from '../components/EventCard';

type VenueEvent = Event & {
  organizer?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Artist | null }[];
};

const VenueDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const { user, profile: currentUserProfile } = useAuth();
  
  const [venue, setVenue] = useState<VenuePlace | null>(null);
  const [events, setEvents] = useState<VenueEvent[]>([]);
  const [moments, setMoments] = useState<PostWithSetlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);

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
          .eq('venue_place_id', id)
          .order('starts_at', { ascending: false });

        if (eventsError) {
          throw eventsError;
        }

        setVenue(venueData as VenuePlace);
        setEvents((eventsData || []) as VenueEvent[]);

        if (venueData.subject_id) {
          const [count, following] = await Promise.all([
            socialService.getFollowersCount(venueData.subject_id),
            user && currentUserProfile?.subject_id 
              ? socialService.isFollowing(currentUserProfile.subject_id, venueData.subject_id)
              : Promise.resolve(false)
          ]);
          setFollowersCount(count);
          setIsFollowing(following);
        }

        const eventIds = (eventsData || []).map(event => event.id);
        if (eventIds.length > 0) {
          const { data: momentsData } = await supabase
            .from('posts')
            .select('id, media_url, media_type, caption, event_id, created_at, actor_subject_id, song_title')
            .in('event_id', eventIds)
            .order('created_at', { ascending: false })
            .limit(18);
          setMoments((momentsData || []) as PostWithSetlist[]);
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
  }, [id, user, currentUserProfile?.subject_id]);

  const handleFollowToggle = async () => {
    if (!user || !currentUserProfile?.subject_id || !venue?.subject_id) {
      if (!user) history.push('/welcome');
      return;
    }

    setFollowLoading(true);
    try {
      if (isFollowing) {
        await socialService.unfollow(currentUserProfile.subject_id, venue.subject_id);
        setIsFollowing(false);
        setFollowersCount(prev => Math.max(0, prev - 1));
      } else {
        await socialService.follow(currentUserProfile.subject_id, venue.subject_id);
        setIsFollowing(true);
        setFollowersCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to toggle follow', err);
    } finally {
      setFollowLoading(false);
    }
  };

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
          <div className="app-screen p-4">
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
                <section className="venue-hero space-y-4 mb-6">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">
                      Venue
                    </p>
                    <h1 className="mt-2 font-display text-2xl text-slate-50">
                      {venue.name}
                    </h1>
                    <div className="flex items-center gap-3 mt-1 text-xs">
                      <p className="text-slate-400 font-semibold uppercase tracking-wider">
                        {followersCount} followers
                      </p>
                      {user && (
                        <button
                          type="button"
                          disabled={followLoading}
                          onClick={handleFollowToggle}
                          className={`rounded-full px-4 py-1 text-[10px] font-bold uppercase tracking-widest transition ${
                            isFollowing
                              ? 'bg-white/10 text-white border border-white/10'
                              : 'bg-[#ff6b4a] text-white'
                          }`}
                        >
                          {followLoading ? <IonSpinner name="crescent" /> : (isFollowing ? 'Following' : 'Follow')}
                        </button>
                      )}
                    </div>
                  </div>
                  {addressLine && (
                    <p className="text-sm text-slate-400">{addressLine}</p>
                  )}
                  {(venue.venue_type || venue.capacity) && (
                    <p className="text-xs text-slate-500">
                      {venue.venue_type || 'Venue'}{venue.capacity ? ` · ${venue.capacity} cap` : ''}
                    </p>
                  )}
                  {venue.website_url && (
                    <a
                      className="text-xs text-[#ffd1c4] hover:text-[#ff6b4a] transition-colors"
                      href={venue.website_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {venue.website_url.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </section>

                {(venue.photos || []).length > 0 && (
                  <section className="flex gap-3 overflow-x-auto pb-4 mb-6 scrollbar-hide">
                    {(venue.photos || []).map((url, index) => (
                      <div key={`${url}-${index}`} className="h-32 w-48 flex-shrink-0 overflow-hidden rounded-2xl bg-[#0f1320] border border-white/5 shadow-lg">
                        <img src={url} alt={`Venue ${venue.name}`} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </section>
                )}

                <section className="space-y-3 mb-8">
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

                <section className="space-y-3 mb-8">
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
                        <button
                          key={moment.id}
                          type="button"
                          onClick={() => history.push(`/post/${moment.id}`)}
                          className="overflow-hidden rounded-2xl bg-[#0f1320] aspect-square border border-white/5 hover:ring-2 hover:ring-slate-600 transition-all"
                        >
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
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 transition-colors"
              onClick={() => history.goBack()}
            >
              Back
            </button>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default VenueDetail;
