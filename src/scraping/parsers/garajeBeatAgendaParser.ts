import type { RawScrapedEvent, ScrapeSource, VenueParser } from '../../types/scrape.js';
import { billArtists, isCancelled, isUpcoming, madridIso, monthNumber } from './localScene.js';
import { htmlToText } from './shared.js';

// Garaje Beat Club (Murcia) keeps its agenda as a hand-edited table on
// /conciertos-live: a header row per night ("SÁBADO 12" + "DICIEMBRE 2026")
// followed by a row with the bill (first p.artista), the door and start
// times, prices and the ticket link. The weekend club sessions that start at
// 01:00 after the concert (DJ line-ups with "B2B") are not concerts and are
// left out.

type SourceLike = Pick<ScrapeSource, 'base_url' | 'name' | 'city'>;

const LATE_CLUB_HOUR = 7;

const timeAfter = (block: string, label: string): { hour: number; minute: number } | undefined => {
  const match = block.match(new RegExp(`${label}:\\s*</span>\\s*<span[^>]*>\\s*([01]?\\d|2[0-3])[:.]([0-5]\\d)`, 'i'));
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : undefined;
};

// "THE BUZZ LOVERS [NIRVANA]<br />GREEN LAND [GREEN DAY]": tribute bands
// keep their own name; the band they cover goes in brackets.
export const garajeBill = (rawHtml: string): string =>
  htmlToText(rawHtml.replace(/<br\s*\/?>/gi, ' + '))
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\?(?=\s|$)/g, ' ')
    .replace(/(?:\s*\+\s*)+/g, ' + ')
    .replace(/^\s*\+\s*|\s*\+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const parseGarajeBeatHtml = (html: string, source: SourceLike, now = new Date()): RawScrapedEvent[] => {
  const blocks = html.split(/<td class="blanco"[^>]*>/).slice(1);
  const seen = new Set<string>();

  return blocks.flatMap((block): RawScrapedEvent[] => {
    const header = htmlToText(block.slice(0, block.indexOf('</tr>') > 0 ? block.indexOf('</tr>') : 600));
    const date = header.match(/(\d{1,2})\s+([A-ZÁÉÍÓÚa-záéíóú]+)\s+(20\d{2})/);
    const month = date ? monthNumber(date[2]) : undefined;
    const billHtml = block.match(/<p class="artista"[^>]*>([\s\S]*?)<\/p>/)?.[1];
    if (!date || !month || !billHtml) return [];
    const title = garajeBill(billHtml);
    const clock = timeAfter(block, 'INICIO') ?? timeAfter(block, 'APERTURA');
    if (!title || isCancelled(title)) return [];
    if (clock && clock.hour < LATE_CLUB_HOUR) return [];
    if (/\bB2B\b/i.test(title)) return [];

    const startsAt = madridIso(Number(date[3]), month, Number(date[1]), clock?.hour, clock?.minute);
    if (!startsAt || !isUpcoming(startsAt, now)) return [];
    const ticketUrl = Array.from(block.matchAll(/href="(https?:\/\/[^"]+)"/g), (match) => match[1].replace(/&amp;/g, '&'))
      .find((href) => /entrada|ticket|evento|event|janto|concierto|dice\.fm|fever/i.test(href) && !/instagram|facebook/i.test(href));
    const id = ticketUrl ?? `${startsAt.slice(0, 10)}::${title.toLowerCase()}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const image = block.match(/<img[^>]+class="imagen_artista"[^>]*src="([^"]+)"/)?.[1]
      ?? block.match(/<img[^>]+src="([^"]+)"[^>]*class="imagen_artista"/)?.[1];
    const pad = (value: number) => String(value).padStart(2, '0');

    return [{
      sourceUrl: source.base_url,
      sourceEventUrl: ticketUrl,
      // Ticket links are per night; the rest fall back to the day and bill.
      sourceEventId: id,
      title,
      dateText: `${pad(Number(date[1]))}/${pad(month)}/${date[3]}${clock ? ` ${pad(clock.hour)}:${pad(clock.minute)}` : ''}`,
      startsAt: clock ? startsAt : undefined,
      venueName: source.name,
      city: source.city || undefined,
      artistNames: billArtists(title),
      imageUrl: image ? new URL(image, source.base_url).toString() : undefined,
      rawPayload: { header, bill: title, start: clock ?? null, ticketUrl: ticketUrl ?? null },
    }];
  });
};

export const garajeBeatAgendaParser: VenueParser = {
  key: 'garaje-beat-agenda',
  canHandle: (_url, html) => html.includes('titulo_articulo') && html.includes('class="artista"'),
  parseListPage: async (page, source) => parseGarajeBeatHtml(await page.content(), source),
};
