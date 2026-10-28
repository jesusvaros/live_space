import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '../components/ui/AppPrimitives';
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
import { fetchEventCards } from '../data/eventQueries';
import { fetchPostCards } from '../data/postQueries';
import { useRouteEntityId } from '../hooks/useRouteEntityId';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import DetailHeader from '../components/ui/DetailHeader';
import ClaimProfileLink from '../components/pro/ClaimProfileLink';

type ArtistTab = 'shows' | 'moments' | 'about';

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

  const [artist, setArtist] = useState<ArtistProfileArtist | null>(null);
  const [upcomingShows, setUpcomingShows] = useState<ArtistProfileEvent[]>([]);
  const [pastShows, setPastShows] = useState<ArtistProfileEvent[]>([]);
  const [moments, setMoments] = useState<PostWithSetlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<ArtistTab>('shows');

  useEffect(() => {
    const loadArtist = async () => {
      setLoading(true);
      setError('');
      try {
        const { data: artistRow, error: artistError } = await supabase
          .from('v_subject_artists')
          .select('*')
          .eq('artist_id', id)
          .maybeSingle();

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

        const { data: artistEvents } = await supabase
          .from('event_artists')
          .select('event_id')
          .eq('artist_id', normalizedArtist.id);

        const eventIds = (artistEvents || []).map(row => row.event_id).filter(Boolean);

        let eventRows: ArtistProfileEvent[] = [];
        if (eventIds.length > 0) {
          eventRows = (await fetchEventCards({ eventIds })) as ArtistProfileEvent[];
        }

        const now = new Date();
        const upcoming = eventRows.filter(event => new Date(event.starts_at) >= now);
        const past = eventRows.filter(event => new Date(event.starts_at) < now);

        setArtist(normalizedArtist);
        setUpcomingShows(upcoming);
        setPastShows(past.reverse());

        if (eventIds.length > 0) {
          const allMoments = (await fetchPostCards({ eventIds })).slice(0, 24) as PostWithSetlist[];
          setMoments(allMoments);
        } else {
          setMoments([]);
        }
      } catch (err) {
        console.error('Failed to load artist profile', err);
        setError('Artista no encontrado.');
        setArtist(null);
        setUpcomingShows([]);
        setPastShows([]);
        setMoments([]);
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
  const limitedPast = pastShows.slice(0, 5);

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

  const playedCount = pastShows.length + upcomingShows.length;

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
          pastCount={pastShows.length}
          onShowConcerts={() => setActiveTab('shows')}
          onEditLinks={() => navigate('/tabs/profile?edit=artist')}
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

        {moments.length > 0 ? (
          <section className="pt-4">
            <h2 className="mb-2.5 font-display text-lg font-bold text-app-ink">Lo que grabó el público</h2>
            <MomentGrid moments={moments} limit={8} />
          </section>
        ) : null}

        {limitedPast.length > 0 ? (
          <section className="flex flex-col gap-2 pt-4">
            <h2 className="font-display text-lg font-bold text-app-ink">Ya tocó</h2>
            {limitedPast.map(event => (
              <ConcertRow
                key={event.id}
                startsAt={event.starts_at}
                title={event.venue_place?.name || event.address || 'Sala'}
                subtitle={concertSubtitle(event)}
                onSelect={() => navigate(`/event/${event.id}`)}
              />
            ))}
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
      <DetailHeader title={artist?.name || 'Artista'} scrollRef={contentRef} fallbackHref="/tabs/discover" />
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      )}

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
