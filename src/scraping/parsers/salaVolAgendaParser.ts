import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtists, isCancelled, isUpcoming, madridIso, withoutFestivalTag } from './localScene.js';

// salavol.com home: <a class="dataModule" data-event="…"> per night with
// "13/11/2026 20:00" and one <div> per act, headliner first. The same markup
// lists past nights under HISTORIC, so only upcoming ones are kept.
export const salaVolAgendaParser: VenueParser = {
  key: 'sala-vol-agenda',
  canHandle: (_url, html) => html.includes('dataModule') && html.includes('data-kind="event"'),
  parseListPage: async (page, source) => {
    const cards = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>('a.dataModule[data-kind="event"]')).map((card) => {
        const left = Array.from(card.querySelectorAll('.dataModule__col--left > div'), (div) => div.textContent?.replace(/\s+/g, ' ').trim() || '');
        return {
          id: card.getAttribute('data-event') || undefined,
          url: card.href,
          date: left.find((text) => /\d{2}\/\d{2}\/\d{4}/.test(text)),
          text: left.find((text) => /€/.test(text)),
          acts: Array.from(card.querySelectorAll('.dataModule__col--right > div'), (div) => div.textContent?.replace(/\s+/g, ' ').trim() || '').filter(Boolean),
        };
      }),
    );

    const seen = new Set<string>();
    return cards.flatMap((card): RawScrapedEvent[] => {
      const match = card.date?.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
      const title = withoutFestivalTag(card.acts.join(' + '));
      if (!match || !title || !card.url || seen.has(card.url) || isCancelled(title)) return [];
      const startsAt = madridIso(Number(match[3]), Number(match[2]), Number(match[1]), Number(match[4] ?? 20), Number(match[5] ?? 0));
      if (!isUpcoming(startsAt)) return [];
      seen.add(card.url);

      return [{
        sourceUrl: source.base_url,
        sourceEventUrl: card.url,
        sourceEventId: card.id || card.url,
        title,
        dateText: card.date,
        startsAt,
        venueName: source.name,
        city: source.city || undefined,
        artistNames: billArtists(...card.acts),
        rawPayload: card,
      }];
    });
  },
};
