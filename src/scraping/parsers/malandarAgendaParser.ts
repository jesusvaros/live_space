import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtistNames, withTitleArtists } from './shared.js';

// Sala Malandar (Sevilla) lists its "qode-event" posts in an Elementor loop:
// each card has day, month and poster but no title. The event page has the
// title and "FECHA: 27 FEB / HORA: 21:00", never the year. The year is taken
// from the poster's upload folder (/uploads/2026/10/): the first occurrence
// of that day and month on or after the upload month. Without a poster, the
// next occurrence from today. Only "conciertos" cards are kept; "clubbing"
// nights are DJ sessions.

const DETAIL_DELAY_MS = 1_000;
const MONTHS: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
};

type Card = { url: string; imageUrl?: string };
type Detail = { title?: string; day?: string; month?: string; time?: string; imageUrl?: string };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The agenda only lists upcoming nights, so a year that leaves the date more
// than a week in the past (a poster reused from an earlier tour) moves on.
export const inferMalandarYear = (day: number, month: number, imageUrl: string | undefined, now: Date): number => {
  const upload = imageUrl?.match(/\/uploads\/(20\d{2})\/(\d{2})\//);
  let year = now.getUTCFullYear();
  if (upload) {
    const uploadYear = Number(upload[1]);
    year = month >= Number(upload[2]) ? uploadYear : uploadYear + 1;
  }
  const earliest = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  while (Date.UTC(year, month - 1, day) < earliest) year += 1;
  return year;
};

export const malandarAgendaParser: VenueParser = {
  key: 'malandar-agenda',
  canHandle: (_url, html) => html.includes('qode-event-type-conciertos'),
  parseListPage: async (page, source) => {
    const cards: Card[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.e-loop-item.qode-event-type-conciertos')).flatMap((item) => {
        const url = item.querySelector<HTMLAnchorElement>('a[href*="/event/"]')?.href;
        if (!url) return [];
        const img = item.querySelector('img');
        return [{ url, imageUrl: img?.getAttribute('data-src') || img?.getAttribute('src') || undefined }];
      }),
    );

    const readDetail = (html: string) =>
      page.evaluate((rawHtml): Detail => {
        const parsed = new DOMParser().parseFromString(rawHtml, 'text/html');
        const headings = Array.from(parsed.querySelectorAll('.elementor-heading-title'))
          .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() || '')
          .filter(Boolean);
        const dateIndex = headings.findIndex((text) => /^FECHA:?$/i.test(text));
        const timeIndex = headings.findIndex((text) => /^HORA:?$/i.test(text));
        return {
          title: dateIndex > 0 ? headings[dateIndex - 1] : undefined,
          day: dateIndex >= 0 ? headings[dateIndex + 1] : undefined,
          month: dateIndex >= 0 ? headings[dateIndex + 2] : undefined,
          time: timeIndex >= 0 ? headings[timeIndex + 1]?.match(/\b(\d{1,2}:\d{2})\b/)?.[1] : undefined,
          imageUrl: parsed.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined,
        };
      }, html);

    const now = new Date();
    const events: RawScrapedEvent[] = [];
    const seen = new Set<string>();
    for (const card of cards) {
      if (seen.has(card.url)) continue;
      seen.add(card.url);

      await wait(DETAIL_DELAY_MS);
      const response = await page.context().request.get(card.url).catch(() => null);
      if (!response?.ok()) continue;
      const detail = await readDetail(await response.text());
      const day = Number(detail.day);
      const month = MONTHS[(detail.month || '').toUpperCase().slice(0, 3)];
      if (!detail.title || !Number.isInteger(day) || day < 1 || day > 31 || !month) continue;

      const imageUrl = card.imageUrl || detail.imageUrl;
      const year = inferMalandarYear(day, month, imageUrl, now);
      events.push({
        sourceUrl: source.base_url,
        sourceEventUrl: card.url,
        sourceEventId: card.url,
        title: detail.title,
        dateText: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year} ${detail.time || ''}`.trim(),
        venueName: source.name,
        city: source.city || undefined,
        artistNames: billArtistNames(detail.title),
        imageUrl,
        rawPayload: { ...detail, inferredYear: year },
      });
    }
    return withTitleArtists(events);
  },
};
