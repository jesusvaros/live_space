import type { RawScrapedEvent, ScrapeSource, VenueParser } from '../../types/scrape.js';

type JsonRecord = Record<string, unknown>;

type MovistarArenaCard = {
  title?: string;
  href?: string;
  eventId?: string;
  startsAt?: string;
};

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;

const text = (value: unknown): string | undefined => {
  const result = typeof value === 'string' ? value.trim() : '';
  return result || undefined;
};

const recordsFromDocument = (document: string): JsonRecord[] => {
  try {
    const root = asRecord(JSON.parse(document) as unknown);
    if (!root) return [];
    const graph = Array.isArray(root['@graph']) ? root['@graph'].map(asRecord).filter(Boolean) : [];
    return [root, ...(graph as JsonRecord[])];
  } catch {
    return [];
  }
};

const dateTextFromUrl = (url: string): string | undefined => {
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    const match = pathname.match(/\/(\d{1,2})-(\d{1,2})-(\d{4})\/(\d{1,2}):(\d{2})(?:\/|$)/);
    if (!match) return undefined;
    return `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}`;
  } catch {
    return undefined;
  }
};

const isLikelyNonConcert = (title: string): boolean =>
  /\b(?:liga endesa|baloncesto|basket(?:ball)?|real madrid vs)\b/i.test(title);

export const parseMovistarArenaCards = (
  cards: MovistarArenaCard[],
  source: Pick<ScrapeSource, 'base_url' | 'name' | 'city'>,
): RawScrapedEvent[] => {
  const events = new Map<string, RawScrapedEvent>();
  for (const card of cards) {
    const title = card.title?.trim();
    const href = card.href?.trim();
    if (!title || !href || isLikelyNonConcert(title)) continue;

    const sourceEventUrl = new URL(href, source.base_url).toString();
    const dateText = card.startsAt?.trim() || dateTextFromUrl(sourceEventUrl);
    if (!dateText) continue;

    const key = `${sourceEventUrl}|${dateText}`;
    events.set(key, {
      sourceUrl: source.base_url,
      sourceEventUrl,
      sourceEventId: card.eventId ? `${card.eventId}:${dateText}` : key,
      title,
      dateText,
      startsAt: card.startsAt || null,
      venueName: source.name,
      city: source.city ?? undefined,
      artistNames: [],
      rawPayload: card,
    });
  }
  return [...events.values()];
};

export const parseMovistarArenaDocuments = (
  documents: string[],
  source: Pick<ScrapeSource, 'base_url' | 'name' | 'city'>
): RawScrapedEvent[] => {
  const listItems = documents
    .flatMap(recordsFromDocument)
    .filter((record) => record['@type'] === 'ItemList')
    .flatMap((record) => (Array.isArray(record.itemListElement) ? record.itemListElement : []));

  return listItems.flatMap((value): RawScrapedEvent[] => {
    const listItem = asRecord(value);
    const event = asRecord(listItem?.item);
    if (!listItem) return [];

    const sourceEventUrl = text(event?.url) ?? text(listItem.url) ?? text(listItem.item);
    const title = text(event?.name) ?? text(listItem.name);
    const dateText = sourceEventUrl ? dateTextFromUrl(sourceEventUrl) : undefined;
    if (!sourceEventUrl || !title || !dateText || isLikelyNonConcert(title)) return [];

    return [{
      sourceUrl: source.base_url,
      sourceEventUrl,
      sourceEventId: text(event?.['@id']) ?? sourceEventUrl,
      title,
      dateText,
      startsAt: null,
      venueName: source.name,
      city: source.city ?? undefined,
      artistNames: [],
      rawPayload: listItem,
    }];
  });
};

export const movistarArenaAgendaParser: VenueParser = {
  key: 'movistar-arena-agenda',
  canHandle: (url, html) =>
    url.includes('movistararena.es/programacion') && html.includes('application/ld+json'),
  parseListPage: async (page, source) => {
    const cards = await page
      .locator('#listado [data-programme-view="grid"] article.event-card')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const titleLink = element.querySelector<HTMLAnchorElement>('.event-card__heading a');
          const time = element.querySelector<HTMLTimeElement>('.event-card__schedule time[datetime*="T"]');
          return {
            title: titleLink?.dataset.eventDetail || titleLink?.textContent || undefined,
            href: titleLink?.href || undefined,
            eventId: titleLink?.dataset.eventId || undefined,
            startsAt: time?.dateTime || undefined,
          };
        }),
      );
    const cardEvents = parseMovistarArenaCards(cards, source);
    if (cardEvents.length > 0) return cardEvents;

    const documents = await page.locator('script[type="application/ld+json"]').allTextContents();
    return parseMovistarArenaDocuments(documents, source);
  },
};
