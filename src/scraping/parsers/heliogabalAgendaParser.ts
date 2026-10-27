import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtists, isCancelled, isNotConcert, isUpcoming, madridIso, monthNumber, parseClock } from './localScene.js';

// heliogabal.com home: one <article class="event"> per night with
// "DIVENDRES 6 / NOVEMBRE 2026", "20:30h" and the bill split by <br>+.
export const heliogabalAgendaParser: VenueParser = {
  key: 'heliogabal-agenda',
  canHandle: (_url, html) => html.includes('class="event future-event') || html.includes('event-title'),
  parseListPage: async (page, source) => {
    const cards = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('article.event[data-href]')).map((card) => {
        const img = card.querySelector('.hidden-info img');
        return {
          id: Array.from(card.classList).find((name) => /^post-\d+$/.test(name)),
          url: card.getAttribute('data-href') || undefined,
          title: card.querySelector('.event-title')?.textContent?.replace(/\s+/g, ' ').trim(),
          date: card.querySelector('.data')?.textContent?.replace(/\s+/g, ' ').trim(),
          time: card.querySelector('.hora')?.textContent?.trim(),
          place: card.querySelector('.lloc')?.textContent?.replace(/[–\s]+/g, ' ').trim(),
          image: img?.getAttribute('data-src') || img?.getAttribute('src') || undefined,
          ticketUrl: card.querySelector<HTMLAnchorElement>('a.entrades_anticipades[href]')?.href,
          text: [card.querySelector('.entrada.anticipada')?.textContent, card.querySelector('.entrada.taquilla')?.textContent]
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim(),
        };
      }),
    );

    return cards.flatMap((card): RawScrapedEvent[] => {
      const match = card.date?.match(/(\d{1,2})\s*([a-zà-ü·]+)\s*(\d{4})/i);
      const month = match ? monthNumber(match[2]) : undefined;
      // Off-site nights (a square, a park) belong to other venues.
      if (!card.url || !card.title || !match || !month || (card.place && !/helio/i.test(card.place))) return [];
      if (isCancelled(card.title) || isNotConcert(card.title)) return [];
      const clock = parseClock(card.time);
      const startsAt = madridIso(Number(match[3]), month, Number(match[1]), clock?.hour, clock?.minute);
      if (!isUpcoming(startsAt)) return [];

      return [{
        sourceUrl: source.base_url,
        sourceEventUrl: card.url,
        sourceEventId: card.id || card.url,
        title: card.title,
        dateText: `${card.date} ${card.time || ''}`.trim(),
        startsAt,
        venueName: source.name,
        city: source.city || undefined,
        artistNames: billArtists(card.title),
        imageUrl: card.image,
        rawPayload: card,
      }];
    });
  },
};
