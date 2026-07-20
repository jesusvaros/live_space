import type { VenueParser } from '../../types/scrape.js';

export const razzmatazzAgendaParser: VenueParser = {
  key: 'razzmatazz-agenda',
  canHandle: (_url, html) => html.includes('page-agenda') && html.includes('/agenda/conciertos/'),
  parseListPage: async (page, source) => {
    // Nuxt hydration currently clears the server-rendered concert list in a
    // headless session. Re-load the same official HTML without executing its JS.
    const response = await page.context().request.get(source.base_url);
    const html = await response.text();

    return page.evaluate(({ html: rawHtml, sourceUrl, venueName, city }) => {
      const parsedDocument = new DOMParser().parseFromString(rawHtml, 'text/html');
      const seen = new Set<string>();
      return Array.from(parsedDocument.querySelectorAll<HTMLElement>('article')).flatMap((card) => {
        if (!(card.textContent || '').toLowerCase().includes('conciertos')) return [];
        const anchor = card.querySelector<HTMLAnchorElement>('h3 a[href^="/agenda/"]');
        const title = anchor?.textContent?.replace(/\s+/g, ' ').trim();
        if (!title || !anchor) return [];

        const sourceEventUrl = new URL(anchor.getAttribute('href') || '', sourceUrl).toString();
        if (seen.has(sourceEventUrl)) return [];
        seen.add(sourceEventUrl);

        const date = sourceEventUrl.match(/\/agenda\/(\d{2})-(\d{2})-(\d{4})-/);
        if (!date) return [];
        const time = (card.textContent || '').match(/\b(\d{1,2}:\d{2})\s*H\b/i)?.[1] || '20:00';

        return [{
          sourceUrl,
          sourceEventUrl,
          title,
          dateText: `${date[1]}/${date[2]}/${date[3]} ${time}`,
          venueName,
          city,
          artistNames: [title],
          rawPayload: { time },
        }];
      });
    }, { html, sourceUrl: source.base_url, venueName: source.name, city: source.city || undefined });
  },
};
