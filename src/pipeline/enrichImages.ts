import type { SupabaseClient } from '@supabase/supabase-js';

import { cleanArtistName } from '../normalize/cleanArtistName.js';
import { extractImageUrl, imageFromSchema, toHttpUrl } from '../normalize/extractImage.js';
import { Logger } from '../utils/logger.js';
import { DeezerClient } from './deezerArtists.js';

// Fills editorial images. Idempotent: it only writes rows whose image_url is
// still null, so a second run, a newer scrape or a manual image is never
// overwritten.

export type EnrichImagesOptions = {
  dryRun?: boolean;
  events?: boolean;
  artists?: boolean;
  // Upcoming events still without a poster after the staging backfill get
  // their page's og:image, one request per second.
  pageFetchLimit?: number;
  artistLimit?: number;
  artistRecheckDays?: number;
  now?: Date;
};

export type EnrichImagesSummary = {
  stagingRowsScanned: number;
  eventsFromStaging: number;
  eventsFromPages: number;
  pagesFetched: number;
  artistsChecked: number;
  artistsMatched: number;
  artistErrors: number;
};

const PAGE_SIZE = 500;
const USER_AGENT = 'LiveSpaceBot/1.0 (+https://github.com/jesusvaros/live_space)';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type StagingImageRow = { published_event_id: string | null; raw_payload: unknown; created_at: string };

// Newest staging row first, so a venue that replaced its artwork wins.
const collectStagingPosters = async (
  supabase: SupabaseClient,
): Promise<{ posters: Map<string, string>; scanned: number }> => {
  const posters = new Map<string, string>();
  let scanned = 0;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('staging_events')
      .select('published_event_id,raw_payload,created_at')
      .not('published_event_id', 'is', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data || []) as StagingImageRow[];
    scanned += rows.length;
    for (const row of rows) {
      if (!row.published_event_id || posters.has(row.published_event_id)) continue;
      const image = extractImageUrl(row.raw_payload);
      if (image) posters.set(row.published_event_id, image);
    }
    if (rows.length < PAGE_SIZE) return { posters, scanned };
  }
};

const fetchEventsWithoutImage = async (
  supabase: SupabaseClient,
  fromIso?: string,
): Promise<Array<{ id: string; name: string; source_url: string | null }>> => {
  const events: Array<{ id: string; name: string; source_url: string | null }> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('events')
      .select('id,name,source_url')
      .is('image_url', null)
      .eq('status', 'published')
      .order('starts_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (fromIso) query = query.gte('starts_at', fromIso);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data || []) as typeof events;
    events.push(...page);
    if (page.length < PAGE_SIZE) return events;
  }
};

const setEventImage = async (supabase: SupabaseClient, eventId: string, imageUrl: string) => {
  const { error } = await supabase
    .from('events')
    .update({ image_url: imageUrl, image_source: 'source' })
    .eq('id', eventId)
    .is('image_url', null);
  if (error) throw error;
};

