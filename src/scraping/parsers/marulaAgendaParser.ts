import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { parseJsonLdDocuments } from './jsonLdAgendaParser.js';
import { billArtists, fetchDetailHtml, isCancelled, isUpcoming, jsonLdBlocks } from './localScene.js';

const ticketUrlOf = (record: unknown): string | undefined => {
  const offers = (record as { offers?: { url?: unknown } | Array<{ url?: unknown }> }).offers;
  const url = (Array.isArray(offers) ? offers[0] : offers)?.url;
  return typeof url === 'string' ? url : undefined;
};

// marulacafe.com/agenda mixes concerts with DJ nights and jams and only shows
// "27 octubre". Each concert page carries a schema.org MusicEvent with the
// full start date and poster, so the listing only picks the concert links.
export const marulaAgendaParser: VenueParser = {
  key: 'marula-agenda',
  canHandle: (_url, html) => html.includes('e-loop-item') && html.includes('category-conciertos'),
  parseListPage: async (page, source) => {
    const urls = await page.evaluate(() =>
      Array.from(
        new Set(
          Array.from(document.querySelectorAll<HTMLElement>('.e-loop-item.category-conciertos'))
            .flatMap((item) => Array.from(item.querySelectorAll<HTMLElement>('[data-url*="/evento/"], a[href*="/evento/"]')))
            .map((element) => element.getAttribute('data-url') || element.getAttribute('href') || '')
            .filter(Boolean),
        ),
      ),
    );
    const details = await fetchDetailHtml(page, urls);

    return urls.flatMap((url): RawScrapedEvent[] =>
      parseJsonLdDocuments(jsonLdBlocks(details.get(url) || ''), source)
        .filter((event) => event.title && !isCancelled(event.title) && isUpcoming(event.startsAt))
        .map((event) => ({
          ...event,
          sourceEventUrl: event.sourceEventUrl || url,
          sourceEventId: url,
          venueName: source.name,
          artistNames: billArtists(event.title),
          rawPayload: { ...(event.rawPayload as object), ticketUrl: ticketUrlOf(event.rawPayload) },
        })),
    );
  },
};
