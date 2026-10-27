import type { VenueParser } from '../../types/scrape.js';
import { artistNamesFromBill, withTitleArtists } from './shared.js';

// Sala Custom (Sevilla) publishes a hand-written agenda: an <h2> per year and,
// below it, one <article> per night with "V30 OCT" and the bill in capitals
// ("SOEN + TRIBULATION + VULKAN"). Each card links to its ticket page, which
// is the only per-event URL the venue publishes.
export const salaCustomAgendaParser: VenueParser = {
  key: 'sala-custom-agenda',
  canHandle: (_url, html) => html.includes('section class="index"') && html.includes('class="artist"'),
  parseListPage: async (page, source) => {
    const events = await page.evaluate(({ sourceUrl, venueName, city }) => {
      const months: Record<string, string> = {
        ENE: '01', FEB: '02', MAR: '03', ABR: '04', MAY: '05', JUN: '06',
        JUL: '07', AGO: '08', SEP: '09', SEPT: '09', OCT: '10', NOV: '11', DIC: '12',
      };
      const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() || '';
      const root = document.querySelector('section.index');
      if (!root) return [];

      let year: string | null = null;
      return Array.from(root.querySelectorAll<HTMLElement>('h2, article')).flatMap((element) => {
        if (element.tagName === 'H2') {
          year = clean(element.textContent).match(/^(20\d{2})$/)?.[1] ?? null;
          return [];
        }

        const fecha = element.querySelector('.fecha');
        const day = clean(fecha?.querySelector('.dia')?.textContent).match(/(\d{1,2})$/)?.[1];
        const monthLabel = clean(fecha?.textContent).match(/([A-Za-z]{3,4})$/)?.[1]?.toUpperCase();
        const month = monthLabel ? months[monthLabel] : undefined;
        const title = clean(element.querySelector('.artist')?.textContent);
        if (!year || !day || !month || !title) return [];

        const dateText = `${day.padStart(2, '0')}/${month}/${year}`;
        const anchor = element.querySelector<HTMLAnchorElement>('a[href]');
        const href = anchor?.getAttribute('href') || '';
        const ticketUrl = /^https?:\/\//i.test(href) ? anchor?.href : undefined;

        return [{
          sourceUrl,
          sourceEventUrl: ticketUrl,
          // Ticket links are per night; cards without one fall back to the
          // date and bill, which is what the venue itself shows.
          sourceEventId: ticketUrl ?? `${dateText}::${title.toLowerCase()}`,
          title,
          dateText,
          venueName,
          city,
          rawPayload: { year, day, month: monthLabel, title, ticketUrl },
        }];
      });
    }, { sourceUrl: source.base_url, venueName: source.name, city: source.city || undefined });
    return withTitleArtists(events.map((event) => ({ ...event, artistNames: artistNamesFromBill(event.title) })));
  },
};
