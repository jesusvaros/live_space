import type { VenueParser } from '../../types/scrape.js';
import { withTitleArtists } from './shared.js';

export const apoloAgendaParser: VenueParser = {
  key: 'apolo-agenda',
  canHandle: (_url, html) => html.includes('c-results__event') && html.includes('c-results__event__title'),
  parseListPage: async (page, source) =>
    withTitleArtists(await page.evaluate(({ sourceUrl, venueName, city }) =>
      Array.from(document.querySelectorAll<HTMLElement>('.c-results__event')).flatMap((root) => {
        const category = root.querySelector('.c-leadCategory')?.textContent?.trim() || '';
        if (!/concierto/i.test(category)) return [];

        const anchor = root.querySelector<HTMLAnchorElement>('.c-results__event__title[href]');
        const title = anchor?.textContent?.replace(/\s+/g, ' ').trim();
        const meta = root.querySelector('.c-leadMeta')?.textContent?.replace(/\s+/g, ' ').trim() || '';
        if (!title || !anchor) return [];

        const encodedDate = anchor.href.match(/-(\d{4})(\d{2})(\d{2})-\d+(?:$|[?#])/);
        const time = meta.match(/\b(\d{1,2}:\d{2})\b/)?.[1] || '20:00';
        let previous: Element | null = root.previousElementSibling;
        while (previous && !previous.classList.contains('c-results__date')) {
          previous = previous.previousElementSibling;
        }
        const visibleDate = previous?.textContent?.replace(/\s+/g, ' ').trim();
        const dateText = encodedDate
          ? `${encodedDate[3]}/${encodedDate[2]}/${encodedDate[1]} ${time}`
          : `${visibleDate || ''} ${time}`.trim();

        return [{
          sourceUrl,
          sourceEventUrl: anchor.href,
          title,
          dateText,
          venueName,
          city,
          imageUrl: (() => { const img = root.querySelector<HTMLImageElement>('img'); return img ? (img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src') || '').trim() || undefined : undefined; })(),
          rawPayload: { category, meta },
        }];
      }),
    { sourceUrl: source.base_url, venueName: source.name, city: source.city || undefined }
    )),
};
