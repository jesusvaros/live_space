import type { Page } from 'playwright';

import { artistNamesFromTitle } from '../../normalize/cleanArtistName.js';
import { toHttpUrl } from '../../normalize/extractImage.js';
import type { RawScrapedEvent, ScrapeSource } from '../../types/scrape.js';

type ParserSelectorDefaults = {
  itemSelectors: string[];
  titleSelectors: string[];
  dateSelectors: string[];
  descriptionSelectors: string[];
  linkSelectors: string[];
  artistSelectors: string[];
  venueSelectors: string[];
  citySelectors: string[];
  imageSelectors?: string[];
};

type SerializableSelectorDefaults = Record<keyof ParserSelectorDefaults, string[]>;

const DEFAULT_IMAGE_SELECTORS = ['img[data-src]', 'img[data-lazy-src]', 'img[src]'];

const splitSelectorInput = (value: unknown, fallback: string[]): string[] => {
  if (Array.isArray(value)) {
    const selectors = value
      .map((entry) => String(entry).trim())
      .filter(Boolean);
    return selectors.length > 0 ? selectors : fallback;
  }

  if (typeof value === 'string') {
    const selectors = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return selectors.length > 0 ? selectors : fallback;
  }

  return fallback;
};

const buildSelectorConfig = (
  source: ScrapeSource,
  defaults: ParserSelectorDefaults
): SerializableSelectorDefaults => ({
  itemSelectors: splitSelectorInput(source.metadata.listItemSelector, defaults.itemSelectors),
  titleSelectors: splitSelectorInput(source.metadata.titleSelector, defaults.titleSelectors),
  dateSelectors: splitSelectorInput(source.metadata.dateSelector, defaults.dateSelectors),
  descriptionSelectors: splitSelectorInput(source.metadata.descriptionSelector, defaults.descriptionSelectors),
  linkSelectors: splitSelectorInput(source.metadata.linkSelector, defaults.linkSelectors),
  artistSelectors: splitSelectorInput(source.metadata.artistSelector, defaults.artistSelectors),
  venueSelectors: splitSelectorInput(source.metadata.venueSelector, defaults.venueSelectors),
  citySelectors: splitSelectorInput(source.metadata.citySelector, defaults.citySelectors),
  imageSelectors: splitSelectorInput(source.metadata.imageSelector, defaults.imageSelectors ?? DEFAULT_IMAGE_SELECTORS),
});

const toAbsoluteUrl = (rawUrl: string | null, baseUrl: string): string | undefined => {
  if (!rawUrl) {
    return undefined;
  }

  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return undefined;
  }
};

// Parsers whose source has no performer field derive artists from the title
// with the cleanup rules (never the raw title), and absolutize the poster.
export const withTitleArtists = (events: RawScrapedEvent[]): RawScrapedEvent[] =>
  events.map((event) => {
    const imageUrl = toHttpUrl(event.imageUrl, event.sourceEventUrl || event.sourceUrl);
    return {
      ...event,
      artistNames: event.artistNames?.length ? event.artistNames : artistNamesFromTitle(event.title),
      imageUrl: imageUrl && !/\.svg(?:$|\?)/i.test(imageUrl) ? imageUrl : undefined,
    };
  });

const dedupeEvents = (events: RawScrapedEvent[]): RawScrapedEvent[] => {
  const seen = new Set<string>();
  const items: RawScrapedEvent[] = [];

  for (const event of events) {
    const key =
      event.sourceEventUrl ||
      event.sourceEventId ||
      [event.title, event.dateText, event.venueName, event.city].filter(Boolean).join('::');

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push(event);
  }

  return items;
};

