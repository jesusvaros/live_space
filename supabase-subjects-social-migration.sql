-- ============================================
-- Subjects and Social Architecture Migration
-- ============================================

-- 1. Subjects Table
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('user', 'venue', 'artist')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Link existing tables to subjects
-- Note: We need to handle existing data if any, but since this is dev, we can assume we might need to backfill.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;
ALTER TABLE public.venue_places ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;

-- 3. Update Artists Table for type
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS artist_type TEXT CHECK (artist_type IN ('band', 'solo')) DEFAULT 'solo';

-- 4. Follows Table
CREATE TABLE IF NOT EXISTS public.follows (
  follower_subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  target_subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_subject_id, target_subject_id)
);

-- 5. Entity Admins Table
CREATE TABLE IF NOT EXISTS public.entity_admins (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, subject_id)
);

-- 6. Profile Privacy Table
CREATE TABLE IF NOT EXISTS public.profile_privacy (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_private BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Songs and Setlist
CREATE TABLE IF NOT EXISTS public.songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_setlist (
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  performer_artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  song_id UUID REFERENCES public.songs(id) ON DELETE SET NULL,
  song_title TEXT,
  starts_offset_ms BIGINT,
  ends_offset_ms BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, ordinal)
);

-- 8. Update Posts Table
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS event_offset_ms BIGINT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS actor_subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS performance_artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS song_id UUID REFERENCES public.songs(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS song_title TEXT;

-- 9. Update Engagement Tables
-- event_saves
ALTER TABLE public.event_saves ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE;
-- Backfill existing saves (assuming subject_id is linked to profiles.id)
UPDATE public.event_saves es SET subject_id = p.subject_id FROM public.profiles p WHERE es.user_id = p.id AND es.subject_id IS NULL;
-- In the future, we might want to drop user_id or make subject_id part of the PK.
-- For now, let's just make it usable.

-- event_attendance
ALTER TABLE public.event_attendance ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE;
UPDATE public.event_attendance ea SET subject_id = p.subject_id FROM public.profiles p WHERE ea.user_id = p.id AND ea.subject_id IS NULL;

-- 10. Views
-- v_subject_users
CREATE OR REPLACE VIEW public.v_subject_users AS
SELECT s.id as subject_id, p.*
FROM public.subjects s
JOIN public.profiles p ON p.subject_id = s.id
WHERE s.type = 'user';

-- v_subject_artists
CREATE OR REPLACE VIEW public.v_subject_artists AS
SELECT s.id as subject_id, a.*
FROM public.subjects s
JOIN public.artists a ON a.subject_id = s.id
WHERE s.type = 'artist';

-- v_subject_venues
CREATE OR REPLACE VIEW public.v_subject_venues AS
SELECT s.id as subject_id, vp.*
FROM public.subjects s
JOIN public.venue_places vp ON vp.subject_id = s.id
WHERE s.type = 'venue';

-- v_event_posts_with_setlist
CREATE OR REPLACE VIEW public.v_event_posts_with_setlist AS
SELECT 
  p.*,
  es.song_id as resolved_song_id,
  COALESCE(es.song_title, s.title) as resolved_song_title,
  es.performer_artist_id as resolved_performer_id,
  COALESCE(a.name, v.name, prof.display_name, prof.username) as actor_name,
  COALESCE(a.image_url, v.image_url, prof.avatar_url) as actor_image_url,
  s_actor.type as actor_type
FROM public.posts p
LEFT JOIN public.subjects s_actor ON p.actor_subject_id = s_actor.id
LEFT JOIN public.artists a ON s_actor.id = a.subject_id AND s_actor.type = 'artist'
LEFT JOIN public.venues v ON s_actor.id = v.subject_id AND s_actor.type = 'venue'
LEFT JOIN public.profiles prof ON s_actor.id = prof.subject_id AND s_actor.type = 'user'
LEFT JOIN public.event_setlist es ON p.event_id = es.event_id 
  AND p.event_offset_ms >= es.starts_offset_ms 
  AND (es.ends_offset_ms IS NULL OR p.event_offset_ms < es.ends_offset_ms)
LEFT JOIN public.songs s ON es.song_id = s.id;

-- 10. RLS (Simplified for now, should be refined based on needs)
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_privacy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_setlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view subjects" ON public.subjects FOR SELECT USING (true);
CREATE POLICY "Anyone can view follows" ON public.follows FOR SELECT USING (true);
CREATE POLICY "Users can manage their own follows" ON public.follows 
  FOR ALL USING (
    follower_subject_id IN (SELECT subject_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Anyone can view entity admins" ON public.entity_admins FOR SELECT USING (true);
CREATE POLICY "Anyone can view privacy" ON public.profile_privacy FOR SELECT USING (true);
CREATE POLICY "Users can update their own privacy" ON public.profile_privacy 
  FOR UPDATE USING (profile_id = auth.uid());

CREATE POLICY "Anyone can view songs" ON public.songs FOR SELECT USING (true);
CREATE POLICY "Anyone can view setlists" ON public.event_setlist FOR SELECT USING (true);

-- 11. Helper Function
CREATE OR REPLACE FUNCTION public.get_setlist_entry_for_offset(p_event_id UUID, p_offset_ms BIGINT)
RETURNS TABLE (
  ordinal INTEGER,
  song_id UUID,
  song_title TEXT,
  performer_artist_id UUID
) LANGUAGE sql STABLE AS $$
  SELECT ordinal, song_id, song_title, performer_artist_id
  FROM public.event_setlist
  WHERE event_id = p_event_id
    AND p_offset_ms >= starts_offset_ms
    AND (ends_offset_ms IS NULL OR p_offset_ms < ends_offset_ms)
  ORDER BY ordinal ASC
  LIMIT 1;
$$;

-- 12. Backfill Trigger for auto-subject creation
CREATE OR REPLACE FUNCTION public.handle_new_subject_profile()
RETURNS TRIGGER AS $$
DECLARE
  v_subject_id UUID;
BEGIN
  IF NEW.subject_id IS NULL THEN
    INSERT INTO public.subjects (type) VALUES ('user') RETURNING id INTO v_subject_id;
    NEW.subject_id := v_subject_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_profiles_subject ON public.profiles;
CREATE TRIGGER tr_profiles_subject
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_subject_profile();

-- Similarly for artists and venues if needed, but usually they are created by admins.
