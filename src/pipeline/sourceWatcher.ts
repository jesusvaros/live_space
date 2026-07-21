import type { SupabaseClient } from '@supabase/supabase-js';

import type { RawScrapedEvent, ScrapeSource } from '../types/scrape.js';
import { createDeterministicHash } from '../utils/hash.js';

export type SnapshotAssessment = {
  trustworthy: boolean;
  status: 'healthy' | 'degraded' | 'broken';
  reason: 'normal' | 'empty' | 'count_collapse';
};

export const sourceEventKey = (event: RawScrapedEvent): string =>
  event.sourceEventId ||
  event.sourceEventUrl ||
  createDeterministicHash({
    title: event.title || null,
    startsAt: event.startsAt || event.dateText || null,
    venueName: event.venueName || null,
  });

export const assessSnapshot = (
  currentCount: number,
  previousCount: number,
  consecutiveEmptyRuns: number,
): SnapshotAssessment => {
  if (currentCount === 0) {
    return {
      trustworthy: false,
      status: consecutiveEmptyRuns + 1 >= 2 ? 'broken' : 'degraded',
      reason: 'empty',
    };
  }
  if (previousCount >= 10 && currentCount < Math.ceil(previousCount * 0.3)) {
    return { trustworthy: false, status: 'degraded', reason: 'count_collapse' };
  }
  return { trustworthy: true, status: 'healthy', reason: 'normal' };
};

const ensureAlert = async (
  supabase: SupabaseClient,
  row: { source_id: string; event_key?: string; alert_type: string; severity: string; message: string; details?: object },
) => {
  let query = supabase
    .from('scrape_watch_alerts')
    .select('id')
    .eq('source_id', row.source_id)
    .eq('alert_type', row.alert_type)
    .eq('status', 'open');
  query = row.event_key ? query.eq('event_key', row.event_key) : query.is('event_key', null);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  if (data) {
    const { error: updateError } = await supabase
      .from('scrape_watch_alerts')
      .update({ severity: row.severity, message: row.message, details: row.details || {} })
      .eq('id', data.id);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase.from('scrape_watch_alerts').insert(row);
    if (insertError) throw insertError;
  }
};

