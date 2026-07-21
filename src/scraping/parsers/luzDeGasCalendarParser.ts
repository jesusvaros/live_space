import type { RawScrapedEvent, ScrapeSource, VenueParser } from '../../types/scrape.js';

type WordpressEvent = {
  id?: number | string;
  link?: string;
  title?: { rendered?: string };
};

export type LuzDeGasCard = {
  venue?: string;
  title?: string;
  date?: string;
  time?: string;
  sourceEventUrl?: string;
};

const clean = (value: string | undefined): string | undefined => {
  const result = value?.replace(/\s+/g, ' ').trim();
  return result || undefined;
};

const firstTime = (value: string | undefined): string | undefined =>
  clean(value)?.match(/\b\d{1,2}:\d{2}h?/i)?.[0]?.replace(/h$/i, '');

export const mapLuzDeGasCard = (
  card: LuzDeGasCard,
  concertIdsByUrl: Map<string, string>,
  source: Pick<ScrapeSource, 'base_url' | 'name' | 'city'>,
): RawScrapedEvent | null => {
  const title = clean(card.title);
  const date = clean(card.date);
  const startsAtText = firstTime(card.time);
  const sourceEventUrl = clean(card.sourceEventUrl);
  if (
    clean(card.venue)?.toLocaleLowerCase('es') !== 'luz de gas' ||
    !title ||
    !date ||
    !startsAtText ||
    !sourceEventUrl
  ) {
    return null;
  }

  const sourceEventId = concertIdsByUrl.get(sourceEventUrl);
  if (!sourceEventId) return null;

  return {
    sourceUrl: source.base_url,
    sourceEventUrl,
    sourceEventId,
    title,
    dateText: `${date} ${startsAtText}`,
    startsAt: null,
    venueName: source.name,
    city: source.city ?? undefined,
    artistNames: [title],
    rawPayload: {
      id: sourceEventId,
      title,
      date,
      time: startsAtText,
      venue: source.name,
      url: sourceEventUrl,
      format: 'concierto',
    },
  };
};

export const luzDeGasCalendarParser: VenueParser = {
  key: 'luz-de-gas-calendar',
  canHandle: (url, html) => url.includes('luzdegas.com') && html.includes('wp-json'),
  parseListPage: async (page, source) => {
    const endpoint = new URL('/wp-json/wp/v2/evento', source.base_url);
    endpoint.searchParams.set('formato', '9');
    endpoint.searchParams.set('sala', '32');
    endpoint.searchParams.set('per_page', '100');
    endpoint.searchParams.set('_fields', 'id,link,title');

    const response = await page.context().request.get(endpoint.toString());
    if (!response.ok()) {
      throw new Error(`Luz de Gas events API returned HTTP ${response.status()}`);
    }

    const posts = (await response.json()) as WordpressEvent[];
    const concertIdsByUrl = new Map(
      (Array.isArray(posts) ? posts : []).flatMap((post) =>
        post.id != null && post.link ? [[post.link, String(post.id)] as const] : [],
      ),
    );

    await page.goto(new URL('/es/calendar/', source.base_url).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

    const cards: LuzDeGasCard[] = [];
    for (const card of await page.locator('.main-archive__card').all()) {
      const moreInfoLink = card.locator('a.main-archive__btn-ticket--sfondo').first();
      cards.push({
        venue: await card.locator('.main-archive__term').first().textContent() ?? undefined,
        title: await card.locator('.main-archive__heading').first().textContent() ?? undefined,
        date: await card.locator('.main-archive__fecha').first().textContent() ?? undefined,
        time: await card.locator('.main-archive__horario').first().textContent() ?? undefined,
        sourceEventUrl: await moreInfoLink.getAttribute('href') ?? undefined,
      });
    }

    return cards
      .map((card) => mapLuzDeGasCard(card, concertIdsByUrl, source))
      .filter((event): event is RawScrapedEvent => event !== null);
  },
};
