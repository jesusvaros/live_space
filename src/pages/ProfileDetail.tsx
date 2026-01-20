import React, { useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent, IonSpinner } from '@ionic/react';
import { useHistory, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, Profile, VenuePlace, PostWithSetlist } from '../lib/types';
import { socialService } from '../services/social.service';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
import EventCard from '../components/EventCard';

type ProfileEvent = Event & {
  organizer?: Profile | null;
  venue?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Profile | null }[];
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

        let eventIds: string[] = [];
        let eventRows: ProfileEvent[] = [];

        if (profileData.role === 'artist') {
          const { data: artistEvents } = await supabase
            .from('event_artists')
            .select('event_id')
            .eq('artist_id', id);
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
          setVenuePlaces((venuesData || []) as VenuePlace[]);

          const { data: eventsData } = await supabase
            .from('events')
            .select(eventSelect)
            .eq('venue_id', id)
            .order('starts_at', { ascending: false });
          eventRows = (eventsData || []) as ProfileEvent[];
          eventIds = eventRows.map(event => event.id);
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
    <IonPage>
      <IonContent fullscreen>
        <div className="min-h-full">
          <AppHeader />
          <div className="flex flex-col gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <IonSpinner name="crescent" />
              </div>
            )}

            {!loading && error && (
              <p className="text-sm text-rose-400">{error}</p>
            )}

            {!loading && profile && (
              <>
                <div className="space-y-4 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-5 shadow-[0_24px_50px_rgba(0,0,0,0.35)]">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 overflow-hidden rounded-full bg-slate-800">
                      {profile.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt={profile.display_name || 'Profile'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-[#1b2232] to-[#0b0e14]" />
                      )}
                    </div>
                    <div>
                      <h2 className="font-display text-xl text-slate-50">
                        {profile.display_name || profile.username || 'Unknown'}
                      </h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-slate-400">
                          {profile.role.toUpperCase()} · {profile.primary_city || 'City TBD'}
                        </p>
                        <span className="text-slate-600">|</span>
                        <p className="text-xs font-semibold text-slate-300">
                          {followersCount} followers
                        </p>
                      </div>
                    </div>
                  </div>
                  {profile.bio && <p className="text-sm text-slate-300">{profile.bio}</p>}
                  
                  {user && profile.id !== user.id && (
                    <button
                      type="button"
                      disabled={followLoading}
                      onClick={handleFollowToggle}
                      className={`w-full rounded-xl py-2 text-sm font-semibold transition ${
                        isFollowing
                          ? 'bg-white/10 text-white border border-white/10'
                          : 'bg-[#ff6b4a] text-white'
                      }`}
                    >
                      {followLoading ? <IonSpinner name="crescent" /> : (isFollowing ? 'Following' : 'Follow')}
                    </button>
                  )}
                </div>

                {externalLinks.length > 0 && (
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 shadow-[0_24px_50px_rgba(0,0,0,0.35)]">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Links</p>
                    <div className="space-y-2 text-sm text-slate-300">
                      {externalLinks.map(link => (
                        <a
                          key={link.key}
                          href={link.value}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-200 hover:text-slate-50"
                        >
                          {link.value.replace(/^https?:\/\//, '')}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {profile.role === 'venue' && venuePlaces.length > 0 && (
                  <div className="space-y-4 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 shadow-[0_24px_50px_rgba(0,0,0,0.35)]">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Venues</p>
                    <div className="space-y-4">
                      {venuePlaces.map(venue => (
                        <div key={venue.id} className="space-y-2">
                          <div>
                            <p className="text-sm text-slate-50">{venue.name}</p>
                            <p className="text-xs text-slate-400">
                              {venue.address || venue.city}
                            </p>
                            {(venue.venue_type || venue.capacity) && (
                              <p className="text-xs text-slate-500">
                                {venue.venue_type || 'Venue'}{venue.capacity ? ` · ${venue.capacity} cap` : ''}
                              </p>
                            )}
                          </div>
                          {venue.website_url && (
                            <a
                              href={venue.website_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-200 hover:text-slate-50"
                            >
                              {venue.website_url.replace(/^https?:\/\//, '')}
                            </a>
                          )}
                          {(venue.photos || []).length > 0 && (
                            <div className="flex gap-3 overflow-x-auto pb-1">
                              {venue.photos.map((url, index) => (
                                <div
                                  key={`${url}-${index}`}
                                  className="h-24 w-40 flex-shrink-0 overflow-hidden rounded-2xl bg-[#0f1320]"
                                >
                                  <img src={url} alt="Venue" className="h-full w-full object-cover" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <section className="space-y-3">
                  <div>
                    <h3 className="font-display text-lg text-slate-50">Events</h3>
                    <p className="text-xs text-slate-500">Shows connected to this profile.</p>
                  </div>
                  {events.length === 0 ? (
                    <p className="text-sm text-slate-500">No events yet.</p>
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
                    <h3 className="font-display text-lg text-slate-50">Recent moments</h3>
                    <p className="text-xs text-slate-500">Latest media from connected events.</p>
                  </div>
                  {moments.length === 0 ? (
                    <p className="text-sm text-slate-500">No moments yet.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {moments.map(moment => (
                        <button
                          key={moment.id}
                          type="button"
                          onClick={() => history.push(`/post/${moment.id}`)}
                          className="overflow-hidden rounded-2xl bg-[#0f1320] aspect-square"
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
              className="inline-flex w-full items-center justify-center rounded-2xl border border-transparent px-4 py-2 text-sm font-semibold text-[#ffd1c4]"
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

export default ProfileDetail;
