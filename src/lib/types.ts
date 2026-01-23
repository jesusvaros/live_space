import { User } from '@supabase/supabase-js';

export type ProfileRole = 'user' | 'artist' | 'venue' | 'label' | 'admin';
export type MediaType = 'video' | 'image';
export type AttendanceStatus = 'going' | 'attended';
export type PriceTier = {
  label: string;
  price: number;
};

export type SubjectType = 'user' | 'venue' | 'artist';
export type ArtistType = 'band' | 'solo';

export interface Subject {
  id: string;
  type: SubjectType;
  profile_id: string | null;
  venue_place_id: string | null;
  artist_id: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  subject_id?: string | null; // Note: profile doesn't have subject_id column, subjects table has profile_id
  role: ProfileRole;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  primary_city: string | null;
  external_links: Record<string, string>;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface Artist {
  id: string;
  name: string;
  artist_type: ArtistType;
  city: string | null;
  bio: string | null;
  avatar_url: string | null;
  genres: string[];
  external_links: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface ProfileArtist {
  profile_id: string;
  genres: string[];
  created_at: string;
  updated_at: string;
}

export interface ProfileVenue {
  profile_id: string;
  managed_venue_place_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VenuePlace {
  id: string;
  subject_id?: string | null;
  name: string;
  city: string;
  address: string | null;
  capacity: number | null;
  venue_type: string | null;
  latitude: number | null;
  longitude: number | null;
  website_url: string | null;
  photos: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  organizer_id: string | null;
  venue_place_id: string | null;
  name: string;
  description: string | null;
  event_url: string | null;
  city: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  genres: string[];
  cover_image_url: string | null;
  is_free: boolean;
  price_tiers: PriceTier[];
  starts_at: string;
  ends_at: string | null;
  is_public: boolean;
  qr_token: string | null;
  qr_token_rotated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  actor_subject_id: string | null;
  event_id: string;
  event_offset_ms: number | null;
  performance_artist_id: string | null;
  song_id: string | null;
  song_title: string | null;
  media_url: string;
  media_type: MediaType;
  thumbnail_url: string | null;
  caption: string | null;
  captured_at: string | null;
  capture_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostWithSetlist extends Post {
  resolved_song_id: string | null;
  resolved_song_title: string | null;
  resolved_performer_id: string | null;
  actor_name: string | null;
  actor_image_url: string | null;
  actor_type: SubjectType | null;
}

export interface Song {
  id: string;
  title: string;
  artist_id: string | null;
  created_at: string;
}

export interface EventSetlistEntry {
  event_id: string;
  ordinal: number;
  performer_artist_id: string | null;
  song_id: string | null;
  song_title: string | null;
  starts_offset_ms: number | null;
  ends_offset_ms: number | null;
  created_at: string;
}

export interface ManagedEntity {
  subject_id: string;
  role: 'owner' | 'admin' | 'editor' | 'moderator';
  type: SubjectType;
  profile?: Profile; // Only if type is user
  artist?: Artist; // Only if type is artist
  venue?: VenuePlace; // Only if type is venue
}

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
}
