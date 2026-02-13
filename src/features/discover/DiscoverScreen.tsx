import React, { useEffect, useMemo, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useIonToast } from '@ionic/react';
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
  const history = useHistory();
  const locationState = useLocation<RouteState>().state;
  const storedLocation = useStoredLocation();
  const [presentToast] = useIonToast();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onToggleFollow = async (subjectId: string) => {
    const result = await toggleFollowSubject(subjectId);
    if (!result.ok && result.reason === 'network') {
      presentToast({
        message: "Couldn't follow. Try again.",
        duration: 2000,
        position: 'top',
      });
    }
  };

  const headerSubtitle = useMemo(() => {
    if (tab === 'artists') return 'Follow the ones you’ve seen live.';
    return 'Follow the rooms you return to.';
  }, [tab]);

  return (
    <div className="flex flex-col gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Discover</p>
        <h2 className="font-display text-3xl font-bold text-white">{tab === 'artists' ? 'Artists' : 'Venues'}</h2>
        <p className="text-sm text-white/55">{headerSubtitle}</p>
      </header>

      <DiscoverSearchBar
        value={query}
        placeholder="Search artists or venues"
        onChange={setQuery}
        onClear={() => setQuery('')}
      />

      <DiscoverSegmentedControl value={tab} onChange={setTab} />

      {loading && <DiscoverSkeletonList rows={6} />}

      {!loading && tab === 'artists' && (
        <>
          {isSearching ? (
            artists.length === 0 ? (
              <DiscoverEmptyState
                title={`No results for "${debouncedQuery.trim()}"`}
                description="Try a different spelling or search by city."
                actionLabel="Clear search"
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
                    onOpenProfile={() => history.push(`/artist/${artist.id}`)}
                  />
                ))}
              </div>
            )
          ) : suggestedArtistSections.length === 0 ? (
            <DiscoverEmptyState
              title="No artist suggestions yet"
              description="Search by name to find an artist."
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
                  onOpenProfile={() => history.push(`/artist/${(artist as DiscoverArtist).id}`)}
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
                title={`No results for "${debouncedQuery.trim()}"`}
                description="Try a different spelling or search by city."
                actionLabel="Clear search"
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
                    onOpenProfile={() => history.push(`/venue/${venue.id}`)}
                  />
                ))}
              </div>
            )
          ) : suggestedVenueSections.length === 0 ? (
            <DiscoverEmptyState
              title="No venue suggestions yet"
              description="Search by name to find a venue."
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
                  onOpenProfile={() => history.push(`/venue/${(venue as DiscoverVenue).id}`)}
                />
              )}
            />
          )}
        </>
      )}
    </div>
  );
};

export default DiscoverScreen;
