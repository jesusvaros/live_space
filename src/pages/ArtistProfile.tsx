import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DetailSkeleton, Spinner } from '../components/ui/AppPrimitives';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PostWithSetlist } from '../lib/types';
import AppShell from '../components/AppShell';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { ArtistProfileArtist, ArtistProfileEvent } from '../components/artist/types';
import ArtistHero from '../components/artist/ArtistHero';
import AboutSection from '../components/artist/AboutSection';
import ConcertRow from '../components/ui/ConcertRow';
import MomentGrid from '../components/ui/MomentGrid';
import { fetchEventCards, fetchPastEventCards } from '../data/eventQueries';
import { fetchPostCards } from '../data/postQueries';
import { artistCacheKey, eventCacheKey, primeCache, readCache, writeCache } from '../data/pageCache';
import { useFirstContent } from '../lib/perfTiming';
import { useRouteEntityId } from '../hooks/useRouteEntityId';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import DetailHeader from '../components/ui/DetailHeader';
import MapVisibilityMenu from '../features/hiddenMap/MapVisibilityMenu';
import ClaimProfileLink from '../components/pro/ClaimProfileLink';
import PastConcertsSection from '../features/events/PastConcertsSection';
import type { EventListItem } from '../features/events/types';

type ArtistTab = 'shows' | 'moments' | 'about';

type ArtistSnapshot = {
  artist: ArtistProfileArtist;
  upcoming: ArtistProfileEvent[];
  /** How many concerts already happened; their cards load in «Conciertos pasados». */
  pastCount: number;
  moments: PostWithSetlist[];
};

const startOfTodayIso = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

type ArtistProfileProps = {
  artistId?: string;
  embedded?: boolean;
};

