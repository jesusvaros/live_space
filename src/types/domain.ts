export type ArtistRole = 'headliner' | 'support' | 'guest' | 'unknown';
export type EventType = 'concert' | 'festival' | 'session' | 'unknown';

export type NormalizedArtist = {
  rawName: string;
  normalizedName: string;
  displayName: string;
  role?: ArtistRole;
  confidence: number;
};

export type NormalizedVenue = {
  name: string;
  normalizedName: string;
  city?: string;
  websiteUrl?: string;
  sourceUrl?: string;
  confidence: number;
};

export type NormalizedEvent = {
  canonicalName: string;
  normalizedName: string;
  description?: string;
  startsAt: string | null;
  city?: string;
  eventType: EventType;
  sourceUrl?: string;
  sourceExternalId?: string;
  artists: NormalizedArtist[];
  venue: NormalizedVenue;
  confidence: number;
};

export type AiExtractionPayload = {
  canonical_event_name: string;
  event_type: EventType;
  artists: Array<{
    name: string;
    role: ArtistRole;
    confidence: number;
  }>;
  starts_at_text: string | null;
  city: string | null;
  venue_name: string | null;
  confidence: number;
};

export type VenueRow = {
  id: string;
  name: string;
  city: string;
  website_url: string | null;
  source_url: string | null;
  normalized_name: string | null;
};

export type ArtistRow = {
  id: string;
  name: string;
  normalized_name: string | null;
  aliases: string[];
  artist_type: string | null;
  city: string | null;
};

export type EventRow = {
  id: string;
  name: string;
  normalized_name: string | null;
  venue_place_id: string;
  starts_at: string;
  source_url: string | null;
  external_source: string | null;
  external_source_id: string | null;
};
