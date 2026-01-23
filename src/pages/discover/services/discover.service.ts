import { searchArtists, searchVenues } from './discoverSearch.service';
import { getSuggestedArtists } from './discoverSuggestedArtists';
import { getSuggestedVenues } from './discoverSuggestedVenues';

export const discoverService = {
  searchArtists,
  searchVenues,
  getSuggestedArtists,
  getSuggestedVenues,
};

