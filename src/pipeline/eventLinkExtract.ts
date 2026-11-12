// Reads one concert from a ticket page sent with «¿No encuentras un
// concierto?» (docs/scraping.md, "Sugerencias de usuarios"). Deterministic:
// schema.org Event in JSON-LD, OpenGraph only for a title and an image to
// show a reviewer. No AI, no browser.
//
// Outcomes:
//   event  → a complete concert (name, start, venue): it is staged.
//   review → something a person should look at (no JSON-LD, several events,
//            missing venue or date, outside Spain, postponed).
//   failed → nothing to import (the page describes itself as something other
//            than an event, the concert was cancelled, or it is online only).

import { artistNamesFromTitle } from '../normalize/cleanArtistName.js';
import { imageFromSchema, toHttpUrl } from '../normalize/extractImage.js';
import { parseDateTextToIso } from '../normalize/normalizeEvent.js';
import { decodeEntities } from '../scraping/parsers/jsonLdAgendaParser.js';

type JsonRecord = Record<string, unknown>;

export type ExtractedEvent = {
  /** Canonical page of the event (JSON-LD url on the same site, else the fetched page). */
  url: string;
  title: string;
  description?: string;
  startsAt: string;
  /** Schema type as published (MusicEvent, Event, Festival…). */
  schemaType: string;
  venueName: string;
  /** True when the venue came from the source we already scrape on that site. */
  venueFromSource: boolean;
  city?: string;
  countryCode?: string;
  streetAddress?: string;
  latitude?: number;
  longitude?: number;
  artistNames: string[];
  imageUrl?: string;
  ticketUrl?: string;
  prices: number[];
  isFree: boolean;
  /** The JSON-LD object it came from, for the staging row's raw payload. */
  record: JsonRecord;
};

export type OpenGraph = { title?: string; imageUrl?: string; type?: string };

export type ExtractionResult =
  | { kind: 'event'; event: ExtractedEvent; openGraph: OpenGraph }
  | { kind: 'review'; reason: string; openGraph: OpenGraph; partial?: Partial<ExtractedEvent> }
  | { kind: 'failed'; reason: string; openGraph: OpenGraph };

export type ExtractOptions = {
  /** Venue to assume when the page names none (a venue's own website). */
  venueFallback?: { name: string; city: string | null } | null;
};

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;

const asText = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const text = typeof value === 'string' ? decodeEntities(value).replace(/\s+/g, ' ').trim() : '';
  return text || undefined;
};

const firstOf = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

const typesOf = (record: JsonRecord): string[] => {
  const value = record['@type'];
  return (Array.isArray(value) ? value : [value])
    .flatMap(item => (typeof item === 'string' ? [item] : []))
    .map(type => type.replace(/^https?:\/\/schema\.org\//i, ''));
};

// Event and its subtypes (MusicEvent, ComedyEvent…); Festival is an Event
// subtype whose name does not end in "Event".
const isEventType = (type: string) => /Event$/.test(type) || type === 'Festival';
const isEvent = (record: JsonRecord) => typesOf(record).some(isEventType);

// --- HTML ------------------------------------------------------------------

const JSON_LD_RE = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;

/** Raw text of every JSON-LD block. */
export const jsonLdBlocks = (html: string): string[] => Array.from(html.matchAll(JSON_LD_RE), match => match[1]);

const parseBlock = (block: string): unknown => {
  const text = block
    .trim()
    .replace(/^<!--/, '')
    .replace(/-->$/, '')
    .replace(/^\s*\/\/\s*<!\[CDATA\[/, '')
    .replace(/\/\/\s*\]\]>\s*$/, '')
    .trim();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // WordPress templates print descriptions with raw line breaks, which
    // JSON does not allow inside strings.
    try {
      // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
      return JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' ')) as unknown;
    } catch {
      return undefined;
    }
  }
};

/** Every object in the documents: arrays, @graph and ItemList entries. */
const collectRecords = (value: unknown, depth = 0): JsonRecord[] => {
  if (depth > 4) return [];
  if (Array.isArray(value)) return value.flatMap(item => collectRecords(item, depth + 1));
  const record = asRecord(value);
  if (!record) return [];
  const nested = [
    ...collectRecords(record['@graph'], depth + 1),
    ...(Array.isArray(record.itemListElement)
      ? record.itemListElement.flatMap(item => collectRecords(asRecord(item)?.item ?? item, depth + 1))
      : []),
  ];
  return [record, ...nested];
};

