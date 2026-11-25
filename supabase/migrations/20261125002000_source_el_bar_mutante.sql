-- El Bar Mutante (Sevilla) as a daily scraping source.
--
-- Same row that `npm run scrape:seed` writes from src/pipeline/sourceCatalog.ts,
-- so the source lands in production with the merge instead of a manual seed.
-- The parser (`bar-mutante-agenda`) reads the Events Manager calendar on
-- /eventos/ and the next month; the venue itself is created by the pipeline
-- on the first run. A row that already exists (a seed got there first) is
-- left alone.
insert into public.scrape_sources (
  source_type, name, base_url, city, country_code, parser_key, frequency,
  terms_reviewed_at, is_active, metadata
)
values (
  'venue',
  'El Bar Mutante',
  'https://elbarmutante.com/eventos/',
  'Sevilla',
  'ES',
  'bar-mutante-agenda',
  'daily',
  '2026-11-25T00:00:00Z',
  true,
  '{"officialWebsite": "https://elbarmutante.com/", "termsReviewStatus": "approved", "fixtureVerified": true, "structuredDataVerified": true, "categoryAllowlist": []}'::jsonb
)
on conflict (base_url) do nothing;
