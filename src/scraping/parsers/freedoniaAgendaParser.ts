import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtists, inferYear, isCancelled, isUpcoming, madridIso, parseClock } from './localScene.js';

// freedonia.eu concerts page: one .event-card (id = slug) per night with
// "jueves 05/11 20.30" and the bill as "A + B". The year is not printed; the
// page only lists upcoming nights, so it is the next occurrence of that day.
export const freedoniaAgendaParser: VenueParser = {
  key: 'freedonia-agenda',
  canHandle: (_url, html) => html.includes('event-card') && html.includes('figcaption'),
  parseListPage: async (page, source) => {
    const cards = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.event-card[id]')).map((card) => {
        const heading = card.querySelector('.figcaption h3')?.cloneNode(true) as HTMLElement | undefined;
        heading?.querySelector('.category-name')?.remove();
        return {
          id: card.id,
          title: heading?.textContent?.replace(/\s+/g, ' ').trim(),
          date: card.querySelector('time strong')?.textContent?.trim(),
          time: Array.from(card.querySelectorAll('time span'), (span) => span.textContent?.trim() || '').find((text) => /\d/.test(text)),
          image: card.querySelector('img')?.getAttribute('src') || undefined,
          ticketUrl: card.querySelector<HTMLAnchorElement>('a.price-item[href]')?.href,
          text: card.querySelector('a.price-item')?.textContent?.trim(),
        };
      }),
    );

    return cards.flatMap((card): RawScrapedEvent[] => {
      const match = card.date?.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (!card.title || !match || isCancelled(card.title)) return [];
      const day = Number(match[1]);
      const month = Number(match[2]);
      const clock = parseClock(card.time);
      const startsAt = madridIso(inferYear(month, day), month, day, clock?.hour, clock?.minute);
      if (!isUpcoming(startsAt)) return [];
      const url = new URL(`#${card.id}`, source.base_url).toString();

      return [{
        sourceUrl: source.base_url,
        sourceEventUrl: url,
        sourceEventId: url,
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
