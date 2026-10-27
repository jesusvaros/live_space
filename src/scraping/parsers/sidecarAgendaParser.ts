import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtists, isCancelled, isUpcoming, madridIso } from './localScene.js';

// sidecar.es/programacio: one <article> per night with "Dijous 29.10.2026 20:30"
// and the bill as the title ("BREAKOUT + Qutr3s").
export const sidecarAgendaParser: VenueParser = {
  key: 'sidecar-agenda',
  canHandle: (_url, html) => html.includes('items concerts') && html.includes('info-box'),
  parseListPage: async (page, source) => {
    const cards = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.items article[id^="post-"]')).map((card) => {
        const anchor = card.querySelector<HTMLAnchorElement>('a.title[href]');
        return {
          id: card.id,
          url: anchor?.href,
          title: anchor?.textContent?.replace(/\s+/g, ' ').trim(),
          date: card.querySelector('.info-box .date')?.textContent?.replace(/\s+/g, ' ').trim(),
          category: card.querySelector('.info-box .category')?.textContent?.trim(),
          style: card.querySelector('a.style')?.textContent?.trim(),
          image: card.querySelector('img')?.getAttribute('src') || undefined,
          ticketUrl: card.querySelector<HTMLAnchorElement>('.tickets a[href]')?.href,
          text: card.querySelector('.tickets')?.textContent?.replace(/\s+/g, ' ').trim(),
        };
      }),
    );

    return cards.flatMap((card): RawScrapedEvent[] => {
      const match = card.date?.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
      if (!card.url || !card.title || !match || isCancelled(card.title)) return [];
      if (card.category && !/concert/i.test(card.category)) return [];
      const startsAt = madridIso(Number(match[3]), Number(match[2]), Number(match[1]), Number(match[4] ?? 20), Number(match[5] ?? 0));
      if (!isUpcoming(startsAt)) return [];

      return [{
        sourceUrl: source.base_url,
        sourceEventUrl: card.url,
        sourceEventId: card.id,
        title: card.title,
        dateText: card.date,
        startsAt,
        venueName: source.name,
        city: source.city || undefined,
        artistNames: billArtists(card.title),
        // The listing serves a 408x276 crop; the original sits next to it.
        imageUrl: card.image?.replace(/-\d+x\d+(\.\w+)$/, '$1'),
        rawPayload: card,
      }];
    });
  },
};
