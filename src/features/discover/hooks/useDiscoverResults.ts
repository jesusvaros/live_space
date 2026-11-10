import { useMemo } from 'react';
import { DiscoverArtist, DiscoverTabKey, DiscoverVenue, SuggestedArtists, SuggestedSection } from '../types';
import { discoverService } from '../services/discover.service';
import { StoredLocation } from '../../../shared/hooks/useStoredLocation';
import { useQuery } from '../../../shared/hooks/useQuery';
import { PERSIST_MAX_AGE } from '../../../lib/persistentCache';

export const locationKeyOf = (location: StoredLocation | null) =>
  location ? `${location.lat.toFixed(4)}:${location.lng.toFixed(4)}` : 'no_location';

/**
 * Explorar's suggestions, shared with the tab prefetch. Public (the same for
 * everyone), so they do not wait for the session, and kept across restarts.
 */
export const suggestedArtistsQuery = (location: StoredLocation | null) => ({
  key: ['discover:artists:suggested:v2', locationKeyOf(location)] as const,
  fn: () => discoverService.getSuggestedArtists({ location }),
  options: { ttlMs: 30_000, persist: { maxAgeMs: PERSIST_MAX_AGE.publicList } },
});

export const suggestedVenuesQuery = (location: StoredLocation | null) => ({
  key: ['discover:venues:suggested', locationKeyOf(location)] as const,
  fn: () => discoverService.getSuggestedVenues({ location }),
  options: { ttlMs: 30_000, persist: { maxAgeMs: PERSIST_MAX_AGE.publicList } },
});

const EMPTY_SUGGESTED_ARTISTS: SuggestedArtists = { sections: [], styles: [] };
const EMPTY_SUGGESTED_VENUES: SuggestedSection<DiscoverVenue>[] = [];

type UseDiscoverResultsOptions = {
  tab: DiscoverTabKey;
  query: string;
  location: StoredLocation | null;
};

export const useDiscoverResults = ({ tab, query, location }: UseDiscoverResultsOptions) => {
  const isSearching = query.trim().length > 0;
  const locationKey = locationKeyOf(location);
  const artistsSuggested = useMemo(() => suggestedArtistsQuery(location), [locationKey]);
  const venuesSuggested = useMemo(() => suggestedVenuesQuery(location), [locationKey]);

  const artistsSearchQuery = useQuery<DiscoverArtist[]>(
    ['discover:artists:search', query.trim()],
    () => discoverService.searchArtists(query),
    {
      enabled: tab === 'artists' && isSearching,
      ttlMs: 10_000,
      initialData: [],
    }
  );

  const artistsSuggestedQuery = useQuery<SuggestedArtists>(artistsSuggested.key, artistsSuggested.fn, {
    ...artistsSuggested.options,
    enabled: tab === 'artists' && !isSearching,
    initialData: EMPTY_SUGGESTED_ARTISTS,
  });

  const venuesSearchQuery = useQuery<DiscoverVenue[]>(
    ['discover:venues:search', query.trim()],
    () => discoverService.searchVenues(query),
    {
      enabled: tab === 'venues' && isSearching,
      ttlMs: 10_000,
      initialData: [],
    }
  );

  const venuesSuggestedQuery = useQuery<SuggestedSection<DiscoverVenue>[]>(venuesSuggested.key, venuesSuggested.fn, {
    ...venuesSuggested.options,
    enabled: tab === 'venues' && !isSearching,
    initialData: EMPTY_SUGGESTED_VENUES,
  });

  const loading = (() => {
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