export const parseCardList = async (
  page: Page,
  source: ScrapeSource,
  defaults: ParserSelectorDefaults
): Promise<RawScrapedEvent[]> => {
  const selectors = buildSelectorConfig(source, defaults);

  const events = await page.evaluate(
    ({ selectors: pageSelectors, sourceUrl, fallbackVenueName, fallbackCity }) => {
      const normalizeText = (value: string | null | undefined): string | undefined => {
        const cleaned = value?.replace(/\s+/g, ' ').trim();
        return cleaned || undefined;
      };

      const collectRoots = (selectorList: string[]): Element[] => {
        const results: Element[] = [];
        const seen = new Set<Element>();

        for (const selector of selectorList) {
          document.querySelectorAll(selector).forEach((element) => {
            if (!seen.has(element)) {
              seen.add(element);
              results.push(element);
            }
          });
        }

        return results.length > 0 ? results : [document.body];
      };

      const firstMatchText = (root: ParentNode, selectorList: string[]): string | undefined => {
        for (const selector of selectorList) {
          const element = root.querySelector(selector);
          const text = normalizeText(element?.textContent);
          if (text) {
            return text;
          }
        }

        return undefined;
      };

      const firstMatchHref = (root: ParentNode, selectorList: string[]): string | undefined => {
        for (const selector of selectorList) {
          const element = root.querySelector(selector) as HTMLAnchorElement | null;
          const href = normalizeText(element?.getAttribute('href'));
          if (href) {
            try {
              return new URL(href, sourceUrl).toString();
            } catch {
              return href;
            }
          }
        }

        return undefined;
      };

      const collectTexts = (root: ParentNode, selectorList: string[]): string[] => {
        const values: string[] = [];
        for (const selector of selectorList) {
          root.querySelectorAll(selector).forEach((element) => {
            const text = normalizeText(element.textContent);
            if (text) {
              values.push(text);
            }
          });
        }

        return Array.from(new Set(values));
      };

      const firstMatchImage = (root: ParentNode, selectorList: string[]): string | undefined => {
        for (const selector of selectorList) {
          // <meta property="og:image"> lives in <head>, outside any card root.
          const element = (selector.startsWith('meta') ? document : root).querySelector(selector);
          const value =
            element?.getAttribute('data-src') ||
            element?.getAttribute('data-lazy-src') ||
            element?.getAttribute('src') ||
            element?.getAttribute('content');
          if (value?.trim()) return value.trim();
        }
        return undefined;
      };

      return collectRoots(pageSelectors.itemSelectors).map((root) => {
        const rawPayload = {
          html: root instanceof HTMLElement ? root.outerHTML.slice(0, 8_000) : '',
        };

        return {
          sourceUrl,
          sourceEventUrl: firstMatchHref(root, pageSelectors.linkSelectors),
          sourceEventId:
            normalizeText((root as HTMLElement).getAttribute?.('data-id')) ||
            normalizeText((root as HTMLElement).id) ||
            undefined,
          title: firstMatchText(root, pageSelectors.titleSelectors),
          description: firstMatchText(root, pageSelectors.descriptionSelectors),
          dateText: firstMatchText(root, pageSelectors.dateSelectors),
          venueName: firstMatchText(root, pageSelectors.venueSelectors) || fallbackVenueName,
          city: firstMatchText(root, pageSelectors.citySelectors) || fallbackCity,
          artistNames: collectTexts(root, pageSelectors.artistSelectors),
          imageUrl: firstMatchImage(root, pageSelectors.imageSelectors),
          rawPayload,
        };
      });
    },
    {
      selectors,
      sourceUrl: source.base_url,
      fallbackVenueName: source.name,
      fallbackCity: source.city,
    }
  );

  return dedupeEvents(withTitleArtists(
    events
      .map((event) => ({
        ...event,
        sourceUrl: source.base_url,
        sourceEventUrl: toAbsoluteUrl(event.sourceEventUrl || null, source.base_url),
        city: event.city || undefined,
      }))
      .filter((event) => Boolean(event.title || event.dateText || event.sourceEventUrl))
  ));
};

