import type { VenueParser } from '../../types/scrape.js';

const MONTHS: Record<string, number> = {
  ENE: 1,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  MAY: 5,
  MAYO: 5,
  JUN: 6,
  JUNIO: 6,
  JUL: 7,
  JULIO: 7,
  AGO: 8,
  SEP: 9,
  SEPT: 9,
  OCT: 10,
  NOV: 11,
  DIC: 12,
};

export const parseElementorAgendaDate = (value: string): string | null => {
  const match = value.trim().toUpperCase().match(/^(\d{1,2})\s+([A-ZÁÉÍÓÚ]+)\s+(\d{4})$/);
  const month = match ? MONTHS[match[2]] : undefined;
  if (!match || !month) return null;
  return `${match[1].padStart(2, '0')}/${String(month).padStart(2, '0')}/${match[3]} 20:00`;
};

export const elementorAgendaParser: VenueParser = {
  key: 'elementor-agenda',
  canHandle: (_url, html) =>
    html.includes('elementor-heading-title') && html.toLowerCase().includes('comprar entradas'),
  parseListPage: async (page, source) => page.evaluate(({ sourceUrl, venueName, city, months }) => {
    const monthMap = months as Record<string, number>;
    const today = new Date();
    const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const seen = new Set<string>();

    return Array.from(document.querySelectorAll<HTMLElement>('span.elementor-heading-title')).flatMap((dateNode) => {
      const dateLabel = (dateNode.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
      const match = dateLabel.match(/^(\d{1,2})\s+([A-ZÁÉÍÓÚ]+)\s+(\d{4})$/);
      const month = match ? monthMap[match[2]] : undefined;
      if (!match || !month) return [];

      const eventTime = new Date(Number(match[3]), month - 1, Number(match[1]), 20, 0).getTime();
      if (eventTime < cutoff) return [];

      const card = dateNode.parentElement?.parentElement?.parentElement;
      if (!card) return [];
      const headings = Array.from(card.querySelectorAll<HTMLElement>('span.elementor-heading-title'))
        .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const title = headings.find((heading) => heading.toUpperCase() !== dateLabel);
      if (!title) return [];

      const sourceEventId = `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}:${title.toLocaleLowerCase('es-ES')}`;
      if (seen.has(sourceEventId)) return [];
      seen.add(sourceEventId);
      const ticketUrl = card.querySelector<HTMLAnchorElement>('a[href]')?.href;

      return [{
        sourceUrl,
        sourceEventUrl: ticketUrl || sourceUrl,
        sourceEventId,
        title,
        dateText: `${match[1].padStart(2, '0')}/${String(month).padStart(2, '0')}/${match[3]} 20:00`,
        venueName,
        city,
        artistNames: [title],
        rawPayload: { dateLabel, ticketUrl: ticketUrl || null },
      }];
    });
  }, {
    sourceUrl: source.base_url,
    venueName: source.name,
    city: source.city || undefined,
    months: MONTHS,
  }),
};
