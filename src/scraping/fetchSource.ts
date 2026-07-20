import type { RawScrapedEvent, ScrapeSource } from '../types/scrape.js';
import { Logger } from '../utils/logger.js';
import { withBrowserPage } from './browser.js';
import { getParser } from './parserRegistry.js';

const compact = (value: string | undefined): string | undefined => {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
};

const normalizeRawEvent = (source: ScrapeSource, event: RawScrapedEvent): RawScrapedEvent => ({
  ...event,
  sourceUrl: source.base_url,
  sourceEventUrl: compact(event.sourceEventUrl),
  sourceEventId: compact(event.sourceEventId),
  title: compact(event.title),
  description: compact(event.description),
  dateText: compact(event.dateText),
  startsAt: compact(event.startsAt ?? undefined) ?? null,
  venueName: compact(event.venueName) || source.name,
  city: compact(event.city) || source.city || undefined,
  artistNames: (event.artistNames || []).map((name) => compact(name)).filter(Boolean) as string[],
});

const dedupeRawItems = (items: RawScrapedEvent[]): RawScrapedEvent[] => {
  const seen = new Set<string>();
  const deduped: RawScrapedEvent[] = [];

  for (const item of items) {
    const key =
      item.sourceEventUrl ||
      item.sourceEventId ||
      [item.title, item.dateText, item.venueName, item.city].filter(Boolean).join('::');

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
};

export const fetchSource = async (
  source: ScrapeSource,
  logger: Logger
): Promise<RawScrapedEvent[]> => {
  const parser = getParser(source.parser_key);
  const sourceLogger = logger.child({
    sourceId: source.id,
    sourceUrl: source.base_url,
    parserKey: source.parser_key,
  });

  return withBrowserPage(
    {
      logger: sourceLogger,
      sourceId: source.id,
      sourceUrl: source.base_url,
    },
    async (page) => {
      sourceLogger.info('Opening source page');
      await page.goto(source.base_url, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });

      // Some official venue sites set a short-lived cookie from an interstitial
      // and use a meta refresh to return to the requested page. Wait for that
      // navigation before inspecting the real agenda.
      if ((await page.locator('meta[http-equiv="refresh" i]').count()) > 0) {
        sourceLogger.info('Waiting for source interstitial refresh');
        await page.waitForTimeout(4_000);
        await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
      }

      if (source.metadata.waitForSelector && typeof source.metadata.waitForSelector === 'string') {
        await page.waitForSelector(source.metadata.waitForSelector, { timeout: 10_000 }).catch(() => undefined);
      }

      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

      const html = await page.content();
      if (!parser.canHandle(source.base_url, html)) {
        sourceLogger.warn('Parser does not confidently match page HTML; continuing with configured parser');
      }

      const parsedEvents = await parser.parseListPage(page, source);
      const normalized = dedupeRawItems(parsedEvents.map((event) => normalizeRawEvent(source, event)));

      sourceLogger.info('Fetched source events', {
        foundCount: normalized.length,
      });

      return normalized;
    }
  );
};
