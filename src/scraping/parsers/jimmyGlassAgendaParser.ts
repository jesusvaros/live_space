import { toHttpUrl } from '../../normalize/extractImage.js';
import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtistNames, pause } from './shared.js';

const MAX_PAGES = 8;

// Event titles carry the series they belong to: "Chipi Chacon en weekend of
// festival", "Crossover Lines festival Jimmy Glass", "Perico Sambeat Plays
// Traffic".
export const jimmyGlassArtistTitle = (title: string): string =>
  title
    .replace(/\s+(?:en\s+(?:el\s+)?)?(?:(?:weekend(?:\s+of)?\s+)?festival|weekend)\b.*$/i, '')
    .replace(/\s+en\s+(?:el\s+)?jimmy glass.*$/i, '')
    .replace(/\s+plays\s+.+$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

type ListedEvent = { postId?: string; title: string; url: string; date: string; time: string };

// Events Manager archive of the club (/Eventos/), ten upcoming nights per page
// with an explicit date; the poster lives on each event page.
export const jimmyGlassAgendaParser: VenueParser = {
  key: 'jimmy-glass-agenda',
  canHandle: (_url, html) => html.includes('type-event') && html.includes('/Eventos/'),
  parseListPage: async (page, source) => {
    const listed: ListedEvent[] = [];
    let nextUrl: string | null = source.base_url;

    for (let index = 0; nextUrl && index < MAX_PAGES; index += 1) {
      if (index > 0) {
        await pause(1_000);
        await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      }
      const result: { events: ListedEvent[]; next: string | null } = await page.evaluate(() => {
        const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() || '';
        const events = Array.from(document.querySelectorAll<HTMLElement>('article.type-event')).flatMap((article) => {
          const anchor = article.querySelector<HTMLAnchorElement>('.art-postheader a[href]');
          // The theme prints a stray <tr><td> outside any table, which the
          // HTML parser drops: read the date from the article text.
          const text = clean(article.querySelector('.art-postcontent')?.textContent);
          const when = text.match(/(\d{2}\/\d{2}\/\d{4})\s*(\d{1,2}:\d{2})?/);
          const title = clean(anchor?.textContent);
          if (!anchor || !title || !when) return [];
          return [{
            postId: article.id.replace(/^post-/, '') || undefined,
            title,
            url: anchor.href,
            date: when[1],
            time: when[2] || '21:30',
          }];
        });
        const next = Array.from(document.querySelectorAll<HTMLAnchorElement>('.navigation a[href]')).find((link) =>
          /siguiente/i.test(link.textContent || ''),
        );
        return { events, next: next?.href || null };
      });
      listed.push(...result.events);
      nextUrl = result.next;
    }

    const seen = new Set<string>();
    const events: RawScrapedEvent[] = [];
    for (const event of listed) {
      if (seen.has(event.url)) continue;
      seen.add(event.url);

      await pause(1_000);
      const detail = await page.context().request.get(event.url).catch(() => null);
      const html = detail?.ok() ? await detail.text() : '';
      const image = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];

      events.push({
        sourceUrl: source.base_url,
        sourceEventUrl: event.url,
        sourceEventId: event.postId ? `post-${event.postId}` : new URL(event.url).pathname,
        title: event.title,
        dateText: `${event.date} ${event.time}`,
        venueName: source.name,
        city: source.city || undefined,
        artistNames: billArtistNames(jimmyGlassArtistTitle(event.title)),
        imageUrl: toHttpUrl(image, event.url) ?? undefined,
        rawPayload: event,
      });
    }
    return events;
  },
};
