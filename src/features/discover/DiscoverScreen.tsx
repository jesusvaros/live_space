import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ui/AppPrimitives';
import { NAV_CLEARANCE } from '../../components/BottomNav';
import DiscoverSearchBar from './components/DiscoverSearchBar';
import DiscoverSegmentedControl from './components/DiscoverSegmentedControl';
import DiscoverEmptyState from './components/DiscoverEmptyState';
import DiscoverSkeletonList from './components/DiscoverSkeletonList';
import ArtistRow from './components/ArtistRow';
import VenueRow from './components/VenueRow';
import { DiscoverArtist, DiscoverTabKey, DiscoverVenue } from './types';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useDiscoverResults } from './hooks/useDiscoverResults';
import { useStoredLocation } from '../../shared/hooks/useStoredLocation';
import { useFollowedSubjects } from '../../hooks/useFollowedSubjects';
import WrappedCard from '../wrapped/WrappedCard';

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
    if (!canFollow) {
      navigate('/welcome');
      return;
    }
    const result = await toggleFollowSubject(subjectId);
    if (!result.ok && result.reason === 'network') {
      presentToast({
        message: 'No se pudo seguir. Inténtalo de nuevo.',
        duration: 2000,
        position: 'top',
      });
    }
  };

  const artistGrid = (list: DiscoverArtist[]) => (
    <div className="grid grid-cols-3 gap-x-2.5 gap-y-3.5">
      {list.map(artist => (
        <ArtistRow
          key={artist.id}
          artist={artist}
          canFollow={canFollow}
          isFollowing={isFollowing(artist.subject_id)}
          followLoading={isToggling(artist.subject_id)}
          onToggleFollow={() => onToggleFollow(artist.subject_id)}
          onOpenProfile={() => navigate(`/tabs/artist/${artist.id}`)}
        />
      ))}
    </div>
  );

  const venueList = (list: DiscoverVenue[]) => (
    <ul className="divide-y divide-app-line overflow-hidden rounded-2xl border border-app-line bg-app-surface">
      {list.map(venue => (
        <VenueRow
          key={venue.id}
          venue={venue}
          canFollow={canFollow}
          isFollowing={isFollowing(venue.subject_id)}
          followLoading={isToggling(venue.subject_id)}
          onToggleFollow={() => onToggleFollow(venue.subject_id)}
          onOpenProfile={() => navigate(`/tabs/venue/${venue.id}`)}
        />
      ))}
    </ul>
  );

  const noResults = (
    <DiscoverEmptyState
      title={`Sin resultados para "${debouncedQuery.trim()}"`}
      description="Prueba con otra ortografía o busca por ciudad."
      actionLabel="Borrar búsqueda"
      onAction={() => setQuery('')}
    />
  );

  return (
    <div className={`flex flex-col gap-3.5 px-4 pt-[calc(18px+env(safe-area-inset-top,0px))] ${NAV_CLEARANCE}`}>
      <h1 className="font-poster text-[44px] leading-[0.9] text-app-ink">Explorar</h1>

      <DiscoverSearchBar
        value={query}
        placeholder={tab === 'artists' ? 'Busca un artista' : 'Busca una sala'}
        onChange={setQuery}
        onClear={() => setQuery('')}
      />

      <DiscoverSegmentedControl value={tab} onChange={setTab} />

      {tab === 'artists' && !query.trim() ? <WrappedCard /> : null}

      <div className="flex flex-col gap-[22px] pt-2">
        {loading && <DiscoverSkeletonList rows={6} />}

        {!loading && tab === 'artists' && (
          isSearching ? (
            artists.length === 0 ? noResults : artistGrid(artists)
          ) : suggestedArtistSections.length === 0 ? (
            <DiscoverEmptyState
              title="Aún no hay artistas sugeridos"
              description="Busca por nombre para encontrar un artista."
            />
          ) : (
            suggestedArtistSections.map(section => (
              <section key={section.key}>
                <h2 className="mb-3 font-display text-xl font-bold text-app-ink">{section.title}</h2>
                {artistGrid(section.items)}
              </section>
            ))
          )
        )}

        {!loading && tab === 'venues' && (
          isSearching ? (
            venues.length === 0 ? noResults : venueList(venues)
          ) : suggestedVenueSections.length === 0 ? (
            <DiscoverEmptyState
              title="Aún no hay salas sugeridas"
              description="Busca por nombre para encontrar una sala."
            />
          ) : (
            suggestedVenueSections.map(section => (
              <section key={section.key}>
                <h2 className="mb-3 font-display text-xl font-bold text-app-ink">{section.title}</h2>
                {venueList(section.items)}
              </section>
            ))
          )
        )}
      </div>
    </div>
  );
};

export default DiscoverScreen;