const META_IMAGE_RES = [
  /<meta[^>]+(?:property|name)=["']og:image(?::secure_url|:url)?["'][^>]*content=["']([^"']+)/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::secure_url|:url)?["']/i,
  /<meta[^>]+(?:property|name)=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)/i,
];

const decodeEntities = (value: string): string =>
  value.replace(/&amp;/g, '&').replace(/&#0*38;/g, '&').replace(/&quot;/g, '"').replace(/&#x2F;/gi, '/');

export const imageFromHtml = (html: string, pageUrl: string): string | null => {
  for (const pattern of META_IMAGE_RES) {
    const match = html.match(pattern);
    const url = match ? toHttpUrl(decodeEntities(match[1]), pageUrl) : null;
    if (url) return url;
  }
  for (const block of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(block[1]) as unknown;
      const records = (Array.isArray(parsed) ? parsed : [parsed]) as Array<Record<string, unknown>>;
      for (const record of records.flatMap((item) => [item, ...((item?.['@graph'] as Array<Record<string, unknown>>) || [])])) {
        const type = String(record?.['@type'] || '');
        if (!/Event/.test(type)) continue;
        const url = imageFromSchema(record.image, pageUrl);
        if (url) return url;
      }
    } catch {
      // Malformed JSON-LD is common; meta tags were already tried.
    }
  }
  return null;
};

const hostLastRequest = new Map<string, number>();

const fetchPageImage = async (pageUrl: string): Promise<string | null> => {
  const host = new URL(pageUrl).host;
  const wait = (hostLastRequest.get(host) || 0) + 1_000 - Date.now();
  if (wait > 0) await sleep(wait);
  hostLastRequest.set(host, Date.now());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(pageUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html', 'Accept-Language': 'es,en;q=0.8' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return imageFromHtml((await response.text()).slice(0, 1_500_000), response.url || pageUrl);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export const enrichEventPosters = async (
  supabase: SupabaseClient,
  logger: Logger,
  options: EnrichImagesOptions,
  summary: EnrichImagesSummary,
) => {
  const { posters, scanned } = await collectStagingPosters(supabase);
  summary.stagingRowsScanned = scanned;

  const missing = await fetchEventsWithoutImage(supabase);
  for (const event of missing) {
    const poster = posters.get(event.id);
    if (!poster) continue;
    summary.eventsFromStaging += 1;
    logger.info('Event poster from staging', { eventId: event.id, event: event.name, poster });
    if (!options.dryRun) await setEventImage(supabase, event.id, poster);
  }

  const limit = options.pageFetchLimit ?? 0;
  if (limit <= 0) return;
  const now = (options.now || new Date()).toISOString();
  const upcoming = (await fetchEventsWithoutImage(supabase, now)).filter(
    (event) => event.source_url && !posters.has(event.id),
  );
  for (const event of upcoming.slice(0, limit)) {
    summary.pagesFetched += 1;
    const poster = await fetchPageImage(event.source_url as string);
    if (!poster) continue;
    summary.eventsFromPages += 1;
    logger.info('Event poster from page', { eventId: event.id, event: event.name, poster });
    if (!options.dryRun) await setEventImage(supabase, event.id, poster);
  }
};

type ArtistImageRow = { id: string; name: string; external_ids: Record<string, unknown> | null };

export const enrichArtistPhotos = async (
  supabase: SupabaseClient,
  logger: Logger,
  options: EnrichImagesOptions,
  summary: EnrichImagesSummary,
  deezer = new DeezerClient(),
) => {
  const now = options.now || new Date();
  const recheckBefore = new Date(now.getTime() - (options.artistRecheckDays ?? 30) * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('artists')
    .select('id,name,external_ids')
    .is('image_url', null)
    .or(`image_checked_at.is.null,image_checked_at.lt.${recheckBefore}`)
    .order('image_checked_at', { ascending: true, nullsFirst: true })
    .limit(options.artistLimit ?? 400);
  if (error) throw error;

  for (const artist of (data || []) as ArtistImageRow[]) {
    summary.artistsChecked += 1;
    // Rows whose name is still an event title ("Morat - YEM World Tour") or
    // a bill are not searched: the cleanup script fixes the name first.
    const cleanup = cleanArtistName(artist.name);
    const searchName = cleanup.names.length === 1 && cleanup.names[0] === artist.name ? artist.name : null;

    let update: Record<string, unknown> = { image_checked_at: now.toISOString() };
    if (searchName) {
      try {
        const match = await deezer.findArtist(searchName);
        if (match) {
          summary.artistsMatched += 1;
          update = {
            ...update,
            image_url: match.artist.picture_xl,
            image_source: 'deezer',
            external_ids: { ...(artist.external_ids || {}), deezer: match.artist.id },
          };
          logger.info('Artist photo from Deezer', {
            artistId: artist.id,
            artist: artist.name,
            deezerName: match.artist.name,
            matchedName: match.matchedName,
            fans: match.artist.nb_fan,
          });
        }
      } catch (lookupError) {
        summary.artistErrors += 1;
        logger.warn('Deezer lookup failed', { artistId: artist.id, error: String(lookupError) });
        continue;
      }
    }

    if (options.dryRun) continue;
    const { error: updateError } = await supabase
      .from('artists')
      .update(update)
      .eq('id', artist.id)
      .is('image_url', null);
    if (updateError) throw updateError;
  }
};

export const enrichImages = async (
  supabase: SupabaseClient,
  options: EnrichImagesOptions = {},
  logger = new Logger('info'),
): Promise<EnrichImagesSummary> => {
  const summary: EnrichImagesSummary = {
    stagingRowsScanned: 0,
    eventsFromStaging: 0,
    eventsFromPages: 0,
    pagesFetched: 0,
    artistsChecked: 0,
    artistsMatched: 0,
    artistErrors: 0,
  };
  const log = logger.child({ pipeline: 'enrichImages', dryRun: Boolean(options.dryRun) });
  if (options.events !== false) await enrichEventPosters(supabase, log, options, summary);
  if (options.artists !== false) await enrichArtistPhotos(supabase, log, options, summary);
  log.info('Image enrichment finished', summary);
  return summary;
};
