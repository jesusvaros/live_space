import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtistNames, madridDateText, madridToday } from './shared.js';

type IntrusoEvent = {
  indice?: number | string;
  FECHA?: string;
  HORA?: string;
  NOMBRE?: string;
  ESTILO?: string;
  TEXTO_ES?: string;
  URL_ENTRADA_ANT?: string;
  CANCELADO?: number | string;
};

// El Intruso's Angular site reads the coming weeks from its own PHP backend.
// Jam sessions are the house band's open nights, not billed concerts.
export const intrusoAgendaParser: VenueParser = {
  key: 'intruso-agenda',
  canHandle: (_url, html) => html.includes('<app-root') && /intruso/i.test(html),
  parseListPage: async (page, source) => {
    const endpoint = new URL('/backend/buscaEventosBarra.php', source.base_url);
    const response = await page.context().request.get(endpoint.toString());
    if (!response.ok()) throw new Error(`Intruso backend returned HTTP ${response.status()}`);
    const payload = (await response.json()) as IntrusoEvent[];
    const today = madridToday();

    return (Array.isArray(payload) ? payload : []).flatMap((event): RawScrapedEvent[] => {
      const date = event.FECHA?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const title = event.NOMBRE?.replace(/\s+/g, ' ').trim();
      if (!date || !title || event.indice == null || event.FECHA! < today) return [];
      if (String(event.CANCELADO) === '1' || /\bjam\b/i.test(title)) return [];
      const time = event.HORA?.match(/^(\d{1,2}):(\d{2})/);

      return [{
        sourceUrl: source.base_url,
        sourceEventId: `intruso-${event.indice}`,
        title,
        dateText: madridDateText(
          Number(date[1]),
          Number(date[2]),
          Number(date[3]),
          time ? `${time[1]}:${time[2]}` : '21:00',
          Boolean(time && Number(time[1]) < 6),
        ),
        venueName: source.name,
        city: source.city || undefined,
        artistNames: billArtistNames(title.replace(/^la sobremesa con\s+/i, '')),
        rawPayload: event,
      }];
    });
  },
};
