import React, { useEffect, useMemo, useState } from 'react';
import { IonSpinner } from '@ionic/react';
import { useHistory, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, Profile, VenuePlace, PostWithSetlist, Artist } from '../lib/types';
import { socialService } from '../services/social.service';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import EventPosterTile from '../components/EventPosterTile';

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

        let venueSubjectId: string | null = null;
        try {
          const { data: subjectId, error: subjectError } = await supabase
            .rpc('get_or_create_venue_subject', { p_venue_place_id: venueData.id });
          if (!subjectError && typeof subjectId === 'string') {
            venueSubjectId = subjectId;
          }
        } catch {
          // ignore subject lookup errors
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

        setVenue({ ...(venueData as VenuePlace), subject_id: venueSubjectId });
        setEvents((eventsData || []) as VenueEvent[]);

        if (venueSubjectId) {
          const [count, following] = await Promise.all([
            socialService.getFollowersCount(venueSubjectId),
            user && currentUserProfile?.subject_id 
              ? socialService.isFollowing(currentUserProfile.subject_id, venueSubjectId)
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
    <AppShell>
      {loading && (
        <div className="flex items-center justify-center py-12">
          <IonSpinner name="crescent" />
        </div>
      )}

      {!loading && error && <div className="p-4"><p className="text-sm text-rose-400">{error}</p></div>}

      {!loading && venue && (
        <>
          <section className="relative h-[340px] w-full overflow-hidden bg-black">
            {(venue.photos || [])[0] ? (
              <img src={(venue.photos || [])[0]} alt={venue.name} className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
            <div className="absolute inset-x-0 bottom-0 bg-black/70 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Venue</p>
              <h1 className="mt-2 font-display text-3xl font-bold text-white">{venue.name}</h1>
              {addressLine && <p className="mt-2 text-sm text-white/70">{addressLine}</p>}
              <div className="mt-3 flex items-center gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
                  {followersCount} followers
                </p>
                {user && (
                  <button
                    type="button"
                    disabled={followLoading}
                    onClick={handleFollowToggle}
                    className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] disabled:opacity-60 ${
                      isFollowing ? 'bg-white/10 text-white/80' : 'bg-[#ff6b4a] text-white'
                    }`}
                  >
                    {followLoading ? <IonSpinner name="crescent" /> : (isFollowing ? 'Following' : 'Follow')}
                  </button>
                )}
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-8 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            {(venue.photos || []).length > 1 && (
              <section className="-mx-4 flex gap-2 overflow-x-auto pb-1">
                {(venue.photos || []).slice(1, 8).map((url, index) => (
                  <div key={`${url}-${index}`} className="h-36 w-52 flex-shrink-0 overflow-hidden bg-white/5">
                    <img src={url} alt={`Venue ${venue.name}`} className="h-full w-full object-cover" />
                  </div>
                ))}
              </section>
            )}

            {(venue.venue_type || venue.capacity) && (
              <p className="text-xs text-white/55">
                    {venue.venue_type || 'Venue'}{venue.capacity ? ` · ${venue.capacity} cap` : ''}
                  </p>
                )}

                {venue.website_url && (
                  <a
                    className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70 hover:text-white"
                    href={venue.website_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {venue.website_url.replace(/^https?:\/\//, '')}
                  </a>
                )}

                <section className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Events</p>
                    <p className="mt-1 text-sm text-white/55">All shows hosted here.</p>
                  </div>
                  {events.length === 0 ? (
                    <p className="text-sm text-white/55">No events here yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {events.map(event => (
                        <EventPosterTile
                          key={event.id}
                          event={event}
                          className="w-full"
                          onSelect={selected => history.push(`/event/${selected.id}`)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Moments</p>
                    <p className="mt-1 text-sm text-white/55">Latest media from this room.</p>
                  </div>
                  {moments.length === 0 ? (
                    <p className="text-sm text-white/55">No memories here yet.</p>
                  ) : (
                    <div className="-mx-4 grid grid-cols-3 gap-1">
                      {moments.map(moment => (
                        <button
                          key={moment.id}
                          type="button"
                          onClick={() => history.push(`/post/${moment.id}`)}
                          className="aspect-square overflow-hidden bg-white/5 transition-opacity hover:opacity-90"
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

                <button
                  type="button"
                  className="bg-white/10 px-4 py-3 text-sm font-semibold text-white"
                  onClick={() => history.goBack()}
                >
                  Back
                </button>
              </div>
            </>
          )}
    </AppShell>
  );
};

export default VenueDetail;
