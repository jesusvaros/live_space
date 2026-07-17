import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { extractAmbiguousEventWithAi } from '../normalize/aiExtraction.js';
import { mergeAiExtraction, normalizeStagingEvent } from '../normalize/normalizeEvent.js';
import type { AiExtractionPayload, NormalizedEvent } from '../types/domain.js';
import type { ScrapeSource, StagingEventRecord } from '../types/scrape.js';
import { Logger } from '../utils/logger.js';
import { runWithConcurrency } from '../utils/promisePool.js';
import { decideByConfidence } from './confidenceDecision.js';
import { upsertArtists } from './upsertArtists.js';
import { upsertEventArtists } from './upsertEventArtists.js';
import { upsertEvent } from './upsertEvents.js';
import { upsertVenue } from './upsertVenues.js';

type RunMetrics = {
  normalizedCount: number;
  publishedCount: number;
  insertedCount: number;
  updatedCount: number;
  reviewCount: number;
  rejectedCount: number;
};

export type ProcessStagingSummary = {
  pendingCount: number;
  processedCount: number;
  publishedCount: number;
  reviewCount: number;
  rejectedCount: number;
  errorCount: number;
};

const STAGING_SELECT =
  'id,scrape_run_id,source_id,source_url,raw_payload,raw_hash,source_event_id,extracted_title,extracted_date_text,extracted_starts_at,extracted_venue_name,extracted_city,extracted_artist_names,normalized_payload,confidence,review_status,published_event_id,processing_error,created_at,updated_at';

const emptyRunMetrics = (): RunMetrics => ({
  normalizedCount: 0,
  publishedCount: 0,
  insertedCount: 0,
  updatedCount: 0,
  reviewCount: 0,
  rejectedCount: 0,
});

const incrementMetrics = (
  metricsMap: Map<string, RunMetrics>,
  runId: string,
  updates: Partial<RunMetrics>,
) => {
  const current = metricsMap.get(runId) || emptyRunMetrics();
  for (const key of Object.keys(current) as Array<keyof RunMetrics>) {
    current[key] += updates[key] || 0;
  }
  metricsMap.set(runId, current);
};

const metricNumber = (metrics: Record<string, unknown>, key: string): number => {
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const updateRunMetrics = async (runId: string, updates: RunMetrics) => {
  const supabase = getSupabaseAdmin();
  const { data, error: readError } = await supabase
    .from('scrape_runs')
    .select('normalized_count,published_count,metrics')
    .eq('id', runId)
    .maybeSingle();
  if (readError) throw readError;

  const current = (data || {}) as {
    normalized_count?: number;
    published_count?: number;
    metrics?: Record<string, unknown>;
  };
  const metrics = current.metrics || {};
  const { error: updateError } = await supabase
    .from('scrape_runs')
    .update({
      normalized_count: (current.normalized_count || 0) + updates.normalizedCount,
      published_count: (current.published_count || 0) + updates.publishedCount,
      metrics: {
        ...metrics,
        inserted_count: metricNumber(metrics, 'inserted_count') + updates.insertedCount,
        updated_count: metricNumber(metrics, 'updated_count') + updates.updatedCount,
        review_count: metricNumber(metrics, 'review_count') + updates.reviewCount,
        rejected_count: metricNumber(metrics, 'rejected_count') + updates.rejectedCount,
      },
    })
    .eq('id', runId);
  if (updateError) throw updateError;
};

const isNormalizedEvent = (value: unknown): value is NormalizedEvent => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<NormalizedEvent>;
  return (
    typeof candidate.canonicalName === 'string' &&
    typeof candidate.normalizedName === 'string' &&
    typeof candidate.confidence === 'number' &&
    Array.isArray(candidate.artists) &&
    Boolean(candidate.venue && typeof candidate.venue === 'object')
  );
};

