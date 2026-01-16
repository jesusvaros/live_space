-- Live Space - Event moments timeline migration
-- Adds capture metadata for posts and new timeline index.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS capture_source TEXT;

CREATE INDEX IF NOT EXISTS idx_posts_event_captured
  ON public.posts (event_id, captured_at DESC NULLS LAST, created_at DESC);

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
