import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtistNames, madridDateText, madridToday } from './shared.js';

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

// Moby Dick Club's static agenda groups concerts under month headers
// ("Programación de conciertos · OCTUBRE 2026") that hold the year. Each card
// stacks the headliner and "+ support" lines in billing order, an optional
// series line above ("RADAR JOVEN presenta") and "JUEVES 22 de OCTUBRE. 21h.".
export const mobyDickAgendaParser: VenueParser = {
  key: 'moby-dick-agenda',
  canHandle: (_url, html) => html.includes('grupoconcierto') && html.includes('conciertofecha'),
  parseListPage: async (page, source) => {
    const blocks = await page.evaluate(() => {
      let header = '';
      return Array.from(document.querySelectorAll<HTMLElement>('[id="titularprog"], [id="grupoconcierto"]')).flatMap((element) => {
        if (element.id === 'titularprog') {
          header = element.textContent?.replace(/\s+/g, ' ').trim() || '';
          return [];
        }
        const anchor = element.querySelector<HTMLAnchorElement>('a.conciertotitulo[href]');
        const lines = (anchor?.innerHTML || '')
          .split(/<br\s*\/?>/i)
          .map((line) => line.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        return [{
          header,
          lines,
          url: anchor?.href || '',
          date: element.querySelector('.conciertofecha')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          image: element.querySelector('img')?.getAttribute('src') || undefined,
        }];
      });
    });

    const today = madridToday();
    return blocks.flatMap((block): RawScrapedEvent[] => {
      const headerYear = Number(block.header.match(/\b(20\d{2})\b/)?.[1]);
      const headerMonth = MONTHS[block.header.match(/·\s*([A-ZÁÉÍÓÚ]+)/i)?.[1]?.toLowerCase() || ''];
      const date = block.date.match(/(\d{1,2}) de ([a-záéíóú]+)/i);
      const month = date ? MONTHS[date[2].toLowerCase()] : undefined;
      if (!headerYear || !date || !month || !block.url || block.lines.length === 0) return [];
      if (/\bjam session\b/i.test(block.lines.join(' '))) return [];
      // A January night listed under a December header belongs to next year.
      const year = headerMonth && month < headerMonth - 6 ? headerYear + 1 : headerYear;
      const time = block.date.match(/\.\s*(\d{1,2})(?:[:.](\d{2}))?\s*h/i);
      const dateText = madridDateText(year, month, Number(date[1]), time ? `${time[1]}:${time[2] || '00'}` : '21:00');
      const iso = dateText?.replace(/^(\d{2})\/(\d{2})\/(\d{4}).*$/, '$3-$2-$1');
      if (!dateText || !iso || iso < today) return [];

      // Only the first line and "+ act" / "con act" lines are performers; other
      // lines describe the show ("TRIBUTO A …", "ROCK LEGENDS NEVER DIE").
      const [headline, ...rest] = block.lines;
      const acts = [
        headline.replace(/[:.]$/, ''),
        ...rest.filter((line) => /^(?:\+|con\s)/i.test(line)).map((line) => line.replace(/^(?:\+|con)\s*/i, '')),
      ];
      const title = block.lines.join(' ');

      return [{
        sourceUrl: source.base_url,
        sourceEventUrl: block.url,
        sourceEventId: new URL(block.url).pathname,
        title,
        dateText,
        venueName: source.name,
        city: source.city || undefined,
        artistNames: billArtistNames(acts.join(' + ')),
        imageUrl: block.image ? new URL(block.image, block.url).toString() : undefined,
        rawPayload: block,
      }];
    });
  },
};
