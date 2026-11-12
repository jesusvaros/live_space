import React, { useEffect, useRef, useState } from 'react';
import Avatar from '../components/ui/Avatar';
import { Spinner } from '../components/ui/AppPrimitives';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, PostWithSetlist } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import AppShell from '../components/AppShell';
import ConcertRow from '../components/ui/ConcertRow';
import MomentGrid from '../components/ui/MomentGrid';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import CoverImage from '../components/ui/CoverImage';
import { eventCoverSources } from '../lib/eventCover';
import { NAV_CLEARANCE } from '../components/BottomNav';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import { useFollowedEntities } from '../hooks/useFollowedEntities';
import { IconSettings } from '../components/icons';
import { useAppResume } from '../shared/hooks/useAppResume';
import { fetchQuery, getQuerySnapshot, serializeQueryKey, type QueryPersistOptions } from '../lib/queryClient';
import { PERSIST_MAX_AGE } from '../lib/persistentCache';
import { useFirstContent } from '../lib/perfTiming';
import { fetchEventCards } from '../data/eventQueries';
import { fetchPostCards } from '../data/postQueries';
import ConcertHistorySection from '../features/agenda/ConcertHistorySection';

// How far back a managed artist's or venue's concert list goes.
const MANAGED_HISTORY_DAYS = 180;

type ProfileConcerts = {
  liked: Event[];
  attended: Event[];
  artistEvents: Event[];
  venueEvents: Event[];
};

