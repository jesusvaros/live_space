import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';

type TribeEvent = {
  id?: number | string;
  title?: string;
  description?: string;
  url?: string;
  start_date?: string;
  all_day?: boolean;
  categories?: Array<{ name?: string }>;
};

type TribeEventsResponse = {
  events?: TribeEvent[];
  total_pages?: number;
};

const stripHtml = (value: string | undefined): string | undefined => {
  const cleaned = value
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;|&#x0*26;/gi, '&')
    .replace(/&#8211;|&ndash;/gi, '–')
    .replace(/&#8217;|&rsquo;/gi, '’')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
};

const toArtistTitle = (title: string): string =>
  title
    .replace(/\s*\((?:sold out|nueva fecha|segunda fecha)\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toMadridDateText = (value: string | undefined, allDay = false): string | undefined => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return value;
  return allDay
    ? `${match[3]}/${match[2]}/${match[1]}`
    : `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}`;
};

export const mapTribeEvent = (
  event: TribeEvent,
  sourceUrl: string,
  venueName: string,
  city?: string,
): RawScrapedEvent | null => {
  const title = stripHtml(event.title);
  const dateText = toMadridDateText(event.start_date, event.all_day === true);
  if (!title || !dateText) return null;

  return {
    sourceUrl,
    sourceEventUrl: event.url,
    sourceEventId: event.id == null ? undefined : String(event.id),
    title,
    description: stripHtml(event.description),
    dateText,
    venueName,
    city,
    artistNames: [toArtistTitle(title)],
    rawPayload: event,
  };
};

export const tribeEventsApiParser: VenueParser = {
  key: 'tribe-events-api',
  canHandle: (_url, html) =>
    html.includes('tribe-events') || html.includes('/wp-json/tribe/events/v1/'),
  parseListPage: async (page, source) => {
    const endpoint = new URL('/wp-json/tribe/events/v1/events', source.base_url);
    endpoint.searchParams.set('per_page', '50');
    endpoint.searchParams.set('status', 'publish');

    const events: TribeEvent[] = [];
    const categoryAllowlist = Array.isArray(source.metadata.categoryAllowlist)
      ? source.metadata.categoryAllowlist.filter((value): value is string => typeof value === 'string')
      : [];
    let pageNumber = 1;
    let totalPages = 1;

    do {
      endpoint.searchParams.set('page', String(pageNumber));
      const response = await page.context().request.get(endpoint.toString());
      if (!response.ok()) {
        throw new Error(`Tribe Events API returned HTTP ${response.status()}`);
      }

      const payload = (await response.json()) as TribeEventsResponse;
      events.push(...(Array.isArray(payload.events) ? payload.events : []));
      totalPages = Math.min(Math.max(payload.total_pages || 1, 1), 10);
      pageNumber += 1;
    } while (pageNumber <= totalPages);

    return events
      .filter((event) => {
        if (categoryAllowlist.length === 0) return true;
        const categories = (event.categories || []).map((category) => category.name).filter(Boolean);
        return categories.some((category) => categoryAllowlist.includes(category as string));
      })
      .map((event) => mapTribeEvent(event, source.base_url, source.name, source.city || undefined))
      .filter((event): event is RawScrapedEvent => event !== null);
  },
};
