import type { Page } from 'playwright';

import { parseDateTextToIso } from '../normalize/normalizeEvent.js';
import type { ParserKey, RawScrapedEvent, ScrapeSource } from '../types/scrape.js';
import { createDeterministicHash } from '../utils/hash.js';
import { Logger } from '../utils/logger.js';
import { withBrowserPage } from './browser.js';
import { getParser } from './parserRegistry.js';
import { isLinkedEventDetailUrl } from './parsers/linkedEventCardsParser.js';

const AGENDA_SIGNAL = /agenda|calendario|conciert|programaci[oó]n|eventos?|cartelera|pr[oó]ximas? fechas?/i;
const SOCIAL_HOSTS = ['instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'tiktok.com', 'youtube.com'];
const PROBE_PARSERS: ParserKey[] = [
  'tribe-events-api',
  'events-manager-calendar',
  'shopify-concerts',
  'json-ld-agenda',
  'linked-event-cards',
  'wordpress-generic',
  'generic-agenda',
];

export type ProbeAssessment = {
  confidence: number;
  futureEvents: RawScrapedEvent[];
  fingerprint: string;
  isViable: boolean;
};

export type AutoProbeResult = {
  status: 'ready_for_review' | 'needs_parser' | 'unreachable' | 'unsupported';
  parserKey?: ParserKey;
  agendaUrl?: string;
  eventCount: number;
  confidence: number;
  fingerprint?: string;
  deterministic: boolean;
  reason: string;
  sample: Array<{ title?: string; dateText?: string; startsAt?: string | null; url?: string }>;
};

export const isScrapableWebsite = (rawUrl: string): boolean => {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./, '');
    return !SOCIAL_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
};

const canonicalEvent = (event: RawScrapedEvent) => ({
  id: event.sourceEventId || null,
  url: event.sourceEventUrl || null,
  title: event.title?.replace(/\s+/g, ' ').trim() || null,
  date: event.startsAt || event.dateText?.replace(/\s+/g, ' ').trim() || null,
});

