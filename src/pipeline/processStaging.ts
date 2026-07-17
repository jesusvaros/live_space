import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { extractAmbiguousEventWithAi } from '../normalize/aiExtraction.js';
import { mergeAiExtraction, normalizeStagingEvent } from '../normalize/normalizeEvent.js';
import { upsertArtists } from './upsertArtists.js';
import { upsertEvent } from './upsertEvents.js';
import { upsertEventArtists } from './upsertEventArtists.js';
import { upsertVenue } from './upsertVenues.js';
import type { AiExtractionPayload } from '../types/domain.js';
import type { ScrapeSource, StagingEventRecord } from '../types/scrape.js';
import { Logger } from '../utils/logger.js';
import { runWithConcurrency } from '../utils/promisePool.js';

type RunMetrics = {
  normalizedCount: number;
  insertedCount: number;
  updatedCount: number;
};

export type ProcessStagingSummary = {
  pendingCount: number;
  processedCount: number;
  errorCount: number;
};

const STAGING_SELECT =
  'id,scrape_run_id,source_id,raw_payload,source_event_url,source_event_id,extracted_title,extracted_description,extracted_date_text,extracted_starts_at,extracted_venue_name,extracted_city,extracted_artist_names,ai_normalized,normalization_status,processing_error,processed,created_at,updated_at';

const ensureProcessable = (record: StagingEventRecord, source: ScrapeSource) => {
  if (!source) {
    throw new Error(`Missing scrape source ${record.source_id}`);
  }
};

const incrementMetrics = (
  metricsMap: Map<string, RunMetrics>,
  runId: string,
  updates: Partial<RunMetrics>
) => {
  const current = metricsMap.get(runId) || {
    normalizedCount: 0,
    insertedCount: 0,
    updatedCount: 0,
  };

  current.normalizedCount += updates.normalizedCount || 0;
  current.insertedCount += updates.insertedCount || 0;
  current.updatedCount += updates.updatedCount || 0;

  metricsMap.set(runId, current);
};

const updateRunMetrics = async (runId: string, metrics: RunMetrics) => {
  const supabase = getSupabaseAdmin();
  const { data: currentRow, error: readError } = await supabase
    .from('scrape_runs')
    .select('normalized_count,inserted_count,updated_count')
    .eq('id', runId)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  const current = (currentRow || {
    normalized_count: 0,
    inserted_count: 0,
    updated_count: 0,
  }) as {
    normalized_count: number;
    inserted_count: number;
    updated_count: number;
  };

  const { error: updateError } = await supabase
    .from('scrape_runs')
    .update({
      normalized_count: current.normalized_count + metrics.normalizedCount,
      inserted_count: current.inserted_count + metrics.insertedCount,
      updated_count: current.updated_count + metrics.updatedCount,
    })
    .eq('id', runId);

  if (updateError) {
    throw updateError;
  }
};

