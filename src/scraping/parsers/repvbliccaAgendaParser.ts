import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtistNames, pause } from './shared.js';

const MAX_SCROLLS = 12;

// JetEngine listing of the "agenda" post type, upcoming first, six cards at a
// time with infinite scroll. Each card has an explicit "30/10/2026 21:30" and
// its WordPress post id.
export const repvbliccaAgendaParser: VenueParser = {
  key: 'repvblicca-agenda',
  canHandle: (_url, html) => html.includes('jet-listing-grid__item') && html.includes('/agenda/'),
  parseListPage: async (page, source) => {
    // WP Rocket only runs the listing scripts after a user gesture, so scroll
    // with the wheel rather than window.scrollTo.
    const countCards = () => page.locator('.jet-listing-grid__item[data-post-id]').count();
    await page.mouse.move(200, 200);
    let previous = -1;
    let unchanged = 0;
    for (let index = 0; index < MAX_SCROLLS && unchanged < 2; index += 1) {
      const current = await countCards();
      unchanged = current === previous ? unchanged + 1 : 0;
      previous = current;
      await page.mouse.wheel(0, 20_000);
      await pause(1_500);
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    }

    const cards = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.jet-listing-grid__item[data-post-id]')).flatMap((card) => {
        const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() || '';
        const anchor = card.querySelector<HTMLAnchorElement>('.elementor-heading-title a[href*="/agenda/"]');
        const title = clean(anchor?.textContent);
        const when = clean(card.textContent).match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})?/);
        if (!anchor || !title || !when) return [];
        const img = card.querySelector<HTMLImageElement>('img[data-lazy-src], img[src^="http"]');
        return [{
          postId: card.dataset.postId || '',
          title,
          url: anchor.href,
          date: when[1],
          time: when[2] || '21:00',
          image: img?.getAttribute('data-lazy-src') || img?.getAttribute('src') || undefined,
        }];
      }),
    );

    const seen = new Set<string>();
    return cards.flatMap((card): RawScrapedEvent[] => {
      if (seen.has(card.url)) return [];
      seen.add(card.url);
      return [{
        sourceUrl: source.base_url,
        sourceEventUrl: card.url,
        sourceEventId: `agenda-${card.postId}`,
        title: card.title,
        dateText: `${card.date} ${card.time}`,
        venueName: source.name,
        city: source.city || undefined,
        // "HARD GZ – 2º FECHA": the second date is not part of the name;
        // "SHO -HAI" is the band Sho-Hai, not a subtitle.
        artistNames: billArtistNames(
          card.title.replace(/\s+[-–]\s+\d+\s*[ºª]?\s*fecha$/i, '').replace(/(\S)\s+-(?=\S)/g, '$1-'),
        ),
        imageUrl: card.image && !card.image.startsWith('data:') ? card.image : undefined,
        rawPayload: card,
      }];
    });
  },
};
