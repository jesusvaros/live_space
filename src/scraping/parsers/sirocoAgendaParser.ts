import type { VenueParser } from '../../types/scrape.js';

export const sirocoAgendaParser: VenueParser = {
  key: 'siroco-agenda',
  canHandle: (_url, html) => html.includes('eventos-agenda') && html.includes('nombre_evento'),
  parseListPage: async (page, source) =>
    page.evaluate(({ sourceUrl, venueName, city }) =>
      Array.from(document.querySelectorAll<HTMLElement>('.eventos-agenda.cosas-153')).flatMap((root) => {
        const anchor = root.querySelector<HTMLAnchorElement>('.nombre_evento a[href]');
        const title = anchor?.textContent?.replace(/\s+/g, ' ').trim();
        const date = root.querySelector('.fecha-superior-publico')?.textContent?.replace(/\s+/g, ' ').trim();
        const time = root.querySelector('.espacio')?.textContent?.replace(/\s+/g, ' ').trim();
        if (!title || !date) return [];

        return [{
          sourceUrl,
          sourceEventUrl: anchor?.href,
          title,
          dateText: `${date} ${time || '20:00'}`,
          venueName,
          city,
          artistNames: [title],
          rawPayload: { date, time },
        }];
      }),
    { sourceUrl: source.base_url, venueName: source.name, city: source.city || undefined }
    ),
};
