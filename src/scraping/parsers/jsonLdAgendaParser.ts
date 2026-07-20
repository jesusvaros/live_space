import type { RawScrapedEvent, ScrapeSource, VenueParser } from '../../types/scrape.js';

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;

const asText = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
};

const absoluteUrl = (value: unknown, baseUrl: string): string | undefined => {
  const text = asText(value);
  if (!text) return undefined;

  try {
    return new URL(text, baseUrl).toString();
  } catch {
    return undefined;
  }
};

const typesFor = (record: JsonRecord): string[] => {
  const value = record['@type'];
  return (Array.isArray(value) ? value : [value]).flatMap((item) => (typeof item === 'string' ? [item] : []));
};

const collectRecords = (value: unknown): JsonRecord[] => {
  if (Array.isArray(value)) return value.flatMap(collectRecords);
  const record = asRecord(value);
  if (!record) return [];

  const graph = collectRecords(record['@graph']);
  return [record, ...graph];
};

const performerNames = (value: unknown): string[] => {
  const entries = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      entries
        .map((entry) => (typeof entry === 'string' ? entry : asText(asRecord(entry)?.name)))
        .filter((entry): entry is string => Boolean(entry))
    )
  );
};

export const parseJsonLdDocuments = (
  documents: string[],
  source: Pick<ScrapeSource, 'base_url' | 'name' | 'city'>
): RawScrapedEvent[] => {
  const records = documents.flatMap((document) => {
    try {
      return collectRecords(JSON.parse(document) as unknown);
    } catch {
      return [];
    }
  });

  const events = records
    .filter((record) => typesFor(record).some((type) => type === 'Event' || type.endsWith('Event')))
    .map((record): RawScrapedEvent => {
      const location = asRecord(record.location);
      const address = asRecord(location?.address);
      const sourceEventUrl = absoluteUrl(record.url ?? record['@id'], source.base_url);
      const startsAt = asText(record.startDate);

      return {
        sourceUrl: source.base_url,
        sourceEventUrl,
        sourceEventId: asText(record.identifier ?? record['@id']),
        title: asText(record.name),
        description: asText(record.description),
        dateText: startsAt,
        startsAt: startsAt ?? null,
        venueName: asText(location?.name) ?? source.name,
        city: asText(address?.addressLocality) ?? source.city ?? undefined,
        artistNames: performerNames(record.performer),
        rawPayload: record,
      };
    })
    .filter((event) => Boolean(event.title && (event.startsAt || event.dateText)));

  const seen = new Set<string>();
  return events.filter((event) => {
    const key = event.sourceEventUrl ?? `${event.title}::${event.startsAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const jsonLdAgendaParser: VenueParser = {
  key: 'json-ld-agenda',
  canHandle: (_url, html) => html.includes('application/ld+json'),
  parseListPage: async (page, source) => {
    const documents = await page.locator('script[type="application/ld+json"]').allTextContents();
    return parseJsonLdDocuments(documents, source);
  },
};
