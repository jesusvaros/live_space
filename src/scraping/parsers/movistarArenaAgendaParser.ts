import type { RawScrapedEvent, ScrapeSource, VenueParser } from '../../types/scrape.js';

type JsonRecord = Record<string, unknown>;

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
    if (!listItem || !event || event['@type'] !== 'Event') return [];

    const sourceEventUrl = text(event.url) ?? text(listItem.url);
    const title = text(event.name) ?? text(listItem.name);
    const dateText = sourceEventUrl ? dateTextFromUrl(sourceEventUrl) : undefined;
    if (!sourceEventUrl || !title || !dateText) return [];

    return [{
      sourceUrl: source.base_url,
      sourceEventUrl,
      sourceEventId: text(event['@id']) ?? sourceEventUrl,
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
    const documents = await page.locator('script[type="application/ld+json"]').allTextContents();
    return parseMovistarArenaDocuments(documents, source);
  },
};
