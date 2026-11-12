import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DetailSkeleton } from '../components/ui/AppPrimitives';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, Profile, VenuePlace, PostWithSetlist, Artist } from '../lib/types';
import { socialService } from '../services/social.service';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import { EventListItem } from '../features/events/types';
import { getEventCoverSources, getPrimaryArtistName } from '../features/events/utils';
import CoverImage from '../components/ui/CoverImage';
import MomentGrid from '../components/ui/MomentGrid';
import { IconCheckCircle, IconMap } from '../components/icons';
import { VenueFeedbackSummary } from '../features/community';
import { mapVenue } from '../data/canonicalMappers';
import { fetchEventCards, fetchPastEventCards } from '../data/eventQueries';
import { eventCacheKey, primeCache, readCache, venueCacheKey, writeCache } from '../data/pageCache';
import { useRouteEntityId } from '../hooks/useRouteEntityId';
import DetailHeader from '../components/ui/DetailHeader';
import MapVisibilityMenu from '../features/hiddenMap/MapVisibilityMenu';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import PhotoCredit from '../components/ui/PhotoCredit';
import ClaimProfileLink from '../components/pro/ClaimProfileLink';
import { enableConcertAlerts } from '../features/alerts/concertAlerts';
import PastConcertsSection from '../features/events/PastConcertsSection';
import { useFirstContent } from '../lib/perfTiming';
import { NAV_CLEARANCE } from '../components/BottomNav';

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

type VenueSnapshot = {
  venue: VenuePlace;
  events: VenueEvent[];
  /** More upcoming concerts than the ones loaded so far. */
  hasMoreEvents?: boolean;
  moments: PostWithSetlist[];
  followersCount: number;
};

// A busy venue lists months ahead: the agenda comes in pages as the visitor
// scrolls along it.
const EVENTS_PAGE = 24;

