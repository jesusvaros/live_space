import { User } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Event {
  id: string;
  name: string;
  city: string;
  venue: string;
  date: string;
}

export interface Post {
  id: string;
  user_id: string;
  event_id: string;
  media_url: string;
  media_type: 'video' | 'image';
  created_at: string;
  profile?: Profile;
  event?: Event;
}

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
}
