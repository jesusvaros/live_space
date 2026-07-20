begin;

-- Existing sources that do not satisfy the gate are made safe before the
-- database constraint is installed. This never activates a source.
update public.scrape_sources
set is_active = false
where is_active
  and (
    terms_reviewed_at is null
    or not metadata @> '{"fixtureVerified": true}'::jsonb
  );

alter table public.scrape_sources
  drop constraint if exists scrape_sources_activation_requirements;

alter table public.scrape_sources
  add constraint scrape_sources_activation_requirements check (
    not is_active
    or (
      terms_reviewed_at is not null
      and metadata @> '{"fixtureVerified": true}'::jsonb
    )
  );

commit;
