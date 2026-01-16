import { User } from '@supabase/supabase-js';

export type ProfileRole = 'user' | 'artist' | 'venue' | 'label';
export type MediaType = 'video' | 'image';
export type AttendanceStatus = 'going' | 'attended';
export type PriceTier = {
  label: string;
  price: number;
};

export interface Profile {
  id: string;
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
  venue_id: string | null;
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
  event_id: string;
  media_url: string;
  media_type: MediaType;
  thumbnail_url: string | null;
  caption: string | null;
  captured_at: string | null;
  capture_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostWithRelations extends Post {
  profiles?: Profile | null;
  events?: Event | null;
}

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
}
