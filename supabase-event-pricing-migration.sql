-- Live Space - Event pricing + links + poster
-- Adds event_url, is_free, price_tiers to events.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_url TEXT,
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS price_tiers JSONB NOT NULL DEFAULT '[]'::jsonb;
