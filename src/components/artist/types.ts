import { Artist, Event, VenuePlace } from '../../lib/types';

export type ArtistProfileArtist = Artist & { subject_id?: string | null };

export type ArtistProfileEvent = Event & {
  venue_place?: VenuePlace | null;
  event_artists?: { artist: { id: string; name: string; avatar_url: string | null } | null }[];
};
