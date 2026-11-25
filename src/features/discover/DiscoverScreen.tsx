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
import { SuggestConcertCard, SuggestConcertSheet } from '../suggestions/SuggestConcert';
import { askForAccount } from '../../auth/askForAccount';
import { FilterSheet } from '../../components/ui/FilterPills';

type RouteState = { initialTab?: DiscoverTabKey } | undefined;

// Styles are secondary: one «Estilo ▾» dropdown next to Artistas / Salas;
// choosing one shows that style's artists. No style rows on the home view.

const DiscoverScreen: React.FC = () => {
  const navigate = useNavigate();
  const locationState = useLocation().state as RouteState;
  const storedLocation = useStoredLocation();
  const { presentToast } = useToast();

  const [tab, setTab] = useState<DiscoverTabKey>('artists');
  const [query, setQuery] = useState('');
  const [style, setStyle] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [stylesOpen, setStylesOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 350);

  const { canFollow, isFollowing, isToggling, toggleFollowSubject } = useFollowedSubjects();

  const {
    loading,
    artists,
    venues,
    suggestedArtistSections,
    suggestedVenueSections,
    styleShelves,
    isSearching,
  } = useDiscoverResults({ tab, query: debouncedQuery, location: storedLocation });

  useEffect(() => {
    if (locationState?.initialTab) {
      setTab(locationState.initialTab);
    }
  }, []);

  const selectedShelf = style ? styleShelves.find(shelf => shelf.style === style) ?? null : null;

  const onToggleFollow = async (subjectId: string, kind: 'artist' | 'venue') => {
    if (!canFollow) {
      askForAccount(navigate, `Crea tu cuenta para seguir ${kind === 'artist' ? 'artistas' : 'salas'} y ver cuándo tocan en Inicio.`);
      return;
    }
    const result = await toggleFollowSubject(subjectId, kind);
    if (!result.ok && result.reason === 'network') {
      presentToast({
        message: 'No se pudo seguir. Inténtalo de nuevo.',
        duration: 2000,
        position: 'top',
      });
    }
  };

  const artistGrid = (list: DiscoverArtist[]) => (
    <div className="grid grid-cols-3 gap-x-1.5 gap-y-2.5">
      {list.map(artist => (
        <ArtistRow
          key={artist.id}
          artist={artist}
          canFollow={canFollow}
          isFollowing={isFollowing(artist.subject_id)}
          followLoading={isToggling(artist.subject_id)}
          onToggleFollow={() => onToggleFollow(artist.subject_id, 'artist')}
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
          onToggleFollow={() => onToggleFollow(venue.subject_id, 'venue')}
          onOpenProfile={() => navigate(`/tabs/venue/${venue.id}`)}
        />
      ))}
    </ul>
  );

  // «¿No encuentras un concierto?»: under an empty search and at the end of
  // the results, for a concert we do not have yet.
  const suggestCard = <SuggestConcertCard onOpen={() => setSuggestOpen(true)} />;

  const noResults = (
    <div className="flex flex-col gap-3">
      <DiscoverEmptyState
        title={`Sin resultados para "${debouncedQuery.trim()}"`}
        description="Prueba con otra ortografía o busca por ciudad."
        actionLabel="Borrar búsqueda"
        onAction={() => setQuery('')}
      />
      {suggestCard}
    </div>
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

      <DiscoverSegmentedControl
        value={tab}
        onChange={setTab}
        trailing={
          tab === 'artists' && !query.trim() && styleShelves.length > 0 ? (
            <span className={`inline-flex min-h-10 items-center rounded-full text-sm font-semibold ${style ? 'bg-app-ink text-app-bg' : 'border border-app-line text-[#c9c5bd]'}`}>
              <button type="button" onClick={() => setStylesOpen(true)} className="inline-flex min-h-10 items-center gap-1 pl-4 pr-3">
                {style ?? 'Estilo'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {style ? (
                <button type="button" aria-label="Quitar estilo" onClick={() => setStyle(null)} className="-ml-1 inline-flex min-h-10 items-center pr-3.5">
                  ×
                </button>
              ) : null}
            </span>
          ) : null
        }
      />
      <FilterSheet
        isOpen={stylesOpen}
        title="Estilo"
        onClose={() => setStylesOpen(false)}
        options={styleShelves.map(shelf => ({ value: shelf.style, label: shelf.style }))}
        selected={style}
        onSelect={setStyle}
      />

      <div className="flex flex-col gap-[22px] pt-2">
        {loading && <DiscoverSkeletonList rows={6} />}

        {!loading && tab === 'artists' && (
          isSearching ? (
            artists.length === 0 ? noResults : (
              <>
                {artistGrid(artists)}
                {suggestCard}
              </>
            )
          ) : selectedShelf ? (
            <section>
              <h2 className="mb-3 font-display text-xl font-bold text-app-ink">{selectedShelf.style}</h2>
              {artistGrid(selectedShelf.items)}
            </section>
          ) : suggestedArtistSections.length === 0 ? (
            <DiscoverEmptyState
              title="Aún no hay artistas sugeridos"
              description="Busca por nombre para encontrar un artista."
            />
          ) : (
            <>
              {suggestedArtistSections.map(section => (
                <section key={section.key}>
                  <h2 className="mb-3 font-display text-xl font-bold text-app-ink">{section.title}</h2>
                  {artistGrid(section.items)}
                </section>
              ))}
            </>
          )
        )}

        {!loading && tab === 'venues' && (
          isSearching ? (
            venues.length === 0 ? noResults : (
              <>
                {venueList(venues)}
                {suggestCard}
              </>
            )
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

      <SuggestConcertSheet isOpen={suggestOpen} onOpen={() => setSuggestOpen(true)} onClose={() => setSuggestOpen(false)} />
    </div>
  );
};

export default DiscoverScreen;
