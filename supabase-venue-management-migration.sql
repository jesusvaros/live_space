-- Live Space - Venue management alignment (Option B)
-- Makes venue_places the canonical venue data and restricts updates to owners.

-- Add new fields to venue_places
ALTER TABLE public.venue_places
  ADD COLUMN IF NOT EXISTS capacity INTEGER,
  ADD COLUMN IF NOT EXISTS venue_type TEXT;

-- Link venue profiles to managed venue places
ALTER TABLE public.profile_venue
  ADD COLUMN IF NOT EXISTS managed_venue_place_id UUID REFERENCES public.venue_places(id) ON DELETE SET NULL;

-- Optional cleanup: remove duplicated venue fields from profile_venue
-- WARNING: run only if you no longer need these legacy fields.
ALTER TABLE public.profile_venue
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS capacity,
  DROP COLUMN IF EXISTS venue_type,
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude,
  DROP COLUMN IF EXISTS website_url,
  DROP COLUMN IF EXISTS photos;

-- Tighten RLS for venue_places (only owners can update)
DROP POLICY IF EXISTS venue_places_insert_auth ON public.venue_places;
CREATE POLICY venue_places_insert_auth ON public.venue_places
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS venue_places_update_auth ON public.venue_places;
CREATE POLICY venue_places_update_auth ON public.venue_places
  FOR UPDATE USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_venue_places_created_by ON public.venue_places(created_by);

-- Require venue_place_id on event insert
DROP POLICY IF EXISTS events_insert_organizer ON public.events;
CREATE POLICY events_insert_organizer ON public.events
  FOR INSERT WITH CHECK (
    auth.uid() = organizer_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('artist', 'venue', 'label')
    )
    AND (
      venue_id IS NULL OR EXISTS (
        SELECT 1 FROM public.profiles v
        WHERE v.id = venue_id AND v.role = 'venue'
      )
    )
    AND venue_place_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.venue_places vp
      WHERE vp.id = venue_place_id
    )
  );