export const GENERIC_CARD_DEFAULTS: ParserSelectorDefaults = {
  itemSelectors: ['article', '.event', '.event-item', '.agenda-item', '.tribe-events-calendar-list__event-row'],
  titleSelectors: ['h1', 'h2', 'h3', '.entry-title', '.event-title', '.tribe-events-calendar-list__event-title'],
  dateSelectors: ['time', '.date', '.event-date', '.tribe-event-date-start', '.datetime'],
  descriptionSelectors: ['.excerpt', '.summary', '.description', '.event-description', 'p'],
  linkSelectors: ['a[href]'],
  artistSelectors: ['.artist', '.artists', '.lineup li', '.lineup .artist', '.event-artists li'],
  venueSelectors: ['.venue', '.location', '.event-venue'],
  citySelectors: ['.city', '.event-city', '.location .city'],
};

const BILL_NOT_ARTIST_RE = /^(?:(?:gran )?fiesta|concierto|evento privado|micro abierto|open mic)\b|\bjam\b/i;

const billActs = (text: string): string[] => {
  const names = text
    .split(/\s+\+\s*/)
    .map((act) => act.replace(/\s*[([].*$/, '').trim())
    .filter((act) => act && !BILL_NOT_ARTIST_RE.test(act))
    .flatMap((act) => artistNamesFromTitle(act));
  const seen = new Set<string>();
  return names.filter((name) => !seen.has(name.toLowerCase()) && Boolean(seen.add(name.toLowerCase())));
};

// "Ciclo 2026: A + B y C (Género) País" → ["A", "B", "C"]. Series prefixes
// ("Radar Joven:", "Jazz con Sabor a Club 2026." or "Patronas 2026 -") are
// dropped, "+" and "feat:" separate the acts in billing order, anything from
// the first bracket of an act on is genre or origin, and every act then goes
// through the shared cleanup rules. When nothing is left after a colon
// ("Lion Family Band: Sandunga vol 2") the left side is the artist. A title
// opening with quotes names a show, not a performer; a tribute band keeps its
// own name ("Chili Critters – Trib. Red Hot Chili Peppers" → Chili Critters).
export const billArtistNames = (title: string | null | undefined): string[] => {
  let text = (title || '').replace(/\s+/g, ' ').replace(/\s+feat\.?:?\s+/gi, ' + ').trim();
  if (/^["“«]/.test(text)) return [];
  if (!/^(?:el\s+)?(?:gran\s+)?trib/i.test(text)) {
    text = text.replace(/\s+[-–—]?\s*\btrib(?:uto|ute)?\b\.?\s+(?:a\s+|al\s+|to\s+)?\S.*$/i, '');
  }
  const colon = text.match(/^([^:+]+):\s+(?=\S)/);
  const names = billActs(
    text
      .slice(colon?.[0].length ?? 0)
      .replace(/^[^.+]{6,}\.\s+(?=\S)/, '')
      .replace(/^[^+]*?\b20\d{2}\s+[-–—]\s+/, ''),
  );
  return names.length === 0 && colon ? billActs(colon[1]) : names;
};

// Madrid wall-clock "dd/mm/yyyy HH:MM", which parseDateTextToIso reads with an
// explicit year. Venue agendas list a show after midnight under the night it
// belongs to, so `nextDay` moves it to its real calendar day.
export const madridDateText = (
  year: number,
  month: number,
  day: number,
  time = '20:00',
  nextDay = false,
): string | undefined => {
  const valid = new Date(Date.UTC(year, month - 1, day));
  if (valid.getUTCMonth() !== month - 1 || valid.getUTCDate() !== day) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day + (nextDay ? 1 : 0)));
  const [hour, minute] = time.split(/[:h.]/);
  const pad = (value: number | string | undefined) => String(value || 0).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(hour)}:${pad(minute)}`;
};

// Today in Madrid as yyyy-mm-dd, to drop past nights from a listing.
export const madridToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

export const htmlToText = (value: string | null | undefined): string =>
  (value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;|&#0*38;/gi, '&')
    .replace(/&#8211;|&ndash;/gi, '–')
    .replace(/&#8217;|&rsquo;/gi, '’')
    .replace(/&#822[01];|&quot;|&[lr]dquo;/gi, '"')
    .replace(/&hellip;|&#8230;/gi, '…')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .trim();
