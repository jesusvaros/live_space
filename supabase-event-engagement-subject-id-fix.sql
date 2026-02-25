-- ============================================
-- Event Engagement subject_id compatibility fix
-- ============================================
-- Run this migration if your DB throws:
-- PGRST204: "Could not find the 'subject_id' column of 'event_attendance'"

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subjects'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'event_attendance'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'event_attendance'
        AND column_name = 'subject_id'
    ) THEN
      ALTER TABLE public.event_attendance
        ADD COLUMN subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'event_saves'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'event_saves'
        AND column_name = 'subject_id'
    ) THEN
      ALTER TABLE public.event_saves
        ADD COLUMN subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'subject_id'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'event_attendance'
        AND column_name = 'subject_id'
    ) THEN
      UPDATE public.event_attendance ea
      SET subject_id = p.subject_id
      FROM public.profiles p
      WHERE ea.user_id = p.id
        AND ea.subject_id IS NULL
        AND p.subject_id IS NOT NULL;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'event_saves'
        AND column_name = 'subject_id'
    ) THEN
      UPDATE public.event_saves es
      SET subject_id = p.subject_id
      FROM public.profiles p
      WHERE es.user_id = p.id
        AND es.subject_id IS NULL
        AND p.subject_id IS NOT NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_attendance'
      AND column_name = 'subject_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_event_attendance_subject_id
      ON public.event_attendance(subject_id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_saves'
      AND column_name = 'subject_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_event_saves_subject_id
      ON public.event_saves(subject_id);
  END IF;
END $$;