export const processPendingStaging = async (
  logger = new Logger(env.logLevel)
): Promise<ProcessStagingSummary> => {
  const supabase = getSupabaseAdmin();
  const rootLogger = logger.child({ pipeline: 'processStaging' });

  const { data: stagingRows, error } = await supabase
    .from('staging_events')
    .select(STAGING_SELECT)
    .eq('processed', false)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const pendingRows = (stagingRows || []) as StagingEventRecord[];
  if (pendingRows.length === 0) {
    rootLogger.info('No pending staging rows found');
    return {
      pendingCount: 0,
      processedCount: 0,
      errorCount: 0,
    };
  }

  const sourceIds = Array.from(new Set(pendingRows.map((row) => row.source_id)));
  const { data: sources, error: sourcesError } = await supabase
    .from('scrape_sources')
    .select('*')
    .in('id', sourceIds);

  if (sourcesError) {
    throw sourcesError;
  }

  const sourceMap = new Map(((sources || []) as ScrapeSource[]).map((source) => [source.id, source]));
  const metricsByRun = new Map<string, RunMetrics>();
  let processedCount = 0;
  let errorCount = 0;

  await runWithConcurrency(pendingRows, env.scraperConcurrency, async (row) => {
    const source = sourceMap.get(row.source_id);
    ensureProcessable(row, source as ScrapeSource);
    const resolvedSource = source as ScrapeSource;

    const itemLogger = rootLogger.child({
      stagingEventId: row.id,
      scrapeRunId: row.scrape_run_id,
      sourceId: row.source_id,
      sourceUrl: resolvedSource.source_url,
      parserKey: resolvedSource.parser_key,
    });

    let aiPayload: AiExtractionPayload | null = (row.ai_normalized as AiExtractionPayload | null) || null;

    try {
      const heuristic = normalizeStagingEvent(row, resolvedSource);
      let normalizedEvent = heuristic.normalizedEvent;

      if (heuristic.needsAi && env.enableAiNormalization) {
        aiPayload = await extractAmbiguousEventWithAi(
          {
            title: row.extracted_title,
            description: row.extracted_description,
            venueName: row.extracted_venue_name,
            city: row.extracted_city,
            dateText: row.extracted_date_text,
            sourceEventUrl: row.source_event_url,
          },
          itemLogger
        );
        normalizedEvent = mergeAiExtraction(normalizedEvent, aiPayload, resolvedSource);
      }

      if (!normalizedEvent.startsAt) {
        throw new Error('Unable to resolve startsAt from heuristics or AI.');
      }
      if (normalizedEvent.artists.length === 0) {
        throw new Error('Unable to resolve artist list from heuristics or AI.');
      }
      if (!normalizedEvent.venue.normalizedName) {
        throw new Error('Unable to resolve venue normalization.');
      }

      const venueResult = await upsertVenue(supabase, normalizedEvent.venue, itemLogger);
      const artistsResult = await upsertArtists(supabase, normalizedEvent.artists, itemLogger);
      const eventResult = await upsertEvent(
        supabase,
        normalizedEvent,
        venueResult.row.id,
        resolvedSource.id,
        itemLogger
      );
      const insertedEventArtistCount = await upsertEventArtists(
        supabase,
        eventResult.row.id,
        artistsResult.rows.map((artist) => artist.id)
      );

      const { error: updateStagingError } = await supabase
        .from('staging_events')
        .update({
          ai_normalized: aiPayload,
          normalization_status: 'processed',
          processed: true,
          processing_error: null,
        })
        .eq('id', row.id);

      if (updateStagingError) {
        throw updateStagingError;
      }

      incrementMetrics(metricsByRun, row.scrape_run_id, {
        normalizedCount: 1,
        insertedCount:
          (venueResult.created ? 1 : 0) +
          artistsResult.createdCount +
          (eventResult.created ? 1 : 0) +
          insertedEventArtistCount,
        updatedCount:
          (venueResult.updated ? 1 : 0) +
          artistsResult.updatedCount +
          (eventResult.updated ? 1 : 0),
      });

      processedCount += 1;
      itemLogger.info('Processed staging row', {
        artistCount: artistsResult.rows.length,
        venueId: venueResult.row.id,
        eventId: eventResult.row.id,
      });
    } catch (processingError) {
      errorCount += 1;
      itemLogger.error('Failed to process staging row', processingError);
      await supabase
        .from('staging_events')
        .update({
          ai_normalized: aiPayload,
          normalization_status: 'error',
          processing_error:
            processingError instanceof Error ? processingError.message : String(processingError),
          processed: false,
        })
        .eq('id', row.id);
    }
  });

  for (const [runId, metrics] of metricsByRun.entries()) {
    await updateRunMetrics(runId, metrics);
  }

  rootLogger.info('Finished processing staging rows', {
    pendingCount: pendingRows.length,
    processedCount,
    errorCount,
  });

  return {
    pendingCount: pendingRows.length,
    processedCount,
    errorCount,
  };
};