const ArtistProfile: React.FC<ArtistProfileProps> = ({ artistId, embedded }) => {
  const routeId = useRouteEntityId();
  const id = artistId || routeId;
  const navigate = useNavigate();
  const { managedEntities, activeWorkspace } = useWorkspace();
  const { canFollow, isFollowing, isToggling, toggleFollowSubject } = useFollowedSubjects();
  const contentRef = useRef<HTMLElement | null>(null);

  const initial = readCache<ArtistSnapshot>(artistCacheKey(id || ''));
  const [artist, setArtist] = useState<ArtistProfileArtist | null>(initial?.artist ?? null);
  const [upcomingShows, setUpcomingShows] = useState<ArtistProfileEvent[]>(initial?.upcoming ?? []);
  const [pastCount, setPastCount] = useState(initial?.pastCount ?? 0);
  const [moments, setMoments] = useState<PostWithSetlist[]>(initial?.moments ?? []);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState('');
  useFirstContent('artist', Boolean(artist));
  const [activeTab, setActiveTab] = useState<ArtistTab>('shows');

  useEffect(() => {
    const loadArtist = async () => {
      // Seen before in this session: paint it now, refresh behind.
      const cached = readCache<ArtistSnapshot>(artistCacheKey(id || ''));
      // Its concerts open at once too (cards restored from a previous session).
      if (cached) primeCache(cached.upcoming as EventListItem[], eventCacheKey);
      setArtist(cached?.artist ?? null);
      setUpcomingShows(cached?.upcoming ?? []);
      setPastCount(cached?.pastCount ?? 0);
      setMoments(cached?.moments ?? []);
      setLoading(!cached);
      setError('');
      try {
        // The profile, its upcoming concerts and the ids and dates of all of
        // them (for the moments and the count) do not depend on each other.
        // Past concerts' cards wait for «Conciertos pasados» to scroll in.
        const today = startOfTodayIso();
        const [{ data: artistRow, error: artistError }, { data: artistEvents }, upcomingRows] = await Promise.all([
          supabase.from('v_subject_artists').select('*').eq('artist_id', id).maybeSingle(),
          supabase
            .from('event_artists')
            .select('event_id,events!inner(starts_at)')
            .eq('artist_id', id)
            .eq('events.status', 'published'),
          id
            ? (fetchEventCards({ artistId: id, startIso: today }) as Promise<ArtistProfileEvent[]>).catch(error => {
                console.warn('Failed to load upcoming concerts', error);
                return [] as ArtistProfileEvent[];
              })
            : Promise.resolve([] as ArtistProfileEvent[]),
        ]);

        if (artistError || !artistRow) {
          throw artistError || new Error('Artist not found');
        }

        const normalizedArtist: ArtistProfileArtist = {
          id: (artistRow as any).artist_id || (artistRow as any).id || id,
          name: artistRow.name,
          artist_type: artistRow.artist_type,
          city: artistRow.city,
          bio: artistRow.bio,
          avatar_url: artistRow.avatar_url,
          avatar_credit: (artistRow as any).avatar_credit ?? null,
          genres: artistRow.genres || [],
          external_links: artistRow.external_links || {},
          created_at: artistRow.created_at,
          updated_at: artistRow.updated_at,
          subject_id: artistRow.subject_id,
        };

        const eventIds = (artistEvents || []).map(row => row.event_id).filter(Boolean);
        const past = (artistEvents || []).filter((row: any) => {
          const event = Array.isArray(row.events) ? row.events[0] : row.events;
          return Boolean(event?.starts_at) && new Date(event.starts_at) < new Date(today);
        }).length;

        // The profile and its concerts show now; the moments (they need the
        // event ids) follow.
        const upcoming = upcomingRows;
        setArtist(normalizedArtist);
        setUpcomingShows(upcoming);
        setPastCount(past);
        setLoading(false);

        const allMoments = eventIds.length > 0
          ? await fetchPostCards({ eventIds })
              .then(rows => rows.slice(0, 24) as PostWithSetlist[])
              .catch(momentsError => {
                console.warn('Failed to load artist moments', momentsError);
                return cached?.moments ?? [];
              })
          : [];
        setMoments(allMoments);
        writeCache<ArtistSnapshot>(artistCacheKey(id || ''), { artist: normalizedArtist, upcoming, pastCount: past, moments: allMoments });
      } catch (err) {
        console.error('Failed to load artist profile', err);
        if (!cached) {
          setError('Artista no encontrado.');
          setArtist(null);
          setUpcomingShows([]);
          setPastCount(0);
          setMoments([]);
        }
      } finally {
        setLoading(false);
      }
    };

    loadArtist();
  }, [id]);

  const isManager = useMemo(() => {
    if (!artist) return false;
    return Boolean(
      activeWorkspace?.type === 'artist' && activeWorkspace.artist?.id === artist.id
    ) || managedEntities.some(entity => entity.type === 'artist' && entity.artist?.id === artist.id);
  }, [activeWorkspace, artist, managedEntities]);

  const externalLinks = useMemo(() => {
    const links = (artist?.external_links || {}) as Record<string, string>;
    const normalized = {
      spotify: links.spotify,
      apple_music: links.apple_music || (links as any).appleMusic,
      instagram: links.instagram,
      youtube: links.youtube,
      tiktok: links.tiktok,
      bandcamp: links.bandcamp,
      website: links.website,
    };
    return Object.entries(normalized)
      .map(([key, value]) => ({ key, value }))
      .filter(link => Boolean(link.value));
  }, [artist]);

  const limitedUpcoming = upcomingShows.slice(0, 5);

  // Past concerts, most recent first: read by PastConcertsSection only once it
  // scrolls into view.
  const fetchPastPage = useCallback(
    (offset: number, limit: number) =>
      !id
        ? Promise.resolve([] as EventListItem[])
        : fetchPastEventCards({ artistId: id, beforeIso: startOfTodayIso(), offset, limit }),
    [id],
  );

  const handleOpenMap = () => {
    if (!artist) return;
    navigate('/tabs/map', { state: {
      artistFilter: {
        id: artist.id,
        name: artist.name,
        avatar_url: artist.avatar_url,
      },
    } });
  };

  const playedCount = pastCount + upcomingShows.length;

  const handleToggleFollow = async () => {
    if (!artist?.subject_id) return;
    if (!canFollow) {
      navigate('/welcome');
      return;
    }
    await toggleFollowSubject(artist.subject_id);
  };

  // Info only when it has something to say; its managers always see it to
  // fill it in.
  const hasInfo = Boolean(artist?.bio) || externalLinks.length > 0 || isManager;
  const tabs: { key: ArtistTab; label: string }[] = [
    { key: 'shows', label: 'Conciertos' },
    { key: 'moments', label: 'Momentos' },
    ...(hasInfo ? [{ key: 'about' as const, label: 'Info' }] : []),
  ];

  const concertSubtitle = (event: ArtistProfileEvent) => {
    const time = new Date(event.starts_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return [event.venue_place?.city || event.city, time].filter(Boolean).join(' · ');
  };

  const renderTabContent = () => {
    if (!artist) return null;

    if (activeTab === 'moments') {
      return moments.length ? (
        <MomentGrid moments={moments} columns={3} />
      ) : (
        <p className="text-sm text-white/60">Aún nadie ha subido momentos de sus conciertos.</p>
      );
    }

    if (activeTab === 'about') {
      return (
        <AboutSection
          artist={artist}
          isManager={isManager}
          externalLinks={externalLinks}
          pastCount={pastCount}
          onShowConcerts={() => setActiveTab('shows')}
          onEditLinks={() => navigate('/ajustes/perfil')}
          onCreateShow={() => navigate('/create-event', { state: { from: `/tabs/artist/${id}` } })}
          onOpenMap={handleOpenMap}
        />
      );
    }

    return (
      <div className="flex flex-col gap-2">
        {limitedUpcoming.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-app-line p-4 text-sm text-white/60">
            No hay conciertos anunciados. Cuando se anuncien, aparecerán aquí.
          </p>
        ) : (
          limitedUpcoming.map(event => (
            <ConcertRow
              key={event.id}
              startsAt={event.starts_at}
              title={event.venue_place?.name || event.address || 'Sala por confirmar'}
              subtitle={concertSubtitle(event)}
              onSelect={() => navigate(`/event/${event.id}`)}
            />
          ))
        )}

        <PastConcertsSection
          ownerKey={`artist:${artist.id}`}
          fetchPage={fetchPastPage}
          titleOf={event => event.venue_place?.name || event.address || 'Sala'}
          subtitleOf={event => event.venue_place?.city || event.city || null}
          hideWhenEmpty={upcomingShows.length === 0}
          className="pt-4"
          headingClassName="font-display text-lg font-bold text-app-ink"
        />

        {moments.length > 0 ? (
          <section className="pt-4">
            <h2 className="mb-2.5 font-display text-lg font-bold text-app-ink">Lo que grabó el público</h2>
            <MomentGrid moments={moments} limit={8} />
          </section>
        ) : null}
      </div>
    );
  };

  const tabBar = (
    <div role="tablist" aria-label="Secciones del artista" className="flex gap-1 rounded-full border border-app-line bg-app-surface p-1">
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          onClick={() => setActiveTab(tab.key)}
          className={`min-h-10 flex-1 rounded-full text-[13px] font-semibold transition-colors ${
            activeTab === tab.key ? 'bg-app-line text-app-ink' : 'text-[#a9a59d]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  if (embedded) {
    return (
      <div className="p-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        )}
        {!loading && error && <p className="text-sm text-rose-400">{error}</p>}
        {!loading && artist && (
          <div className="space-y-4">
            <ArtistHero
              artist={artist}
              isManager={isManager}
              playedCount={playedCount}
              externalLinks={externalLinks}
              onEdit={() => navigate('/tabs/profile?edit=artist')}
            />
            {tabBar}
            <div>{renderTabContent()}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <AppShell headerProps={null} contentRef={contentRef} contentWrapperClassName={false}>
      <DetailHeader
        title={artist?.name || 'Artista'}
        scrollRef={contentRef}
        fallbackHref="/tabs/discover"
        actions={artist ? <MapVisibilityMenu type="artist" id={artist.id} name={artist.name} imageUrl={artist.avatar_url} /> : null}
      />
      {loading && <DetailSkeleton />}

      {!loading && error && <div className="p-4"><p className="text-sm text-rose-400">{error}</p></div>}

      {!loading && artist && (
        <>
          <ArtistHero
            artist={artist}
            isManager={isManager}
            playedCount={playedCount}
            externalLinks={externalLinks}
            immersive
            isFollowing={artist.subject_id ? isFollowing(artist.subject_id) : false}
            followLoading={artist.subject_id ? isToggling(artist.subject_id) : false}
            onToggleFollow={handleToggleFollow}
            onEdit={() => navigate('/tabs/profile?edit=artist')}
          />

          <div className="px-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))] pt-4">
            {tabBar}
            <div className="pt-3.5">{renderTabContent()}</div>
            {/* Claiming is for the few who are the artist: tucked away under
                Info, or at the end of the concerts when there is no Info. */}
            {activeTab === 'about' || (!hasInfo && activeTab === 'shows') ? (
              <ClaimProfileLink type="artist" entityId={artist.id} subjectId={artist.subject_id} className="pt-6" />
            ) : null}
          </div>
        </>
      )}
    </AppShell>
  );
};

export default ArtistProfile;
