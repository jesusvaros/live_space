-- ============================================
-- Live Space - Schema v1 (clean)
-- ============================================
-- Notes:
-- - Single profiles table with role + optional extensions.
-- - Leaflet map uses lat/lng on events and venue profiles.
-- - QR uses event.id with optional qr_token for rotation/tracking.
-- ============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_role') THEN
    CREATE TYPE public.profile_role AS ENUM ('user', 'artist', 'venue', 'label');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_type') THEN
    CREATE TYPE public.media_type AS ENUM ('video', 'image');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status') THEN
    CREATE TYPE public.attendance_status AS ENUM ('going', 'attended');
  END IF;
END $$;

-- ============================================
-- Tables
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.profile_role NOT NULL DEFAULT 'user',
  username CITEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  primary_city TEXT,
  external_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profile_artist (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  genres TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profile_venue (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  managed_venue_place_id UUID REFERENCES venue_places(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS venue_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  capacity INTEGER,
  venue_type TEXT,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  website_url TEXT,
  photos TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  venue_place_id UUID NOT NULL REFERENCES venue_places(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  event_url TEXT,
  city TEXT NOT NULL,
  address TEXT,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  genres TEXT[] NOT NULL DEFAULT '{}'::text[],
  cover_image_url TEXT,
  is_free BOOLEAN NOT NULL DEFAULT true,
  price_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  is_public BOOLEAN NOT NULL DEFAULT true,
  qr_token UUID DEFAULT gen_random_uuid(),
  qr_token_rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_artists (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, artist_id)
);

CREATE TABLE IF NOT EXISTS label_artists (
  label_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (label_id, artist_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type public.media_type NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  captured_at TIMESTAMPTZ,
  capture_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS event_saves (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS event_attendance (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status public.attendance_status NOT NULL DEFAULT 'going',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- ============================================
-- Updated_at trigger
-- ============================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS profile_artist_set_updated_at ON profile_artist;
CREATE TRIGGER profile_artist_set_updated_at
  BEFORE UPDATE ON profile_artist
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS profile_venue_set_updated_at ON profile_venue;
CREATE TRIGGER profile_venue_set_updated_at
  BEFORE UPDATE ON profile_venue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS venue_places_set_updated_at ON venue_places;
CREATE TRIGGER venue_places_set_updated_at
  BEFORE UPDATE ON venue_places
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS events_set_updated_at ON events;
CREATE TRIGGER events_set_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS posts_set_updated_at ON posts;
CREATE TRIGGER posts_set_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS event_attendance_set_updated_at ON event_attendance;
CREATE TRIGGER event_attendance_set_updated_at
  BEFORE UPDATE ON event_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- Auto-create profile on signup
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    avatar_url,
    primary_city,
    external_links,
    role
  )
  VALUES (
    new.id,
    NULLIF(new.raw_user_meta_data->>'username', ''),
    NULLIF(new.raw_user_meta_data->>'display_name', ''),
    NULLIF(new.raw_user_meta_data->>'avatar_url', ''),
    NULLIF(new.raw_user_meta_data->>'primary_city', ''),
    COALESCE(new.raw_user_meta_data->'external_links', '{}'::jsonb),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Prevent role changes via client updates
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role <> OLD.role THEN
    RAISE EXCEPTION 'Profile role cannot be changed.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_prevent_role_change ON profiles;
CREATE TRIGGER profiles_prevent_role_change
  BEFORE UPDATE OF role ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_change();

-- ============================================
-- RLS
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_artist ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_venue ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE label_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendance ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS profiles_select_public ON profiles;
CREATE POLICY profiles_select_public ON profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS profiles_insert_self ON profiles;
CREATE POLICY profiles_insert_self ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_self ON profiles;
CREATE POLICY profiles_update_self ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_delete_self ON profiles;
CREATE POLICY profiles_delete_self ON profiles
  FOR DELETE USING (auth.uid() = id);

-- Artist profile policies
DROP POLICY IF EXISTS profile_artist_select_public ON profile_artist;
CREATE POLICY profile_artist_select_public ON profile_artist
  FOR SELECT USING (true);

DROP POLICY IF EXISTS profile_artist_write_owner ON profile_artist;
CREATE POLICY profile_artist_write_owner ON profile_artist
  FOR INSERT WITH CHECK (
    auth.uid() = profile_id
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profile_id AND p.role = 'artist'
    )
  );

DROP POLICY IF EXISTS profile_artist_update_owner ON profile_artist;
CREATE POLICY profile_artist_update_owner ON profile_artist
  FOR UPDATE USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS profile_artist_delete_owner ON profile_artist;
CREATE POLICY profile_artist_delete_owner ON profile_artist
  FOR DELETE USING (auth.uid() = profile_id);

-- Venue profile policies
DROP POLICY IF EXISTS profile_venue_select_public ON profile_venue;
CREATE POLICY profile_venue_select_public ON profile_venue
  FOR SELECT USING (true);

DROP POLICY IF EXISTS profile_venue_write_owner ON profile_venue;
CREATE POLICY profile_venue_write_owner ON profile_venue
  FOR INSERT WITH CHECK (
    auth.uid() = profile_id
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profile_id AND p.role = 'venue'
    )
  );

DROP POLICY IF EXISTS profile_venue_update_owner ON profile_venue;
CREATE POLICY profile_venue_update_owner ON profile_venue
  FOR UPDATE USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS profile_venue_delete_owner ON profile_venue;
CREATE POLICY profile_venue_delete_owner ON profile_venue
  FOR DELETE USING (auth.uid() = profile_id);

-- Venue places policies
DROP POLICY IF EXISTS venue_places_select_public ON venue_places;
CREATE POLICY venue_places_select_public ON venue_places
  FOR SELECT USING (true);

DROP POLICY IF EXISTS venue_places_insert_auth ON venue_places;
CREATE POLICY venue_places_insert_auth ON venue_places
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS venue_places_update_auth ON venue_places;
CREATE POLICY venue_places_update_auth ON venue_places
  FOR UPDATE USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Events policies
DROP POLICY IF EXISTS events_select_public ON events;
CREATE POLICY events_select_public ON events
  FOR SELECT USING (is_public OR auth.uid() = organizer_id);

DROP POLICY IF EXISTS events_insert_organizer ON events;
CREATE POLICY events_insert_organizer ON events
  FOR INSERT WITH CHECK (
    auth.uid() = organizer_id
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('artist', 'venue', 'label')
    )
    AND (
      venue_id IS NULL OR EXISTS (
        SELECT 1 FROM profiles v
        WHERE v.id = venue_id AND v.role = 'venue'
      )
    )
    AND venue_place_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM venue_places vp
      WHERE vp.id = venue_place_id
    )
  );

DROP POLICY IF EXISTS events_update_organizer ON events;
CREATE POLICY events_update_organizer ON events
  FOR UPDATE USING (auth.uid() = organizer_id)
  WITH CHECK (auth.uid() = organizer_id);

DROP POLICY IF EXISTS events_delete_organizer ON events;
CREATE POLICY events_delete_organizer ON events
  FOR DELETE USING (auth.uid() = organizer_id);

-- Event artists policies
DROP POLICY IF EXISTS event_artists_select_public ON event_artists;
CREATE POLICY event_artists_select_public ON event_artists
  FOR SELECT USING (true);

DROP POLICY IF EXISTS event_artists_insert ON event_artists;
CREATE POLICY event_artists_insert ON event_artists
  FOR INSERT WITH CHECK (
    (
      auth.uid() = artist_id
      OR auth.uid() = (
        SELECT e.organizer_id FROM events e WHERE e.id = event_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = artist_id AND p.role = 'artist'
    )
  );

DROP POLICY IF EXISTS event_artists_delete ON event_artists;
CREATE POLICY event_artists_delete ON event_artists
  FOR DELETE USING (
    auth.uid() = artist_id
    OR auth.uid() = (
      SELECT e.organizer_id FROM events e WHERE e.id = event_id
    )
  );

-- Label artists policies
DROP POLICY IF EXISTS label_artists_select_public ON label_artists;
CREATE POLICY label_artists_select_public ON label_artists
  FOR SELECT USING (true);

DROP POLICY IF EXISTS label_artists_insert ON label_artists;
CREATE POLICY label_artists_insert ON label_artists
  FOR INSERT WITH CHECK (
    auth.uid() = label_id
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'label'
    )
    AND EXISTS (
      SELECT 1 FROM profiles a
      WHERE a.id = artist_id AND a.role = 'artist'
    )
  );

DROP POLICY IF EXISTS label_artists_delete ON label_artists;
CREATE POLICY label_artists_delete ON label_artists
  FOR DELETE USING (auth.uid() = label_id);

-- Posts policies
DROP POLICY IF EXISTS posts_select_public ON posts;
CREATE POLICY posts_select_public ON posts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS posts_insert_owner ON posts;
CREATE POLICY posts_insert_owner ON posts
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND (e.is_public OR e.organizer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS posts_update_owner ON posts;
CREATE POLICY posts_update_owner ON posts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS posts_delete_owner ON posts;
CREATE POLICY posts_delete_owner ON posts
  FOR DELETE USING (auth.uid() = user_id);

-- Post likes policies
DROP POLICY IF EXISTS post_likes_select_public ON post_likes;
CREATE POLICY post_likes_select_public ON post_likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS post_likes_insert_owner ON post_likes;
CREATE POLICY post_likes_insert_owner ON post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS post_likes_delete_owner ON post_likes;
CREATE POLICY post_likes_delete_owner ON post_likes
  FOR DELETE USING (auth.uid() = user_id);

-- Event saves policies
DROP POLICY IF EXISTS event_saves_select_owner ON event_saves;
CREATE POLICY event_saves_select_owner ON event_saves
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS event_saves_insert_owner ON event_saves;
CREATE POLICY event_saves_insert_owner ON event_saves
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS event_saves_delete_owner ON event_saves;
CREATE POLICY event_saves_delete_owner ON event_saves
  FOR DELETE USING (auth.uid() = user_id);

-- Event attendance policies
DROP POLICY IF EXISTS event_attendance_select_owner ON event_attendance;
CREATE POLICY event_attendance_select_owner ON event_attendance
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS event_attendance_insert_owner ON event_attendance;
CREATE POLICY event_attendance_insert_owner ON event_attendance
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS event_attendance_update_owner ON event_attendance;
CREATE POLICY event_attendance_update_owner ON event_attendance
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS event_attendance_delete_owner ON event_attendance;
CREATE POLICY event_attendance_delete_owner ON event_attendance
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON profiles(primary_city);

CREATE INDEX IF NOT EXISTS idx_venue_places_city ON venue_places(city);
CREATE INDEX IF NOT EXISTS idx_venue_places_location ON venue_places(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_venue_places_created_by ON venue_places(created_by);

CREATE INDEX IF NOT EXISTS idx_events_city_starts ON events(city, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue_id);
CREATE INDEX IF NOT EXISTS idx_events_venue_place ON events(venue_place_id);
CREATE INDEX IF NOT EXISTS idx_events_location ON events(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_events_genres ON events USING GIN (genres);

CREATE INDEX IF NOT EXISTS idx_event_artists_event ON event_artists(event_id);
CREATE INDEX IF NOT EXISTS idx_event_artists_artist ON event_artists(artist_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_artists_event ON event_artists(event_id);

CREATE INDEX IF NOT EXISTS idx_label_artists_label ON label_artists(label_id);
CREATE INDEX IF NOT EXISTS idx_label_artists_artist ON label_artists(artist_id);

CREATE INDEX IF NOT EXISTS idx_posts_event ON posts(event_id);
CREATE INDEX IF NOT EXISTS idx_posts_event_captured ON posts(event_id, captured_at DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes(user_id);

CREATE INDEX IF NOT EXISTS idx_event_saves_user ON event_saves(user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendance_user ON event_attendance(user_id);

-- ============================================
-- Timeline buckets (RPC)
-- ============================================

CREATE OR REPLACE FUNCTION public.event_moment_buckets(p_event_id UUID)
RETURNS TABLE (bucket_time TIMESTAMPTZ, moment_count INTEGER)
LANGUAGE sql STABLE
AS $$
  SELECT
    date_trunc('second', COALESCE(captured_at, created_at)) AS bucket_time,
    COUNT(*)::int AS moment_count
  FROM public.posts
  WHERE event_id = p_event_id
  GROUP BY 1
  ORDER BY 1 ASC;
$$;

CREATE OR REPLACE FUNCTION public.event_moment_buckets_filtered(
  p_event_id UUID,
  p_media_type TEXT
)
RETURNS TABLE (bucket_time TIMESTAMPTZ, moment_count INTEGER)
LANGUAGE sql STABLE
AS $$
  SELECT
    date_trunc('second', COALESCE(captured_at, created_at)) AS bucket_time,
    COUNT(*)::int AS moment_count
  FROM public.posts
  WHERE event_id = p_event_id
    AND (p_media_type IS NULL OR media_type::text = p_media_type)
  GROUP BY 1
  ORDER BY 1 ASC;
$$;

-- ============================================
-- Storage bucket & policies
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS media_read_public ON storage.objects;
CREATE POLICY media_read_public ON storage.objects
  FOR SELECT USING (bucket_id = 'media');

DROP POLICY IF EXISTS media_insert_auth ON storage.objects;
CREATE POLICY media_insert_auth ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS media_update_owner ON storage.objects;
CREATE POLICY media_update_owner ON storage.objects
  FOR UPDATE USING (bucket_id = 'media' AND auth.uid() = owner);

DROP POLICY IF EXISTS media_delete_owner ON storage.objects;
CREATE POLICY media_delete_owner ON storage.objects
  FOR DELETE USING (bucket_id = 'media' AND auth.uid() = owner);
