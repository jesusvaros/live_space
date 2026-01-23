import { Artist, Event, Profile, VenuePlace } from '../../lib/types';

export type EventListItem = Event & {
  organizer?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Artist | null }[];
};

export type NearbyEventListItem = EventListItem & { distanceKm: number };
