import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtistNames, madridDateText, madridToday } from './shared.js';

// Café Central's booking form (/reservas/) lists every upcoming show as an
// <option> with data-event-date, data-end-date, the set times and the room.
// A run of several nights becomes one concert per night; shows in the
// group's other room (La Cátedra) are left out. Posters come from the cards
// of the agenda page, which is the source URL.
export const cafeCentralAgendaParser: VenueParser = {
  key: 'cafe-central-agenda',
  canHandle: (_url, html) => html.includes('/reservas/?event='),
  parseListPage: async (page, source) => {
    const posters = await page.evaluate(() =>
      Object.fromEntries(
        Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/events/"]'))
          .map((anchor) => [anchor.href, anchor.querySelector('img')?.getAttribute('src') || ''] as const)
          .filter(([, src]) => src),
      ),
    );

    await page.waitForTimeout(1_000);
    await page.goto(new URL('/reservas/', source.base_url).toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const shows = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLOptionElement>('option[data-event-id]')).map((option) => ({
        id: option.dataset.eventId || '',
        url: option.value,
        title: option.dataset.title || option.textContent?.trim() || '',
        room: option.dataset.venueName || '',
        start: option.dataset.eventDate || '',
        end: option.dataset.endDate || option.dataset.eventDate || '',
        times: option.dataset.time || '[]',
        price: option.dataset.price,
      })),
    );

    const today = madridToday();
    return shows.flatMap((show): RawScrapedEvent[] => {
      if (!show.id || !show.url || !show.title || !/caf[eé] central/i.test(show.room)) return [];
      const first = (JSON.parse(show.times) as string[])[0]?.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      const hour = first ? (Number(first[1]) % 12) + (/pm/i.test(first[3] || 'pm') ? 12 : 0) : 20;
      const time = `${hour}:${first?.[2] || '00'}`;
      const nights: string[] = [];
      for (let night = new Date(`${show.start}T12:00:00Z`); night.toISOString().slice(0, 10) <= show.end && nights.length < 14; night.setUTCDate(night.getUTCDate() + 1)) {
        nights.push(night.toISOString().slice(0, 10));
      }

      return nights.filter((night) => night >= today).map((night) => {
        const [year, month, day] = night.split('-').map(Number);
        return {
          sourceUrl: source.base_url,
          // One URL per night, so a run is not collapsed into its first date.
          sourceEventUrl: nights.length > 1 ? `${show.url}#${night}` : show.url,
          sourceEventId: `${show.id}-${night}`,
          title: show.title,
          dateText: madridDateText(year, month, day, time),
          venueName: source.name,
          city: source.city || undefined,
          artistNames: billArtistNames(show.title),
          imageUrl: posters[show.url] ? new URL(posters[show.url], source.base_url).toString() : undefined,
          rawPayload: { ...show, night },
        };
      });
    });
  },
};
