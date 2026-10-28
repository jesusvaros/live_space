import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '../components/ui/AppPrimitives';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, Profile, VenuePlace, PostWithSetlist, Artist } from '../lib/types';
import { socialService } from '../services/social.service';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import { EventListItem } from '../features/events/types';
import { getEventCoverImage, getPrimaryArtistName } from '../features/events/utils';
import MomentGrid from '../components/ui/MomentGrid';
import { IconCheckCircle, IconMap } from '../components/icons';
import { VenueFeedbackSummary } from '../features/community';
import { mapVenue } from '../data/canonicalMappers';
import { fetchEventCards } from '../data/eventQueries';
import { useRouteEntityId } from '../hooks/useRouteEntityId';
import DetailHeader from '../components/ui/DetailHeader';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import PhotoCredit from '../components/ui/PhotoCredit';
import ClaimProfileLink from '../components/pro/ClaimProfileLink';
import { enableConcertAlerts } from '../features/alerts/concertAlerts';

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

        // Everything recorded here, past concerts included.
        try {
          const { data: momentRows, error: momentsError } = await supabase
            .from('v_post_cards')
            .select('*')
            .eq('events->venue_place->>id', mappedVenue.id)
            .order('created_at', { ascending: false })
            .limit(16);
          if (momentsError) throw momentsError;
          setMoments((momentRows || []) as unknown as PostWithSetlist[]);
        } catch (momentsError) {
          console.warn('Failed to load venue moments', momentsError);
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
        void enableConcertAlerts();
        setIsFollowing(true);
        setFollowersCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to toggle follow', err);
    } finally {
      setFollowLoading(false);
    }
  };

  const directionsUrl = useMemo(() => {
    if (!venue) return null;
    if (venue.latitude != null && venue.longitude != null) {
      return `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`;
    }
    const query = [venue.name, venue.address, venue.city].filter(Boolean).join(', ');
    return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
  }, [venue]);

  const venueCover = venue ? venue.cover_image_url || (venue.photos || [])[0] || null : null;

  const posterDate = (iso: string) =>
    new Date(iso)
      .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
      .replace(/[.,]/g, '')
      .toUpperCase();

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
        <div className="pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
          <section className="relative h-[300px] w-full overflow-hidden">
            {venueCover ? (
              <img src={venueCover} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <GeneratedPoster title={venue.name} variant="hero" />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(to_top,#0d0e12_4%,rgba(13,14,18,0)_60%)]" />
            <div className="absolute inset-x-4 bottom-1.5">
              <PhotoCredit credit={venueCover ? venue.cover_credit : null} className="mb-2" />
              <p className="flex items-center gap-1.5 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-app-accent">
                <IconMap size={14} />
                {[venueTypeLabel(venue.venue_type), venue.city].filter(Boolean).join(' · ')}
              </p>
              <h1 className={`mt-1.5 font-poster leading-[0.86] text-app-ink ${venue.name.length > 16 ? 'text-[44px]' : 'text-[60px]'}`}>
                {venue.name}
              </h1>
              {venue.address ? <p className="mt-1.5 text-sm text-[#e4e0d8]">{venue.address}</p> : null}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5">
            <button
              type="button"
              aria-pressed={isFollowing}
              disabled={followLoading}
              onClick={user ? handleFollowToggle : () => navigate('/welcome')}
              className={`inline-flex min-h-[46px] items-center gap-1.5 rounded-full px-[18px] text-[15px] font-bold transition disabled:opacity-60 ${
                isFollowing ? 'border border-app-line bg-app-surface text-app-ink' : 'bg-app-accent text-[#14151a]'
              }`}
            >
              {isFollowing ? <IconCheckCircle size={16} className="text-[#25d47b]" /> : null}
              {isFollowing ? 'Siguiendo' : 'Seguir'}
            </button>
            {directionsUrl ? (
              <a
                href={directionsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[46px] items-center rounded-full border border-app-line px-[18px] text-[15px] font-semibold text-app-ink"
              >
                Cómo llegar
              </a>
            ) : null}
            {venue.website_url ? (
              <a
                href={venue.website_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[46px] items-center rounded-full border border-app-line px-[18px] text-[15px] font-semibold text-app-ink"
              >
                Web
              </a>
            ) : null}
            {followersCount > 0 ? (
              <span className="font-mono text-xs text-white/50">
                {followersCount} {followersCount === 1 ? 'seguidor' : 'seguidores'}
              </span>
            ) : null}
          </div>

          <div className="px-4 pt-5 empty:hidden">
            <VenueFeedbackSummary venueId={venue.id} />
          </div>

          <section className="px-4 pt-5">
            <h2 className="mb-2.5 font-display text-xl font-bold text-app-ink">Próximos conciertos</h2>
            {events.length === 0 ? (
              <p className="text-sm text-white/55">No hay conciertos anunciados ahora mismo.</p>
            ) : (
              <div className="-mr-4 flex gap-3 overflow-x-auto pr-4">
                {events.map(event => {
                  const artist = getPrimaryArtistName(event as EventListItem);
                  const cover = getEventCoverImage(event as EventListItem);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => navigate(`/event/${event.id}`)}
                      className="w-[140px] shrink-0 text-left text-app-ink"
                    >
                      <span className="relative block h-[175px] w-[140px] overflow-hidden rounded-xl bg-app-surface">
                        {cover ? (
                          <img src={cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <GeneratedPoster title={artist} />
                        )}
                      </span>
                      <span className="mt-1.5 block font-mono text-[11px] font-semibold text-app-accent">{posterDate(event.starts_at)}</span>
                      <span className="block truncate font-display text-[15px] font-bold">{artist}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="px-4 pt-5">
            <h2 className="mb-2.5 font-display text-xl font-bold text-app-ink">Grabado aquí</h2>
            {moments.length === 0 ? (
              <p className="text-sm text-white/55">Nadie ha subido nada desde aquí todavía. Graba en tu próximo concierto.</p>
            ) : (
              <MomentGrid moments={moments} />
            )}
          </section>
          <ClaimProfileLink type="venue" entityId={venue.id} subjectId={venue.subject_id} className="px-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))] pt-6" />
        </div>
      )}
    </AppShell>
  );
};

export default VenueDetail;
