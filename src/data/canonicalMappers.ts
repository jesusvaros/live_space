import type { Artist, Event, Profile, VenuePlace } from '../lib/types';

type UnknownRow = Record<string, unknown>;

const stringOrNull = (value: unknown) => (typeof value === 'string' ? value : null);
const numberOrNull = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const mapProfile = (row: UnknownRow, subjectId?: string | null): Profile => ({
  id: String(row.id),
  subject_id: subjectId ?? stringOrNull(row.subject_id),
  role: row.app_role === 'admin' ? 'admin' : 'user',
  username: stringOrNull(row.username),
  display_name: stringOrNull(row.display_name),
  avatar_url: stringOrNull(row.avatar_url),
  bio: stringOrNull(row.bio),
  primary_city: stringOrNull(row.primary_city),
  external_links:
    row.external_links && typeof row.external_links === 'object'
      ? (row.external_links as Record<string, string>)
      : {},
  is_verified: row.app_role === 'admin' || row.app_role === 'moderator',
  created_at: String(row.created_at ?? ''),
  updated_at: String(row.updated_at ?? ''),
});

export const mapArtist = (row: UnknownRow): Artist => ({
  id: String(row.artist_id ?? row.id),
  subject_id: stringOrNull(row.subject_id),
  name: String(row.name ?? ''),
  artist_type: row.artist_type === 'solo' ? 'solo' : 'band',
  city: stringOrNull(row.city),
  bio: stringOrNull(row.bio),
  avatar_url: stringOrNull(row.avatar_url),
  genres: Array.isArray(row.genres) ? row.genres.filter((item): item is string => typeof item === 'string') : [],
  external_links:
    row.external_links && typeof row.external_links === 'object'
      ? (row.external_links as Record<string, string>)
      : {},
  created_at: String(row.created_at ?? ''),
  updated_at: String(row.updated_at ?? ''),
});

export const mapVenue = (row: UnknownRow): VenuePlace => ({
  id: String(row.venue_place_id ?? row.id),
  subject_id: stringOrNull(row.subject_id),
  name: String(row.name ?? ''),
  city: String(row.city ?? ''),
  address: stringOrNull(row.address),
  capacity: numberOrNull(row.capacity),
  venue_type: stringOrNull(row.venue_type),
  latitude: numberOrNull(row.latitude),
  longitude: numberOrNull(row.longitude),
  website_url: stringOrNull(row.website_url),
  photos: Array.isArray(row.photos) ? row.photos.filter((item): item is string => typeof item === 'string') : [],
  created_by: stringOrNull(row.created_by),
  created_at: String(row.created_at ?? ''),
  updated_at: String(row.updated_at ?? ''),
});

export const mapEvent = (row: UnknownRow): Event => ({
  id: String(row.id),
  organizer_id: stringOrNull(row.created_by),
  venue_place_id: stringOrNull(row.venue_place_id),
  name: String(row.name ?? ''),
  description: stringOrNull(row.description),
  event_url: stringOrNull(row.source_url),
  city: String(row.city ?? ''),
  address: stringOrNull(row.address),
  latitude: numberOrNull(row.latitude),
  longitude: numberOrNull(row.longitude),
  genres: Array.isArray(row.genres) ? row.genres.filter((item): item is string => typeof item === 'string') : [],
  cover_image_url: stringOrNull(row.cover_image_url),
  is_free: row.is_free === true,
  price_tiers: Array.isArray(row.price_tiers) ? (row.price_tiers as Event['price_tiers']) : [],
  starts_at: String(row.starts_at ?? ''),
  ends_at: stringOrNull(row.ends_at),
  is_public: row.status === 'published',
  qr_token: null,
  qr_token_rotated_at: null,
  created_at: String(row.created_at ?? ''),
  updated_at: String(row.updated_at ?? ''),
});
