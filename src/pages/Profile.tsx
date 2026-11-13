import React, { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '../components/ui/Avatar';
import { Spinner } from '../components/ui/AppPrimitives';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import AppShell from '../components/AppShell';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import CoverImage from '../components/ui/CoverImage';
import { eventCoverSources } from '../lib/eventCover';
import { NAV_CLEARANCE } from '../components/BottomNav';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import { useFollowedEntities } from '../hooks/useFollowedEntities';
import { IconCalendar, IconChevronRight, IconHeart, IconSettings } from '../components/icons';
import { useAppResume } from '../shared/hooks/useAppResume';
import { fetchQuery, getQuerySnapshot, serializeQueryKey, type QueryPersistOptions } from '../lib/queryClient';
import { PERSIST_MAX_AGE } from '../lib/persistentCache';
import { useFirstContent } from '../lib/perfTiming';
import { fetchEventCards } from '../data/eventQueries';
import { fetchPostCards } from '../data/postQueries';
import ConcertHistorySection from '../features/agenda/ConcertHistorySection';
import { readStoredCity } from '../features/agenda/agendaPrefs';
import type { EventListItem } from '../features/events/types';
import ConcertPosters from '../features/profile/ConcertPosters';
import FollowingGrid from '../features/profile/FollowingGrid';
import MomentsByConcert from '../features/profile/MomentsByConcert';
import ProfileMerchSection from '../features/profile/ProfileMerchSection';
import { UPCOMING_GRACE_MS, type ProfileMoment } from '../features/profile/profileLayout';

// How far back a managed artist's or venue's concert list goes.
const MANAGED_HISTORY_DAYS = 180;

// How many of the user's own moments the gallery reads (a managed artist's
// or venue's, the latest ones only).
const OWN_MOMENTS_MAX = 200;
const MANAGED_MOMENTS_MAX = 60;

type ProfileConcerts = {
  liked: EventListItem[];
  attended: EventListItem[];
  artistEvents: EventListItem[];
  venueEvents: EventListItem[];
  /** Concerts marked «Voy» (the rest of `attended` were attended). */
  going?: string[];
};

// The moments and the cards of their concerts (lineup and poster for the
// group headers).
type ProfileMoments = { posts: ProfileMoment[]; cards: EventListItem[] };

// One set of lists per account and acting entity, kept across restarts under
// that account only.
const profileQueryKeys = (userId: string, isManagementMode: boolean, entitySubjectId?: string | null, role?: string | null) => {
  const loadContext = `${userId}-${isManagementMode}-${entitySubjectId || 'none'}-${role || 'user'}`;
  const persist: QueryPersistOptions = { maxAgeMs: PERSIST_MAX_AGE.user, userId };
  return {
    moments: ['profile:data', 'moments', loadContext] as const,
    concerts: ['profile:data', 'concerts', loadContext] as const,
    persist,
  };
};

const Profile: React.FC = () => {
  const { user, profile } = useAuth();

  const {
    managedEntities,
    activeWorkspace: activeEntity,
    setActiveWorkspace: setActiveEntity,
  } = useWorkspace();

  // Derived, not state: as state it started false and flipped a moment later,
  // which threw away the first load and fetched everything twice.
  const isManagementMode = Boolean(activeEntity);

  const navigate = useNavigate();
  const location = useLocation();

  // What was saved last time (this session or a previous one) paints on the
  // first render; the requests below refresh it.
  const [initialData] = useState(() => {
    if (!user?.id) return { moments: undefined, concerts: undefined };
    const keys = profileQueryKeys(user.id, isManagementMode, activeEntity?.subject_id, profile?.role);
    return {
      moments: getQuerySnapshot<ProfileMoments>(serializeQueryKey(keys.moments), keys.persist).data,
      concerts: getQuerySnapshot<ProfileConcerts>(serializeQueryKey(keys.concerts), keys.persist).data,
    };
  });
  const [moments, setMoments] = useState<ProfileMoments>(initialData.moments ?? { posts: [], cards: [] });
  const [likedEvents, setLikedEvents] = useState<EventListItem[]>(initialData.concerts?.liked ?? []);
  const [attendedEvents, setAttendedEvents] = useState<EventListItem[]>(
    initialData.concerts ? [...initialData.concerts.attended, ...initialData.concerts.artistEvents] : [],
  );
  const [goingIds, setGoingIds] = useState<string[]>(initialData.concerts?.going ?? []);
  const [artistEvents, setArtistEvents] = useState<EventListItem[]>(initialData.concerts?.artistEvents ?? []);
  const [venueEvents, setVenueEvents] = useState<EventListItem[]>(initialData.concerts?.venueEvents ?? []);
  // The moments grid and the concerts load separately: each tab shows as soon
  // as its own data is there.
  const [postsLoading, setPostsLoading] = useState(!initialData.moments);
  const [concertsLoading, setConcertsLoading] = useState(!initialData.concerts);

  const [error, setError] = useState('');
  const [selectedTab, setSelectedTab] = useState<'moments' | 'concerts' | 'following'>(
    (location.state as { profileTab?: string } | null)?.profileTab === 'following' ? 'following' : 'moments'
  );
  const resumeTick = useAppResume();
  const loading = selectedTab === 'moments' ? postsLoading : selectedTab === 'concerts' ? concertsLoading : false;
  useFirstContent('profile', !postsLoading);

  useEffect(() => {
    if (!activeEntity) return;
    if (location.pathname.startsWith('/tabs/profile')) return;
    // Route to entity-specific profile pages when acting as an entity
    if (activeEntity.type === 'artist' && activeEntity.artist?.id) {
      const artistPath = `/tabs/artist/${activeEntity.artist.id}`;
      if (!location.pathname.startsWith(artistPath)) {
        navigate(artistPath, { replace: true });
      }
    } else if (activeEntity.type === 'venue' && activeEntity.venue?.id) {
      const venuePath = `/tabs/venue/${activeEntity.venue.id}`;
      if (!location.pathname.startsWith(venuePath)) {
        navigate(venuePath, { replace: true });
      }
    }
  }, [activeEntity, location.pathname, navigate]);

  const applyConcerts = (data: ProfileConcerts) => {
    setGoingIds(data.going ?? []);
    setLikedEvents(data.liked);
    setAttendedEvents([...data.attended, ...data.artistEvents]);
    setArtistEvents(data.artistEvents);
    setVenueEvents(data.venueEvents);
  };

  const loadProfileData = async (isManualRefresh = false) => {
    if (!user?.id) return;
    const userId = user.id;
    const { moments: momentsKey, concerts: concertsKey, persist } = profileQueryKeys(
      userId,
      isManagementMode,
      activeEntity?.subject_id,
      profile?.role,
    );

    // What we already have shows at once; the spinner is only for a first visit.
    const cachedPosts = getQuerySnapshot<ProfileMoments>(serializeQueryKey(momentsKey), persist).data;
    const cachedConcerts = getQuerySnapshot<ProfileConcerts>(serializeQueryKey(concertsKey), persist).data;
    if (cachedPosts) setMoments(cachedPosts);
    setPostsLoading(!cachedPosts);
    if (cachedConcerts) applyConcerts(cachedConcerts);
    setConcertsLoading(!cachedConcerts);
    setError('');

    const activeRole = isManagementMode && activeEntity ? activeEntity.type : profile?.role;
    const artistEntityId = activeRole === 'artist' && isManagementMode && activeEntity ? activeEntity.artist?.id ?? null : null;
    const venuePlaceId = activeRole === 'venue' && isManagementMode && activeEntity ? activeEntity.venue?.id ?? null : null;
    // A managed artist's or venue's concerts: what is coming up and the
    // last months, not their whole history. Their moments come from
    // every concert, past ones included.
    const historyStartIso = new Date(Date.now() - MANAGED_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // The managed artist's concert ids feed both its moments and its list.
    const artistEventRows = artistEntityId
      ? Promise.resolve(
          supabase.from('event_artists').select('event_id,events!inner(starts_at)').eq('artist_id', artistEntityId),
        ).then(({ data, error: artistEventError }) => {
          if (artistEventError) throw artistEventError;
          return (data || []) as unknown as { event_id: string; events: { starts_at: string } | null }[];
        })
      : Promise.resolve([] as { event_id: string; events: { starts_at: string } | null }[]);
    artistEventRows.catch(() => undefined);

    const postsRequest = fetchQuery<ProfileMoments>(
      momentsKey,
      async () => {
        const readPosts = async (): Promise<ProfileMoment[]> => {
          if (!isManagementMode) return fetchPostCards({ authorId: userId, from: 0, to: OWN_MOMENTS_MAX - 1 });
          if (artistEntityId) {
            const allIds = (await artistEventRows).map(row => row.event_id);
            return fetchPostCards({ eventIds: allIds, from: 0, to: MANAGED_MOMENTS_MAX - 1 });
          }
          if (venuePlaceId) return fetchPostCards({ venueId: venuePlaceId, from: 0, to: MANAGED_MOMENTS_MAX - 1 });
          return [];
        };
        const posts = await readPosts();
        // The headers need the lineup and the poster; without them they still
        // show from the moment's own concert.
        const cards = await fetchEventCards({ eventIds: [...new Set(posts.map(post => post.event_id))] }).catch(
          () => [] as EventListItem[],
        );
        return { posts, cards };
      },
      { ttlMs: 60_000, force: isManualRefresh, persist },
    )
      .then(data => {
        setMoments(data);
        return true;
      })
      .catch(() => false)
      .finally(() => setPostsLoading(false));

    const concertsRequest = fetchQuery<ProfileConcerts>(
      concertsKey,
      async () => {
        const [likedRes, attendedRes, artistEvents, venueEvents] = await Promise.all([
          supabase.from('event_saves').select('event_id').eq('profile_id', userId),
          supabase.from('event_attendance').select('event_id,status').eq('profile_id', userId),
          artistEntityId
            ? artistEventRows.then(rows =>
                fetchEventCards({
                  eventIds: rows
                    .filter(row => Date.parse(row.events?.starts_at ?? '') >= Date.parse(historyStartIso))
                    .map(row => row.event_id),
                  startIso: historyStartIso,
                }),
              )
            : Promise.resolve([] as EventListItem[]),
          venuePlaceId ? fetchEventCards({ venueId: venuePlaceId, startIso: historyStartIso }) : Promise.resolve([] as EventListItem[]),
        ]);
        const likedIds = (likedRes.data || []).map(row => row.event_id).filter(Boolean);
        const attendedIds = (attendedRes.data || []).map(row => row.event_id).filter(Boolean);
        const going = (attendedRes.data || []).filter(row => row.status === 'going').map(row => String(row.event_id));
        const [liked, attended] = await Promise.all([
          fetchEventCards({ eventIds: likedIds }),
          fetchEventCards({ eventIds: attendedIds }),
        ]);
        return { liked, attended, artistEvents, venueEvents, going };
      },
      { ttlMs: 60_000, force: isManualRefresh, persist },
    )
      .then(data => {
        applyConcerts(data);
        return true;
      })
      .catch(() => false)
      .finally(() => setConcertsLoading(false));

    const [postsOk, concertsOk] = await Promise.all([postsRequest, concertsRequest]);
    // Keep what was on screen if a background refresh fails.
    if ((!postsOk && !cachedPosts) || (!concertsOk && !cachedConcerts)) {
      setError('No se ha podido cargar tu perfil. Revisa tu conexión.');
    }
  };

  // Opening the tab uses the cache (a minute); coming back to the app refreshes.
  const lastResumeTick = useRef(resumeTick);
  useEffect(() => {
    if (!user?.id) return;
    const resumed = lastResumeTick.current !== resumeTick;
    lastResumeTick.current = resumeTick;
    void loadProfileData(resumed);
  }, [activeEntity?.subject_id, isManagementMode, profile?.role, resumeTick, user?.id]);

  const { followedSubjectIds } = useFollowedSubjects();
  const { entities: followedEntities } = useFollowedEntities(followedSubjectIds);

  const renderEmpty = (title: string, description: string, action?: { label: string; onSelect: () => void }) => (
    <div className="mx-4 flex flex-col items-center rounded-2xl bg-app-surface px-5 py-7 text-center">
      <p className="font-display text-base font-bold text-app-ink">{title}</p>
      <p className="mt-1 max-w-[260px] text-sm text-white/60">{description}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onSelect}
          className="mt-4 min-h-10 rounded-full bg-app-accent px-4 text-sm font-semibold text-[#14151a]"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );

  // Saved and attended concerts (or the managed entity's), without repeats.
  const concerts = useMemo(() => {
    const own = isManagementMode ? [...artistEvents, ...venueEvents] : [...attendedEvents, ...likedEvents];
    const seen = new Set<string>();
    return own.filter(event => (seen.has(event.id) ? false : (seen.add(event.id), true)));
  }, [artistEvents, attendedEvents, isManagementMode, likedEvents, venueEvents]);

  const goingSet = useMemo(() => new Set(goingIds), [goingIds]);
  const likedSet = useMemo(() => new Set(likedEvents.map(event => event.id)), [likedEvents]);
  const momentCards = useMemo(() => new Map(moments.cards.map(card => [card.id, card])), [moments.cards]);

  // Upcoming concerts the user is going to: their merch leads the merch section.
  const upcomingGoingIds = useMemo(() => {
    const from = Date.now() - UPCOMING_GRACE_MS;
    return attendedEvents.filter(event => goingSet.has(event.id) && Date.parse(event.starts_at) >= from).map(event => event.id);
  }, [attendedEvents, goingSet]);

  // The next concert the user is going to or saved, up to a few hours after doors.
  const nextConcert = (() => {
    const from = Date.now() - UPCOMING_GRACE_MS;
    return [...attendedEvents, ...likedEvents]
      .filter(event => new Date(event.starts_at).getTime() >= from)
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at))[0] || null;
  })();

  // Opened from «Lo que sigues · Gestionar»: bring the following wall into view.
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const openedOnFollowing = useRef(selectedTab === 'following');
  useEffect(() => {
    if (!openedOnFollowing.current) return;
    openedOnFollowing.current = false;
    tabsRef.current?.scrollIntoView?.({ block: 'start' });
  }, []);

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      );
    }

    if (error) {
      return <p className="px-4 text-sm text-rose-400">{error}</p>;
    }

    if (selectedTab === 'following') {
      return followedEntities.length === 0
        ? renderEmpty('Aún no sigues a nadie', 'Sigue artistas y salas para ver cuándo tocan en Inicio.', {
            label: 'Descubrir artistas',
            onSelect: () => navigate('/tabs/discover'),
          })
        : <FollowingGrid entities={followedEntities} />;
    }

    if (selectedTab === 'concerts') {
      return concerts.length === 0
        ? renderEmpty('Aún no hay conciertos', 'Marca «Voy» o guarda un concierto y aparecerá aquí.')
        : (
          <ConcertPosters
            events={concerts}
            badgeFor={
              isManagementMode
                ? undefined
                : event => (goingSet.has(event.id) ? 'Voy' : likedSet.has(event.id) ? 'Guardado' : null)
            }
          />
        );
    }

    return moments.posts.length === 0
      ? renderEmpty('Aún no hay momentos', 'Sube lo que grabes en tu próximo concierto y aparecerá aquí.')
      : <MomentsByConcert moments={moments.posts} cards={momentCards} />;
  };

  const headerName = isManagementMode && activeEntity
    ? (activeEntity.type === 'artist' ? activeEntity.artist?.name : activeEntity.venue?.name) || 'Tu perfil'
    : profile?.display_name || profile?.username || 'Tu perfil';
  const avatarUrl = isManagementMode && activeEntity
    ? activeEntity.type === 'artist' ? activeEntity.artist?.avatar_url : activeEntity.venue?.photos?.[0]
    : profile?.avatar_url;
  const subline = isManagementMode && activeEntity
    ? activeEntity.type === 'artist' ? 'Artista que gestionas' : 'Sala que gestionas'
    : [profile?.primary_city, profile?.username ? `@${profile.username}` : null].filter(Boolean).join(' · ');
  // The user's area for «merch near you»: the city picked on Inicio, else the profile's.
  const area = readStoredCity() || profile?.primary_city || null;

  const tabs: { key: typeof selectedTab; label: string; count: number | null }[] = [
    { key: 'moments', label: isManagementMode ? 'Momentos' : 'Mis momentos', count: postsLoading ? null : moments.posts.length },
    { key: 'concerts', label: 'Conciertos', count: concertsLoading ? null : concerts.length },
    { key: 'following', label: 'Siguiendo', count: followedEntities.length },
  ];

  const quickLinks = [
    { key: 'saved', label: 'Guardadas', hint: 'Fotos con ♥', icon: <IconHeart size={20} />, onSelect: () => navigate('/guardadas') },
    {
      key: 'agenda',
      label: 'Tu agenda',
      hint: 'Ciudad · gustos · seguir',
      icon: <IconCalendar size={20} />,
      onSelect: () => navigate('/empezar', { state: { returnTo: '/tabs/profile' } }),
    },
  ];

  return (
    <AppShell headerProps={null}>
      <div className={`flex flex-col ${NAV_CLEARANCE}`}>
        <header className="relative overflow-hidden px-4 pb-5 pt-[calc(18px+env(safe-area-inset-top,0px))]">
          {/* A warm stage light behind the avatar. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[130%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--app-accent)_32%,transparent),transparent)]"
          />
          {/* Its own layer above the centred block, so nothing covers the tap. */}
          <button
            type="button"
            aria-label="Ajustes"
            onClick={() => navigate('/ajustes')}
            className="absolute right-4 top-[calc(14px+env(safe-area-inset-top,0px))] z-10 flex h-11 w-11 items-center justify-center rounded-full border border-app-line bg-app-surface/80 text-app-ink backdrop-blur"
          >
            <IconSettings size={20} />
          </button>
          <div className="relative flex flex-col items-center px-12 text-center">
            <span className="rounded-full p-[3px] ring-2 ring-app-accent">
              {avatarUrl ? (
                <Avatar name={headerName} src={avatarUrl} className="h-[92px] w-[92px] text-[30px]" />
              ) : (
                <span className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-full bg-app-accent font-poster text-[34px] text-[#14151a]">
                  {isManagementMode ? headerName.slice(0, 2) : 'Tú'}
                </span>
              )}
            </span>
            <h1 className="mt-3 max-w-full truncate font-display text-[26px] font-bold leading-tight text-app-ink">{headerName}</h1>
            <p className="mt-0.5 max-w-full truncate text-sm text-[#c9c5bd]">{subline || 'Añade tu ciudad en ajustes'}</p>
          </div>
        </header>

        {isManagementMode && managedEntities.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-1">
            {managedEntities.map(ent => (
              <button
                key={ent.subject_id}
                type="button"
                className={`min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold ${
                  activeEntity?.subject_id === ent.subject_id ? 'bg-app-ink text-app-bg' : 'border border-app-line text-[#c9c5bd]'
                }`}
                onClick={() => setActiveEntity(ent)}
              >
                {ent.type === 'artist' ? ent.artist?.name : ent.venue?.name}
              </button>
            ))}
          </div>
        )}

        {managedEntities.some(ent => ent.type === 'artist' || ent.type === 'venue') ? (
          <button
            type="button"
            onClick={() => navigate('/gestion')}
            className="mx-4 mt-2 flex min-h-12 items-center justify-between rounded-2xl border border-app-line bg-app-surface px-4 text-left text-sm font-semibold text-app-ink"
          >
            <span>Panel de gestión</span>
            <span className="font-mono text-[11px] font-semibold uppercase text-app-accent">Eventos · setlist · QR</span>
          </button>
        ) : null}

        {!isManagementMode ? (
          <div className="mx-4 mt-2 grid grid-cols-2 gap-2">
            {quickLinks.map(link => (
              <button
                key={link.key}
                type="button"
                onClick={link.onSelect}
                className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-3 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-app-accent">
                  {link.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-app-ink">{link.label}</span>
                  <span className="block truncate font-mono text-[10px] font-semibold uppercase text-white/50">{link.hint}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {!isManagementMode && nextConcert ? (
          <button
            type="button"
            aria-label="Tu próximo concierto"
            onClick={() => navigate(`/event/${nextConcert.id}`)}
            className="relative mx-4 mt-5 flex items-center gap-3.5 overflow-hidden rounded-2xl border border-app-line bg-app-surface p-3 text-left"
          >
            <span className="relative h-[92px] w-[74px] shrink-0 overflow-hidden rounded-xl">
              <CoverImage
                sources={eventCoverSources(nextConcert, 'thumb')}
                className="h-full w-full object-cover"
                fallback={<GeneratedPoster title={nextConcert.name} variant="thumb" />}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-[11px] font-semibold uppercase text-app-accent">
                {(() => {
                  const date = new Date(nextConcert.starts_at);
                  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                  return date.toDateString() === new Date().toDateString()
                    ? `Vas hoy · ${time}`
                    : `Próximo · ${date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/[.,]/g, '')} · ${time}`;
                })()}
              </span>
              <span className="mt-0.5 block font-display text-[17px] font-bold leading-tight text-app-ink line-clamp-2">
                {nextConcert.name}
              </span>
              {nextConcert.venue_place?.name ? (
                <span className="block truncate text-[13px] text-[#c9c5bd]">{nextConcert.venue_place.name}</span>
              ) : null}
              <span className="mt-1 block text-[12px] text-white/50">Cuando acabe, sube lo que grabes.</span>
            </span>
            <IconChevronRight size={18} className="shrink-0 text-white/40" />
          </button>
        ) : null}

        {!isManagementMode && user ? <ProfileMerchSection userId={user.id} city={area} goingEventIds={upcomingGoingIds} /> : null}

        {!isManagementMode && user ? <ConcertHistorySection userId={user.id} /> : null}

        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Secciones del perfil"
          className="mx-4 mb-4 mt-7 grid scroll-mt-4 grid-cols-3 gap-1 rounded-full border border-app-line bg-app-surface p-1"
        >
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selectedTab === tab.key}
              onClick={() => setSelectedTab(tab.key)}
              className={`flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-full px-2 text-[13px] font-semibold ${
                selectedTab === tab.key ? 'bg-app-ink text-app-bg' : 'text-[#c9c5bd]'
              }`}
            >
              <span className="truncate">{tab.label}</span>
              {tab.count ? (
                <span className={`font-mono text-[11px] ${selectedTab === tab.key ? 'text-app-bg/60' : 'text-white/40'}`}>{tab.count}</span>
              ) : null}
            </button>
          ))}
        </div>

        {renderTabContent()}
      </div>
    </AppShell>
  );
};

export default Profile;
