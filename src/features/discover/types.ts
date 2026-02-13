export type DiscoverTabKey = 'artists' | 'venues';

export type DiscoverArtist = {
  id: string;
  subject_id: string;
  name: string;
  avatar_url: string | null;
  city: string | null;
  genres: string[];
  is_verified?: boolean | null;
};

export type DiscoverVenue = {
  id: string;
  subject_id: string;
  name: string;
  city: string;
  address: string | null;
  photos: string[];
  venue_type: string | null;
  capacity: number | null;
  is_verified?: boolean | null;
};

export type SuggestedSection<T> = {
  key: string;
  title: string;
  items: T[];
};

