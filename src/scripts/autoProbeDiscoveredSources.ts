import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { autoProbeSource } from '../scraping/autoProbe.js';
import type { ScrapeSource, ScrapeSourceMetadata } from '../types/scrape.js';
import { Logger } from '../utils/logger.js';
import { runWithConcurrency } from '../utils/promisePool.js';

const logger = new Logger(env.logLevel, { script: 'autoProbeDiscoveredSources' });
const supabase = getSupabaseAdmin();
const selectedNames = new Set(
  (process.env.AUTO_PROBE_SOURCE_NAMES || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
);

const run = async () => {
  const { data, error } = await supabase
    .from('scrape_sources')
    .select('*')
    .eq('is_active', false)
    .eq('metadata->>autoDiscovered', 'true')
    .order('name');
  if (error) throw error;

  const sources = ((data || []) as ScrapeSource[]).filter(
    (source) => selectedNames.size === 0 || selectedNames.has(source.name),
  );
  const counts: Record<string, number> = {};
  await runWithConcurrency(sources, Math.min(env.scraperConcurrency, 2), async (source) => {
    const result = await autoProbeSource(source, logger.child({ sourceId: source.id, sourceName: source.name }));
    counts[result.status] = (counts[result.status] || 0) + 1;
    const metadata = source.metadata as ScrapeSourceMetadata;
    const { error: updateError } = await supabase
      .from('scrape_sources')
      .update({
        parser_key: result.parserKey || source.parser_key,
        metadata: {
          ...metadata,
          fixtureVerified: result.status === 'ready_for_review',
          autoProbe: {
            ...result,
            probedAt: new Date().toISOString(),
          },
        },
      })
      .eq('id', source.id);
    if (updateError) throw updateError;
    logger.info('Auto-probe source completed', {
      sourceName: source.name,
      status: result.status,
      parserKey: result.parserKey,
      eventCount: result.eventCount,
      confidence: result.confidence,
    });
  });

  logger.info('Auto-probe batch completed', { sourceCount: sources.length, counts });
};

run().catch((error) => {
  logger.error('Auto-probe batch failed', error);
  process.exitCode = 1;
});
