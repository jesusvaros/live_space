import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '../db/supabase.js';
import { Logger } from '../utils/logger.js';

type MissingAlert = {
  id: string;
  source_id: string;
  event_key: string;
};

export type ScraperMaintenanceSummary = {
  endedObservations: number;
  resolvedMissingAlerts: number;
  expiredDiscoveryRuns: number;
};

const STALE_MISSING_DAYS = 30;

export const shouldCloseMissingObservation = (
  observation: { starts_at: string | null; last_seen_at: string },
  now: Date,
): boolean => {
  const startsAt = observation.starts_at ? Date.parse(observation.starts_at) : Number.NaN;
  if (Number.isFinite(startsAt)) return startsAt < now.getTime();

  const lastSeenAt = Date.parse(observation.last_seen_at);
  const staleCutoff = now.getTime() - STALE_MISSING_DAYS * 24 * 60 * 60 * 1000;
  return Number.isFinite(lastSeenAt) && lastSeenAt < staleCutoff;
};

const chunk = <T>(values: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

export const runScraperMaintenance = async (
  logger = new Logger('info'),
  supabase: SupabaseClient = getSupabaseAdmin(),
  now = new Date(),
): Promise<ScraperMaintenanceSummary> => {
  const timestamp = now.toISOString();
  const staleRunCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const summary: ScraperMaintenanceSummary = {
    endedObservations: 0,
    resolvedMissingAlerts: 0,
    expiredDiscoveryRuns: 0,
  };

  const { data: alerts, error: alertsError } = await supabase
    .from('scrape_watch_alerts')
    .select('id,source_id,event_key')
    .eq('alert_type', 'event_missing')
    .eq('status', 'open')
    .not('source_id', 'is', null)
    .not('event_key', 'is', null)
    .limit(5_000);
  if (alertsError) throw alertsError;

  const alertsBySource = new Map<string, MissingAlert[]>();
  for (const alert of (alerts || []) as MissingAlert[]) {
    const sourceAlerts = alertsBySource.get(alert.source_id) || [];
    sourceAlerts.push(alert);
    alertsBySource.set(alert.source_id, sourceAlerts);
  }

  for (const [sourceId, sourceAlerts] of alertsBySource) {
    for (const alertChunk of chunk(sourceAlerts, 100)) {
      const eventKeys = alertChunk.map((alert) => alert.event_key);
      const { data: observations, error: observationsError } = await supabase
        .from('source_event_observations')
        .select('event_key,starts_at,last_seen_at')
        .eq('source_id', sourceId)
        .in('event_key', eventKeys);
      if (observationsError) throw observationsError;
      const ended = (observations || []).filter((observation) =>
        shouldCloseMissingObservation(observation, now),
      );
      if (!ended?.length) continue;

      const endedKeys = ended.map((observation) => observation.event_key as string);
      const endedKeySet = new Set(endedKeys);
      const alertIds = alertChunk
        .filter((alert) => endedKeySet.has(alert.event_key))
        .map((alert) => alert.id);

      const { error: observationUpdateError } = await supabase
        .from('source_event_observations')
        .update({ status: 'ended' })
        .eq('source_id', sourceId)
        .in('event_key', endedKeys);
      if (observationUpdateError) throw observationUpdateError;

      const { error: alertUpdateError } = await supabase
        .from('scrape_watch_alerts')
        .update({ status: 'resolved', resolved_at: timestamp })
        .in('id', alertIds);
      if (alertUpdateError) throw alertUpdateError;

      summary.endedObservations += endedKeys.length;
      summary.resolvedMissingAlerts += alertIds.length;
    }
  }

  const { data: expiredRuns, error: expiredRunsError } = await supabase
    .from('venue_discovery_runs')
    .update({
      status: 'error',
      finished_at: timestamp,
      error_message: 'La ejecución superó dos horas y fue cerrada por mantenimiento.',
    })
    .eq('status', 'running')
    .lt('started_at', staleRunCutoff)
    .select('id');
  if (expiredRunsError) throw expiredRunsError;
  summary.expiredDiscoveryRuns = expiredRuns?.length || 0;

  logger.info('Scraper maintenance finished', summary);
  return summary;
};
