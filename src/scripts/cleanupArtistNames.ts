import type { SupabaseClient } from '@supabase/supabase-js';

import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import {
  type ArtistCleanupAction,
  type ArtistNameRow,
  type PlannedName,
  pickRawName,
  planArtistCleanup,
} from '../pipeline/artistNameCleanup.js';
import { Logger } from '../utils/logger.js';

// One-off (and idempotent, so safe in the daily cron) fix of artist names that
// are event titles: "Morat - YEM World Tour" → "Morat", "Belén Bandera i
// Carla Motis" → two artists linked to the same events. Never merges or
// deletes rows: a name owned by another artist and non-artist titles
// ("Tributo MECANO") are only reported.
//   --dry-run  print the diff without writing
const dryRun = process.argv.includes('--dry-run');
const logger = new Logger(env.logLevel, { script: 'cleanupArtistNames', dryRun });
const PAGE_SIZE = 1000;

const fetchAll = async <T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
};

type EventArtistRow = { event_id: string; artist_id: string; billing_order: number | null };
type StagingNameRow = { published_event_id: string; extracted_title: string | null; extracted_artist_names: string[] | null };

// The raw names live in staging_events, readable with the service role only.
// Without them, names damaged by the old hyphen bug are left alone.
const loadRawNames = async (
  supabase: SupabaseClient,
  artists: ArtistNameRow[],
  links: EventArtistRow[],
): Promise<Map<string, string>> => {
  let staging: StagingNameRow[];
  try {
    staging = await fetchAll<StagingNameRow>((from, to) =>
      supabase
        .from('staging_events')
        .select('published_event_id,extracted_title,extracted_artist_names')
        .not('published_event_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, to),
    );
  } catch (error) {
    logger.warn('Staging is not readable; damaged hyphens will be reported as ambiguous', { error: String(error) });
    return new Map();
  }

  const candidatesByEvent = new Map<string, string[]>();
  for (const row of staging) {
    const list = candidatesByEvent.get(row.published_event_id) || [];
    list.push(...(row.extracted_artist_names || []));
    if (row.extracted_title) list.push(row.extracted_title);
    candidatesByEvent.set(row.published_event_id, list);
  }

  const eventsByArtist = new Map<string, string[]>();
  for (const link of links) {
    eventsByArtist.set(link.artist_id, [...(eventsByArtist.get(link.artist_id) || []), link.event_id]);
  }

  const rawNames = new Map<string, string>();
  for (const artist of artists) {
    const candidates = (eventsByArtist.get(artist.id) || []).flatMap((eventId) => candidatesByEvent.get(eventId) || []);
    const raw = pickRawName(artist, candidates);
    if (raw) rawNames.set(artist.id, raw);
  }
  return rawNames;
};

const detectArtistType = (name: string): 'solo' | 'band' =>
  /\bband|trio|quartet|orquesta|orchestra|ensemble|collective\b/i.test(name) ? 'band' : 'solo';

const findOrCreateArtist = async (supabase: SupabaseClient, planned: PlannedName): Promise<string> => {
  const { data: existing, error } = await supabase
    .from('artists')
    .select('id')
    .eq('normalized_name', planned.normalizedName)
    .eq('country_code', 'ZZ')
    .limit(1);
  if (error) throw error;
  if (existing?.[0]) return (existing[0] as { id: string }).id;

  const { data, error: insertError } = await supabase
    .from('artists')
    .insert({
      name: planned.name,
      normalized_name: planned.normalizedName,
      artist_type: detectArtistType(planned.name),
      country_code: 'ZZ',
      status: 'published',
    })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return (data as { id: string }).id;
};

const applyRename = async (
  supabase: SupabaseClient,
  action: Extract<ArtistCleanupAction, { kind: 'rename' }>,
  links: EventArtistRow[],
): Promise<'applied' | 'collision'> => {
  const { error } = await supabase
    .from('artists')
    .update({ name: action.to.name, normalized_name: action.to.normalizedName })
    .eq('id', action.artistId)
    .eq('name', action.from);
  if (error) {
    // 23505: another artist took that name since the plan was made.
    if (error.code === '23505') return 'collision';
    throw error;
  }

  const eventIds = links.filter((link) => link.artist_id === action.artistId).map((link) => link.event_id);
  for (const extra of action.extra) {
    const extraId = await findOrCreateArtist(supabase, extra);
    for (const eventId of eventIds) {
      const eventLinks = links.filter((link) => link.event_id === eventId);
      if (eventLinks.some((link) => link.artist_id === extraId)) continue;
      const billingOrder = Math.max(-1, ...eventLinks.map((link) => link.billing_order ?? 0)) + 1;
      const { error: linkError } = await supabase
        .from('event_artists')
        .insert({ event_id: eventId, artist_id: extraId, billing_order: billingOrder, is_headliner: false });
      if (linkError && linkError.code !== '23505') throw linkError;
      links.push({ event_id: eventId, artist_id: extraId, billing_order: billingOrder });
    }
  }
  return 'applied';
};

const describe = (action: ArtistCleanupAction): string => {
  switch (action.kind) {
    case 'rename': {
      const extra = action.extra.length ? ` + ${action.extra.map((name) => `"${name.name}"`).join(' + ')}` : '';
      const tour = action.tourName ? `   [gira: ${action.tourName}]` : '';
      return `~ "${action.from}" → "${action.to.name}"${extra}${tour}`;
    }
    case 'not-artist':
      return `! "${action.name}" no es un artista (se deja; revisar a mano)`;
    case 'collision':
      return `= "${action.from}" → "${action.to}" ya existe como "${action.conflictWith}" (no se fusiona)`;
    case 'ambiguous':
      return `? "${action.name}" guion ambiguo sin texto original (se deja)`;
  }
};

const run = async () => {
  const supabase = getSupabaseAdmin();
  const artists = await fetchAll<ArtistNameRow>((from, to) =>
    supabase.from('artists').select('id,name,normalized_name').order('id', { ascending: true }).range(from, to),
  );
  const links = await fetchAll<EventArtistRow>((from, to) =>
    supabase
      .from('event_artists')
      .select('event_id,artist_id,billing_order')
      .order('event_id', { ascending: true })
      .order('artist_id', { ascending: true })
      .range(from, to),
  );
  const rawNames = await loadRawNames(supabase, artists, links);
  const actions = planArtistCleanup(artists, rawNames);

  const counts: Record<string, number> = { rename: 0, caseOnly: 0, split: 0, 'not-artist': 0, collision: 0, ambiguous: 0 };
  for (const action of actions) {
    counts[action.kind] += 1;
    if (action.kind === 'rename' && action.caseOnly) counts.caseOnly += 1;
    if (action.kind === 'rename' && action.extra.length > 0) counts.split += 1;
    if (dryRun) {
      console.info(describe(action));
      continue;
    }
    if (action.kind !== 'rename') {
      logger.info('Artist left unchanged', { artistId: action.artistId, reason: describe(action) });
      continue;
    }
    const result = await applyRename(supabase, action, links);
    logger.info(result === 'applied' ? 'Artist renamed' : 'Artist rename skipped (name taken)', {
      artistId: action.artistId,
      change: describe(action),
    });
  }

  logger.info('Artist name cleanup finished', {
    artists: artists.length,
    rawNamesFound: rawNames.size,
    ...counts,
    unchanged: artists.length - actions.length,
  });
};

run().catch((error) => {
  logger.error('Artist name cleanup failed', error);
  process.exitCode = 1;
});
