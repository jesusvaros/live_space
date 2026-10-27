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
  venues?: boolean;
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
  artistsFromPosters: number;
  venuesChecked: number;
  venuesMatched: number;
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
    // A poster fallback is still upgraded to a real photo when Deezer has one.
    .or('image_url.is.null,image_source.eq.poster')
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
      .or('image_url.is.null,image_source.eq.poster');
    if (updateError) throw updateError;
  }
};

type HeadlinerRow = {
  event_id: string;
  artist_id: string;
  is_headliner: boolean;
  event: { image_url: string | null; image_source: string | null; starts_at: string } | null;
};

// Local bands are rarely on Deezer, but the venue's poster of a night they
// headline (or play alone) usually shows them. Never from a shared bill as
// support act, and never over any other image.
export const enrichArtistsFromPosters = async (
  supabase: SupabaseClient,
  logger: Logger,
  options: EnrichImagesOptions,
  summary: EnrichImagesSummary,
) => {
  const { data: artists, error } = await supabase
    .from('artists')
    .select('id,name')
    .is('image_url', null)
    .limit(1000);
  if (error) throw error;
  const names = new Map(((artists || []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));

  for (let start = 0; start < names.size; start += 100) {
    const ids = [...names.keys()].slice(start, start + 100);
    const { data: bills, error: billsError } = await supabase
      .from('event_artists')
      .select('event_id,artist_id,is_headliner,event:events!inner(image_url,image_source,starts_at)')
      .in('artist_id', ids)
      .eq('events.image_source', 'source')
      .not('events.image_url', 'is', null);
    if (billsError) throw billsError;
    const rows = (bills || []) as unknown as HeadlinerRow[];
    if (rows.length === 0) continue;

    const { data: lineups, error: lineupsError } = await supabase
      .from('event_artists')
      .select('event_id')
      .in('event_id', [...new Set(rows.map((row) => row.event_id))]);
    if (lineupsError) throw lineupsError;
    const billSize = new Map<string, number>();
    for (const row of (lineups || []) as Array<{ event_id: string }>) {
      billSize.set(row.event_id, (billSize.get(row.event_id) || 0) + 1);
    }

    const latest = new Map<string, HeadlinerRow>();
    for (const row of rows) {
      if (!row.event?.image_url) continue;
      if (!row.is_headliner && billSize.get(row.event_id) !== 1) continue;
      const current = latest.get(row.artist_id);
      if (!current || row.event.starts_at > (current.event?.starts_at || '')) latest.set(row.artist_id, row);
    }

    for (const [artistId, row] of latest) {
      summary.artistsFromPosters += 1;
      logger.info('Artist photo from poster', { artistId, artist: names.get(artistId), eventId: row.event_id });
      if (options.dryRun) continue;
      const { error: updateError } = await supabase
        .from('artists')
        .update({ image_url: row.event?.image_url, image_source: 'poster' })
        .eq('id', artistId)
        .is('image_url', null);
      if (updateError) throw updateError;
    }
  }
};

// Logos and icons make poor covers; the GeneratedPoster looks better. Venue
// sites ship their logo or a single gig's poster as PNG and their photos as
// JPEG/WebP, and social CDN links expire within days.
const LOGO_LIKE = /logo|favicon|icon|sprite|placeholder|cropped-/i;
const POOR_VENUE_COVER = (image: string) => {
  const url = new URL(image);
  return (
    LOGO_LIKE.test(url.pathname) ||
    /\.(png|svg|gif)$/i.test(url.pathname) ||
    /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i.test(url.hostname)
  );
};

// Venue cover from the og:image of the venue's own website.
export const enrichVenuePhotos = async (
  supabase: SupabaseClient,
  logger: Logger,
  options: EnrichImagesOptions,
  summary: EnrichImagesSummary,
) => {
  const { data, error } = await supabase
    .from('venue_places')
    .select('id,name,website_url')
    .is('image_url', null)
    .not('website_url', 'is', null)
    .limit(200);
  if (error) throw error;

  for (const venue of (data || []) as Array<{ id: string; name: string; website_url: string }>) {
    let url: URL;
    try {
      url = new URL(venue.website_url);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    summary.venuesChecked += 1;
    const image = await fetchPageImage(url.toString());
    if (!image || POOR_VENUE_COVER(image)) continue;
    summary.venuesMatched += 1;
    logger.info('Venue photo from website', { venueId: venue.id, venue: venue.name, image });
    if (options.dryRun) continue;
    const { error: updateError } = await supabase
      .from('venue_places')
      .update({ image_url: image, image_source: 'source' })
      .eq('id', venue.id)
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
    artistsFromPosters: 0,
    venuesChecked: 0,
    venuesMatched: 0,
  };
  const log = logger.child({ pipeline: 'enrichImages', dryRun: Boolean(options.dryRun) });
  if (options.events !== false) await enrichEventPosters(supabase, log, options, summary);
  if (options.artists !== false) {
    await enrichArtistPhotos(supabase, log, options, summary);
    // After Deezer, so a real photo always wins over a poster.
    await enrichArtistsFromPosters(supabase, log, options, summary);
  }
  if (options.venues !== false) await enrichVenuePhotos(supabase, log, options, summary);
  log.info('Image enrichment finished', summary);
  return summary;
};
