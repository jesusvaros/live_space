import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtistNames, madridDateText, madridToday, withTitleArtists } from './shared.js';

const MAX_PAGES = 6;

// Café Libertad 8 lists its "eventos" custom post type in an Elementor loop
// grid: each card has the title, "dd/mm/yyyy", "HH:MM" and the genre classes
// (genero-de-evento-conciertos, -monologos, -poesia…). Only concerts are kept.
export const libertad8AgendaParser: VenueParser = {
  key: 'libertad8-agenda',
  canHandle: (_url, html) => html.includes('e-loop-item') && html.includes('genero-de-evento'),
  parseListPage: async (page, source) => {
    const today = madridToday();
    const events: RawScrapedEvent[] = [];

    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
      if (pageNumber > 1) {
        await page.waitForTimeout(1_000);
        await page.goto(new URL(`page/${pageNumber}/`, source.base_url.replace(/\/?$/, '/')).toString(), {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
      }

      const cards = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('.e-loop-item')).map((card) => {
          const anchor = card.querySelector<HTMLAnchorElement>('h1 a[href], h2 a[href], h3 a[href]');
          const headings = Array.from(card.querySelectorAll('h2, .elementor-heading-title'))
            .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() || '');
          const image = Array.from(card.querySelectorAll('img'))
            .map((img) => img.getAttribute('src') || '')
            .find((src) => src && !/\.svg(?:$|\?)/i.test(src));
          return {
            id: card.className.match(/\bpost-(\d+)\b/)?.[1],
            concert: card.classList.contains('genero-de-evento-conciertos'),
            title: anchor?.textContent?.replace(/\s+/g, ' ').trim() || '',
            url: anchor?.href || '',
            date: headings.find((value) => /^\d{2}\/\d{2}\/\d{4}$/.test(value)),
            time: headings.find((value) => /^\d{1,2}:\d{2}$/.test(value)),
            image,
          };
        }),
      );
      if (cards.length === 0) break;

      for (const card of cards) {
        const date = card.date?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!card.concert || !date || !card.title || !card.url || !card.id) continue;
        if (`${date[3]}-${date[2]}-${date[1]}` < today || /micro abierto|open mic|\bjam\b/i.test(card.title)) continue;
        events.push({
          sourceUrl: source.base_url,
          sourceEventUrl: card.url,
          sourceEventId: card.id,
          title: card.title,
          dateText: madridDateText(Number(date[3]), Number(date[2]), Number(date[1]), card.time || '21:00'),
          venueName: source.name,
          city: source.city || undefined,
          artistNames: billArtistNames(card.title),
          imageUrl: card.image,
          rawPayload: card,
        });
      }

      const hasNext = await page.locator('a.next, a.page-numbers.next').count();
      if (!hasNext) break;
    }

    return withTitleArtists(events);
  },
};
