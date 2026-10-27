import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ui/AppPrimitives';
import DiscoverSearchBar from './components/DiscoverSearchBar';
import DiscoverSegmentedControl from './components/DiscoverSegmentedControl';
import DiscoverEmptyState from './components/DiscoverEmptyState';
import DiscoverSkeletonList from './components/DiscoverSkeletonList';
import SuggestedSectionList from './components/SuggestedSectionList';
import ArtistRow from './components/ArtistRow';
import VenueRow from './components/VenueRow';
import { DiscoverArtist, DiscoverTabKey, DiscoverVenue } from './types';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useDiscoverResults } from './hooks/useDiscoverResults';
import { useStoredLocation } from '../../shared/hooks/useStoredLocation';
import { useFollowedSubjects } from '../../hooks/useFollowedSubjects';

type RouteState = { initialTab?: DiscoverTabKey } | undefined;

const DiscoverScreen: React.FC = () => {
  const navigate = useNavigate();
  const locationState = useLocation().state as RouteState;
  const storedLocation = useStoredLocation();
  const { presentToast } = useToast();

  const [tab, setTab] = useState<DiscoverTabKey>('artists');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 350);

  const { canFollow, isFollowing, isToggling, toggleFollowSubject } = useFollowedSubjects();

  const {
    loading,
    artists,
    venues,
    suggestedArtistSections,
    suggestedVenueSections,
    isSearching,
  } = useDiscoverResults({ tab, query: debouncedQuery, location: storedLocation });

  useEffect(() => {
    if (locationState?.initialTab) {
      setTab(locationState.initialTab);
    }
  }, []);

  const onToggleFollow = async (subjectId: string) => {
    const result = await toggleFollowSubject(subjectId);
    if (!result.ok && result.reason === 'network') {
      presentToast({
        message: 'No se pudo seguir. Inténtalo de nuevo.',
        duration: 2000,
        position: 'top',
      });
    }
  };

  const headerSubtitle = useMemo(() => {
    if (tab === 'artists') return 'Sigue a los que has visto en directo.';
    return 'Sigue las salas a las que siempre vuelves.';
  }, [tab]);

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_14%_2%,rgba(255,107,74,0.2),transparent_58%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_88%_7%,rgba(122,167,255,0.14),transparent_62%)]" />

      <div className="relative z-10 flex flex-col gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
        <header className="rounded-2xl border border-white/10 bg-[linear-gradient(140deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02)_55%,rgba(255,107,74,0.08))] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/65">Descubre</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-white">
            {tab === 'artists' ? 'Artistas' : 'Salas'}
          </h2>
          <p className="mt-1 text-sm text-white/65">{headerSubtitle}</p>
        </header>

        <DiscoverSearchBar
          value={query}
          placeholder="Busca artistas o salas"
          onChange={setQuery}
          onClear={() => setQuery('')}
        />

        <DiscoverSegmentedControl value={tab} onChange={setTab} />

        <div className="space-y-4">
          {loading && <DiscoverSkeletonList rows={6} />}

          {!loading && tab === 'artists' && (
            <>
              {isSearching ? (
                artists.length === 0 ? (
                  <DiscoverEmptyState
                    title={`Sin resultados para "${debouncedQuery.trim()}"`}
                    description="Prueba con otra ortografía o busca por ciudad."
                    actionLabel="Borrar búsqueda"
                    onAction={() => setQuery('')}
                  />
                ) : (
                  <div className="space-y-3">
                    {artists.map(artist => (
                      <ArtistRow
                        key={artist.id}
                        artist={artist}
                        canFollow={canFollow}
                        isFollowing={isFollowing(artist.subject_id)}
                        followLoading={isToggling(artist.subject_id)}
                        onToggleFollow={() => onToggleFollow(artist.subject_id)}
                        onOpenProfile={() => navigate(`/artist/${artist.id}`)}
                      />
                    ))}
                  </div>
                )
              ) : suggestedArtistSections.length === 0 ? (
                <DiscoverEmptyState
                  title="Aún no hay artistas sugeridos"
                  description="Busca por nombre para encontrar un artista."
                />
              ) : (
                <SuggestedSectionList
                  sections={suggestedArtistSections}
                  renderItem={artist => (
                    <ArtistRow
                      key={(artist as DiscoverArtist).id}
                      artist={artist as DiscoverArtist}
                      canFollow={canFollow}
                      isFollowing={isFollowing((artist as DiscoverArtist).subject_id)}
                      followLoading={isToggling((artist as DiscoverArtist).subject_id)}
                      onToggleFollow={() => onToggleFollow((artist as DiscoverArtist).subject_id)}
                      onOpenProfile={() => navigate(`/artist/${(artist as DiscoverArtist).id}`)}
                    />
                  )}
                />
              )}
            </>
          )}

          {!loading && tab === 'venues' && (
            <>
              {isSearching ? (
                venues.length === 0 ? (
                  <DiscoverEmptyState
                    title={`Sin resultados para "${debouncedQuery.trim()}"`}
                    description="Prueba con otra ortografía o busca por ciudad."
                    actionLabel="Borrar búsqueda"
                    onAction={() => setQuery('')}
                  />
                ) : (
                  <div className="space-y-3">
                    {venues.map(venue => (
                      <VenueRow
                        key={venue.id}
                        venue={venue}
                        canFollow={canFollow}
                        isFollowing={isFollowing(venue.subject_id)}
                        followLoading={isToggling(venue.subject_id)}
                        onToggleFollow={() => onToggleFollow(venue.subject_id)}
                        onOpenProfile={() => navigate(`/venue/${venue.id}`)}
                      />
                    ))}
                  </div>
                )
              ) : suggestedVenueSections.length === 0 ? (
                <DiscoverEmptyState
                  title="Aún no hay salas sugeridas"
                  description="Busca por nombre para encontrar una sala."
                />
              ) : (
                <SuggestedSectionList
                  sections={suggestedVenueSections}
                  renderItem={venue => (
                    <VenueRow
                      key={(venue as DiscoverVenue).id}
                      venue={venue as DiscoverVenue}
                      canFollow={canFollow}
                      isFollowing={isFollowing((venue as DiscoverVenue).subject_id)}
                      followLoading={isToggling((venue as DiscoverVenue).subject_id)}
                      onToggleFollow={() => onToggleFollow((venue as DiscoverVenue).subject_id)}
                      onOpenProfile={() => navigate(`/venue/${(venue as DiscoverVenue).id}`)}
                    />
                  )}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiscoverScreen;
