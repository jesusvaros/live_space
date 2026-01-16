-- Live Space - Venue places + profile management migration
-- Adds venue_places, profile_venue management link, and event constraints.

CREATE TABLE IF NOT EXISTS public.venue_places (
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
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_venue
  ADD COLUMN IF NOT EXISTS managed_venue_place_id UUID REFERENCES public.venue_places(id) ON DELETE SET NULL;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS venue_place_id UUID REFERENCES public.venue_places(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role <> OLD.role THEN
    RAISE EXCEPTION 'Profile role cannot be changed.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_prevent_role_change ON public.profiles;
CREATE TRIGGER profiles_prevent_role_change
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_change();

DROP TRIGGER IF EXISTS venue_places_set_updated_at ON public.venue_places;
CREATE TRIGGER venue_places_set_updated_at
  BEFORE UPDATE ON public.venue_places
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.venue_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_places_select_public ON public.venue_places;
CREATE POLICY venue_places_select_public ON public.venue_places
  FOR SELECT USING (true);

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

CREATE INDEX IF NOT EXISTS idx_venue_places_city ON public.venue_places(city);
CREATE INDEX IF NOT EXISTS idx_venue_places_location ON public.venue_places(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_venue_places_created_by ON public.venue_places(created_by);

CREATE INDEX IF NOT EXISTS idx_events_venue_place ON public.events(venue_place_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_artists_event ON public.event_artists(event_id);

-- Extend events insert policy to allow venue_place_id
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
