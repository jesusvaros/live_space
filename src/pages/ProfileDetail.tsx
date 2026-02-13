import React, { useEffect, useMemo, useState } from 'react';
import { IonSpinner } from '@ionic/react';
import { useHistory, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, Profile, VenuePlace, PostWithSetlist, Artist } from '../lib/types';
import { socialService } from '../services/social.service';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import EventPosterTile from '../components/EventPosterTile';

type ProfileEvent = Event & {
  organizer?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Artist | null }[];
};

const ProfileDetail: React.FC = () => {
  const history = useHistory();
  const { id } = useParams<{ id: string }>();
  const { user, profile: currentUserProfile } = useAuth();
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [venuePlaces, setVenuePlaces] = useState<VenuePlace[]>([]);
  const [events, setEvents] = useState<ProfileEvent[]>([]);
  const [moments, setMoments] = useState<PostWithSetlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setError('');
      try {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .single();
        
        if (profileError || !profileData) {
          throw profileError;
        }

        setProfile(profileData as Profile);

        if (profileData.subject_id) {
          const [count, following] = await Promise.all([
            socialService.getFollowersCount(profileData.subject_id),
            user && currentUserProfile?.subject_id 
              ? socialService.isFollowing(currentUserProfile.subject_id, profileData.subject_id)
              : Promise.resolve(false)
          ]);
          setFollowersCount(count);
          setIsFollowing(following);
        }

        const eventSelect = `
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

        let eventIds: string[] = [];
        let eventRows: ProfileEvent[] = [];

        if (profileData.role === 'artist') {
          const { data: artistEvents } = await supabase
            .from('event_artists')
            .select('event_id')
            .eq('artist_entity_id', id);
          eventIds = (artistEvents || []).map((row: any) => row.event_id);
          if (eventIds.length > 0) {
            const { data: eventsData } = await supabase
              .from('events')
              .select(eventSelect)
              .in('id', eventIds)
              .order('starts_at', { ascending: false });
            eventRows = (eventsData || []) as ProfileEvent[];
          }
        } else if (profileData.role === 'venue') {
          const { data: venuesData } = await supabase
            .from('venue_places')
            .select('*')
            .eq('created_by', id)
            .order('name', { ascending: true });
          const venuePlacesList = (venuesData || []) as VenuePlace[];
          setVenuePlaces(venuePlacesList);

          const venuePlaceIds = venuePlacesList.map(v => v.id).filter(Boolean);
          if (venuePlaceIds.length > 0) {
            const { data: eventsData } = await supabase
              .from('events')
              .select(eventSelect)
              .in('venue_place_id', venuePlaceIds)
              .order('starts_at', { ascending: false });
            eventRows = (eventsData || []) as ProfileEvent[];
            eventIds = eventRows.map(event => event.id);
          } else {
            eventRows = [];
            eventIds = [];
          }
        } else if (profileData.role === 'label') {
          const { data: eventsData } = await supabase
            .from('events')
            .select(eventSelect)
            .eq('organizer_id', id)
            .order('starts_at', { ascending: false });
          eventRows = (eventsData || []) as ProfileEvent[];
          eventIds = eventRows.map(event => event.id);
        }

        setEvents(eventRows);

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
        setError('Profile not found.');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [id, user, currentUserProfile?.subject_id]);

  const handleFollowToggle = async () => {
    if (!user || !currentUserProfile?.subject_id || !profile?.subject_id) {
      if (!user) history.push('/welcome');
      return;
    }

    setFollowLoading(true);
    try {
      if (isFollowing) {
        await socialService.unfollow(currentUserProfile.subject_id, profile.subject_id);
        setIsFollowing(false);
        setFollowersCount(prev => Math.max(0, prev - 1));
      } else {
        await socialService.follow(currentUserProfile.subject_id, profile.subject_id);
        setIsFollowing(true);
        setFollowersCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to toggle follow', err);
    } finally {
      setFollowLoading(false);
    }
  };

  const externalLinks = useMemo(() => {
    const links = (profile?.external_links || {}) as Record<string, string>;
    return Object.entries(links)
      .map(([key, value]) => ({ key, value }))
      .filter(link => Boolean(link.value));
  }, [profile]);

  return (
    <AppShell>
      {loading && (
        <div className="flex items-center justify-center py-12">
          <IonSpinner name="crescent" />
        </div>
      )}

      {!loading && error && <div className="p-4"><p className="text-sm text-rose-400">{error}</p></div>}

      {!loading && profile && (
        <>
          <section className="relative h-[340px] w-full overflow-hidden bg-black">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name || 'Profile'} className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
            <div className="absolute inset-x-0 bottom-0 bg-black/70 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">
                {profile.role.toUpperCase()}
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold text-white">
                {profile.display_name || profile.username || 'Unknown'}
              </h2>
              {profile.primary_city && <p className="mt-2 text-sm text-white/70">{profile.primary_city}</p>}
              <div className="mt-3 flex items-center gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
                  {followersCount} followers
                </p>
                {user && profile.id !== user.id && (
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
                {profile.bio && <p className="text-sm text-white/70">{profile.bio}</p>}

                {externalLinks.length > 0 && (
                  <section className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Links</p>
                    <div className="space-y-2 text-sm">
                      {externalLinks.map(link => (
                        <a
                          key={link.key}
                          href={link.value}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-white/70 hover:text-white"
                        >
                          {link.value.replace(/^https?:\/\//, '')}
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                {profile.role === 'venue' && venuePlaces.length > 0 && (
                  <section className="space-y-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Venues</p>
                    <div className="space-y-6">
                      {venuePlaces.map(venue => (
                        <div key={venue.id} className="space-y-2">
                          <div>
                            <p className="font-display text-lg font-bold text-white">{venue.name}</p>
                            <p className="text-sm text-white/70">{venue.address || venue.city}</p>
                            {(venue.venue_type || venue.capacity) && (
                              <p className="text-xs text-white/55">
                                {venue.venue_type || 'Venue'}{venue.capacity ? ` · ${venue.capacity} cap` : ''}
                              </p>
                            )}
                          </div>
                          {venue.website_url && (
                            <a
                              href={venue.website_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70 hover:text-white"
                            >
                              {venue.website_url.replace(/^https?:\/\//, '')}
                            </a>
                          )}
                          {(venue.photos || []).length > 0 && (
                            <div className="-mx-4 flex gap-2 overflow-x-auto pb-1">
                              {venue.photos.slice(0, 8).map((url, index) => (
                                <div key={`${url}-${index}`} className="h-28 w-44 flex-shrink-0 overflow-hidden bg-white/5">
                                  <img src={url} alt="Venue" className="h-full w-full object-cover" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Events</p>
                    <p className="mt-1 text-sm text-white/55">Shows connected to this profile.</p>
                  </div>
                  {events.length === 0 ? (
                    <p className="text-sm text-white/55">No events yet.</p>
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
                    <p className="mt-1 text-sm text-white/55">Latest media from connected events.</p>
                  </div>
                  {moments.length === 0 ? (
                    <p className="text-sm text-white/55">No moments yet.</p>
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

export default ProfileDetail;
