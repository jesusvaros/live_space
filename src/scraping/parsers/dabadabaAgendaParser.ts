import type { Page } from 'playwright';

import type { RawScrapedEvent, ScrapeSource, VenueParser } from '../../types/scrape.js';
import { billArtists, isCancelled, isUpcoming } from './localScene.js';
import { htmlToText } from './shared.js';

// Dabadaba (Donostia) runs its agenda on Odoo's event module. The source is
// the upcoming list filtered to the "Concierto" type (?type=6); the club
// nights are another type. Each card is a schema.org Event with the name,
// a one-line blurb and `startDate` in UTC, which is how Odoo stores it
// ("2026-11-11 19:00:00" is 20:00 in Donostia, as the card's "Puertas"
// says). The list is paginated twelve by twelve.

type SourceLike = Pick<ScrapeSource, 'base_url' | 'name' | 'city'>;

const MAX_PAGES = 8;
const PAGE_DELAY_MS = 1_100;

export const parseDabadabaHtml = (html: string, source: SourceLike, now = new Date()): RawScrapedEvent[] =>
  Array.from(html.matchAll(/<a[^>]+href="([^"]*\/event\/[^"/]+-(\d+)(?:\/register)?)"[^>]*>\s*<article[\s\S]*?<\/article>/g)).flatMap(
    ([card, href, odooId]): RawScrapedEvent[] => {
      const type = htmlToText(card.match(/o_ribbon_left[^>]*>\s*<span>([^<]*)/)?.[1]);
      if (type && !/concierto|kontzertua|concert/i.test(type)) return [];
      const title = htmlToText(card.match(/itemprop="name"[^>]*>([^<]*)</)?.[1]).replace(/\s+/g, ' ').trim();
      const utc = card.match(/itemprop="startDate"[^>]*datetime="(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?"/);
      if (!title || !utc || isCancelled(title)) return [];
      const startsAt = `${utc[1]}T${utc[2]}:00Z`;
      if (Number.isNaN(Date.parse(startsAt)) || !isUpcoming(startsAt, now)) return [];
      // The language prefix depends on the visitor (/en/event/…, /event/…);
      // the event page without it is the stable one.
      const url = new URL(href.replace(/\/register$/, '').replace(/^\/(?:en|es|eu)(?:_[A-Z]{2})?(?=\/event\/)/, ''), source.base_url).toString();
      const image = card.match(/<img[^>]+itemprop="image"[^>]*src="([^"]+)"/)?.[1];
      const ticketUrl = card.match(/itemprop="price"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*itemprop="price"/)?.slice(1).find(Boolean);

      return [{
        sourceUrl: source.base_url,
        sourceEventUrl: url,
        sourceEventId: `dabadaba:${odooId}`,
        title,
        description: htmlToText(card.match(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/)?.[1]) || undefined,
        dateText: startsAt,
        startsAt,
        venueName: source.name,
        city: source.city || undefined,
        artistNames: billArtists(title),
        imageUrl: image ? new URL(image.replace(/\/\d+x\d+$/, ''), source.base_url).toString() : undefined,
        rawPayload: {
          odooId,
          type: type || null,
          title,
          startUtc: `${utc[1]} ${utc[2]}`,
          price: htmlToText(card.match(/event-price[^>]*>([\s\S]*?)<\/div>/)?.[1]) || null,
          ticketUrl: ticketUrl ?? null,
        },
      }];
    },
  );

// "/en/event/page/2?type=6&amp;…" links of the pager, in order.
export const dabadabaNextPages = (html: string, baseUrl: string): string[] =>
  Array.from(
    new Set(
      Array.from(html.matchAll(/class="page-link"\s+href="([^"]*\/event\/page\/\d+[^"]*)"/g), (match) =>
        new URL(match[1].replace(/&amp;/g, '&'), baseUrl).toString(),
      ),
    ),
  );

// The cards nest the ticket link inside the card link, which the browser's
// HTML parser splits apart, so every page is read from the raw response.
const fetchPages = async (page: Page, source: SourceLike): Promise<string[]> => {
  const first = await page.context().request.get(source.base_url, { timeout: 30_000 });
  if (!first.ok()) throw new Error(`Dabadaba agenda returned HTTP ${first.status()}`);
  const pages = [await first.text()];
  const visited = new Set<string>();
  const queue = dabadabaNextPages(pages[0], source.base_url);
  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const url = queue.shift() as string;
    const pageNumber = url.match(/\/page\/(\d+)/)?.[1];
    if (!pageNumber || visited.has(pageNumber)) continue;
    visited.add(pageNumber);
    await page.waitForTimeout(PAGE_DELAY_MS);
    const response = await page.context().request.get(url, { timeout: 30_000 }).catch(() => null);
    if (!response?.ok()) break;
    const html = await response.text();
    pages.push(html);
    queue.push(...dabadabaNextPages(html, source.base_url));
  }
  return pages;
};

export const dabadabaAgendaParser: VenueParser = {
  key: 'dabadaba-agenda',
  canHandle: (_url, html) => html.includes('o_wevent_events_list') && html.includes('schema.org/Event'),
  parseListPage: async (page, source) => {
    const now = new Date();
    const seen = new Set<string>();
    return (await fetchPages(page, source))
      .flatMap((html) => parseDabadabaHtml(html, source, now))
      .filter((event) => {
        if (!event.sourceEventId || seen.has(event.sourceEventId)) return false;
        seen.add(event.sourceEventId);
        return true;
      });
  },
};