export const assessProbeEvents = (
  events: RawScrapedEvent[],
  parserKey: ParserKey,
  now = new Date(),
): ProbeAssessment => {
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  const seen = new Set<string>();
  const futureEvents = events.filter((event) => {
    const title = event.title?.replace(/\s+/g, ' ').trim() || '';
    if (title.length < 3 || title.length > 180 || !/\p{L}{2}/u.test(title)) return false;
    if ((event.dateText?.length || 0) > 2_000) return false;
    if (/^(?:programaci[oó]n|agenda|calendario)(?:\s+\w+){0,3}$/i.test(title)) return false;
    if (/\.(?:png|jpe?g|gif|webp|svg|pdf)(?:[?#]|$)/i.test(event.sourceEventUrl || '')) return false;
    const parsed = event.startsAt || parseDateTextToIso(event.dateText, now);
    if (!parsed || new Date(parsed).getTime() < cutoff) return false;
    const identity = event.sourceEventId || event.sourceEventUrl || `${event.title}::${parsed}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });

  const withUrls = futureEvents.filter((event) => Boolean(event.sourceEventUrl)).length;
  const engineConfidence = parserKey === 'generic-agenda' ? 0.25 : parserKey === 'wordpress-generic' ? 0.4 : 0.55;
  const minimumEventCount = parserKey === 'generic-agenda' || parserKey === 'wordpress-generic' ? 2 : 1;
  const volumeConfidence = futureEvents.length >= 3 ? 0.25 : futureEvents.length >= minimumEventCount ? 0.15 : 0;
  const urlConfidence = futureEvents.length > 0 && withUrls / futureEvents.length >= 0.8 ? 0.15 : 0;
  const confidence = Math.round(Math.min(engineConfidence + volumeConfidence + urlConfidence + 0.05, 1) * 10_000) / 10_000;
  const canonical = futureEvents.map(canonicalEvent).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );

  return {
    confidence,
    futureEvents,
    fingerprint: createDeterministicHash(canonical),
    isViable: futureEvents.length >= minimumEventCount && confidence >= 0.7,
  };
};

export const discoverAgendaUrls = async (page: Page, homepageUrl: string): Promise<string[]> => {
  const homepage = new URL(homepageUrl);
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).map((anchor) => ({
      href: anchor.href,
      text: anchor.textContent?.replace(/\s+/g, ' ').trim() || '',
    })),
  );
  const ranked = links
    .flatMap((link) => {
      try {
        const url = new URL(link.href, homepage);
        if (url.origin !== homepage.origin || !/^https?:$/.test(url.protocol)) return [];
        if (isLinkedEventDetailUrl(url.toString())) return [];
        const score = (AGENDA_SIGNAL.test(link.text) ? 2 : 0) + (AGENDA_SIGNAL.test(url.pathname) ? 3 : 0);
        return score > 0 ? [{ url: url.toString(), score }] : [];
      } catch {
        return [];
      }
    })
    .sort((left, right) => right.score - left.score);

  const commonPaths = ['/agenda', '/calendario', '/conciertos', '/programacion', '/eventos'].map(
    (pathname) => new URL(pathname, homepage).toString(),
  );
  return Array.from(
    new Set([homepage.toString(), ...ranked.map((entry) => entry.url), ...commonPaths]),
  ).slice(0, 8);
};

type ViableProbe = {
  parserKey: ParserKey;
  agendaUrl: string;
  assessment: ProbeAssessment;
};

const probeUrl = async (
  page: Page,
  source: ScrapeSource,
  agendaUrl: string,
  logger: Logger,
): Promise<ViableProbe[]> => {
  await page.goto(agendaUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => undefined);
  const html = await page.content();
  const sourceAtAgenda = { ...source, base_url: agendaUrl };
  const results: ViableProbe[] = [];

  for (const parserKey of PROBE_PARSERS) {
    const parser = getParser(parserKey);
    if (parserKey !== 'generic-agenda' && !parser.canHandle(agendaUrl, html)) continue;
    try {
      const events = await parser.parseListPage(page, sourceAtAgenda);
      const assessment = assessProbeEvents(events, parserKey);
      if (assessment.isViable) results.push({ parserKey, agendaUrl, assessment });
    } catch (error) {
      logger.warn('Auto-probe parser rejected source', {
        agendaUrl,
        parserKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
};

export const autoProbeSource = async (
  source: ScrapeSource,
  logger: Logger,
): Promise<AutoProbeResult> => {
  if (!isScrapableWebsite(source.base_url)) {
    return {
      status: 'unsupported',
      eventCount: 0,
      confidence: 0,
      deterministic: false,
      reason: 'social-or-invalid-website',
      sample: [],
    };
  }

  try {
    return await withBrowserPage(
      { logger, sourceId: source.id, sourceUrl: source.base_url, timeoutMs: 35_000 },
      async (page) => {
        await page.goto(source.base_url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => undefined);
        const agendaUrls = await discoverAgendaUrls(page, page.url());
        const viable: ViableProbe[] = [];

        for (const agendaUrl of agendaUrls) {
          try {
            viable.push(...(await probeUrl(page, source, agendaUrl, logger)));
          } catch (error) {
            logger.warn('Auto-probe URL failed', {
              agendaUrl,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        viable.sort((left, right) =>
          right.assessment.confidence - left.assessment.confidence ||
          right.assessment.futureEvents.length - left.assessment.futureEvents.length,
        );
        const best = viable[0];
        if (!best) {
          return {
            status: 'needs_parser',
            eventCount: 0,
            confidence: 0,
            deterministic: false,
            reason: 'no-compatible-future-event-list',
            sample: [],
          };
        }

        await page.goto(best.agendaUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => undefined);
        const replayEvents = await getParser(best.parserKey).parseListPage(page, {
          ...source,
          base_url: best.agendaUrl,
        });
        const replay = assessProbeEvents(replayEvents, best.parserKey);
        const deterministic = replay.fingerprint === best.assessment.fingerprint;

        return {
          status: deterministic ? 'ready_for_review' : 'needs_parser',
          parserKey: best.parserKey,
          agendaUrl: best.agendaUrl,
          eventCount: best.assessment.futureEvents.length,
          confidence: best.assessment.confidence,
          fingerprint: best.assessment.fingerprint,
          deterministic,
          reason: deterministic ? 'two-identical-probes' : 'non-deterministic-probe',
          sample: best.assessment.futureEvents.slice(0, 3).map((event) => ({
            title: event.title,
            dateText: event.dateText,
            startsAt: event.startsAt,
            url: event.sourceEventUrl,
          })),
        };
      },
    );
  } catch (error) {
    return {
      status: 'unreachable',
      eventCount: 0,
      confidence: 0,
      deterministic: false,
      reason: error instanceof Error ? error.message : String(error),
      sample: [],
    };
  }
};
