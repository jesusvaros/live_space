import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import type { ScrapeSource, ScrapeSourceMetadata } from '../types/scrape.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger(env.logLevel, { script: 'approveAutoProbedSources' });
const supabase = getSupabaseAdmin();
const approvedNames = (process.env.APPROVED_SOURCE_NAMES || '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const reviewNote = process.env.SOURCE_REVIEW_NOTE?.trim();

const run = async () => {
  if (approvedNames.length === 0) {
    throw new Error('APPROVED_SOURCE_NAMES must contain at least one reviewed source');
  }
  if (!reviewNote) {
    throw new Error('SOURCE_REVIEW_NOTE is required to preserve the activation audit trail');
  }

  const { data, error } = await supabase
    .from('scrape_sources')
    .select('*')
    .in('name', approvedNames)
    .eq('is_active', false);
  if (error) throw error;

  const sources = (data || []) as ScrapeSource[];
  const foundNames = new Set(sources.map((source) => source.name));
  const missing = approvedNames.filter((name) => !foundNames.has(name));
  if (missing.length > 0) {
    throw new Error(`Inactive sources not found: ${missing.join(', ')}`);
  }

  const reviewedAt = new Date().toISOString();
  const readySources = sources.map((source) => {
    const metadata = source.metadata as ScrapeSourceMetadata;
    const probe = metadata.autoProbe;
    if (!metadata.fixtureVerified || probe?.status !== 'ready_for_review' || !probe.parserKey) {
      throw new Error(`${source.name} has not passed the reproducible auto-probe`);
    }
    return { source, metadata, probe };
  });

  for (const { source, metadata, probe } of readySources) {
    const { error: updateError } = await supabase
      .from('scrape_sources')
      .update({
        base_url: probe.agendaUrl || source.base_url,
        parser_key: probe.parserKey,
        is_active: true,
        terms_reviewed_at: reviewedAt,
        metadata: {
          ...metadata,
          termsReviewStatus: 'approved',
          termsReviewMethod: 'manual-public-calendar-and-robots-review',
          termsReviewNote: reviewNote,
          robotsReviewedAt: reviewedAt,
          activatedAt: reviewedAt,
        },
      })
      .eq('id', source.id);
    if (updateError) throw updateError;
    logger.info('Auto-probed source activated', {
      sourceName: source.name,
      parserKey: probe.parserKey,
      agendaUrl: probe.agendaUrl || source.base_url,
    });
  }
};

run().catch((error) => {
  logger.error('Source approval failed', error);
  process.exitCode = 1;
});
