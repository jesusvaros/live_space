// Ticket links sent from «¿No encuentras un concierto?» → staging_events
// (docs/scraping.md, "Sugerencias de usuarios"). Run by the daily scrape
// workflow after the scrape itself:
//
//   1. reconcile: suggestions already staged learn what the normal pipeline
//      decided (published → 'imported' or 'duplicate', rejected → 'failed',
//      still in human review → 'review').
//   2. import: up to `limit` pending links (each at most MAX_ATTEMPTS times)
//      are fetched (safeFetch: public addresses only), read with
//      eventLinkExtract (JSON-LD, no AI) and staged under one of the two
//      user-suggestion sources. Links already in the catalogue are
//      'duplicate' without staging anything.
//   3. process + reconcile again, so a concert published today notifies
//      today. Only when AI normalization is off: this path never calls it.
//
// The push «Ya está» is sent by the notifications sender
// (suggestion_imported), not here.

import type { SupabaseClient } from '@supabase/supabase-js';

import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import type { RawScrapedEvent, ScrapeSource } from '../types/scrape.js';
import { Logger } from '../utils/logger.js';
import { runWithConcurrency } from '../utils/promisePool.js';
import { extractEventFromHtml, type ExtractedEvent, type ExtractionResult } from './eventLinkExtract.js';
import { processPendingStaging } from './processStaging.js';
import { safeFetchHtml, type SafeFetchResult } from './safeFetch.js';
import { buildStagingRow } from './scrapeSources.js';

export const MAX_ATTEMPTS = 3;
export const DEFAULT_LIMIT = 50;

export type SuggestionStatus = 'pending' | 'imported' | 'duplicate' | 'review' | 'failed';

export type SuggestionRow = {
  id: string;
  url: string;
  url_host: string;
  suggested_by: string;
  status: SuggestionStatus;
  attempts: number;
  staging_event_id: string | null;
  result_event_id: string | null;
  error: string | null;
  created_at: string;
};

const SUGGESTION_SELECT = 'id,url,url_host,suggested_by,status,attempts,staging_event_id,result_event_id,error,created_at';

// Ticket sellers whose event pages publish the organiser's own schema.org
// data. A complete event from one of them (or from the website of a source
// we already scrape) is staged under the trusted source and may publish
// without a person; anything else waits for review.
export const TRUSTED_TICKET_HOSTS = [
  'dice.fm',
  'entradium.com',
  'wegow.com',
  'ticketmaster.es',
  'livenation.es',
  'seetickets.com',
  'entradas.com',
  'eventbrite.es',
  'eventbrite.com',
  'tomaticket.es',
  'giglon.com',
  'ataquilla.com',
  'enterticket.es',
  'compralaentrada.com',
  'notikumi.com',
  'mutick.com',
  'redentradas.com',
  'taquilla.com',
  'generaltickets.com',
  'proticketing.com',
  'ticketib.com',
  'codetickets.com',
  'universe.com',
  'feverup.com',
  'bclever.tv',
  'elcorteingles.es',
];

export type KnownHost = {
  trusted: boolean;
  /** The venue of a single-venue source on that site (fallback when the page names none). */
  venue: { name: string; city: string | null } | null;
};

