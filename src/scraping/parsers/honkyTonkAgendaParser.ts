import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtistNames, madridDateText, madridToday, withTitleArtists } from './shared.js';

const MONTHS_AHEAD = 4;

// Honky Tonk publishes one month per page (/programacion?date=YYYY-MM) as a
// timeline whose items carry the night as data-id="dd/mm/yyyy". Its pictures
// are archive photos of other nights, often of another band, so none is kept.
export const honkyTonkAgendaParser: VenueParser = {
  key: 'honky-tonk-agenda',
  canHandle: (_url, html) => html.includes('my_timeline_content') && html.includes('hora_concierto'),
  parseListPage: async (page, source) => {
    const today = madridToday();
    const [year, month] = today.split('-').map(Number);
    const events: RawScrapedEvent[] = [];

    for (let offset = 0; offset < MONTHS_AHEAD; offset += 1) {
      const target = new Date(Date.UTC(year, month - 1 + offset, 1));
      const url = new URL(source.base_url);
      url.searchParams.set('date', `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}`);
      if (offset > 0) await page.waitForTimeout(1_000);
      await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });

      const items = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('.timeline .item[data-id]')).map((item) => {
          const anchor = item.querySelector<HTMLAnchorElement>('.my_timeline_content a[href]');
          return {
            night: item.dataset.id || '',
            title: anchor?.textContent?.replace(/\s+/g, ' ').trim() || '',
            url: anchor?.href || '',
            time: item.querySelector('.hora_concierto')?.textContent?.trim() || '',
          };
        }),
      );

      for (const item of items) {
        const date = item.night.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const time = item.time.match(/(\d{1,2})[:.](\d{2})/);
        // Jam sessions and open mics have no billed performer.
        if (!date || !item.title || !item.url || /\bjam\b|open mic/i.test(item.title)) continue;
        // Each page holds one month, which also fixes a mistyped year
        // ("08/11/2027" on the November 2026 page).
        const itemYear = Number(date[2]) === target.getUTCMonth() + 1 ? target.getUTCFullYear() : Number(date[3]);
        if (`${itemYear}-${date[2]}-${date[1]}` < today) continue;
        const hour = time ? Number(time[1]) : 21;
        events.push({
          sourceUrl: source.base_url,
          sourceEventUrl: item.url,
          sourceEventId: new URL(item.url).pathname,
          title: item.title,
          dateText: madridDateText(
            itemYear,
            Number(date[2]),
            Number(date[1]),
            time ? `${time[1]}:${time[2]}` : '21:30',
            hour < 6,
          ),
          venueName: source.name,
          city: source.city || undefined,
          artistNames: billArtistNames(item.title),
          rawPayload: item,
        });
      }
    }

    return withTitleArtists(events);
  },
};
