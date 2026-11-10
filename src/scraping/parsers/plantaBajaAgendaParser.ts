import type { RawScrapedEvent, ScrapeSource, VenueParser } from '../../types/scrape.js';
import { billArtists, fetchDetailHtml, isCancelled, isUpcoming, madridIso } from './localScene.js';
import { htmlToText } from './shared.js';

// Sala Planta Baja (Granada) sells every night as a WooCommerce product. The
// source is the "Próximos conciertos" page, a list of magazine entries with
// the bill and the date in the title ("MUJERES + YO SOMOS (14.11.26)"); the
// DJ sessions and club nights live in other categories and never show up
// there. The start time ("21.00H") is only on the product page, which is
// read one by one, a second apart.

type SourceLike = Pick<ScrapeSource, 'base_url' | 'name' | 'city'>;

export type PlantaBajaCard = {
  url: string;
  title: string;
  bill: string;
  day: number;
  month: number;
  year: number;
  categories: string[];
  imageUrl?: string;
};

// "JOSÉ IGNACIO LAPIDO en acústico + Javi Tejero", "BLUES BAND DE GRANADA
// especial concierto de NAVIDAD": the format of the night is not part of
// the performer's name.
export const plantaBajaBill = (bill: string): string =>
  bill
    .replace(/\s+en\s+ac[úu]stico\b/gi, '')
    .replace(/\s+especial\b[^+]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const TITLE_DATE_RE = /\(\s*(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})\s*\)\s*$/;

export const parsePlantaBajaList = (html: string): PlantaBajaCard[] => {
  const seen = new Set<string>();
  return Array.from(html.matchAll(/<article class=['"]av-magazine-entry[\s\S]*?<\/article>/g)).flatMap(([article]): PlantaBajaCard[] => {
    const url = article.match(/href=['"](https?:\/\/[^'"]+)['"]/)?.[1];
    const rawTitle = article.match(/title=['"]Enlace a:\s*([^'"]+)['"]/)?.[1];
    const title = htmlToText(rawTitle).replace(/\s+/g, ' ').trim();
    const date = title.match(TITLE_DATE_RE);
    const categories = Array.from(article.matchAll(/rel=["']tag["']>([^<]+)</g), (match) => htmlToText(match[1]));
    if (!url || !title || !date || seen.has(url)) return [];
    if (categories.length > 0 && !categories.some((category) => /conciertos?/i.test(category))) return [];
    seen.add(url);
    const year = Number(date[3].length === 2 ? `20${date[3]}` : date[3]);
    return [{
      url,
      title,
      bill: title.replace(TITLE_DATE_RE, '').trim(),
      day: Number(date[1]),
      month: Number(date[2]),
      year,
      categories,
      imageUrl: article.match(/<img[^>]+src=["']([^"']+)["']/)?.[1],
    }];
  });
};

// "MUJERES + YO SOMOS (14.11.26) 21.00H ¿Qué se puede decir…": the first
// clock in the product description.
export const plantaBajaDetailTime = (html: string): { hour: number; minute: number } | undefined => {
  const description = html.match(/woocommerce-Tabs-panel--description[\s\S]*?(?=woocommerce-Tabs-panel--|<\/main>|$)/)?.[0] ?? '';
  const match = htmlToText(description).match(/(?<!\d)([01]?\d|2[0-3])[.:]([0-5]\d)\s*h\b/i);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : undefined;
};

export const plantaBajaEvents = (
  cards: PlantaBajaCard[],
  details: Map<string, string>,
  source: SourceLike,
  now = new Date(),
): RawScrapedEvent[] =>
  cards.flatMap((card): RawScrapedEvent[] => {
    if (isCancelled(card.title)) return [];
    const detail = details.get(card.url);
    const clock = detail ? plantaBajaDetailTime(detail) : undefined;
    const startsAt = madridIso(card.year, card.month, card.day, clock?.hour, clock?.minute);
    if (!startsAt || !isUpcoming(startsAt, now)) return [];
    const pad = (value: number) => String(value).padStart(2, '0');
    const time = clock ? ` ${pad(clock.hour)}:${pad(clock.minute)}` : '';

    return [{
      sourceUrl: source.base_url,
      sourceEventUrl: card.url,
      sourceEventId: card.url,
      title: card.bill,
      // Without the product page the time is unknown: keep only the day.
      dateText: `${pad(card.day)}/${pad(card.month)}/${card.year}${time}`,
      startsAt: clock ? startsAt : undefined,
      venueName: source.name,
      city: source.city || undefined,
      artistNames: billArtists(plantaBajaBill(card.bill)),
      imageUrl: card.imageUrl?.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1'),
      rawPayload: { ...card, time: time.trim() || null },
    }];
  });

export const plantaBajaAgendaParser: VenueParser = {
  key: 'planta-baja-agenda',
  canHandle: (_url, html) => html.includes('av-magazine-entry') && html.includes('plantabaja'),
  parseListPage: async (page, source) => {
    const now = new Date();
    const cards = parsePlantaBajaList(await page.content()).filter((card) =>
      isUpcoming(madridIso(card.year, card.month, card.day, 23, 59), now),
    );
    const details = await fetchDetailHtml(page, cards.map((card) => card.url));
    return plantaBajaEvents(cards, details, source, now);
  },
};
