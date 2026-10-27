import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { artistNamesFromBill, withTitleArtists } from './shared.js';

// Pandora and Supra Music Hall (Sevilla, RollerCoaster Group) share one
// WordPress theme. The source points at the "conciertos" agenda category:
// cards carry title, "20.11.2026" and poster; the event page adds the start
// time and one card per performer. The listing is short (two pages), so the
// detail pages are read one by one, a second apart.

const MAX_LIST_PAGES = 5;
const DETAIL_DELAY_MS = 1_000;

type ListCard = { url: string; title: string; date: string; imageUrl?: string };
type Detail = { title?: string; date?: string; time?: string; performers: string[]; imageUrl?: string };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Billing order is the order of the title ("Elli Acula, Ignez y Nørbak");
// the performer cards are not sorted. Cards absent from the title go last.
export const orderPerformersByTitle = (title: string, performers: string[]): string[] => {
  const lowerTitle = title.toLowerCase();
  const indexed = performers.map((name, index) => {
    const position = lowerTitle.indexOf(name.toLowerCase());
    return { name, rank: position >= 0 ? position : lowerTitle.length + index };
  });
  return Array.from(new Set(indexed.sort((left, right) => left.rank - right.rank).map((entry) => entry.name)));
};

export const rollercoasterAgendaParser: VenueParser = {
  key: 'rollercoaster-agenda',
  canHandle: (_url, html) => html.includes('card --agenda') && html.includes('/agenda/'),
  parseListPage: async (page, source) => {
    const readList = (html: string) =>
      page.evaluate((rawHtml) => {
        const parsed = new DOMParser().parseFromString(rawHtml, 'text/html');
        const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() || '';
        const cards = Array.from(parsed.querySelectorAll<HTMLElement>('article.card.--agenda')).flatMap((card) => {
          const anchor = card.querySelector<HTMLAnchorElement>('a[href*="/agenda/"]');
          const title = clean(card.querySelector('.heading-3')?.textContent);
          const date = clean(card.querySelector('.text-primary')?.textContent);
          const url = anchor?.getAttribute('href');
          if (!url || !title || !/^\d{2}\.\d{2}\.\d{4}$/.test(date)) return [];
          return [{ url, title, date, imageUrl: card.querySelector('img')?.getAttribute('src') || undefined }];
        });
        const next = Array.from(parsed.querySelectorAll<HTMLAnchorElement>('a[href*="/page/"]'))
          .map((anchor) => anchor.getAttribute('href') || '')
          .filter(Boolean);
        return { cards, next };
      }, html);

    const readDetail = (html: string) =>
      page.evaluate((rawHtml): Detail => {
        const parsed = new DOMParser().parseFromString(rawHtml, 'text/html');
        const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() || '';
        const misc = parsed.querySelector('.single-misc');
        const items = Array.from(misc?.querySelectorAll('.single-misc__item') || []).map((item) => clean(item.textContent));
        return {
          title: clean(parsed.querySelector('h1')?.textContent) || undefined,
          date: items.map((item) => item.match(/\b(\d{2}\.\d{2}\.\d{4})\b/)?.[1]).find(Boolean),
          time: items.map((item) => item.match(/\b(\d{1,2}:\d{2})\b/)?.[1]).find(Boolean),
          performers: Array.from(parsed.querySelectorAll('.section_single_agenda__artists .--mini-artist .text-card'))
            .map((element) => clean(element.textContent))
            .filter(Boolean),
          imageUrl: parsed.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined,
        };
      }, html);

    const fetchText = async (url: string): Promise<string> => {
      const response = await page.context().request.get(url);
      if (!response.ok()) throw new Error(`${url} returned HTTP ${response.status()}`);
      return response.text();
    };

    const cards: ListCard[] = [];
    const visited = new Set<string>([source.base_url]);
    let listing = await readList(await page.content());
    for (let pageCount = 1; ; pageCount += 1) {
      cards.push(...listing.cards);
      const nextUrl = listing.next
        .map((href) => new URL(href, source.base_url).toString())
        .find((href) => !visited.has(href) && href.startsWith(source.base_url.replace(/\/?$/, '/page/')));
      if (!nextUrl || pageCount >= MAX_LIST_PAGES) break;
      visited.add(nextUrl);
      await wait(DETAIL_DELAY_MS);
      listing = await readList(await fetchText(nextUrl));
    }

    const events: RawScrapedEvent[] = [];
    const seen = new Set<string>();
    for (const card of cards) {
      const url = new URL(card.url, source.base_url).toString();
      if (seen.has(url)) continue;
      seen.add(url);

      await wait(DETAIL_DELAY_MS);
      const detail = await fetchText(url).then(readDetail).catch(() => null);
      const date = detail?.date || card.date;
      const [day, month, year] = date.split('.');
      const title = card.title;
      const performers = detail?.performers.length ? orderPerformersByTitle(title, detail.performers) : [];

      events.push({
        sourceUrl: source.base_url,
        sourceEventUrl: url,
        sourceEventId: url,
        title,
        dateText: `${day}/${month}/${year}${detail?.time ? ` ${detail.time}` : ''}`,
        venueName: source.name,
        city: source.city || undefined,
        artistNames: performers.length ? performers : artistNamesFromBill(title),
        imageUrl: detail?.imageUrl || card.imageUrl,
        rawPayload: { card, detail },
      });
    }
    return withTitleArtists(events);
  },
};
