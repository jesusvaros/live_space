import type { SupabaseClient } from '@supabase/supabase-js';

import { cleanArtistName } from '../normalize/cleanArtistName.js';
import { Logger } from '../utils/logger.js';
import { deezerMatchKey } from './deezerArtists.js';
import { ArtistLinkKey, ArtistLinks, MusicBrainzClient } from './musicBrainzLinks.js';
import { linksFromStaging } from './stagingArtistLinks.js';

// Fills artists.external_links from the venue agendas we already scraped and
// from MusicBrainz. Idempotent: it only adds keys
// that are still empty, so links written by the artist's managers are never
// overwritten. external_ids keeps the MusicBrainz id and links_checked_at, so
// no artist is searched twice in a row:
// - identified artists (musicbrainz id) are refreshed with one request every
//   `matchedRecheckDays`, without searching again;
// - artists not found are searched again only after `recheckDays`, in case
//   someone added them to MusicBrainz;
// - artists with every link already filled, or whose name is still a bill
//   or an event title, are marked checked without any request.

export type EnrichArtistLinksOptions = {
  dryRun?: boolean;
  limit?: number;
  recheckDays?: number;
  matchedRecheckDays?: number;
  stagingRows?: number;
  now?: Date;
};

export type EnrichArtistLinksSummary = {
  checked: number;
  refreshed: number;
  skipped: number;
  matched: number;
  fromAgendas: number;
  linksAdded: number;
  errors: number;
};

type ArtistRow = {
  id: string;
  name: string;
  external_ids: Record<string, unknown> | null;
  external_links: Record<string, string> | null;
};

export const enrichArtistLinks = async (
  supabase: SupabaseClient,
  options: EnrichArtistLinksOptions,
  logger: Logger,
  musicBrainz = new MusicBrainzClient(),
): Promise<EnrichArtistLinksSummary> => {
  const now = options.now || new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const recheckBefore = daysAgo(options.recheckDays ?? 90);
  const matchedRecheckBefore = daysAgo(options.matchedRecheckDays ?? 180);
  const summary: EnrichArtistLinksSummary = {
    checked: 0,
    refreshed: 0,
    skipped: 0,
    matched: 0,
    fromAgendas: 0,
    linksAdded: 0,
    errors: 0,
  };

  await fillFromAgendas(supabase, options, logger, summary);

  const { data, error } = await supabase
    .from('artists')
    .select('id,name,external_ids,external_links')
    .or(
      [
        'external_ids->>links_checked_at.is.null',
        `and(external_ids->>musicbrainz.is.null,external_ids->>links_checked_at.lt.${recheckBefore})`,
        `and(external_ids->>musicbrainz.not.is.null,external_ids->>links_checked_at.lt.${matchedRecheckBefore})`,
      ].join(','),
    )
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 200);
  if (error) throw error;

  for (const artist of (data || []) as ArtistRow[]) {
    const externalIds = { ...(artist.external_ids || {}) };
    const deezerId = (externalIds.deezer as string | number | undefined) ?? null;
    const knownMbid = typeof externalIds.musicbrainz === 'string' ? externalIds.musicbrainz : null;
    const current = { ...(artist.external_links || {}) };
    let added: ArtistLinkKey[] = [];

    // Names that are still event titles or bills, and artists with nothing
    // left to fill, cost no request.
    const cleanup = cleanArtistName(artist.name);
    const cleanName = cleanup.names.length === 1 && cleanup.names[0] === artist.name;
    const complete = LINK_KEYS.every((key) => current[key]);

    try {
      if (!cleanName || complete) {
        summary.skipped += 1;
      } else if (knownMbid) {
        summary.refreshed += 1;
        const links = await musicBrainz.linksForMbid(knownMbid);
        added = (Object.keys(links) as ArtistLinkKey[]).filter((key) => !current[key]);
        for (const key of added) current[key] = links[key] as string;
        summary.linksAdded += added.length;
        if (added.length) logger.info('Artist links refreshed', { artistId: artist.id, artist: artist.name, added });
      } else {
        summary.checked += 1;
        const match = await musicBrainz.findLinks(artist.name, deezerId);
        if (match) {
          summary.matched += 1;
          externalIds.musicbrainz = match.mbid;
          added = (Object.keys(match.links) as ArtistLinkKey[]).filter((key) => !current[key]);
          for (const key of added) current[key] = match.links[key] as string;
          summary.linksAdded += added.length;
          logger.info('Artist links from MusicBrainz', {
            artistId: artist.id,
            artist: artist.name,
            mbid: match.mbid,
            evidence: match.evidence,
            added,
          });
        }
      }
    } catch (lookupError) {
      summary.errors += 1;
      logger.warn('MusicBrainz lookup failed', { artistId: artist.id, error: String(lookupError) });
      continue;
    }

    if (options.dryRun) continue;
    externalIds.links_checked_at = now.toISOString();
    const update: Record<string, unknown> = { external_ids: externalIds };
    if (added.length) update.external_links = current;
    const { error: updateError } = await supabase.from('artists').update(update).eq('id', artist.id);
    if (updateError) throw updateError;
  }

  logger.info('Artist links enrichment finished', { ...summary, dryRun: Boolean(options.dryRun) });
  return summary;
};

const LINK_KEYS: ArtistLinkKey[] = ['spotify', 'apple_music', 'instagram', 'youtube', 'tiktok', 'bandcamp', 'website'];

const PAGE_SIZE = 500;

// Links found on the venues' own concert pages, for every artist whose name
// matches exactly. Cheap (no requests), so it runs over all artists each time.
const fillFromAgendas = async (
  supabase: SupabaseClient,
  options: EnrichArtistLinksOptions,
  logger: Logger,
  summary: EnrichArtistLinksSummary,
) => {
  const payloads: Array<Record<string, unknown>> = [];
  for (let from = 0; from < (options.stagingRows ?? 20_000); from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('staging_events')
      .select('raw_payload')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data || []) as Array<{ raw_payload: Record<string, unknown> | null }>;
    for (const row of rows) if (row.raw_payload) payloads.push(row.raw_payload);
    if (rows.length < PAGE_SIZE) break;
  }
  const found = linksFromStaging(payloads);
  if (!found.size) return;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('artists')
      .select('id,name,external_links')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data || []) as Array<Pick<ArtistRow, 'id' | 'name' | 'external_links'>>;
    for (const artist of rows) {
      const links: ArtistLinks | undefined = found.get(deezerMatchKey(artist.name));
      if (!links) continue;
      const current = { ...(artist.external_links || {}) };
      const added = (Object.keys(links) as ArtistLinkKey[]).filter((key) => !current[key]);
      if (!added.length) continue;
      for (const key of added) current[key] = links[key] as string;
      summary.fromAgendas += 1;
      summary.linksAdded += added.length;
      logger.info('Artist links from venue agendas', { artistId: artist.id, artist: artist.name, added });
      if (options.dryRun) continue;
      const { error: updateError } = await supabase.from('artists').update({ external_links: current }).eq('id', artist.id);
      if (updateError) throw updateError;
    }
    if (rows.length < PAGE_SIZE) break;
  }
};
