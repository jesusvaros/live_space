import { artistNamesFromTitle } from '../../normalize/cleanArtistName.js';
import { imageFromSchema } from '../../normalize/extractImage.js';
import type { RawScrapedEvent, ScrapeSource, VenueParser } from '../../types/scrape.js';

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;

const asText = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
};

// WordPress plugins often escape the JSON-LD strings as HTML
// ("En Bruto &#8211; Open mic").
const NAMED_ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] !== '#') return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });

const asDisplayText = (value: unknown): string | undefined => {
  const text = asText(value);
  return text ? decodeEntities(text) : undefined;
};

// Some calendars write the offset without its leading zero ("+1:00"), which
// PostgreSQL and Date reject.
const asIsoDate = (value: unknown): string | undefined =>
  asText(value)?.replace(/([+-])(\d):(\d{2})$/, (_match, sign: string, hour: string, minute: string) => `${sign}0${hour}:${minute}`);

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
      const startsAt = asIsoDate(record.startDate);
      const title = asDisplayText(record.name);
      const performers = performerNames(record.performer);

      return {
        sourceUrl: source.base_url,
        sourceEventUrl,
        sourceEventId: asText(record.identifier ?? record['@id']),
        title,
        description: asDisplayText(record.description),
        dateText: startsAt,
        startsAt: startsAt ?? null,
        venueName: asText(location?.name) ?? source.name,
        city: asText(address?.addressLocality) ?? source.city ?? undefined,
        artistNames: performers.length > 0 ? performers : artistNamesFromTitle(title),
        imageUrl: imageFromSchema(record.image, source.base_url) ?? undefined,
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
