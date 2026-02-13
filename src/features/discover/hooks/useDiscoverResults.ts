import { useEffect, useState } from 'react';
import { DiscoverArtist, DiscoverTabKey, DiscoverVenue, SuggestedSection } from '../types';
import { discoverService } from '../services/discover.service';
import { StoredLocation } from '../../../hooks/useStoredLocation';

type UseDiscoverResultsOptions = {
  tab: DiscoverTabKey;
  query: string;
  location: StoredLocation | null;
};

export const useDiscoverResults = ({ tab, query, location }: UseDiscoverResultsOptions) => {
  const [loading, setLoading] = useState(false);
  const [artists, setArtists] = useState<DiscoverArtist[]>([]);
  const [venues, setVenues] = useState<DiscoverVenue[]>([]);
  const [suggestedArtistSections, setSuggestedArtistSections] = useState<
    SuggestedSection<DiscoverArtist>[]
  >([]);
  const [suggestedVenueSections, setSuggestedVenueSections] = useState<
    SuggestedSection<DiscoverVenue>[]
  >([]);

  const isSearching = query.trim().length > 0;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        if (tab === 'artists') {
          if (isSearching) {
            const results = await discoverService.searchArtists(query);
            if (cancelled) return;
            setArtists(results);
          } else {
            const sections = await discoverService.getSuggestedArtists({ location });
            if (cancelled) return;
            setSuggestedArtistSections(sections);
          }
        } else {
          if (isSearching) {
            const results = await discoverService.searchVenues(query);
            if (cancelled) return;
            setVenues(results);
          } else {
            const sections = await discoverService.getSuggestedVenues({ location });
            if (cancelled) return;
            setSuggestedVenueSections(sections);
          }
        }
      } catch {
        if (cancelled) return;
        if (tab === 'artists') {
          setArtists([]);
          setSuggestedArtistSections([]);
        } else {
          setVenues([]);
          setSuggestedVenueSections([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isSearching, location, query, tab]);

  return {
    loading,
    artists,
    venues,
    suggestedArtistSections,
    suggestedVenueSections,
    isSearching,
  };
};
