-- ============================================
-- Artists and Venues Tables - Database Migration
-- ============================================
-- Execute this in Supabase SQL Editor

-- ============================================
-- 1. CREATE ARTISTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS artists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster searches
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
CREATE INDEX IF NOT EXISTS idx_artists_slug ON artists(slug);

-- Enable RLS
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;

-- Everyone can read artists
CREATE POLICY "Anyone can view artists"
  ON artists FOR SELECT
  USING (true);

-- Authenticated users can create artists
CREATE POLICY "Authenticated users can create artists"
  ON artists FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- 2. CREATE VENUES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  city TEXT,
  country TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, city, country)
);

-- Create indexes for faster searches
CREATE INDEX IF NOT EXISTS idx_venues_name ON venues(name);
CREATE INDEX IF NOT EXISTS idx_venues_slug ON venues(slug);
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city);
CREATE INDEX IF NOT EXISTS idx_venues_location ON venues(latitude, longitude);

-- Enable RLS
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Everyone can read venues
CREATE POLICY "Anyone can view venues"
  ON venues FOR SELECT
  USING (true);

-- Authenticated users can create venues
CREATE POLICY "Authenticated users can create venues"
  ON venues FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- 3. UPDATE VIDEOS TABLE
-- ============================================

-- Add foreign keys to videos table
ALTER TABLE videos 
  ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES artists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_videos_artist_id ON videos(artist_id);
CREATE INDEX IF NOT EXISTS idx_videos_venue_id ON videos(venue_id);

-- Keep the old text columns for backward compatibility (can be removed later)
-- ALTER TABLE videos DROP COLUMN IF EXISTS artist;
-- ALTER TABLE videos DROP COLUMN IF EXISTS venue;

-- ============================================
-- 4. CREATE HELPER FUNCTIONS
-- ============================================

-- Function to generate slug from name
CREATE OR REPLACE FUNCTION generate_slug(name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to search artists by name
CREATE OR REPLACE FUNCTION search_artists(search_query TEXT, result_limit INT DEFAULT 10)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  image_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.name, a.slug, a.image_url
  FROM artists a
  WHERE a.name ILIKE '%' || search_query || '%'
  ORDER BY 
    CASE WHEN a.name ILIKE search_query || '%' THEN 1 ELSE 2 END,
    a.name
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to search venues by name
CREATE OR REPLACE FUNCTION search_venues(search_query TEXT, result_limit INT DEFAULT 10)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  city TEXT,
  country TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  image_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT v.id, v.name, v.slug, v.city, v.country, v.latitude, v.longitude, v.image_url
  FROM venues v
  WHERE v.name ILIKE '%' || search_query || '%'
     OR v.city ILIKE '%' || search_query || '%'
  ORDER BY 
    CASE WHEN v.name ILIKE search_query || '%' THEN 1 ELSE 2 END,
    v.name
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. INSERT SAMPLE DATA (OPTIONAL)
-- ============================================

-- Sample artists
INSERT INTO artists (name, slug) VALUES
  ('Taylor Swift', 'taylor-swift'),
  ('Bad Bunny', 'bad-bunny'),
  ('Coldplay', 'coldplay'),
  ('Rosalía', 'rosalia'),
  ('The Weeknd', 'the-weeknd'),
  ('Dua Lipa', 'dua-lipa'),
  ('Ed Sheeran', 'ed-sheeran'),
  ('Beyoncé', 'beyonce'),
  ('Drake', 'drake'),
  ('Billie Eilish', 'billie-eilish')
ON CONFLICT (name) DO NOTHING;

-- Sample venues in Spain
INSERT INTO venues (name, slug, city, country, latitude, longitude) VALUES
  ('Estadio Santiago Bernabéu', 'estadio-santiago-bernabeu', 'Madrid', 'España', 40.453054, -3.688344),
  ('Camp Nou', 'camp-nou', 'Barcelona', 'España', 41.380896, 2.122820),
  ('WiZink Center', 'wizink-center', 'Madrid', 'España', 40.422371, -3.667050),
  ('Palau Sant Jordi', 'palau-sant-jordi', 'Barcelona', 'España', 41.364556, 2.153611),
  ('Estadio Wanda Metropolitano', 'estadio-wanda-metropolitano', 'Madrid', 'España', 40.436111, -3.599444),
  ('Palacio de los Deportes', 'palacio-de-los-deportes', 'Madrid', 'España', 40.397778, -3.668889),
  ('RCDE Stadium', 'rcde-stadium', 'Barcelona', 'España', 41.347778, 2.075556),
  ('Estadio de La Cartuja', 'estadio-de-la-cartuja', 'Sevilla', 'España', 37.405556, -5.978333)
ON CONFLICT (name, city, country) DO NOTHING;

-- ============================================
-- 6. CREATE TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_artists_updated_at
  BEFORE UPDATE ON artists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_venues_updated_at
  BEFORE UPDATE ON venues
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
