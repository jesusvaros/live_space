import { useMemo } from 'react';
import { DiscoverArtist, DiscoverTabKey, DiscoverVenue, SuggestedArtists, SuggestedSection } from '../types';
import { discoverService } from '../services/discover.service';
import { StoredLocation } from '../../../shared/hooks/useStoredLocation';
import { useAuth } from '../../../contexts/AuthContext';
import { useQuery } from '../../../shared/hooks/useQuery';

type UseDiscoverResultsOptions = {
  tab: DiscoverTabKey;
  query: string;
  location: StoredLocation | null;
};

export const useDiscoverResults = ({ tab, query, location }: UseDiscoverResultsOptions) => {
  const { loading: authLoading } = useAuth();
  const isSearching = query.trim().length > 0;
  const locationKey = useMemo(
    () => (location ? `${location.lat.toFixed(4)}:${location.lng.toFixed(4)}` : 'no_location'),
    [location]
  );

  const artistsSearchQuery = useQuery<DiscoverArtist[]>(
    ['discover:artists:search', query.trim()],
    () => discoverService.searchArtists(query),
    {
      enabled: !authLoading && tab === 'artists' && isSearching,
      ttlMs: 10_000,
      initialData: [],
    }
  );

  const artistsSuggestedQuery = useQuery<SuggestedArtists>(
    ['discover:artists:suggested:v2', locationKey],
    () => discoverService.getSuggestedArtists({ location }),
    {
      enabled: !authLoading && tab === 'artists' && !isSearching,
      ttlMs: 30_000,
      initialData: { sections: [], styles: [] },
    }
  );

  const venuesSearchQuery = useQuery<DiscoverVenue[]>(
    ['discover:venues:search', query.trim()],
    () => discoverService.searchVenues(query),
    {
      enabled: !authLoading && tab === 'venues' && isSearching,
      ttlMs: 10_000,
      initialData: [],
    }
  );

  const venuesSuggestedQuery = useQuery<SuggestedSection<DiscoverVenue>[]>(
    ['discover:venues:suggested', locationKey],
    () => discoverService.getSuggestedVenues({ location }),
    {
      enabled: !authLoading && tab === 'venues' && !isSearching,
      ttlMs: 30_000,
      initialData: [],
    }
  );

  const loading = (() => {
    if (authLoading) return false;
    if (tab === 'artists') return isSearching ? artistsSearchQuery.loading : artistsSuggestedQuery.loading;
    return isSearching ? venuesSearchQuery.loading : venuesSuggestedQuery.loading;
  })();

  return {
    loading,
    artists: artistsSearchQuery.data || [],
    venues: venuesSearchQuery.data || [],
    suggestedArtistSections: artistsSuggestedQuery.data?.sections || [],
    styleShelves: artistsSuggestedQuery.data?.styles || [],
    suggestedVenueSections: venuesSuggestedQuery.data || [],
    isSearching,
  };
};
