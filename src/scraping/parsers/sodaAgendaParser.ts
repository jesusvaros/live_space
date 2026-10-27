import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtists, isCancelled, isUpcoming, madridIso, monthNumber, parseClock } from './localScene.js';

// soda.cat/agenda-de-conciertos (Sugar Calendar): "Fecha: 29 octubre, 2026",
// "Hora: 21.00h." and titles such as "Denys Hordovskyi Quintet [Jazz]".
// Weekly residencies ("MARTES MANOUCHE #203", jams) name no performer.
export const sodaAgendaParser: VenueParser = {
  key: 'soda-agenda',
  canHandle: (_url, html) => html.includes('sc_event_details'),
  parseListPage: async (page, source) => {
    const cards = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('article.sc_event')).map((card) => {
        const anchor = card.querySelector<HTMLAnchorElement>('.entry-title a[href]');
        return {
          id: card.id,
          url: anchor?.href,
          title: anchor?.textContent?.replace(/\s+/g, ' ').trim(),
          date: card.querySelector('.sc_event_date')?.textContent?.replace(/\s+/g, ' ').trim(),
          time: card.querySelector('.sc_event_time')?.textContent?.replace(/\s+/g, ' ').trim(),
          image: card.querySelector('.featured-image img')?.getAttribute('src') || undefined,
        };
      }),
    );

    return cards.flatMap((card): RawScrapedEvent[] => {
      const match = card.date?.match(/(\d{1,2})\s+([a-zà-ü]+),?\s+(\d{4})/i);
      const month = match ? monthNumber(match[2]) : undefined;
      if (!card.url || !card.title || !match || !month || isCancelled(card.title)) return [];
      const clock = parseClock(card.time?.match(/Hora:\s*([^P]+)/i)?.[1]);
      const startsAt = madridIso(Number(match[3]), month, Number(match[1]), clock?.hour, clock?.minute);
      if (!isUpcoming(startsAt)) return [];
      const name = card.title.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();

      return [{
        sourceUrl: source.base_url,
        sourceEventUrl: card.url,
        sourceEventId: card.url,
        title: name,
        dateText: `${card.date} ${card.time || ''}`.trim(),
        startsAt,
        venueName: source.name,
        city: source.city || undefined,
        artistNames: /#\s*\d+|jam session|nocturna discordia/i.test(name) ? [] : billArtists(name),
        imageUrl: card.image,
        rawPayload: { ...card, text: card.time },
      }];
    });
  },
};