const startOfTodayIso = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const VenueDetail: React.FC = () => {
  const id = useRouteEntityId();
  const navigate = useNavigate();
  const { user, profile: currentUserProfile } = useAuth();
  const contentRef = useRef<HTMLElement | null>(null);
  
  const initial = readCache<VenueSnapshot>(venueCacheKey(id || ''));
  const [venue, setVenue] = useState<VenuePlace | null>(initial?.venue ?? null);
  const [events, setEvents] = useState<VenueEvent[]>(initial?.events ?? []);
  const [hasMoreEvents, setHasMoreEvents] = useState(initial?.hasMoreEvents ?? false);
  const eventsScrollerRef = useRef<HTMLDivElement | null>(null);
  const eventsEndRef = useRef<HTMLSpanElement | null>(null);
  const [moments, setMoments] = useState<PostWithSetlist[]>(initial?.moments ?? []);
  const [loading, setLoading] = useState(!initial);
  const [eventsLoading, setEventsLoading] = useState(!initial);
  const [momentsLoading, setMomentsLoading] = useState(!initial);
  useFirstContent('venue', Boolean(venue));
  const [error, setError] = useState('');
  
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followersCount, setFollowersCount] = useState(initial?.followersCount ?? 0);

  // The venue, its agenda and its moments only need the venue id: each part
  // shows as soon as it arrives (the agenda and the moments have their own
  // placeholders) instead of all waiting for the slowest.
  useEffect(() => {
    let stale = false;
    // Seen before (this session or a previous one): paint it now, refresh behind.
    const cached = readCache<VenueSnapshot>(venueCacheKey(id || ''));
    // Its concerts open at once too (cards restored from a previous session).
    if (cached) primeCache(cached.events as EventListItem[], eventCacheKey);
    setVenue(cached?.venue ?? null);
    setEvents(cached?.events ?? []);
    setHasMoreEvents(cached?.hasMoreEvents ?? false);
    setMoments(cached?.moments ?? []);
    setFollowersCount(cached?.followersCount ?? 0);
    setLoading(!cached);
    setEventsLoading(!cached);
    setMomentsLoading(!cached);
    setError('');

    const snapshot: VenueSnapshot | null = cached ? { ...cached } : null;
    let mappedVenue: VenuePlace | null = cached?.venue ?? null;
    let eventsData = cached?.events ?? null;
    let moreEvents = cached?.hasMoreEvents ?? false;
    let momentsData = cached?.moments ?? null;

    const eventsRequest = fetchEventCards({ venueId: id, startIso: startOfTodayIso(), limit: EVENTS_PAGE })
      .then(rows => {
        eventsData = rows as VenueEvent[];
        moreEvents = rows.length === EVENTS_PAGE;
        if (stale) return;
        setEvents(eventsData);
        setHasMoreEvents(moreEvents);
      })
      .catch(eventsError => {
        // Offline with a saved agenda: keep it.
        console.warn('Failed to load venue events', eventsError);
      })
      .finally(() => {
        if (!stale) setEventsLoading(false);
      });

    // Everything recorded here, past concerts included.
    const momentsRequest = Promise.resolve(
      supabase
        .from('v_post_cards')
        .select('*')
        .eq('events->venue_place->>id', id)
        .order('created_at', { ascending: false })
        .limit(16),
    )
      .then(({ data, error: momentsError }) => {
        if (momentsError) throw momentsError;
        momentsData = (data || []) as unknown as PostWithSetlist[];
        if (!stale) setMoments(momentsData);
      })
      .catch(momentsError => {
        console.warn('Failed to load venue moments', momentsError);
      })
      .finally(() => {
        if (!stale) setMomentsLoading(false);
      });

    const venueRequest = Promise.resolve(
      supabase.from('v_subject_venues').select('*').eq('venue_place_id', id).single(),
    )
      .then(({ data, error: venueError }) => {
        if (venueError || !data) throw venueError || new Error('Venue not found');
        mappedVenue = mapVenue(data);
        if (stale) return;
        setVenue(mappedVenue);
        setLoading(false);
      })
      .catch(() => {
        if (stale) return;
        if (!cached) {
          setError('Sala no encontrada.');
          setVenue(null);
          setEvents([]);
          setMoments([]);
        }
        setLoading(false);
      });

    // Saved once every part has answered, with whatever arrived.
    void Promise.all([venueRequest, eventsRequest, momentsRequest]).then(() => {
      if (!mappedVenue) return;
      writeCache<VenueSnapshot>(venueCacheKey(id || ''), {
        venue: mappedVenue,
        events: eventsData ?? [],
        hasMoreEvents: moreEvents,
        moments: momentsData ?? [],
        followersCount: readCache<VenueSnapshot>(venueCacheKey(id || ''))?.followersCount ?? snapshot?.followersCount ?? 0,
      });
    });

    return () => {
      stale = true;
    };
  }, [id]);

  // Followers and «Siguiendo» need the venue's subject and the session; they
  // load on their own so signing in does not reload the whole page.
  const venueSubjectId = venue?.subject_id ?? null;
  const viewerSubjectId = user ? currentUserProfile?.subject_id ?? null : null;
  useEffect(() => {
    if (!venueSubjectId) return undefined;
    let stale = false;
    Promise.all([
      socialService.getFollowersCount(venueSubjectId),
      viewerSubjectId ? socialService.isFollowing(viewerSubjectId, venueSubjectId) : Promise.resolve(false),
    ])
      .then(([followers, following]) => {
        if (stale) return;
        setFollowersCount(followers);
        setIsFollowing(following);
        const saved = readCache<VenueSnapshot>(venueCacheKey(id || ''));
        if (saved && saved.followersCount !== followers) {
          writeCache<VenueSnapshot>(venueCacheKey(id || ''), { ...saved, followersCount: followers });
        }
      })
      .catch(socialError => {
        console.warn('Failed to load venue social data', socialError);
        if (!stale) setIsFollowing(false);
      });
    return () => {
      stale = true;
    };
  }, [id, venueSubjectId, viewerSubjectId]);

  // The next page of the agenda once the end of the row comes into view.
  // One page at a time; a page that lands after leaving this venue is dropped.
  const currentIdRef = useRef(id);
  currentIdRef.current = id;
  const loadingMoreRef = useRef(false);
  useEffect(() => {
    const scroller = eventsScrollerRef.current;
    const end = eventsEndRef.current;
    if (!id || !hasMoreEvents || !scroller || !end || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      entries => {
        if (loadingMoreRef.current || !entries.some(entry => entry.isIntersecting)) return;
        loadingMoreRef.current = true;
        fetchEventCards({ venueId: id, startIso: startOfTodayIso(), offset: events.length, limit: EVENTS_PAGE })
          .then(page => {
            if (currentIdRef.current !== id) return;
            const seen = new Set(events.map(event => event.id));
            const next = [...events, ...(page as VenueEvent[]).filter(event => !seen.has(event.id))];
            const more = page.length === EVENTS_PAGE;
            setEvents(next);
            setHasMoreEvents(more);
            const snapshot = readCache<VenueSnapshot>(venueCacheKey(id));
            if (snapshot) writeCache<VenueSnapshot>(venueCacheKey(id), { ...snapshot, events: next, hasMoreEvents: more });
          })
          .catch(() => {
            if (currentIdRef.current === id) setHasMoreEvents(false);
          })
          .finally(() => {
            loadingMoreRef.current = false;
          });
      },
      { root: scroller, rootMargin: '0px 420px 0px 0px' },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [events, hasMoreEvents, id]);

  // Past concerts, most recent first: read by PastConcertsSection only once it
  // scrolls into view.
  const fetchPastPage = useCallback(
    (offset: number, limit: number) =>
      !id
        ? Promise.resolve([])
        : fetchPastEventCards({ venueId: id, beforeIso: startOfTodayIso(), offset, limit }),
    [id],
  );

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
      <DetailHeader
        title={venue?.name || 'Sala'}
        scrollRef={contentRef}
        fallbackHref="/tabs/discover"
        actions={venue ? <MapVisibilityMenu type="venue" id={venue.id} name={venue.name} imageUrl={venueCover} /> : null}
      />
      {loading && <DetailSkeleton />}

      {!loading && error && <div className="p-4"><p className="text-sm text-rose-400">{error}</p></div>}

      {!loading && venue && (
        <div className={NAV_CLEARANCE}>
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
            {events.length === 0 && eventsLoading ? (
              <div className="-mr-4 flex gap-3 overflow-hidden pr-4" aria-hidden>
                {[0, 1, 2].map(index => (
                  <span key={index} className="h-[175px] w-[140px] shrink-0 animate-pulse rounded-xl bg-app-surface" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-white/55">No hay conciertos anunciados ahora mismo.</p>
            ) : (
              <div ref={eventsScrollerRef} className="-mr-4 flex gap-3 overflow-x-auto pr-4">
                {events.map(event => {
                  const artist = getPrimaryArtistName(event as EventListItem);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => navigate(`/event/${event.id}`)}
                      className="w-[140px] shrink-0 text-left text-app-ink"
                    >
                      <span className="relative block h-[175px] w-[140px] overflow-hidden rounded-xl bg-app-surface">
                        <CoverImage
                          sources={getEventCoverSources(event as EventListItem)}
                          className="absolute inset-0 h-full w-full object-cover"
                          fallback={<GeneratedPoster title={artist} />}
                        />
                      </span>
                      <span className="mt-1.5 block font-mono text-[11px] font-semibold text-app-accent">{posterDate(event.starts_at)}</span>
                      <span className="block truncate font-display text-[15px] font-bold">{artist}</span>
                    </button>
                  );
                })}
                {hasMoreEvents ? <span ref={eventsEndRef} aria-hidden className="w-px shrink-0" /> : null}
              </div>
            )}
          </section>

          <PastConcertsSection
            ownerKey={`venue:${venue.id}`}
            fetchPage={fetchPastPage}
            titleOf={getPrimaryArtistName}
            subtitleOf={event => (getPrimaryArtistName(event) !== event.name ? event.name : null)}
            hideWhenEmpty={events.length === 0 && !eventsLoading}
            className="px-4 pt-5"
          />

          <section className="px-4 pt-5">
            <h2 className="mb-2.5 font-display text-xl font-bold text-app-ink">Grabado aquí</h2>
            {moments.length === 0 && momentsLoading ? (
              <div className="grid grid-cols-3 gap-1" aria-hidden>
                {[0, 1, 2].map(index => (
                  <span key={index} className="aspect-square animate-pulse rounded-lg bg-app-surface" />
                ))}
              </div>
            ) : moments.length === 0 ? (
              <p className="text-sm text-white/55">Nadie ha subido nada desde aquí todavía. Graba en tu próximo concierto.</p>
            ) : (
              <MomentGrid moments={moments} />
            )}
          </section>
          <ClaimProfileLink type="venue" entityId={venue.id} subjectId={venue.subject_id} className="px-4 pt-6" />
        </div>
      )}
    </AppShell>
  );
};

export default VenueDetail;
