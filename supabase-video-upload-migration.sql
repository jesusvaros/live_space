-- ============================================
-- Video Upload Feature - Database Migration
-- ============================================
-- Execute this in Supabase SQL Editor after running supabase-setup.sql

-- ============================================
-- 1. UPDATE VIDEOS TABLE SCHEMA
-- ============================================

-- Add new columns for video metadata
ALTER TABLE videos 
  ADD COLUMN IF NOT EXISTS venue TEXT,
  ADD COLUMN IF NOT EXISTS artist TEXT,
  ADD COLUMN IF NOT EXISTS song TEXT,
  ADD COLUMN IF NOT EXISTS concert_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recorded_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS duration INTEGER, -- in seconds
  ADD COLUMN IF NOT EXISTS file_size BIGINT; -- in bytes

-- Update title to be optional (can be auto-generated from song + artist)
ALTER TABLE videos ALTER COLUMN title DROP NOT NULL;

-- ============================================
-- 2. CREATE STORAGE BUCKET FOR VIDEOS
-- ============================================

-- Create videos bucket (public access for playback)
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

-- Create thumbnails bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. STORAGE POLICIES FOR VIDEOS
-- ============================================

-- Allow users to upload their own videos
CREATE POLICY "Users can upload their own videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'videos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Everyone can view videos
CREATE POLICY "Anyone can view videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos');

-- Users can update their own videos
CREATE POLICY "Users can update their own videos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'videos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own videos
CREATE POLICY "Users can delete their own videos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'videos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================
-- 4. STORAGE POLICIES FOR THUMBNAILS
-- ============================================

-- Allow users to upload their own thumbnails
CREATE POLICY "Users can upload their own thumbnails"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'thumbnails' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Everyone can view thumbnails
CREATE POLICY "Anyone can view thumbnails"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails');

-- Users can update their own thumbnails
CREATE POLICY "Users can update their own thumbnails"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'thumbnails' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own thumbnails
CREATE POLICY "Users can delete their own thumbnails"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'thumbnails' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================
-- 5. CREATE INDEXES FOR NEW FIELDS
-- ============================================

-- Index for searching by venue
CREATE INDEX IF NOT EXISTS idx_videos_venue ON videos(venue);

-- Index for searching by artist
CREATE INDEX IF NOT EXISTS idx_videos_artist ON videos(artist);

-- Index for searching by song
CREATE INDEX IF NOT EXISTS idx_videos_song ON videos(song);

-- Index for searching by concert date
CREATE INDEX IF NOT EXISTS idx_videos_concert_date ON videos(concert_date DESC);

-- Spatial index for location-based queries
CREATE INDEX IF NOT EXISTS idx_videos_location ON videos(latitude, longitude);

-- ============================================
-- VERIFICATION
-- ============================================

-- Check updated schema
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'videos' 
-- ORDER BY ordinal_position;

-- Check storage buckets
-- SELECT * FROM storage.buckets WHERE id IN ('videos', 'thumbnails');

-- Check storage policies
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
