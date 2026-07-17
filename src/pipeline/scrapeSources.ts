import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { fetchSource } from '../scraping/fetchSource.js';
import type { RawScrapedEvent, ScrapeSource } from '../types/scrape.js';
import { Logger } from '../utils/logger.js';
import { runWithConcurrency } from '../utils/promisePool.js';

export type ScrapeSourcesSummary = {
  sourceCount: number;
  runCount: number;
  rawEventCount: number;
  errorCount: number;
};

const buildStagingRow = (source: ScrapeSource, scrapeRunId: string, event: RawScrapedEvent) => ({
  scrape_run_id: scrapeRunId,
  source_id: source.id,
  raw_payload: event.rawPayload,
  source_event_url: event.sourceEventUrl || null,
  source_event_id: event.sourceEventId || null,
  extracted_title: event.title || null,
  extracted_description: event.description || null,
  extracted_date_text: event.dateText || null,
  extracted_starts_at: event.startsAt || null,
  extracted_venue_name: event.venueName || null,
  extracted_city: event.city || null,
  extracted_artist_names: event.artistNames || [],
});

export const scrapeSources = async (logger = new Logger(env.logLevel)): Promise<ScrapeSourcesSummary> => {
  const supabase = getSupabaseAdmin();
  const rootLogger = logger.child({ pipeline: 'scrapeSources' });

  const { data: sources, error } = await supabase
    .from('scrape_sources')
    .select('*')
    .eq('is_active', true)
    .order('source_name', { ascending: true });

  if (error) {
    throw error;
  }

  const activeSources = (sources || []) as ScrapeSource[];
  rootLogger.info('Loaded active scrape sources', { sourceCount: activeSources.length });

  let rawEventCount = 0;
  let errorCount = 0;

  await runWithConcurrency(activeSources, env.scraperConcurrency, async (source) => {
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
      sourceUrl: source.source_url,
      parserKey: source.parser_key,
      scrapeRunId: scrapeRun.id,
    });

    try {
      const items = await fetchSource(source, sourceLogger);
      rawEventCount += items.length;

      if (items.length > 0) {
        const rows = items.map((event) => buildStagingRow(source, scrapeRun.id, event));
        const { error: stagingError } = await supabase.from('staging_events').insert(rows);
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
    sourceCount: activeSources.length,
    runCount: activeSources.length,
    rawEventCount,
    errorCount,
  };
};