// One set of lists per account and acting entity, kept across restarts under
// that account only.
const profileQueryKeys = (userId: string, isManagementMode: boolean, entitySubjectId?: string | null, role?: string | null) => {
  const loadContext = `${userId}-${isManagementMode}-${entitySubjectId || 'none'}-${role || 'user'}`;
  const persist: QueryPersistOptions = { maxAgeMs: PERSIST_MAX_AGE.user, userId };
  return {
    posts: ['profile:data', 'posts', loadContext] as const,
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
    if (!user?.id) return { posts: undefined, concerts: undefined };
    const keys = profileQueryKeys(user.id, isManagementMode, activeEntity?.subject_id, profile?.role);
    return {
      posts: getQuerySnapshot<PostWithSetlist[]>(serializeQueryKey(keys.posts), keys.persist).data,
      concerts: getQuerySnapshot<ProfileConcerts>(serializeQueryKey(keys.concerts), keys.persist).data,
    };
  });
  const [posts, setPosts] = useState<PostWithSetlist[]>(initialData.posts ?? []);
  const [likedEvents, setLikedEvents] = useState<Event[]>(initialData.concerts?.liked ?? []);
  const [attendedEvents, setAttendedEvents] = useState<Event[]>(
    initialData.concerts ? [...initialData.concerts.attended, ...initialData.concerts.artistEvents] : [],
  );
  const [artistEvents, setArtistEvents] = useState<Event[]>(initialData.concerts?.artistEvents ?? []);
  const [venueEvents, setVenueEvents] = useState<Event[]>(initialData.concerts?.venueEvents ?? []);
  // The moments grid and the concerts load separately: each tab shows as soon
  // as its own data is there.
  const [postsLoading, setPostsLoading] = useState(!initialData.posts);
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
    setLikedEvents(data.liked);
    setAttendedEvents([...data.attended, ...data.artistEvents]);
    setArtistEvents(data.artistEvents);
    setVenueEvents(data.venueEvents);
  };

  const loadProfileData = async (isManualRefresh = false) => {
    if (!user?.id) return;
    const userId = user.id;
    const { posts: postsKey, concerts: concertsKey, persist } = profileQueryKeys(
      userId,
      isManagementMode,
      activeEntity?.subject_id,
      profile?.role,
    );

    // What we already have shows at once; the spinner is only for a first visit.
    const cachedPosts = getQuerySnapshot<PostWithSetlist[]>(serializeQueryKey(postsKey), persist).data;
    const cachedConcerts = getQuerySnapshot<ProfileConcerts>(serializeQueryKey(concertsKey), persist).data;
    if (cachedPosts) setPosts(cachedPosts);
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

    const postsRequest = fetchQuery<PostWithSetlist[]>(
      postsKey,
      async () => {
        // Only the 12 the grid shows.
        if (!isManagementMode) return (await fetchPostCards({ authorId: userId, from: 0, to: 11 })) as PostWithSetlist[];
        if (artistEntityId) {
          const allIds = (await artistEventRows).map(row => row.event_id);
          return (await fetchPostCards({ eventIds: allIds, from: 0, to: 11 })).slice(0, 12) as PostWithSetlist[];
        }
        if (venuePlaceId) return (await fetchPostCards({ venueId: venuePlaceId, from: 0, to: 11 })).slice(0, 12) as PostWithSetlist[];
        return [];
      },
      { ttlMs: 60_000, force: isManualRefresh, persist },
    )
      .then(data => {
        setPosts(data);
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
            : Promise.resolve([] as Event[]),
          venuePlaceId ? fetchEventCards({ venueId: venuePlaceId, startIso: historyStartIso }) : Promise.resolve([] as Event[]),
        ]);
        const likedIds = (likedRes.data || []).map(row => row.event_id).filter(Boolean);
        const attendedIds = (attendedRes.data || []).map(row => row.event_id).filter(Boolean);
        const [liked, attended] = await Promise.all([
          fetchEventCards({ eventIds: likedIds }),
          fetchEventCards({ eventIds: attendedIds }),
        ]);
        return { liked, attended, artistEvents, venueEvents };
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

  const renderEmpty = (title: string, description: string) => (
    <div className="mx-4 rounded-2xl border border-dashed border-app-line p-5">
      <p className="font-display text-base font-bold text-app-ink">{title}</p>
      <p className="mt-1 text-sm text-white/60">{description}</p>
    </div>
  );

  // Saved and attended concerts, newest first, without repeats.
  const concerts = (() => {
    const own = isManagementMode ? [...artistEvents, ...venueEvents] : [...attendedEvents, ...likedEvents];
    const seen = new Set<string>();
    return own
      .filter(event => (seen.has(event.id) ? false : (seen.add(event.id), true)))
      .sort((left, right) => right.starts_at.localeCompare(left.starts_at));
  })();

  // The next concert the user is going to or saved, up to a few hours after doors.
  const nextConcert = (() => {
    const from = Date.now() - 4 * 60 * 60 * 1000;
    return [...attendedEvents, ...likedEvents]
      .filter(event => new Date(event.starts_at).getTime() >= from)
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at))[0] || null;
  })();

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
      return followedEntities.length === 0 ? (
        renderEmpty('Aún no sigues a nadie', 'Sigue artistas y salas para ver cuándo tocan en Inicio.')
      ) : (
        <ul className="mx-4 divide-y divide-app-line overflow-hidden rounded-2xl border border-app-line bg-app-surface">
          {followedEntities.map(entity => (
            <li key={entity.subjectId}>
              <button
                type="button"
                onClick={() => navigate(`/tabs/${entity.kind}/${entity.id}`)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <Avatar name={entity.name} src={entity.imageUrl} kind={entity.kind} badge className="h-11 w-11 text-[15px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[15px] font-bold text-app-ink">{entity.name}</span>
                  <span className="block truncate text-xs text-[#8f8b84]">
                    {[entity.kind === 'artist' ? 'Artista' : entity.kind === 'festival' ? 'Festival' : 'Sala', entity.city].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      );
    }

    if (selectedTab === 'concerts') {
      return concerts.length === 0 ? (
        renderEmpty('Aún no hay conciertos', 'Marca «Voy» o guarda un concierto y aparecerá aquí.')
      ) : (
        <div className="flex flex-col gap-2 px-4">
          {concerts.map(event => {
            const card = event as Event & { venue_place?: { name?: string | null } | null };
            return (
              <ConcertRow
                key={event.id}
                startsAt={event.starts_at}
                title={card.name}
                subtitle={card.venue_place?.name || event.city}
                onSelect={() => navigate(`/event/${event.id}`)}
              />
            );
          })}
        </div>
      );
    }

    return posts.length === 0 ? (
      renderEmpty('Aún no hay momentos', 'Sube lo que grabes en tu próximo concierto y aparecerá aquí.')
    ) : (
      <MomentGrid
        moments={posts}
        columns={3}
        label={index => (posts[index] as any)?.events?.venue_place?.name || (posts[index] as any)?.events?.city}
      />
    );
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

  const tabs: { key: typeof selectedTab; label: string }[] = [
    { key: 'moments', label: isManagementMode ? 'Momentos' : 'Mis momentos' },
    { key: 'concerts', label: 'Conciertos' },
    { key: 'following', label: 'Siguiendo' },
  ];

  return (
    <AppShell headerProps={null}>
      <div className={`flex flex-col ${NAV_CLEARANCE}`}>
        <header className="flex items-center gap-3.5 px-4 pt-[calc(18px+env(safe-area-inset-top,0px))]">
          {avatarUrl ? (
            <Avatar name={headerName} src={avatarUrl} className="h-[72px] w-[72px]" />
          ) : (
            <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-app-accent font-poster text-[28px] text-[#14151a]">
              {isManagementMode ? headerName.slice(0, 2) : 'Tú'}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[22px] font-bold text-app-ink">{headerName}</h1>
            <p className="mt-0.5 truncate text-sm text-[#c9c5bd]">{subline || 'Añade tu ciudad en ajustes'}</p>
          </div>
          <button
            type="button"
            aria-label="Ajustes"
            onClick={() => navigate('/ajustes')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
          >
            <IconSettings size={20} />
          </button>
        </header>

        {isManagementMode && managedEntities.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 pt-3">
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
            className="mx-4 mt-3.5 flex min-h-12 items-center justify-between rounded-[14px] border border-app-line bg-app-surface px-3.5 text-left text-sm font-semibold text-app-ink"
          >
            <span>Panel de gestión</span>
            <span className="font-mono text-[11px] font-semibold uppercase text-app-accent">Eventos · setlist · QR</span>
          </button>
        ) : null}

        {!isManagementMode ? (
          <button
            type="button"
            onClick={() => navigate('/pedidos')}
            className="mx-4 mt-3.5 flex min-h-12 items-center justify-between rounded-[14px] border border-app-line bg-app-surface px-3.5 text-left text-sm font-semibold text-app-ink"
          >
            <span>Mis pedidos de merch</span>
            <span className="font-mono text-[11px] font-semibold uppercase text-app-accent">Recoger · recuerdos</span>
          </button>
        ) : null}

        {!isManagementMode ? (
          <button
            type="button"
            onClick={() => navigate('/guardadas')}
            className="mx-4 mt-2 flex min-h-12 items-center justify-between rounded-[14px] border border-app-line bg-app-surface px-3.5 text-left text-sm font-semibold text-app-ink"
          >
            <span>Guardadas</span>
            <span className="font-mono text-[11px] font-semibold uppercase text-app-accent">Fotos con ♥</span>
          </button>
        ) : null}

        {!isManagementMode ? (
          <button
            type="button"
            onClick={() => navigate('/empezar', { state: { returnTo: '/tabs/profile' } })}
            className="mx-4 mt-2 flex min-h-12 items-center justify-between rounded-[14px] border border-app-line bg-app-surface px-3.5 text-left text-sm font-semibold text-app-ink"
          >
            <span>Tu agenda</span>
            <span className="font-mono text-[11px] font-semibold uppercase text-app-accent">Ciudad · gustos · seguir</span>
          </button>
        ) : null}

        {!isManagementMode && nextConcert ? (
          <button
            type="button"
            aria-label="Tu próximo concierto"
            onClick={() => navigate(`/event/${nextConcert.id}`)}
            className="mx-4 mt-[18px] flex items-center gap-3 rounded-[18px] border border-app-line bg-app-surface p-3.5 text-left"
          >
            <span className="relative h-[68px] w-[54px] shrink-0 overflow-hidden rounded-[10px]">
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
              <span className="block truncate font-display text-base font-bold text-app-ink">
                {nextConcert.name}
                {(nextConcert as any).venue_place?.name ? ` · ${(nextConcert as any).venue_place.name}` : ''}
              </span>
              <span className="block text-[13px] text-[#c9c5bd]">Cuando acabe, sube lo que grabes.</span>
            </span>
          </button>
        ) : null}

        {!isManagementMode && user ? <ConcertHistorySection userId={user.id} /> : null}

        <div role="tablist" aria-label="Secciones del perfil" className="flex gap-1.5 overflow-x-auto px-4 pb-3 pt-[18px]">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selectedTab === tab.key}
              onClick={() => setSelectedTab(tab.key)}
              className={`min-h-10 shrink-0 rounded-full px-3.5 text-sm font-semibold ${
                selectedTab === tab.key ? 'bg-app-ink text-app-bg' : 'border border-app-line text-[#c9c5bd]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {renderTabContent()}

      </div>

    </AppShell>
  );
};

export default Profile;
