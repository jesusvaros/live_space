import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtistNames, pause } from './shared.js';

type SixteenArtist = { name?: string; order?: number; isHeadliner?: boolean };

type SixteenEvent = {
  id?: string;
  title?: string;
  slug?: string;
  date?: string;
  doorsTime?: string | null;
  showTime?: string | null;
  imageUrl?: string | null;
  ticketUrl?: string | null;
  isPublished?: boolean;
  status?: string;
  Category?: { name?: string } | null;
  Artists?: SixteenArtist[];
};

const MAX_MONTHS = 12;

// Next.js streams the page data as `self.__next_f.push([1, "…"])` chunks.
const flightPayload = (html: string): string =>
  Array.from(html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g))
    .map((match) => {
      try {
        const chunk = JSON.parse(match[1]) as unknown[];
        return typeof chunk[1] === 'string' ? chunk[1] : '';
      } catch {
        return '';
      }
    })
    .join('');

// Reads the JSON array that starts at `start` ("[") without a full parser of
// the flight format around it.
const readJsonArray = (text: string, start: number): unknown[] => {
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const value = JSON.parse(text.slice(start, index + 1)) as unknown;
          return Array.isArray(value) ? value : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
};

export const parseSixteenToneladasMonth = (html: string): SixteenEvent[] => {
  const payload = flightPayload(html);
  return Array.from(payload.matchAll(/"events":\[/g)).flatMap((match) =>
    readJsonArray(payload, (match.index ?? 0) + match[0].length - 1).filter(
      (event): event is SixteenEvent =>
        typeof event === 'object' && event !== null && typeof (event as SixteenEvent).date === 'string',
    ),
  );
};

// "date" is the night of the show; a 01:00 slot belongs to the next morning.
const toDateText = (date: string, time: string): string | undefined => {
  const day = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const clock = time.match(/^(\d{2}):(\d{2})/);
  if (!day || !clock) return undefined;
  const start = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
  if (Number(clock[1]) < 6) start.setUTCDate(start.getUTCDate() + 1);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(start.getUTCDate())}/${pad(start.getUTCMonth() + 1)}/${start.getUTCFullYear()} ${clock[1]}:${clock[2]}`;
};

const lineup = (event: SixteenEvent): string[] => {
  const artists = [...(event.Artists || [])]
    .sort(
      (left, right) =>
        Number(Boolean(right.isHeadliner)) - Number(Boolean(left.isHeadliner)) ||
        (left.order ?? 0) - (right.order ?? 0),
    )
    .map((artist) => artist.name?.replace(/\s+/g, ' ').trim())
    .filter((name): name is string => Boolean(name));
  if (artists.length > 0) return Array.from(new Set(artists));
  // Without a line-up, festival days ("…PARTY WEEKEND: VIERNES") and book
  // presentations name no performer in the title either.
  return /:|presentaci[oó]n/i.test(event.title || '') ? [] : billArtistNames(event.title);
};

export const mapSixteenToneladasEvent = (
  event: SixteenEvent,
  sourceUrl: string,
  venueName: string,
  city?: string,
): RawScrapedEvent | null => {
  const title = event.title?.replace(/\s+/g, ' ').trim();
  if (!title || !event.id || !event.slug || !event.date) return null;
  if (event.isPublished === false || (event.status && event.status !== 'active')) return null;
  const category = event.Category?.name;
  if (category && !/concierto|festival/i.test(category)) return null;
  const dateText = toDateText(event.date, event.showTime || event.doorsTime || '21:00:00');
  if (!dateText) return null;

  return {
    sourceUrl,
    sourceEventUrl: new URL(`/events/${event.slug}`, sourceUrl).toString(),
    sourceEventId: event.id,
    title,
    dateText,
    venueName,
    city,
    artistNames: lineup(event),
    imageUrl: event.imageUrl || undefined,
    rawPayload: event,
  };
};

const madridMonth = (date: Date): { year: number; month: number } => {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' })
    .format(date)
    .split('-')
    .map(Number);
  return { year, month };
};

// The programme is one Next.js page per month (`/?month=2026-11`) whose
// flight data lists each night with its line-up in billing order.
export const sixteenToneladasAgendaParser: VenueParser = {
  key: 'sixteen-toneladas-agenda',
  canHandle: (_url, html) => html.includes('self.__next_f') && html.includes('16 Toneladas'),
  parseListPage: async (page, source) => {
    const today = new Date().toISOString().slice(0, 10);
    let { year, month } = madridMonth(new Date());
    const events = new Map<string, SixteenEvent>();
    let emptyMonths = 0;

    for (let index = 0; index < MAX_MONTHS && emptyMonths < 2; index += 1) {
      if (index > 0) await pause(1_000);
      const url = new URL(source.base_url);
      url.searchParams.set('month', `${year}-${String(month).padStart(2, '0')}`);
      const response = await page.context().request.get(url.toString());
      if (!response.ok()) throw new Error(`16 Toneladas returned HTTP ${response.status()} for ${url}`);

      const monthEvents = parseSixteenToneladasMonth(await response.text());
      emptyMonths = monthEvents.length === 0 ? emptyMonths + 1 : 0;
      for (const event of monthEvents) {
        if (event.id && event.date && event.date >= today) events.set(event.id, event);
      }

      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    return Array.from(events.values())
      .map((event) => mapSixteenToneladasEvent(event, source.base_url, source.name, source.city || undefined))
      .filter((event): event is RawScrapedEvent => event !== null);
  },
};
