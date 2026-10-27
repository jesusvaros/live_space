import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '../components/ui/AppPrimitives';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, Profile, VenuePlace, PostWithSetlist, Artist } from '../lib/types';
import { socialService } from '../services/social.service';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import EventPosterTile from '../features/events/components/EventPosterTile';
import { mapVenue } from '../data/canonicalMappers';
import { fetchEventCards } from '../data/eventQueries';
import { fetchPostCards } from '../data/postQueries';
import { useRouteEntityId } from '../hooks/useRouteEntityId';
import Button, { buttonClass } from '../components/ui/Button';
import DetailHeader from '../components/ui/DetailHeader';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import { VenueFeedbackSummary } from '../features/community';

const VENUE_TYPE_LABELS: Record<string, string> = {
  music_venue: 'Sala de conciertos',
  club: 'Club',
  bar: 'Bar',
  theater: 'Teatro',
  theatre: 'Teatro',
  auditorium: 'Auditorio',
  arena: 'Pabellón',
  stadium: 'Estadio',
  festival: 'Festival',
  outdoor: 'Al aire libre',
};

const venueTypeLabel = (type?: string | null) => (type ? VENUE_TYPE_LABELS[type] || 'Sala' : 'Sala');

type VenueEvent = Event & {
  organizer?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Artist | null }[];
};

const VenueDetail: React.FC = () => {
  const id = useRouteEntityId();
  const navigate = useNavigate();
  const { user, profile: currentUserProfile } = useAuth();
  const contentRef = useRef<HTMLElement | null>(null);
  
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
          .from('v_subject_venues')
          .select('*')
          .eq('venue_place_id', id)
          .single();

        if (venueError || !venueData) {
          throw venueError;
        }

        const mappedVenue = mapVenue(venueData);
        const venueSubjectId = mappedVenue.subject_id ?? null;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        setVenue(mappedVenue);

        const [eventsResult, socialResult] = await Promise.allSettled([
          fetchEventCards({ venueId: mappedVenue.id, startIso: startOfToday.toISOString() }),
          venueSubjectId
            ? Promise.all([
                socialService.getFollowersCount(venueSubjectId),
                user && currentUserProfile?.subject_id
                  ? socialService.isFollowing(currentUserProfile.subject_id, venueSubjectId)
                  : Promise.resolve(false),
              ])
            : Promise.resolve([0, false] as const),
        ]);

        const eventsData =
          eventsResult.status === 'fulfilled' ? (eventsResult.value as VenueEvent[]) : [];
        setEvents(eventsData);

        if (eventsResult.status === 'rejected') {
          console.warn('Failed to load venue events', eventsResult.reason);
        }

        if (socialResult.status === 'fulfilled') {
          const [count, following] = socialResult.value;
          setFollowersCount(count);
          setIsFollowing(following);
        } else {
          console.warn('Failed to load venue social data', socialResult.reason);
          setFollowersCount(0);
          setIsFollowing(false);
        }

        const eventIds = eventsData.map(event => event.id);
        if (eventIds.length > 0) {
          try {
            setMoments((await fetchPostCards({ eventIds })).slice(0, 18) as PostWithSetlist[]);
          } catch (momentsError) {
            console.warn('Failed to load venue moments', momentsError);
            setMoments([]);
          }
        } else {
          setMoments([]);
        }
      } catch (err) {
        setError('Sala no encontrada.');
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
      if (!user) navigate('/welcome');
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
    <AppShell headerProps={null} contentRef={contentRef}>
      <DetailHeader title={venue?.name || 'Sala'} scrollRef={contentRef} fallbackHref="/tabs/discover" />
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      )}

      {!loading && error && <div className="p-4"><p className="text-sm text-rose-400">{error}</p></div>}

      {!loading && venue && (
        <>
          <section className="relative h-[46vh] min-h-[300px] w-full overflow-hidden">
            {(venue.photos || [])[0] ? (
              <img src={(venue.photos || [])[0]} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <GeneratedPoster title={venue.name} variant="hero" />
            )}
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-app-bg via-app-bg/60 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-accent">
                {[venueTypeLabel(venue.venue_type), venue.capacity ? `aforo ${venue.capacity}` : null].filter(Boolean).join(' · ')}
              </p>
              <h1 className="mt-1 font-poster text-[44px] leading-[0.9] text-white">{venue.name}</h1>
              {addressLine && <p className="mt-2 text-sm text-white/75">{addressLine}</p>}
            </div>
          </section>
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <Button
              variant={isFollowing ? 'secondary' : 'primary'}
              disabled={followLoading}
              onClick={user ? handleFollowToggle : () => navigate('/welcome')}
            >
              {isFollowing ? 'Siguiendo' : 'Seguir'}
            </Button>
            {venue.website_url && (
              <a className={buttonClass('secondary')} href={venue.website_url} target="_blank" rel="noreferrer">
                Web de la sala
              </a>
            )}
            {followersCount > 0 && (
              <span className="text-sm text-white/55">
                {followersCount} {followersCount === 1 ? 'seguidor' : 'seguidores'}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-8 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            {(venue.photos || []).length > 1 && (
              <section className="-mx-4 flex gap-2 overflow-x-auto pb-1">
                {(venue.photos || []).slice(1, 8).map((url, index) => (
                  <div key={`${url}-${index}`} className="h-36 w-52 flex-shrink-0 overflow-hidden bg-white/5">
                    <img src={url} alt={`Sala ${venue.name}`} className="h-full w-full object-cover" />
                  </div>
                ))}
              </section>
            )}

                <VenueFeedbackSummary venueId={venue.id} />
                <section className="space-y-3">
                  <div>
                    <h2 className="font-display text-xl font-bold text-white">Próximos conciertos</h2>
                  </div>
                  {events.length === 0 ? (
                    <p className="text-sm text-white/55">No hay conciertos anunciados ahora mismo.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {events.map(event => (
                        <EventPosterTile
                          key={event.id}
                          event={event}
                          className="w-full"
                          onSelect={selected => navigate(`/event/${selected.id}`)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div>
                    <h2 className="font-display text-xl font-bold text-white">Momentos</h2>
                  </div>
                  {moments.length === 0 ? (
                    <p className="text-sm text-white/55">Nadie ha subido nada desde aquí todavía. Graba en tu próximo concierto.</p>
                  ) : (
                    <div className="-mx-4 grid grid-cols-3 gap-1">
                      {moments.map(moment => (
                        <button
                          key={moment.id}
                          type="button"
                          onClick={() => navigate(`/post/${moment.id}`)}
                          className="aspect-square overflow-hidden bg-white/5 transition-opacity hover:opacity-90"
                        >
                          {moment.media_type === 'video' ? (
                            <video className="h-full w-full object-cover" muted>
                              <source src={moment.media_url} />
                            </video>
                          ) : (
                            <img
                              src={moment.media_url}
                              alt={moment.caption || 'Momento'}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </section>

              </div>
            </>
          )}
    </AppShell>
  );
};

export default VenueDetail;
