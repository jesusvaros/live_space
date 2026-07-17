import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { fetchSource } from '../scraping/fetchSource.js';
import type { RawScrapedEvent, ScrapeSource } from '../types/scrape.js';
import { createDeterministicHash } from '../utils/hash.js';
import { Logger } from '../utils/logger.js';
import { runWithConcurrency } from '../utils/promisePool.js';

export type ScrapeSourcesSummary = {
  sourceCount: number;
  runCount: number;
  rawEventCount: number;
  errorCount: number;
};

export const buildStagingRow = (
  source: ScrapeSource,
  scrapeRunId: string,
  event: RawScrapedEvent,
) => {
  const sourceUrl = event.sourceEventUrl || event.sourceUrl || source.base_url;
  const rawPayload = {
    sourceUrl: event.sourceUrl,
    sourceEventUrl: event.sourceEventUrl || null,
    sourceEventId: event.sourceEventId || null,
    title: event.title || null,
    description: event.description || null,
    dateText: event.dateText || null,
    startsAt: event.startsAt || null,
    venueName: event.venueName || null,
    city: event.city || null,
    artistNames: event.artistNames || [],
    payload: event.rawPayload,
  };

  return {
    scrape_run_id: scrapeRunId,
    source_id: source.id,
    source_url: sourceUrl,
    raw_payload: rawPayload,
    raw_hash: createDeterministicHash(rawPayload),
    source_event_id: event.sourceEventId || null,
    extracted_title: event.title || null,
    extracted_date_text: event.dateText || null,
    extracted_starts_at: event.startsAt || null,
    extracted_venue_name: event.venueName || null,
    extracted_city: event.city || null,
    extracted_artist_names: event.artistNames || [],
  };
};

export const scrapeSources = async (logger = new Logger(env.logLevel)): Promise<ScrapeSourcesSummary> => {
  const supabase = getSupabaseAdmin();
  const rootLogger = logger.child({ pipeline: 'scrapeSources' });

  const { data: sources, error } = await supabase
    .from('scrape_sources')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  const activeSources = (sources || []) as ScrapeSource[];
  const allowedCities = new Set(env.cityAllowlist.map((city) => city.toLocaleLowerCase('es-ES')));
  const pilotSources = activeSources.filter((source) => {
    if (allowedCities.size === 0) {
      return true;
    }
    return source.city ? allowedCities.has(source.city.toLocaleLowerCase('es-ES')) : false;
  });
  rootLogger.info('Loaded active scrape sources', {
    sourceCount: pilotSources.length,
    cityAllowlist: env.cityAllowlist,
  });

  let rawEventCount = 0;
  let errorCount = 0;

  await runWithConcurrency(pilotSources, env.scraperConcurrency, async (source) => {
    const { data: scrapeRun, error: scrapeRunError } = await supabase
      .from('scrape_runs')
      .insert({
        source_id: source.id,
        status: 'running',
      })
      .select('id')
      .single();

    if (scrapeRunError || !scrapeRun) {
      throw scrapeRunError || new Error(`Failed to create scrape run for source ${source.id}`);
    }

    const sourceLogger = rootLogger.child({
      sourceId: source.id,
      sourceUrl: source.base_url,
      parserKey: source.parser_key,
      scrapeRunId: scrapeRun.id,
    });

    try {
      const items = await fetchSource(source, sourceLogger);
      rawEventCount += items.length;

      if (items.length > 0) {
        const rows = items.map((event) => buildStagingRow(source, scrapeRun.id, event));
        const { error: stagingError } = await supabase.from('staging_events').upsert(rows, {
          onConflict: 'source_id,raw_hash',
          ignoreDuplicates: true,
        });
        if (stagingError) {
          throw stagingError;
        }
      }

      const { error: finishError } = await supabase
        .from('scrape_runs')
        .update({
          status: 'success',
          raw_count: items.length,
          finished_at: new Date().toISOString(),
        })
        .eq('id', scrapeRun.id);

      if (finishError) {
        throw finishError;
      }

      await supabase
        .from('scrape_sources')
        .update({ last_success_at: new Date().toISOString() })
        .eq('id', source.id);

      sourceLogger.info('Scrape run completed', {
        rawCount: items.length,
      });
    } catch (sourceError) {
      errorCount += 1;
      sourceLogger.error('Scrape run failed', sourceError);
      await supabase
        .from('scrape_runs')
        .update({
          status: 'error',
          error_message: sourceError instanceof Error ? sourceError.message : String(sourceError),
          finished_at: new Date().toISOString(),
        })
        .eq('id', scrapeRun.id);
    }
  });

  return {
    sourceCount: pilotSources.length,
    runCount: pilotSources.length,
    rawEventCount,
    errorCount,
  };
};
