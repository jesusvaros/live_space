import { seedSources } from '../pipeline/sourceCatalog.js';
import { fetchSource } from '../scraping/fetchSource.js';
import type { ScrapeSource } from '../types/scrape.js';
import { Logger } from '../utils/logger.js';
import { runWithConcurrency } from '../utils/promisePool.js';

const selectedNames = new Set(
  (process.env.PROBE_SOURCE_NAMES || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
);

const candidates = seedSources.filter(
  (source) => selectedNames.size === 0 || selectedNames.has(source.name)
);

const probe = async () => {
  const logger = new Logger('warn', { script: 'probeSources' });
  const results: Array<Record<string, unknown>> = [];

  await runWithConcurrency(candidates, 3, async (candidate, index) => {
    const source: ScrapeSource = {
      ...candidate,
      id: `probe-${index}`,
      country_code: 'ES',
      frequency: 'daily',
    };

    try {
      const events = await fetchSource(source, logger);
      results.push({
        name: source.name,
        url: source.base_url,
        eventCount: events.length,
        sample: events.slice(0, 2).map((event) => ({
          title: event.title,
          dateText: event.dateText,
          startsAt: event.startsAt,
          sourceEventUrl: event.sourceEventUrl,
        })),
      });
    } catch (error) {
      results.push({
        name: source.name,
        url: source.base_url,
        eventCount: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  results.sort((left, right) => String(left.name).localeCompare(String(right.name), 'es'));
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
};

probe().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