const metaContent = (html: string, property: string): string | undefined => {
  const escaped = property.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*\\bcontent\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'),
    new RegExp(`<meta[^>]+\\bcontent\\s*=\\s*(["'])([\\s\\S]*?)\\1[^>]*(?:property|name)\\s*=\\s*["']${escaped}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const value = asText(html.match(pattern)?.[2]);
    if (value) return value;
  }
  return undefined;
};

export const readOpenGraph = (html: string, pageUrl: string): OpenGraph => {
  const titleTag = asText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  return {
    title: metaContent(html, 'og:title') ?? titleTag,
    imageUrl: toHttpUrl(metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image'), pageUrl) ?? undefined,
    type: metaContent(html, 'og:type'),
  };
};

// --- Fields ------------------------------------------------------------------

const sameUrl = (left: string | undefined, right: string | undefined) => {
  if (!left || !right) return false;
  const strip = (value: string) => value.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/i, '').toLowerCase();
  return strip(left) === strip(right);
};

const hostOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '').toLowerCase() : '';
  } catch {
    return '';
  }
};

const absolute = (value: unknown, baseUrl: string): string | undefined => {
  const text = asText(value);
  return text ? (toHttpUrl(text, baseUrl) ?? undefined) : undefined;
};

/**
 * schema.org dates as an ISO instant. A date or time without an offset is
 * read in Madrid time (the runner is in UTC): «2026-11-15» → 20:00 Madrid,
 * «2026-11-15T21:30» → 21:30 Madrid.
 */
export const schemaDateToIso = (value: unknown): string | null => {
  const text = asText(value)?.replace(/([+-])(\d):(\d{2})$/, (_m, sign: string, hour: string, minute: string) => `${sign}0${hour}:${minute}`);
  if (!text) return null;
  const local = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/);
  if (local) {
    const [, year, month, day, hour, minute] = local;
    return parseDateTextToIso(`${day}/${month}/${year}${hour ? ` ${hour}:${minute}` : ''}`);
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
};

const COUNTRY_ES = /^(es|esp|spain|españa|espana|espagne|spanien)$/i;

const countryOf = (address: JsonRecord | null): string | undefined => {
  const country = address?.addressCountry;
  return asText(asRecord(country)?.name ?? asRecord(country)?.identifier ?? country);
};

// «Av. Felipe II, S/N, 28009 Madrid, Spain» → Madrid.
const cityFromAddressText = (text: string | undefined) =>
  text?.match(/\b\d{5}\s+([^,\d]+?)\s*(?:,|$)/)?.[1]?.trim() || undefined;

type Venue = Pick<ExtractedEvent, 'city' | 'countryCode' | 'streetAddress' | 'latitude' | 'longitude'> & {
  name?: string;
  online: boolean;
};

const readLocation = (value: unknown): Venue => {
  const entries = (Array.isArray(value) ? value : [value]).filter(entry => entry !== undefined && entry !== null);
  const places = entries.map(entry => (typeof entry === 'string' ? { name: entry } : asRecord(entry))).filter(Boolean) as JsonRecord[];
  const physical = places.find(place => !typesOf(place).includes('VirtualLocation'));
  if (!physical) return { online: places.length > 0, name: undefined };

  const addressValue = physical.address;
  const address = asRecord(addressValue);
  const addressText = typeof addressValue === 'string' ? asText(addressValue) : undefined;
  const geo = asRecord(physical.geo);
  const latitude = Number(geo?.latitude);
  const longitude = Number(geo?.longitude);
  return {
    online: false,
    name: asText(physical.name),
    city: asText(address?.addressLocality) ?? cityFromAddressText(addressText ?? asText(address?.streetAddress)),
    countryCode: countryOf(address),
    streetAddress: asText(address?.streetAddress) ?? addressText,
    latitude: Number.isFinite(latitude) && latitude !== 0 ? latitude : undefined,
    longitude: Number.isFinite(longitude) && longitude !== 0 ? longitude : undefined,
  };
};

const performerNames = (value: unknown): string[] => {
  const entries = Array.isArray(value) ? value : [value];
  const names = entries
    .map(entry => (typeof entry === 'string' ? asText(entry) : asText(asRecord(entry)?.name)))
    .filter((name): name is string => Boolean(name));
  const seen = new Set<string>();
  return names.filter(name => {
    const key = name.toLocaleLowerCase('es-ES');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const PRICE_RE = /(\d{1,3}(?:[.,]\d{1,2})?)/g;

const toPrice = (value: unknown): number[] => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value < 1000 ? [Math.round(value * 100) / 100] : [];
  const text = asText(value);
  if (!text) return [];
  return Array.from(text.matchAll(PRICE_RE), match => Number(match[1].replace(',', '.')))
    .filter(price => Number.isFinite(price) && price >= 0 && price < 1000)
    .map(price => Math.round(price * 100) / 100);
};

const readOffers = (value: unknown, pageUrl: string) => {
  const offers = (Array.isArray(value) ? value : [value]).map(asRecord).filter(Boolean) as JsonRecord[];
  const prices = new Set<number>();
  let ticketUrl: string | undefined;
  for (const offer of offers) {
    for (const key of ['price', 'lowPrice', 'highPrice']) for (const price of toPrice(offer[key])) prices.add(price);
    const specification = asRecord(firstOf(offer.priceSpecification));
    for (const price of toPrice(specification?.price)) prices.add(price);
    ticketUrl ??= absolute(offer.url, pageUrl);
  }
  const paid = [...prices].filter(price => price > 0).sort((left, right) => left - right);
  return { prices: paid, isFree: prices.size > 0 && paid.length === 0, ticketUrl };
};

// --- Choice of the event ------------------------------------------------------

const eventKey = (record: JsonRecord) => `${asText(record.name) ?? ''}|${schemaDateToIso(record.startDate) ?? ''}`;

const pickEvent = (events: JsonRecord[], pageUrl: string): JsonRecord | 'several' | null => {
  if (events.length === 0) return null;
  const byUrl = events.filter(record => sameUrl(asText(record.url) ?? asText(record['@id']), pageUrl));
  if (byUrl.length === 1) return byUrl[0];
  const distinct = new Map(events.map(record => [eventKey(record), record]));
  if (distinct.size === 1) {
    // The same event printed twice (a theme block and an SEO plugin): keep
    // the richest copy.
    return [...events].sort((left, right) => Object.keys(right).length - Object.keys(left).length)[0];
  }
  return 'several';
};

// --- Entry point -------------------------------------------------------------

export const extractEventFromHtml = (html: string, pageUrl: string, options: ExtractOptions = {}): ExtractionResult => {
  const openGraph = readOpenGraph(html, pageUrl);
  const blocks = jsonLdBlocks(html);
  const records = blocks.flatMap(block => collectRecords(parseBlock(block)));
  const events = records.filter(isEvent);

  if (events.length === 0) {
    // The page describes itself in JSON-LD and none of it is an event (a
    // listing, a shop, an organisation's home): nothing to import.
    if (records.some(record => typesOf(record).length > 0)) {
      return { kind: 'failed', reason: 'not-an-event', openGraph };
    }
    return { kind: 'review', reason: openGraph.title ? 'no-structured-data' : 'no-structured-data-no-title', openGraph };
  }

  const picked = pickEvent(events, pageUrl);
  if (picked === 'several') return { kind: 'review', reason: `several-events:${events.length}`, openGraph };
  const record = picked as JsonRecord;

  const status = asText(record.eventStatus)?.replace(/^https?:\/\/schema\.org\//i, '');
  if (status === 'EventCancelled') return { kind: 'failed', reason: 'cancelled', openGraph };

  const title = asText(record.name) ?? openGraph.title;
  const startsAt = schemaDateToIso(record.startDate);
  const location = readLocation(record.location);
  if (location.online && !location.name) return { kind: 'failed', reason: 'online-event', openGraph };

  const fallback = options.venueFallback ?? null;
  const venueName = location.name ?? fallback?.name;
  const city = location.city ?? (location.name ? undefined : (fallback?.city ?? undefined));

  const schemaUrl = absolute(record.url ?? record['@id'], pageUrl);
  const url = schemaUrl && hostOf(schemaUrl) === hostOf(pageUrl) && !schemaUrl.includes('#') ? schemaUrl : pageUrl;
  const performers = performerNames(record.performer);
  const offers = readOffers(record.offers, pageUrl);
  const free = record.isAccessibleForFree === true || record.isAccessibleForFree === 'true' || offers.isFree;

  const partial: Partial<ExtractedEvent> = {
    url,
    title,
    description: asText(record.description)?.slice(0, 4000),
    startsAt: startsAt ?? undefined,
    schemaType: typesOf(record).find(isEventType) ?? 'Event',
    venueName,
    venueFromSource: !location.name && Boolean(fallback?.name),
    city,
    countryCode: location.countryCode,
    streetAddress: location.streetAddress,
    latitude: location.latitude,
    longitude: location.longitude,
    artistNames: performers.length > 0 ? performers : artistNamesFromTitle(title),
    imageUrl: imageFromSchema(record.image, pageUrl) ?? openGraph.imageUrl,
    ticketUrl: offers.ticketUrl,
    prices: offers.prices,
    isFree: free && offers.prices.length === 0,
    record,
  };

  if (!title) return { kind: 'review', reason: 'missing-title', openGraph, partial };
  if (!startsAt) return { kind: 'review', reason: 'missing-start-date', openGraph, partial };
  if (!venueName) return { kind: 'review', reason: 'missing-venue', openGraph, partial };
  if (location.countryCode && !COUNTRY_ES.test(location.countryCode)) {
    return { kind: 'review', reason: `outside-spain:${location.countryCode}`, openGraph, partial };
  }
  if (status === 'EventPostponed' || status === 'EventRescheduled') {
    return { kind: 'review', reason: `status:${status}`, openGraph, partial };
  }

  return { kind: 'event', event: partial as ExtractedEvent, openGraph };
};
