import type { RawScrapedEvent, ScrapeSource, VenueParser } from '../../types/scrape.js';
import { billArtists, isCancelled, isUpcoming, madridIso, parseClock } from './localScene.js';

// Rock & Blues Café (Zaragoza) builds its agenda from a JSON array printed in
// the page (`const rbEventsData = [...]`): title, canonical URL, weekday,
// day, month name, hour, style, origin and poster of every upcoming night.
// The year is only in the canonical URL ("…-zaragoza-11-11-2026/"), which is
// also the stable id.

type SourceLike = Pick<ScrapeSource, 'base_url' | 'name' | 'city'>;

type RockBluesEvent = {
  titulo?: string;
  url?: string;
  cartel?: string;
  ciclo?: string;
  dia?: string;
  mes?: string;
  hora?: string;
  estilo?: string;
  procedencia?: string;
  descripcion?: string;
  tieneEntrada?: boolean;
};

// The first JSON array after `marker`, read with the JSON grammar so a "]"
// inside a description does not end it early.
export const jsonArrayAfter = (html: string, marker: string): unknown[] => {
  const start = html.indexOf('[', html.indexOf(marker));
  if (html.indexOf(marker) < 0 || start < 0) return [];
  let depth = 0;
  let inString = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(html.slice(start, index + 1));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
};

export const parseRockBluesHtml = (html: string, source: SourceLike, now = new Date()): RawScrapedEvent[] => {
  const seen = new Set<string>();
  return (jsonArrayAfter(html, 'rbEventsData') as RockBluesEvent[]).flatMap((event): RawScrapedEvent[] => {
    const title = event.titulo?.replace(/\s+/g, ' ').trim();
    const url = event.url?.trim();
    const date = url?.match(/-(\d{2})-(\d{2})-(20\d{2})\/?$/);
    if (!title || !url || !date || seen.has(url) || isCancelled(title)) return [];
    // The URL date must be the night the card shows.
    if (event.dia && Number(event.dia) !== Number(date[1])) return [];
    const clock = parseClock(event.hora);
    const startsAt = madridIso(Number(date[3]), Number(date[2]), Number(date[1]), clock?.hour, clock?.minute);
    if (!startsAt || !isUpcoming(startsAt, now)) return [];
    seen.add(url);

    return [{
      sourceUrl: source.base_url,
      sourceEventUrl: url,
      sourceEventId: url,
      title,
      description: event.descripcion?.replace(/\s+/g, ' ').trim() || undefined,
      dateText: `${date[1]}/${date[2]}/${date[3]} ${event.hora || ''}`.trim(),
      startsAt,
      venueName: source.name,
      city: source.city || undefined,
      artistNames: billArtists(title),
      imageUrl: event.cartel || undefined,
      rawPayload: {
        title,
        url,
        cycle: event.ciclo || null,
        style: event.estilo || null,
        origin: event.procedencia || null,
        hour: event.hora || null,
        hasTicket: event.tieneEntrada ?? null,
        image: event.cartel || null,
      },
    }];
  });
};

export const rockBluesAgendaParser: VenueParser = {
  key: 'rock-blues-agenda',
  canHandle: (_url, html) => html.includes('rbEventsData'),
  parseListPage: async (page, source) => parseRockBluesHtml(await page.content(), source),
};
