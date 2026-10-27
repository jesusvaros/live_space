import { toHttpUrl } from '../../normalize/extractImage.js';
import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtistNames, pause } from './shared.js';

const MONTHS: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const NOT_A_CONCERT_RE = /\b(?:micro abierto|open mic)\b/i;

// Cards read "27-Oct" and "22:30"; the year only appears in the event slug
// ("/eventos/noche-de-flamenco-show-27-10-2026/"). Without it the date stays
// yearless so the event is not treated as having an explicit date.
export const radioCityDateText = (
  dayMonth: string,
  time: string,
  url: string,
  now = new Date(),
): string | undefined => {
  const match = dayMonth.trim().match(/^(\d{1,2})[-\s/]+([a-záéíóú]{3})/i);
  const month = match ? MONTHS[match[2].toLowerCase()] : undefined;
  if (!match || !month) return undefined;
  const day = Number(match[1]);
  const clock = time.match(/\d{1,2}:\d{2}/)?.[0] || '22:30';
  const pad = (value: number) => String(value).padStart(2, '0');
  const slug = new URL(url).pathname.match(/-(\d{1,2})-(\d{1,2})-(20\d{2})(?:-\d+)?\/?$/);
  // Copied event pages keep an old slug ("…-15-01-2026" for a 2027 night):
  // a slug year that puts the night in the past is not trusted.
  const slugYear = slug && Number(slug[1]) === day && Number(slug[2]) === month ? Number(slug[3]) : undefined;
  const year = slugYear && Date.UTC(slugYear, month - 1, day + 1) >= now.getTime() ? slugYear : undefined;
  // Yearless dates use the month name: "05/11 19:30" would read 19 as the year.
  return year ? `${pad(day)}/${pad(month)}/${year} ${clock}` : `${day} ${MONTH_NAMES[month - 1]} ${clock}`;
};

// "SÚA 29/10/2026 - Radiocity" → "SÚA"; "Supernova 21-11-2026" → "Supernova".
export const radioCityPageTitle = (ogTitle: string): string =>
  ogTitle
    .replace(/\s+-\s+radiocity\s*$/i, '')
    .replace(/\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*$/, '')
    .trim();

// Agenda grid of Radio City. Live nights come in three shapes: the performers
// listed on the card (flamenco line-ups, guest vocalists), a title tagged with
// the "Directos" logo (bands, "Rotonda Bonsai + Penalti"), or only a poster,
// whose act is named on the event page. DJ sessions show a title, the genres
// and their own logo, and are left out.
export const radioCityAgendaParser: VenueParser = {
  key: 'radio-city-agenda',
  canHandle: (_url, html) => html.includes('Grid-All-Eventos') && html.includes('Nombre_Artista_Banner'),
  parseListPage: async (page, source) => {
    const cards = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('#Grid-All-Eventos .card-container')).flatMap((card) => {
        const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() || '';
        const anchor = card.querySelector<HTMLAnchorElement>('a[href*="/eventos/"]');
        const artists = Array.from(card.querySelectorAll('.Nombre_Artista_Banner'))
          .map((node) => clean(node.textContent))
          .filter(Boolean);
        const dayMonth = clean(card.querySelector('.Fecha_Banner')?.textContent);
        const title = clean(card.querySelector('.Titulo_Banner')?.textContent);
        const logo = card.querySelector('img.TematicaBanner');
        const live = /directos/i.test(logo?.getAttribute('data-src') || logo?.getAttribute('src') || '');
        const kind = artists.length > 0 ? 'lineup' : title ? (live ? 'band' : 'dj') : 'poster';
        if (!anchor || !dayMonth || kind === 'dj') return [];
        const img = card.querySelector<HTMLImageElement>('img.BackgroundBanner');
        return [{
          url: anchor.href,
          kind,
          title,
          artists,
          dayMonth,
          time: clean(card.querySelector('.Hora_Banner')?.textContent),
          image: img?.getAttribute('data-src') || img?.getAttribute('src') || undefined,
        }];
      }),
    );

    const seen = new Set<string>();
    const events: RawScrapedEvent[] = [];
    for (const card of cards) {
      const dateText = radioCityDateText(card.dayMonth, card.time, card.url);
      if (!dateText || seen.has(card.url)) continue;
      seen.add(card.url);

      let title = card.kind === 'lineup' ? Array.from(new Set(card.artists)).join(' + ') : card.title;
      if (card.kind === 'poster') {
        await pause(1_000);
        const detail = await page.context().request.get(card.url).catch(() => null);
        const html = detail?.ok() ? await detail.text() : '';
        const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
        title = ogTitle ? radioCityPageTitle(ogTitle.replace(/&amp;/g, '&').replace(/&#039;/g, "'")) : '';
        if (!title) continue;
      }
      if (NOT_A_CONCERT_RE.test(title)) continue;
      const artists = card.kind === 'lineup' ? Array.from(new Set(card.artists)) : billArtistNames(title);
      events.push({
        sourceUrl: source.base_url,
        sourceEventUrl: card.url,
        sourceEventId: new URL(card.url).pathname,
        title,
        description: card.kind === 'lineup' ? card.title || undefined : undefined,
        dateText,
        venueName: source.name,
        city: source.city || undefined,
        artistNames: artists,
        imageUrl: card.image && !card.image.startsWith('data:') ? (toHttpUrl(card.image, card.url) ?? undefined) : undefined,
        rawPayload: card,
      });
    }
    return events;
  },
};