export const hostOf = (url: string | null | undefined): string => {
  try {
    return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

const isUserSuggestionSource = (source: Pick<ScrapeSource, 'metadata'>) => source.metadata?.userSuggestions === true;

/** Hosts we know: the ticket sellers above and every scrape source's site. */
export const buildKnownHosts = (sources: ScrapeSource[]): Map<string, KnownHost> => {
  const known = new Map<string, KnownHost>();
  for (const host of TRUSTED_TICKET_HOSTS) known.set(host, { trusted: true, venue: null });

  const venuesByHost = new Map<string, Array<{ name: string; city: string | null }>>();
  for (const source of sources) {
    if (isUserSuggestionSource(source) || source.metadata?.hijackedDomain) continue;
    const official = typeof source.metadata?.officialWebsite === 'string' ? source.metadata.officialWebsite : null;
    for (const host of new Set([hostOf(source.base_url), hostOf(official)].filter(Boolean))) {
      const trusted = source.is_active || source.metadata?.structuredDataVerified === true;
      const current = known.get(host);
      known.set(host, { trusted: Boolean(current?.trusted || trusted), venue: null });
      if (source.source_type === 'venue') {
        venuesByHost.set(host, [...(venuesByHost.get(host) ?? []), { name: source.name, city: source.city }]);
      }
    }
  }
  // Only a site with exactly one venue says which venue a page is at.
  for (const [host, venues] of venuesByHost) {
    const distinct = new Map(venues.map(venue => [venue.name.toLocaleLowerCase('es-ES'), venue]));
    const entry = known.get(host);
    if (entry && distinct.size === 1) entry.venue = [...distinct.values()][0];
  }
  return known;
};

/** 'tickets.dice.fm' matches 'dice.fm'. */
export const knownHostFor = (host: string, known: Map<string, KnownHost>): KnownHost | null => {
  const parts = host.split('.');
  for (let index = 0; index < parts.length - 1; index += 1) {
    const candidate = known.get(parts.slice(index).join('.'));
    if (candidate) return candidate;
  }
  return null;
};

export type SuggestionAction =
  | { action: 'stage'; event: ExtractedEvent }
  | { action: 'review'; error: string }
  | { action: 'failed'; error: string };

/** What to do with an extraction (pure). */
export const decideExtraction = (result: ExtractionResult, now: Date): SuggestionAction => {
  if (result.kind === 'failed') return { action: 'failed', error: result.reason };
  if (result.kind === 'review') {
    const title = result.partial?.title ?? result.openGraph.title;
    return { action: 'review', error: title ? `${result.reason} · ${title}`.slice(0, 1000) : result.reason };
  }
  if (new Date(result.event.startsAt).getTime() < now.getTime()) return { action: 'failed', error: 'past-event' };
  return { action: 'stage', event: result.event };
};

/** The staging row's input, in the shape every parser produces. */
export const toRawScrapedEvent = (event: ExtractedEvent, fetchedUrl: string): RawScrapedEvent => ({
  sourceUrl: fetchedUrl,
  sourceEventUrl: event.url,
  // The canonical page is the identity: the same link sent twice (or by two
  // people) is one staging row and one event.
  sourceEventId: event.url,
  title: event.title,
  description: event.description,
  dateText: event.startsAt,
  startsAt: event.startsAt,
  venueName: event.venueName,
  city: event.city,
  artistNames: event.artistNames,
  imageUrl: event.imageUrl,
  // extractOffer reads ticketUrl, prices and a "free" text from here.
  rawPayload: {
    ticketUrl: event.ticketUrl ?? event.url,
    prices: event.prices,
    cost: event.isFree ? 'Entrada libre' : undefined,
    schemaType: event.schemaType,
    venueFromSource: event.venueFromSource,
    streetAddress: event.streetAddress ?? null,
    countryCode: event.countryCode ?? null,
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
    jsonLd: event.record,
  },
});

type StagingState = { id: string; review_status: string; published_event_id: string | null; processing_error: string | null };
type EventState = { id: string; status: string; created_at: string };

export type Reconciled = { status: SuggestionStatus; resultEventId: string | null; error: string | null } | null;

/**
 * What the pipeline decided for a staged suggestion (pure). Published → it is
 * 'imported' when the event was created for it, 'duplicate' when the pipeline
 * matched an event that already existed. null = no change yet.
 */
export const reconcileStatus = (
  suggestion: Pick<SuggestionRow, 'created_at'>,
  staging: StagingState | undefined,
  event: EventState | undefined,
): Reconciled => {
  if (!staging) return null;
  if (staging.published_event_id) {
    if (!event || event.status !== 'published') return null;
    const createdForIt = new Date(event.created_at).getTime() >= new Date(suggestion.created_at).getTime();
    return { status: createdForIt ? 'imported' : 'duplicate', resultEventId: event.id, error: null };
  }
  if (staging.review_status === 'rejected') {
    return { status: 'failed', resultEventId: null, error: 'rejected-by-pipeline (past, non-music, no artist or low confidence)' };
  }
  if (staging.review_status === 'merged') return { status: 'duplicate', resultEventId: null, error: 'merged-into-existing' };
  if (staging.processing_error) return { status: 'review', resultEventId: null, error: staging.processing_error.slice(0, 1000) };
  return null;
};

// --- Runner ------------------------------------------------------------------

export type ImportSuggestionsOptions = {
  apply: boolean;
  limit?: number;
  now?: Date;
  logger?: Logger;
  supabase?: SupabaseClient;
  fetchPage?: (url: string) => Promise<SafeFetchResult>;
  /** Run the staging pipeline after staging (default: yes, when applying). */
  processStaging?: boolean;
};

export type ImportSuggestionsSummary = {
  pending: number;
  urls: number;
  staged: number;
  review: number;
  failed: number;
  duplicate: number;
  retry: number;
  reconciled: Record<string, number>;
};

const isMissingTable = (error: { code?: string } | null) => error?.code === '42P01' || error?.code === 'PGRST205';

const chunks = <T>(items: T[], size = 100) => {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
};

const findEventByLink = async (supabase: SupabaseClient, links: string[]): Promise<string | null> => {
  for (const link of new Set(links.filter(Boolean))) {
    for (const column of ['source_url', 'ticket_url']) {
      const { data, error } = await supabase
        .from('events')
        .select('id')
        .eq(column, link)
        .eq('status', 'published')
        .limit(1);
      if (error) throw error;
      const row = (data ?? [])[0] as { id?: string } | undefined;
      if (row?.id) return row.id;
    }
  }
  return null;
};

export const importEventSuggestions = async (options: ImportSuggestionsOptions): Promise<ImportSuggestionsSummary> => {
  const { apply, limit = DEFAULT_LIMIT, now = new Date(), fetchPage = url => safeFetchHtml(url) } = options;
  const logger = (options.logger ?? new Logger(env.logLevel)).child({ pipeline: 'importEventSuggestions', apply });
  const supabase = options.supabase ?? getSupabaseAdmin();
  const summary: ImportSuggestionsSummary = {
    pending: 0,
    urls: 0,
    staged: 0,
    review: 0,
    failed: 0,
    duplicate: 0,
    retry: 0,
    reconciled: {},
  };

  const { data: sourceRows, error: sourcesError } = await supabase.from('scrape_sources').select('*');
  if (sourcesError) throw sourcesError;
  const sources = (sourceRows ?? []) as ScrapeSource[];
  const trustedSource = sources.find(source => isUserSuggestionSource(source) && source.metadata.structuredDataVerified === true);
  const reviewSource = sources.find(source => isUserSuggestionSource(source) && source.metadata.structuredDataVerified !== true);
  if (!trustedSource || !reviewSource) {
    logger.warn('User-suggestion sources missing (migration 20261112000100 not applied); nothing to do');
    return summary;
  }
  const known = buildKnownHosts(sources);

  const update = async (ids: string[], patch: Record<string, unknown>) => {
    if (!apply || ids.length === 0) return;
    const { error } = await supabase.from('event_link_suggestions').update(patch).in('id', ids);
    if (error) throw error;
  };

  // 1. Reconcile what is already staged.
  const reconcile = async () => {
    const { data, error } = await supabase
      .from('event_link_suggestions')
      .select(SUGGESTION_SELECT)
      .eq('status', 'review')
      .not('staging_event_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1000);
    if (error) throw error;
    const rows = (data ?? []) as SuggestionRow[];
    if (rows.length === 0) return;

    const staging = new Map<string, StagingState>();
    for (const chunk of chunks([...new Set(rows.map(row => row.staging_event_id as string))])) {
      const { data: stagingRows, error: stagingError } = await supabase
        .from('staging_events')
        .select('id,review_status,published_event_id,processing_error')
        .in('id', chunk);
      if (stagingError) throw stagingError;
      for (const row of (stagingRows ?? []) as StagingState[]) staging.set(row.id, row);
    }
    const eventIds = [...new Set([...staging.values()].map(row => row.published_event_id).filter(Boolean) as string[])];
    const events = new Map<string, EventState>();
    for (const chunk of chunks(eventIds)) {
      const { data: eventRows, error: eventsError } = await supabase.from('events').select('id,status,created_at').in('id', chunk);
      if (eventsError) throw eventsError;
      for (const row of (eventRows ?? []) as EventState[]) events.set(row.id, row);
    }

    for (const row of rows) {
      const stagingRow = staging.get(row.staging_event_id as string);
      const next = reconcileStatus(row, stagingRow, stagingRow?.published_event_id ? events.get(stagingRow.published_event_id) : undefined);
      if (!next || (next.status === row.status && next.error === row.error)) continue;
      summary.reconciled[next.status] = (summary.reconciled[next.status] ?? 0) + 1;
      logger.info('Suggestion reconciled', { suggestionId: row.id, url: row.url, status: next.status, eventId: next.resultEventId });
      await update([row.id], {
        status: next.status,
        result_event_id: next.resultEventId,
        error: next.error,
        processed_at: now.toISOString(),
      });
    }
  };

  const { data: pendingData, error: pendingError } = await supabase
    .from('event_link_suggestions')
    .select(SUGGESTION_SELECT)
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 500)));
  if (pendingError) {
    if (isMissingTable(pendingError)) {
      logger.warn('event_link_suggestions does not exist yet (migration 20261112000100 not applied); nothing to do');
      return summary;
    }
    throw pendingError;
  }

  await reconcile();

  const pending = (pendingData ?? []) as SuggestionRow[];
  summary.pending = pending.length;
  const byUrl = new Map<string, SuggestionRow[]>();
  for (const row of pending) byUrl.set(row.url, [...(byUrl.get(row.url) ?? []), row]);
  summary.urls = byUrl.size;

  const runs = new Map<string, Promise<string>>();
  const runFor = (source: ScrapeSource) => {
    let run = runs.get(source.id);
    if (!run) {
      run = (async () => {
        const { data, error } = await supabase.from('scrape_runs').insert({ source_id: source.id, status: 'running' }).select('id').single();
        if (error || !data) throw error || new Error('Could not create the scrape run');
        return (data as { id: string }).id;
      })();
      runs.set(source.id, run);
    }
    return run;
  };
  const stagedPerRun = new Map<string, number>();

  // Polite: one request per host at a time, a second apart.
  const lastRequest = new Map<string, number>();
  const politeFetch = async (url: string) => {
    const host = hostOf(url);
    const wait = (lastRequest.get(host) ?? 0) + 1_000 - Date.now();
    lastRequest.set(host, Date.now() + Math.max(0, wait));
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    return fetchPage(url);
  };

  await runWithConcurrency([...byUrl.entries()], 3, async ([url, rows]) => {
    const ids = rows.map(row => row.id);
    const attempts = Math.max(...rows.map(row => row.attempts)) + 1;
    const itemLogger = logger.child({ url, suggestions: ids.length });
    const finish = async (status: SuggestionStatus, patch: Record<string, unknown> = {}) => {
      await update(ids, { status, attempts, processed_at: now.toISOString(), ...patch });
    };

    try {
      const existing = await findEventByLink(supabase, [url]);
      if (existing) {
        summary.duplicate += 1;
        itemLogger.info('Already in the catalogue', { eventId: existing });
        await finish('duplicate', { result_event_id: existing, error: null });
        return;
      }

      const page = await politeFetch(url);
      if (!page.ok) {
        const giveUp = page.permanent || attempts >= MAX_ATTEMPTS;
        itemLogger.info('Fetch failed', { error: page.error, status: page.status, giveUp });
        if (giveUp) {
          summary.failed += 1;
          await finish('failed', { error: page.error });
        } else {
          summary.retry += 1;
          await update(ids, { attempts, error: page.error, processed_at: now.toISOString() });
        }
        return;
      }

      const knownHost = knownHostFor(hostOf(page.url), known);
      const extraction = extractEventFromHtml(page.html, page.url, { venueFallback: knownHost?.venue ?? null });
      const decision = decideExtraction(extraction, now);
      if (decision.action !== 'stage') {
        summary[decision.action] += 1;
        itemLogger.info('Not staged', { status: decision.action, reason: decision.error });
        await finish(decision.action, { error: decision.error });
        return;
      }

      const event = decision.event;
      const canonicalMatch = await findEventByLink(supabase, [event.url, page.url, event.ticketUrl ?? ''].filter(link => link !== url));
      if (canonicalMatch) {
        summary.duplicate += 1;
        itemLogger.info('Already in the catalogue (canonical link)', { eventId: canonicalMatch });
        await finish('duplicate', { result_event_id: canonicalMatch, error: null });
        return;
      }

      const source = knownHost?.trusted ? trustedSource : reviewSource;
      summary.staged += 1;
      itemLogger.info('Staging', {
        source: source.name,
        title: event.title,
        startsAt: event.startsAt,
        venue: event.venueName,
        city: event.city,
        artists: event.artistNames,
      });
      if (!apply) return;

      const runId = await runFor(source);
      const row = buildStagingRow(source, runId, toRawScrapedEvent(event, page.url));
      const { error: stagingError } = await supabase.from('staging_events').upsert(row, {
        onConflict: 'source_id,raw_hash',
        ignoreDuplicates: true,
      });
      if (stagingError) throw stagingError;
      const { data: stagingRow, error: readError } = await supabase
        .from('staging_events')
        .select('id')
        .eq('source_id', source.id)
        .eq('raw_hash', row.raw_hash)
        .single();
      if (readError || !stagingRow) throw readError || new Error('Staged row not found');
      stagedPerRun.set(runId, (stagedPerRun.get(runId) ?? 0) + 1);
      await finish('review', { staging_event_id: (stagingRow as { id: string }).id, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
      itemLogger.error('Suggestion failed', error);
      const giveUp = attempts >= MAX_ATTEMPTS;
      if (giveUp) summary.failed += 1;
      else summary.retry += 1;
      await update(ids, {
        attempts,
        error: message.slice(0, 1000),
        processed_at: now.toISOString(),
        ...(giveUp ? { status: 'failed' } : {}),
      }).catch(updateError => itemLogger.error('Could not record the failure', updateError));
    }
  });

  for (const [sourceId, runPromise] of runs) {
    const runId = await runPromise.catch(() => null);
    if (!runId) continue;
    const { error } = await supabase
      .from('scrape_runs')
      .update({ status: 'success', raw_count: stagedPerRun.get(runId) ?? 0, finished_at: new Date().toISOString() })
      .eq('id', runId);
    if (error) logger.warn('Could not close the scrape run', { sourceId, code: error.code });
  }

  if (apply && summary.staged > 0 && options.processStaging !== false) {
    if (env.enableAiNormalization) {
      // This path promises zero AI calls; the daily scrape will process the
      // rows with whatever it is configured to do.
      logger.warn('ENABLE_AI_NORMALIZATION is on: staged rows are left for the next scrape run');
    } else {
      const processed = await processPendingStaging(logger);
      logger.info('Staging processed', processed);
      await reconcile();
    }
  }

  logger.info('Event link suggestions done', summary);
  return summary;
};