export const processPendingStaging = async (
  logger = new Logger(env.logLevel),
): Promise<ProcessStagingSummary> => {
  const supabase = getSupabaseAdmin();
  const rootLogger = logger.child({ pipeline: 'processStaging' });
  const { data, error } = await supabase
    .from('staging_events')
    .select(STAGING_SELECT)
    .is('published_event_id', null)
    .in('review_status', ['pending', 'approved'])
    .order('created_at', { ascending: true });
  if (error) throw error;

  const candidateRows = (data || []) as StagingEventRecord[];
  const pendingRows = candidateRows.filter(
    (row) => row.review_status === 'approved' || row.normalized_payload === null,
  );
  if (pendingRows.length === 0) {
    rootLogger.info('No processable staging rows found');
    return {
      pendingCount: 0,
      processedCount: 0,
      publishedCount: 0,
      reviewCount: 0,
      rejectedCount: 0,
      errorCount: 0,
    };
  }

  const sourceIds = Array.from(new Set(pendingRows.map((row) => row.source_id)));
  const { data: sources, error: sourcesError } = await supabase
    .from('scrape_sources')
    .select('*')
    .in('id', sourceIds);
  if (sourcesError) throw sourcesError;

  const sourceMap = new Map(((sources || []) as ScrapeSource[]).map((source) => [source.id, source]));
  const metricsByRun = new Map<string, RunMetrics>();
  let processedCount = 0;
  let publishedCount = 0;
  let reviewCount = 0;
  let rejectedCount = 0;
  let errorCount = 0;

  await runWithConcurrency(pendingRows, env.scraperConcurrency, async (row) => {
    const source = sourceMap.get(row.source_id);
    const itemLogger = rootLogger.child({
      stagingEventId: row.id,
      scrapeRunId: row.scrape_run_id,
      sourceId: row.source_id,
      sourceUrl: source?.base_url,
      parserKey: source?.parser_key,
    });

    try {
      if (!source) throw new Error(`Missing scrape source ${row.source_id}`);

      let normalizedEvent: NormalizedEvent;
      if (row.review_status === 'approved' && isNormalizedEvent(row.normalized_payload)) {
        normalizedEvent = row.normalized_payload;
      } else {
        const heuristic = normalizeStagingEvent(row, source);
        normalizedEvent = heuristic.normalizedEvent;

        if (heuristic.needsAi && env.enableAiNormalization) {
          const raw =
            row.raw_payload && typeof row.raw_payload === 'object'
              ? (row.raw_payload as Record<string, unknown>)
              : {};
          const aiPayload: AiExtractionPayload = await extractAmbiguousEventWithAi(
            {
              title: row.extracted_title,
              description: typeof raw.description === 'string' ? raw.description : null,
              venueName: row.extracted_venue_name,
              city: row.extracted_city,
              dateText: row.extracted_date_text,
              sourceEventUrl: row.source_url,
            },
            itemLogger,
          );
          normalizedEvent = mergeAiExtraction(normalizedEvent, aiPayload, source);
        }

        const decision = decideByConfidence(normalizedEvent);
        const { error: decisionError } = await supabase
          .from('staging_events')
          .update({
            normalized_payload: normalizedEvent,
            confidence: normalizedEvent.confidence,
            review_status: decision.reviewStatus,
            processing_error: null,
          })
          .eq('id', row.id);
        if (decisionError) throw decisionError;

        incrementMetrics(metricsByRun, row.scrape_run_id, {
          normalizedCount: 1,
          reviewCount: decision.reviewStatus === 'pending' ? 1 : 0,
          rejectedCount: decision.reviewStatus === 'rejected' ? 1 : 0,
        });

        if (!decision.shouldPublish) {
          processedCount += 1;
          if (decision.reviewStatus === 'pending') reviewCount += 1;
          if (decision.reviewStatus === 'rejected') rejectedCount += 1;
          itemLogger.info('Retained staging row without publication', {
            confidence: normalizedEvent.confidence,
            reviewStatus: decision.reviewStatus,
            reasons: decision.reasons,
          });
          return;
        }
      }

      const decision = decideByConfidence(normalizedEvent);
      if (decision.reviewStatus === 'rejected') {
        await supabase
          .from('staging_events')
          .update({ review_status: 'rejected', processing_error: null })
          .eq('id', row.id);
        incrementMetrics(metricsByRun, row.scrape_run_id, { rejectedCount: 1 });
        rejectedCount += 1;
        processedCount += 1;
        return;
      }
      if (row.review_status !== 'approved' && !decision.shouldPublish) return;

      const venueResult = await upsertVenue(supabase, normalizedEvent.venue, itemLogger);
      const artistsResult = await upsertArtists(supabase, normalizedEvent.artists, itemLogger);
      const eventResult = await upsertEvent(
        supabase,
        normalizedEvent,
        venueResult.row.id,
        source.id,
        itemLogger,
      );
      const insertedEventArtistCount = await upsertEventArtists(
        supabase,
        eventResult.row.id,
        artistsResult.rows.map((artist) => artist.id),
      );

      const { error: publishError } = await supabase
        .from('staging_events')
        .update({
          review_status: 'approved',
          published_event_id: eventResult.row.id,
          processing_error: null,
        })
        .eq('id', row.id);
      if (publishError) throw publishError;

      incrementMetrics(metricsByRun, row.scrape_run_id, {
        publishedCount: 1,
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
      publishedCount += 1;
      itemLogger.info('Published staging row', {
        confidence: normalizedEvent.confidence,
        eventId: eventResult.row.id,
      });
    } catch (processingError) {
      errorCount += 1;
      itemLogger.error('Failed to process staging row', processingError);
      await supabase
        .from('staging_events')
        .update({
          processing_error:
            processingError instanceof Error ? processingError.message : String(processingError),
        })
        .eq('id', row.id);
    }
  });

  for (const [runId, metrics] of metricsByRun.entries()) await updateRunMetrics(runId, metrics);

  return {
    pendingCount: pendingRows.length,
    processedCount,
    publishedCount,
    reviewCount,
    rejectedCount,
    errorCount,
  };
};
