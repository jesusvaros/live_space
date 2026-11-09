import type { RawScrapedEvent, ScrapeSource, VenueParser } from '../../types/scrape.js';
import { billArtists, isCancelled, isNotConcert, isUpcoming, madridIso } from './localScene.js';

// Generic iCalendar feed (RFC 5545). WordPress agenda plugins publish one
// next to the HTML agenda: Events Manager at /events.ics, The Events
// Calendar at ?ical=1, Modern Events Calendar… The feed carries the start
// with its time zone, a stable UID and the categories, which is more
// reliable than the theme's HTML. `metadata.icsUrl` points at the feed
// (default: /events.ics on the source's host) and
// `metadata.categoryAllowlist` keeps only the concert categories.

type SourceLike = Pick<ScrapeSource, 'base_url' | 'name' | 'city' | 'metadata'>;

export type IcsEvent = {
  uid?: string;
  summary?: string;
  description?: string;
  url?: string;
  dtstart?: string;
  dtstartParams?: string;
  status?: string;
  categories: string[];
  attach?: string;
};

// Long lines are folded with CRLF + one space or tab.
const unfold = (text: string): string[] => text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');

const unescapeText = (value: string): string =>
  value
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .trim();

// Commas inside a value are escaped ("\,"), so only bare commas separate.
const splitList = (value: string): string[] =>
  value
    .split(/(?<!\\),/)
    .map((part) => unescapeText(part))
    .filter(Boolean);

export const parseIcsEvents = (ics: string): IcsEvent[] => {
  const events: IcsEvent[] = [];
  let current: IcsEvent | null = null;

  for (const line of unfold(ics)) {
    if (line === 'BEGIN:VEVENT') {
      current = { categories: [] };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const match = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
    if (!match) continue;
    const [, name, params, value] = match;
    switch (name) {
      case 'UID': current.uid = value.trim(); break;
      case 'SUMMARY': current.summary = unescapeText(value); break;
      case 'DESCRIPTION': current.description = unescapeText(value); break;
      case 'URL': current.url = value.trim(); break;
      case 'DTSTART': current.dtstart = value.trim(); current.dtstartParams = params; break;
      case 'STATUS': current.status = value.trim().toUpperCase(); break;
      case 'CATEGORIES': current.categories.push(...splitList(value)); break;
      case 'ATTACH': if (/^https?:\/\//i.test(value)) current.attach = value.trim(); break;
      default: break;
    }
  }

  return events;
};

// DTSTART forms: 20261110T203000 with TZID (wall clock), 20261110T193000Z
// (UTC) and VALUE=DATE:20261110 (all day, no time).
export const icsStartToIso = (value: string | undefined, params = ''): string | null => {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, , utc] = match;
  if (hour === undefined) return madridIso(Number(year), Number(month), Number(day));
  if (utc) {
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().replace('.000Z', 'Z');
  }
  const tzid = params.match(/TZID=([^;:]+)/i)?.[1];
  // A floating time or another Spanish zone is read as Madrid wall clock;
  // Canarias would need its own offset, so it is not accepted.
  if (tzid && !/Europe\/Madrid|Europe\/Paris|Romance/i.test(tzid)) return null;
  return madridIso(Number(year), Number(month), Number(day), Number(hour), Number(minute));
};

// Postponed or cancelled nights stay in the feed with a note in the title,
// in Spanish, Catalan or Basque ("atzeratua", "bertan behera").
const isCalledOff = (text: string): boolean => isCancelled(text) || /\batzeratu|bertan\s+behera/i.test(text);

// "Mugan (Kutxa Beltza aretoan)", "Niña Polaca (Sarrerak agortuta)",
// "Barrrk - "Madarikatu" EP berriaren aurkezpena", "Tito Ramirez y su
// Orquesta: "Los verdaderos reales"": the bill is what comes before the
// room, ticket note, quoted show name or tour/album subtitle. "A vs B" bills
// a tribute ("ZUMO DE BELLOTA vs EXTREMODURO"), so B is not a performer.
export const icsBillTitle = (summary: string): string =>
  summary
    .replace(/\s*\([^)]*\)?\s*[.,;]?\s*$/, ' ')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+[-–—]\s+.*$/, '')
    .replace(/\s*:?\s+["“«].*$/, '')
    .replace(/\s+vs\.?\s+.*$/i, '')
    .replace(/[\s.,;:-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

// "+dMANÁ": a band whose name starts with "+" is not an empty act before a
// "+" separator; the split drops the sign, so it is put back.
export const keepLeadingPlus = (bill: string, names: string[]): string[] => {
  const lead = bill.match(/^\+(\S[^+]*)/)?.[1]?.trim().toLocaleLowerCase('es');
  return names.map((name, index) => (index === 0 && lead?.startsWith(name.toLocaleLowerCase('es')) ? `+${name}` : name));
};

// A title that opens with quotes names a show, not a performer.
const icsArtists = (summary: string): string[] => {
  if (/^["“«]/.test(summary)) return [];
  const bill = icsBillTitle(summary);
  return keepLeadingPlus(bill, billArtists(bill));
};

export const mapIcsEvents = (
  events: IcsEvent[],
  source: SourceLike,
  now = new Date(),
): RawScrapedEvent[] => {
  const allowlist = Array.isArray(source.metadata.categoryAllowlist)
    ? source.metadata.categoryAllowlist.filter((value): value is string => typeof value === 'string')
    : [];

  return events.flatMap((event): RawScrapedEvent[] => {
    const title = event.summary?.replace(/\s+/g, ' ').trim();
    if (!title || event.status === 'CANCELLED' || isCalledOff(title) || isNotConcert(title)) return [];
    if (allowlist.length > 0 && !event.categories.some((category) => allowlist.includes(category))) return [];
    const startsAt = icsStartToIso(event.dtstart, event.dtstartParams);
    if (!startsAt || !isUpcoming(startsAt, now)) return [];

    return [{
      sourceUrl: source.base_url,
      sourceEventUrl: event.url,
      sourceEventId: event.uid ?? event.url,
      title,
      description: event.description?.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim() || undefined,
      dateText: startsAt,
      startsAt,
      venueName: source.name,
      city: source.city || undefined,
      artistNames: icsArtists(title),
      imageUrl: event.attach,
      rawPayload: {
        uid: event.uid,
        summary: event.summary,
        url: event.url,
        dtstart: event.dtstart,
        categories: event.categories,
        image: event.attach,
      },
    }];
  });
};

export const icsFeedUrl = (source: Pick<ScrapeSource, 'base_url' | 'metadata'>): string => {
  const configured = typeof source.metadata.icsUrl === 'string' ? source.metadata.icsUrl : undefined;
  return new URL(configured || '/events.ics', source.base_url).toString();
};

export const icsFeedParser: VenueParser = {
  key: 'ics-feed',
  canHandle: (_url, html) => /\.ics\b|ical=1|text\/calendar/i.test(html),
  parseListPage: async (page, source) => {
    const feedUrl = icsFeedUrl(source);
    const response = await page.context().request.get(feedUrl, { timeout: 30_000 });
    if (!response.ok()) throw new Error(`iCalendar feed ${feedUrl} returned HTTP ${response.status()}`);
    const body = await response.text();
    if (!body.includes('BEGIN:VCALENDAR')) throw new Error(`iCalendar feed ${feedUrl} is not a calendar`);
    return mapIcsEvents(parseIcsEvents(body), source);
  },
};
