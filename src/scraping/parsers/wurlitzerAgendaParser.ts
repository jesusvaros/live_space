import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { lineupFromTitle } from './shared.js';

const EVENT_START_RE = /\{id:"([0-9a-f-]{36})",slug:"/g;

// Values in the TanStack Start payload are JavaScript literals: strings,
// null or seroval references such as $R[16].
const readField = (chunk: string, field: string): string | undefined => {
  const match = chunk.match(new RegExp(`[,{]${field}:("(?:[^"\\\\]|\\\\.)*")`));
  if (!match) return undefined;
  try {
    return JSON.parse(match[1].replace(/\\x([0-9a-f]{2})/gi, '\\u00$1')) as string;
  } catch {
    return undefined;
  }
};

// Wurlitzer Ballroom renders its agenda with TanStack Start. The server
// dehydrates every event (title, support acts and an ISO start) into the
// HTML, so the parser reads the raw response instead of the hydrated DOM.
// Posters are Supabase links signed for 24 hours, so none is kept.
export const wurlitzerAgendaParser: VenueParser = {
  key: 'wurlitzer-agenda',
  canHandle: (_url, html) => html.includes('$_TSR') && html.includes('support_acts'),
  parseListPage: async (page, source) => {
    const response = await page.context().request.get(source.base_url);
    if (!response.ok()) throw new Error(`Wurlitzer agenda returned HTTP ${response.status()}`);
    const html = await response.text();
    const starts = Array.from(html.matchAll(EVENT_START_RE));

    return starts.flatMap((match, index): RawScrapedEvent[] => {
      const chunk = html.slice(match.index, starts[index + 1]?.index ?? match.index + 20_000);
      const slug = readField(chunk, 'slug');
      const title = readField(chunk, 'title');
      const startsAt = readField(chunk, 'starts_at');
      const eventType = readField(chunk, 'event_type');
      if (!slug || !title || !startsAt || Number.isNaN(Date.parse(startsAt))) return [];
      if (eventType && eventType !== 'concierto') return [];
      const supportActs = readField(chunk, 'support_acts');
      const lineup = [title, ...(supportActs ? supportActs.split(/\s*[+,]\s*/) : [])].join(' + ');

      return [{
        sourceUrl: source.base_url,
        sourceEventUrl: new URL(`/concierto/${slug}`, source.base_url).toString(),
        sourceEventId: match[1],
        title,
        startsAt,
        venueName: source.name,
        city: source.city || undefined,
        artistNames: lineupFromTitle(lineup),
        rawPayload: { id: match[1], slug, title, supportActs, startsAt, eventType, ticketUrl: readField(chunk, 'ticket_url'), price: readField(chunk, 'price') },
      }];
    });
  },
};
