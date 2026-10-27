import { toHttpUrl } from '../../normalize/extractImage.js';
import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtistNames } from './shared.js';

type WixEvent = {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  status?: number;
  scheduling?: { config?: { startDate?: string; scheduleTbd?: boolean } };
  mainImage?: { url?: string };
  location?: { name?: string };
};

// Wix Events status: 0 scheduled, 1 started, 2 ended, 3 canceled.
const CANCELED = 3;

const collectWixEvents = (value: unknown, found: Map<string, WixEvent>): void => {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectWixEvents(entry, found));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const scheduling = record.scheduling as WixEvent['scheduling'];
  if (typeof record.id === 'string' && typeof record.slug === 'string' && typeof record.title === 'string' && scheduling?.config) {
    found.set(record.id, record as WixEvent);
  }
  Object.values(record).forEach((entry) => collectWixEvents(entry, found));
};

export const parseWixWarmupData = (
  json: string,
  source: { base_url: string; name: string; city: string | null },
  now = new Date(),
): RawScrapedEvent[] => {
  const found = new Map<string, WixEvent>();
  try {
    collectWixEvents(JSON.parse(json) as unknown, found);
  } catch {
    return [];
  }

  return Array.from(found.values()).flatMap((event): RawScrapedEvent[] => {
    const startsAt = event.scheduling?.config?.scheduleTbd ? undefined : event.scheduling?.config?.startDate;
    const title = event.title?.replace(/\s+/g, ' ').trim();
    if (!title || !event.slug || !startsAt || event.status === CANCELED) return [];
    if (new Date(startsAt).getTime() < now.getTime() - 12 * 60 * 60 * 1000) return [];

    return [{
      sourceUrl: source.base_url,
      sourceEventUrl: new URL(`/event-details/${event.slug}`, source.base_url).toString(),
      sourceEventId: event.id,
      title,
      description: event.description,
      dateText: startsAt,
      startsAt,
      venueName: source.name,
      city: source.city || undefined,
      artistNames: billArtistNames(title),
      imageUrl: toHttpUrl(event.mainImage?.url, source.base_url) ?? undefined,
      rawPayload: event,
    }];
  });
};

// Wix sites with the Events app embed the upcoming events of their widget in
// the `wix-warmup-data` script, with ids and ISO start dates.
export const wixEventsWarmupParser: VenueParser = {
  key: 'wix-events-warmup',
  canHandle: (_url, html) => html.includes('wix-warmup-data') && html.includes('/event-details/'),
  parseListPage: async (page, source) => {
    const json = await page.locator('script#wix-warmup-data').first().textContent().catch(() => null);
    return json ? parseWixWarmupData(json, source) : [];
  },
};
