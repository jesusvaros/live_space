import type { Page } from 'playwright';

import { artistNamesFromTitle } from '../../normalize/cleanArtistName.js';

// Helpers shared by the small-venue parsers of the local scene: their
// listings show a whole night ("A + B + C") in one title and dates in
// Spanish or Catalan without an offset.

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, gen: 1, gener: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, febrer: 2, february: 2,
  mar: 3, marzo: 3, 'març': 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5, mai: 5, maig: 5,
  jun: 6, junio: 6, juny: 6, june: 6,
  jul: 7, julio: 7, juliol: 7, july: 7,
  ago: 8, agosto: 8, ag: 8, agost: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, setiembre: 9, set: 9, setembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, novembre: 11, november: 11,
  dic: 12, diciembre: 12, des: 12, desembre: 12, dec: 12, december: 12,
};

export const monthNumber = (name: string): number | undefined =>
  MONTHS[name.toLowerCase().replace(/\.$/, '')];

const offsetFor = (utcGuess: Date): string => {
  const name = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', timeZoneName: 'longOffset' })
    .formatToParts(utcGuess)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = name?.match(/GMT([+-]\d{2}):?(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '+01:00';
};

const pad = (value: number): string => String(value).padStart(2, '0');

// Wall-clock time in Barcelona as ISO with its offset, e.g. 2026-11-06T22:00:00+01:00.
export const madridIso = (year: number, month: number, day: number, hour = 20, minute = 0): string | null => {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (guess.getUTCMonth() !== month - 1 || guess.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${offsetFor(guess)}`;
};

// Listings without a year only show upcoming nights: a day more than a week
// behind today belongs to next year.
export const inferYear = (month: number, day: number, now = new Date()): number => {
  const year = now.getFullYear();
  const candidate = Date.UTC(year, month - 1, day);
  return candidate < now.getTime() - 7 * 24 * 60 * 60 * 1000 ? year + 1 : year;
};

// "21.30h", "20:00H", "22h" → hour and minute.
export const parseClock = (text: string | undefined): { hour: number; minute: number } | undefined => {
  const match = text?.match(/(?<!\d)([01]?\d|2[0-3])(?:[:.h]([0-5]\d))?\s*h?(?![\d])/i);
  return match ? { hour: Number(match[1]), minute: Number(match[2] ?? 0) } : undefined;
};

export const isUpcoming = (startsAt: string | null | undefined, now = new Date()): boolean =>
  Boolean(startsAt) && new Date(startsAt as string).getTime() >= now.getTime() - 12 * 60 * 60 * 1000;

export const isCancelled = (text: string | undefined): boolean =>
  /cancel·?lat|cancelad[oa]|cancelled|canceled|aplaçat|aplazad[oa]|suspès|suspendid[oa]/i.test(text || '');

// Nights that are not a concert even if the venue lists them.
export const isNotConcert = (text: string | undefined): boolean =>
  /\b(?:karaoke|micro obert|micro abierto|open mic)\b/i.test(text || '');

// "Merino (Festival Empremtes)", "Festival Empremtes: Abril": a single
// concert of a festival cycle the venue hosts, not a festival line-up.
export const withoutFestivalTag = (title: string): string =>
  title
    .replace(/\s*\((?:festival|fest)\b[^)]*\)/gi, ' ')
    .replace(/^festival\b[^:]{0,60}:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const BILL_SEPARATOR = /\s*\+\s*|\s+\/\s+|\s+(?:vs\.?|b2b|x)\s+|,\s+|\s+·\s+/i;

// Every performer of the night, headliner first: "Promoter: A + B, C" →
// [A, B, C]. Each piece then goes through the shared cleanup rules, so tour
// names, "presenta…" and "(Festival …)" decorations are dropped.
export const billArtists = (...lines: Array<string | undefined>): string[] => {
  const names = lines
    .flatMap((line) => {
      // Eli "Paperboy" Reed: a nickname between names keeps its words.
      const text = (line || '').replace(/\s+/g, ' ').trim().replace(/(\S)\s+["“]([^"”]+)["”]\s+(?=\S)/g, '$1 $2 ');
      // "Bistec Music: BRAVA + …", "L'Equipe presenta: Rüdiger".
      const withoutSeries = text.replace(/^[^:]{2,60}:\s+(?=\S)/, '');
      return withoutSeries.split(BILL_SEPARATOR);
    })
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part && !/^presentaci/i.test(part))
    .flatMap((part) => artistNamesFromTitle(part));

  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// Detail pages of small venues are fetched one by one, a second apart.
export const fetchDetailHtml = async (page: Page, urls: string[]): Promise<Map<string, string>> => {
  const pages = new Map<string, string>();
  for (const [index, url] of urls.entries()) {
    if (index > 0) await page.waitForTimeout(1_100);
    const response = await page.context().request.get(url, { timeout: 30_000 }).catch(() => null);
    if (response?.ok()) pages.set(url, await response.text());
  }
  return pages;
};

export const jsonLdBlocks = (html: string): string[] =>
  Array.from(html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi), (match) => match[1]);
