import type { RawScrapedEvent, ScrapeSource, VenueParser } from '../../types/scrape.js';
import { billArtists, isCancelled, isNotConcert, isUpcoming, madridIso } from './localScene.js';
import { htmlToText } from './shared.js';

// El Bar Mutante (Sevilla) runs Events Manager: /eventos/ is a month
// calendar (with the last days of the previous month and the first of the
// next) where every night carries its event page, "9:00 PM" and the title,
// and the day popups add the poster. The next month is read from the
// calendar's own "next" link, so a run sees five to nine weeks ahead.
// Most nights are the bar's own series and not a billed concert: open mic,
// jam sessions, poetry slam, talks, the drag show and the DJ sessions and
// parties from 23:00 onwards, plus the weekend placeholder "Conciertos en el
// Mutante" until the bands are announced. Those are left out here.

type SourceLike = Pick<ScrapeSource, 'base_url' | 'name' | 'city'>;

const NOT_A_CONCERT_RE =
  /\b(?:jam|micro libre|poetry slam|hacking|charlas?|documental|jueves de reinas|drag|noche de musicales|dj|vinyl|vinilos|fiesta|party|selektor)\b/i;

// "Conciertos en el Mutante": a weekend placeholder with no band named yet.
const PLACEHOLDER_RE = /^conciertos?\s+en\s+(?:el|bar)\s+mutante$/i;

// Sessions starting at 23:00 or later are DJ sets, parties and the drag show.
const LATE_NIGHT_HOUR = 23;

export const isBarMutanteConcert = (title: string, url: string, hour?: number): boolean => {
  const slug = decodeURIComponent(url).replace(/^.*\/evento\//, '').replace(/[-/]+/g, ' ');
  if (isCancelled(title) || isNotConcert(title) || isNotConcert(slug)) return false;
  if (NOT_A_CONCERT_RE.test(title) || NOT_A_CONCERT_RE.test(slug) || PLACEHOLDER_RE.test(title.trim())) return false;
  return hour === undefined || hour < LATE_NIGHT_HOUR;
};

// "MAWI MATEO EN SEVILLA", "The Criollos en Concierto", "ANDREAS LUTZ &
// RUBÉN SIERRA EN BAR MUTANTE", "LA RECALCADA ·
// HOMENAJE AL ROCK ARGENTINO", "LA REPÚBLICA DEL TONO · MASTERCLASS +
// CONCIERTO": the city, the bar, "en concierto" and the subtitle after "·" are not
// part of the performer's name.
export const barMutanteBill = (title: string): string =>
  title
    .replace(/\s+·\s+.*$/, '')
    .replace(/\s+en\s+(?:sevilla|concierto|(?:el\s+|bar\s+)?mutante)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

// "9:00 PM" → 21:00.
const clockOf = (text: string): { hour: number; minute: number } | undefined => {
  const match = text.match(/(\d{1,2}):(\d{2})\s*([AP]M)?/i);
  if (!match) return undefined;
  let hour = Number(match[1]) % (match[3] ? 12 : 24);
  if (match[3]?.toUpperCase() === 'PM') hour += 12;
  return hour <= 23 ? { hour, minute: Number(match[2]) } : undefined;
};

const fullSizeImage = (url: string | undefined): string | undefined =>
  url?.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1');

export const barMutanteNextMonthUrl = (html: string, baseUrl: string): string | undefined => {
  const href = html.match(/<a class="em-calnav em-calnav-next" href="([^"]+)"/)?.[1];
  return href ? new URL(href.replace(/&#0?38;|&amp;/g, '&'), baseUrl).toString() : undefined;
};

export const parseBarMutanteHtml = (html: string, source: SourceLike, now = new Date()): RawScrapedEvent[] => {
  // The day popups list each night with its poster.
  const posters = new Map<string, string>();
  for (const [, image, url] of html.matchAll(
    /<div class="em-item-image[^"]*"[^>]*>\s*<img[^>]+src="([^"]+)"[\s\S]{0,600}?<div class="em-item-name"><a href="([^"]+)"/g,
  )) {
    if (!posters.has(url)) posters.set(url, image);
  }

  const tokens = html.matchAll(
    /<div class="em-cal-day-date[^"]*" data-calendar-date="(\d+)"|<div class="em-cal-event"[^>]*data-event-url="([^"]+)"[^>]*data-event-id="(\d+)"[^>]*>\s*<div>([^<]*)<a[^>]*>([\s\S]*?)<\/a>/g,
  );
  let day: Date | undefined;
  const seen = new Set<string>();
  const events: RawScrapedEvent[] = [];
  const pad = (value: number) => String(value).padStart(2, '0');

  for (const [, epoch, url, eventId, timeLabel, rawTitle] of tokens) {
    if (epoch !== undefined) {
      day = new Date(Number(epoch) * 1000);
      continue;
    }
    if (!day || !url || seen.has(url)) continue;
    const title = htmlToText(rawTitle).replace(/\s+/g, ' ').trim();
    const clock = clockOf(timeLabel ?? '');
    if (!title || !isBarMutanteConcert(title, url, clock?.hour)) continue;
    const [year, month, date] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
    const startsAt = madridIso(year, month, date, clock?.hour, clock?.minute);
    if (!startsAt || !isUpcoming(startsAt, now)) continue;
    seen.add(url);
    const imageUrl = fullSizeImage(posters.get(url));
    const time = clock ? ` ${pad(clock.hour)}:${pad(clock.minute)}` : '';

    events.push({
      sourceUrl: source.base_url,
      sourceEventUrl: url,
      sourceEventId: url,
      title,
      dateText: `${pad(date)}/${pad(month)}/${year}${time}`,
      startsAt: clock ? startsAt : undefined,
      venueName: source.name,
      city: source.city || undefined,
      artistNames: billArtists(barMutanteBill(title)),
      imageUrl,
      rawPayload: { url, eventId, title, date: `${year}-${pad(month)}-${pad(date)}`, time: time.trim() || null, image: imageUrl ?? null },
    });
  }

  return events;
};

export const barMutanteAgendaParser: VenueParser = {
  key: 'bar-mutante-agenda',
  canHandle: (url, html) => /elbarmutante\.com/i.test(url) && html.includes('em-cal-event'),
  parseListPage: async (page, source) => {
    const html = await page.content();
    const pages = [html];
    const nextUrl = barMutanteNextMonthUrl(html, source.base_url);
    if (nextUrl) {
      await page.waitForTimeout(1_100);
      const response = await page.context().request.get(nextUrl, { timeout: 30_000 }).catch(() => null);
      if (response?.ok()) pages.push(await response.text());
    }
    const seen = new Set<string>();
    return pages
      .flatMap((pageHtml) => parseBarMutanteHtml(pageHtml, source))
      .filter((event) => !seen.has(event.sourceEventId as string) && Boolean(seen.add(event.sourceEventId as string)));
  },
};
