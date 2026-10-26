import { getSupabaseAdmin } from '../db/supabase.js';
import { normalizeStagingEvent } from '../normalize/normalizeEvent.js';
import type { NormalizedEvent } from '../types/domain.js';
import type { ScrapeSource, StagingEventRecord } from '../types/scrape.js';
import { Logger } from '../utils/logger.js';
import { buildDecisionContext, decideByConfidence, NON_MUSIC_RE } from './confidenceDecision.js';

export type TriageRule = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';

export type TriageAction = {
  id: string;
  rule: TriageRule | null;
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'merged';
  normalizedEvent: NormalizedEvent | null;
  sourceName: string;
  title: string | null;
};

export type TriagePlan = {
  actions: TriageAction[];
  countsByRule: Record<TriageRule | 'review', number>;
};

type TriageRow = Pick<
  StagingEventRecord,
  | 'id'
  | 'source_id'
  | 'source_url'
  | 'source_event_id'
  | 'review_status'
  | 'published_event_id'
  | 'created_at'
> &
  Partial<StagingEventRecord>;

// "Jamboree Jam Session": the only "artist" is the venue's own series.
const isHouseSeries = (event: NormalizedEvent) =>
  Boolean(event.venue.normalizedName) &&
  event.artists[0].normalizedName.includes(event.venue.normalizedName);

export const stagingKey = (row: Pick<StagingEventRecord, 'source_id' | 'source_event_id' | 'source_url'>) =>
  `${row.source_id}|${row.source_event_id || row.source_url}`;

/**
 * Rules applied in order to pending staging rows; the first match wins.
 * R1 key already published → merged; R2 older copy of a pending key → merged;
 * R3 past event (dated against the capture) → rejected; R4 non-music → rejected;
 * R5 trusted structured source → approved; R6 same as R5 for a session or
 * festival with exactly one artist → approved, only when `includeR6`.
 */
export const planTriage = (
  pendingRows: StagingEventRecord[],
  publishedRows: TriageRow[],
  sources: Map<string, ScrapeSource>,
  { now = new Date(), includeR6 = false }: { now?: Date; includeR6?: boolean } = {},
): TriagePlan => {
  const publishedKeys = new Set(publishedRows.map(stagingKey));
  const newestByKey = new Map<string, StagingEventRecord>();
  for (const row of pendingRows) {
    const key = stagingKey(row);
    const current = newestByKey.get(key);
    if (!current || row.created_at > current.created_at || (row.created_at === current.created_at && row.id > current.id)) {
      newestByKey.set(key, row);
    }
  }

  const countsByRule: TriagePlan['countsByRule'] = { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, review: 0 };
  const actions = pendingRows.map((row): TriageAction => {
    const source = sources.get(row.source_id);
    const base = { id: row.id, sourceName: source?.name || row.source_id, title: row.extracted_title };
    const decide = (rule: TriageRule | null, reviewStatus: TriageAction['reviewStatus'], normalizedEvent: NormalizedEvent | null) => {
      countsByRule[rule || 'review'] += 1;
      return { ...base, rule, reviewStatus, normalizedEvent };
    };

    const key = stagingKey(row);
    if (publishedKeys.has(key)) return decide('R1', 'merged', null);
    if (newestByKey.get(key)?.id !== row.id) return decide('R2', 'merged', null);
    if (!source) return decide(null, 'pending', null);

    const { normalizedEvent } = normalizeStagingEvent(row, source);
    const context = buildDecisionContext(row, source, now);
    if (normalizedEvent.startsAt && new Date(normalizedEvent.startsAt).getTime() < now.getTime()) {
      return decide('R3', 'rejected', normalizedEvent);
    }
    if (NON_MUSIC_RE.test(normalizedEvent.canonicalName)) return decide('R4', 'rejected', normalizedEvent);

    const decision = decideByConfidence(normalizedEvent, context);
    if (decision.reviewStatus === 'approved' && normalizedEvent.eventType === 'concert') {
      return decide('R5', 'approved', normalizedEvent);
    }
    if (
      includeR6 &&
      decision.reviewStatus !== 'rejected' &&
      (normalizedEvent.eventType === 'session' || normalizedEvent.eventType === 'festival') &&
      normalizedEvent.artists.length === 1 &&
      !isHouseSeries(normalizedEvent) &&
      decideByConfidence({ ...normalizedEvent, eventType: 'concert' }, context).reviewStatus === 'approved'
    ) {
      return decide('R6', 'approved', normalizedEvent);
    }
    return decide(null, decision.reviewStatus === 'rejected' ? 'rejected' : 'pending', normalizedEvent);
  });

  return { actions, countsByRule };
};

const PAGE_SIZE = 1000;

const fetchAll = async <T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
};

export const runStagingTriage = async ({
  apply,
  includeR6,
  logger = new Logger('info'),
}: {
  apply: boolean;
  includeR6: boolean;
  logger?: Logger;
}): Promise<TriagePlan> => {
  const supabase = getSupabaseAdmin();
  const pendingRows = await fetchAll<StagingEventRecord>((from, to) =>
    supabase
      .from('staging_events')
      .select(
        'id,scrape_run_id,source_id,source_url,raw_payload,raw_hash,source_event_id,extracted_title,extracted_date_text,extracted_starts_at,extracted_venue_name,extracted_city,extracted_artist_names,normalized_payload,confidence,review_status,published_event_id,processing_error,created_at,updated_at',
      )
      .eq('review_status', 'pending')
      .is('published_event_id', null)
      .order('id')
      .range(from, to),
  );
  const publishedRows = await fetchAll<TriageRow>((from, to) =>
    supabase
      .from('staging_events')
      .select('id,source_id,source_url,source_event_id,review_status,published_event_id,created_at')
      .not('published_event_id', 'is', null)
      .order('id')
      .range(from, to),
  );
  const { data: sources, error: sourcesError } = await supabase.from('scrape_sources').select('*');
  if (sourcesError) throw sourcesError;

  const plan = planTriage(
    pendingRows,
    publishedRows,
    new Map(((sources || []) as ScrapeSource[]).map((source) => [source.id, source])),
    { includeR6 },
  );
  logger.info('Staging triage plan', { apply, includeR6, pending: pendingRows.length, ...plan.countsByRule });
  if (!apply) return plan;

  // Rows that stay in human review keep their status but get the
  // capture-anchored normalization so the daily run does not redo it.
  const writes = plan.actions.filter((action) => action.rule || action.normalizedEvent);
  for (const action of writes) {
    const { error } = await supabase
      .from('staging_events')
      .update({
        review_status: action.reviewStatus,
        ...(action.normalizedEvent
          ? { normalized_payload: action.normalizedEvent, confidence: action.normalizedEvent.confidence }
          : {}),
        processing_error: null,
      })
      .eq('id', action.id)
      .eq('review_status', 'pending');
    if (error) throw error;
  }
  logger.info('Staging triage applied', { updated: writes.length });
  return plan;
};