export const recordSuccessfulSnapshot = async (
  supabase: SupabaseClient,
  source: ScrapeSource,
  items: RawScrapedEvent[],
  now = new Date(),
): Promise<SnapshotAssessment> => {
  const timestamp = now.toISOString();
  const { data: prior, error: priorError } = await supabase
    .from('scrape_source_watch_state')
    .select('*')
    .eq('source_id', source.id)
    .maybeSingle();
  if (priorError) throw priorError;

  const previousCount = Number(prior?.last_raw_count || 0);
  const consecutiveEmptyRuns = Number(prior?.consecutive_empty_runs || 0);
  const assessment = assessSnapshot(items.length, previousCount, consecutiveEmptyRuns);
  const observations = items.map((event) => ({
    source_id: source.id,
    event_key: sourceEventKey(event),
    source_event_id: event.sourceEventId || null,
    source_url: event.sourceEventUrl || event.sourceUrl || source.base_url,
    starts_at: event.startsAt || null,
    last_raw_hash: createDeterministicHash(event),
    last_seen_at: timestamp,
    consecutive_misses: 0,
    status: 'present',
  }));

  if (observations.length > 0) {
    const { error } = await supabase.from('source_event_observations').upsert(observations, {
      onConflict: 'source_id,event_key',
    });
    if (error) throw error;

    for (let index = 0; index < observations.length; index += 100) {
      const returnedKeys = observations.slice(index, index + 100).map((row) => row.event_key);
      const { error: resolutionError } = await supabase
        .from('scrape_watch_alerts')
        .update({ status: 'resolved', resolved_at: timestamp })
        .eq('source_id', source.id)
        .eq('alert_type', 'event_missing')
        .eq('status', 'open')
        .in('event_key', returnedKeys);
      if (resolutionError) throw resolutionError;
    }
  }

  if (assessment.trustworthy) {
    const { error: sourceResolutionError } = await supabase
      .from('scrape_watch_alerts')
      .update({ status: 'resolved', resolved_at: timestamp })
      .eq('source_id', source.id)
      .eq('status', 'open')
      .in('alert_type', ['source_empty', 'source_failed']);
    if (sourceResolutionError) throw sourceResolutionError;

    const seen = new Set(observations.map((row) => row.event_key));
    const { data: known, error } = await supabase
      .from('source_event_observations')
      .select('event_key,source_url,starts_at,consecutive_misses,status')
      .eq('source_id', source.id)
      .in('status', ['present', 'missing_once']);
    if (error) throw error;

    for (const observation of known || []) {
      if (seen.has(observation.event_key)) continue;
      if (observation.starts_at && new Date(observation.starts_at) < now) {
        const { error: endError } = await supabase
          .from('source_event_observations')
          .update({ status: 'ended' })
          .eq('source_id', source.id)
          .eq('event_key', observation.event_key);
        if (endError) throw endError;
        continue;
      }

      const misses = Number(observation.consecutive_misses || 0) + 1;
      const status = misses >= 2 ? 'review' : 'missing_once';
      const { error: missingError } = await supabase
        .from('source_event_observations')
        .update({ consecutive_misses: misses, status })
        .eq('source_id', source.id)
        .eq('event_key', observation.event_key);
      if (missingError) throw missingError;

      if (status === 'review') {
        await ensureAlert(supabase, {
          source_id: source.id,
          event_key: observation.event_key,
          alert_type: 'event_missing',
          severity: 'warning',
          message: `El evento ya no aparece en ${source.name} tras dos capturas fiables.`,
          details: { sourceUrl: observation.source_url, misses },
        });
      }
    }
  } else {
    await ensureAlert(supabase, {
      source_id: source.id,
      alert_type: 'source_empty',
      severity: assessment.status === 'broken' ? 'critical' : 'warning',
      message: `La captura de ${source.name} no es fiable: ${assessment.reason}.`,
      details: { currentCount: items.length, previousCount },
    });
  }

  const { error: stateError } = await supabase.from('scrape_source_watch_state').upsert({
    source_id: source.id,
    last_raw_count: items.length || previousCount,
    healthy_run_count: Number(prior?.healthy_run_count || 0) + (assessment.trustworthy ? 1 : 0),
    consecutive_empty_runs: items.length === 0 ? consecutiveEmptyRuns + 1 : 0,
    consecutive_failures: 0,
    status: assessment.status,
    last_error: null,
    last_checked_at: timestamp,
    updated_at: timestamp,
  });
  if (stateError) throw stateError;
  return assessment;
};

export const recordFailedSnapshot = async (
  supabase: SupabaseClient,
  source: ScrapeSource,
  error: unknown,
): Promise<void> => {
  const message = error instanceof Error ? error.message : String(error);
  const { data: prior, error: readError } = await supabase
    .from('scrape_source_watch_state')
    .select('*')
    .eq('source_id', source.id)
    .maybeSingle();
  if (readError) throw readError;
  const failures = Number(prior?.consecutive_failures || 0) + 1;
  const timestamp = new Date().toISOString();
  const { error: stateError } = await supabase.from('scrape_source_watch_state').upsert({
    source_id: source.id,
    last_raw_count: Number(prior?.last_raw_count || 0),
    healthy_run_count: Number(prior?.healthy_run_count || 0),
    consecutive_empty_runs: Number(prior?.consecutive_empty_runs || 0),
    consecutive_failures: failures,
    status: failures >= 2 ? 'broken' : 'degraded',
    last_error: message,
    last_checked_at: timestamp,
    updated_at: timestamp,
  });
  if (stateError) throw stateError;
  if (failures >= 2) {
    await ensureAlert(supabase, {
      source_id: source.id,
      alert_type: 'source_failed',
      severity: 'critical',
      message: `${source.name} ha fallado en ${failures} ejecuciones consecutivas.`,
      details: { error: message, failures },
    });
  }
};
