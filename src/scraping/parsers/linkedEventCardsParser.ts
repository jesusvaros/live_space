import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';

const DETAIL_LINK = /\/(?:eventos?|events?|conciertos?|concerts?)\/[^/?#]+/i;

export const linkedEventCardsParser: VenueParser = {
  key: 'linked-event-cards',
  canHandle: (_url, html) => {
    const matches = html.match(/href=["'][^"']*\/(?:eventos?|events?|conciertos?|concerts?)\/[^"'/?#]+/gi);
    return (matches || []).length >= 2;
  },
  parseListPage: async (page, source) =>
    page.evaluate(
      ({ sourceUrl, venueName, city }) => {
        const detailLink = /\/(?:eventos?|events?|conciertos?|concerts?)\/[^/?#]+/i;
        const dateSignal =
          /(?:\b\d{1,2}[/. -]\d{1,2}(?:[/. -]\d{2,4})?\b)|(?:\b\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?=\s|\d|$))/i;
        const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() || '';
        const events: RawScrapedEvent[] = [];
        const seen = new Set<string>();

        for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
          let url: URL;
          try {
            url = new URL(anchor.href, sourceUrl);
          } catch {
            continue;
          }
          if (!detailLink.test(url.pathname) || url.hash || seen.has(url.toString())) continue;

          let root: HTMLElement | null = anchor.closest('article, li, [class*="event" i], [class*="card" i]');
          let cursor = anchor.parentElement;
          for (let depth = 0; !root && cursor && depth < 6; depth += 1) {
            const text = clean(cursor.textContent);
            if (dateSignal.test(text) && text.length >= 20 && text.length <= 2_000) root = cursor;
            cursor = cursor.parentElement;
          }
          const text = clean(root?.textContent || anchor.parentElement?.textContent);
          if (!dateSignal.test(text) || text.length > 2_000) continue;

          const titleCandidates = Array.from(
            root?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, p, [class*="title" i]') || [],
          )
            .map((element) => {
              const value = clean(element.textContent);
              const invalid =
                value.length < 3 ||
                value.length > 180 ||
                !/[a-záéíóúüñ]{2}/i.test(value) ||
                /^(?:lun|mar|mi[eé]|jue|vie|s[aá]b|dom|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)$/i.test(value) ||
                /^(?:tickets?|entradas?|m[aá]s info(?:rmaci[oó]n)?)$/i.test(value) ||
                /^(?:dsd\s*)?\d+(?:[.,]\d+)?\s*€/i.test(value);
              const bonus = /title/i.test(element.className) ? 60 : /^H[234]$/.test(element.tagName) ? 30 : 0;
              return { value, score: invalid ? -1 : bonus + Math.min(value.length, 120) };
            })
            .filter((candidate) => candidate.score >= 0)
            .sort((left, right) => right.score - left.score);
          const anchorText = clean(anchor.textContent);
          const title =
            titleCandidates[0]?.value ||
            (anchorText.length > 3 && !/m[aá]s informaci[oó]n|tickets?/i.test(anchorText) ? anchorText : '');
          if (!title) continue;

          seen.add(url.toString());
          events.push({
            sourceUrl,
            sourceEventUrl: url.toString(),
            sourceEventId: url.pathname,
            title,
            dateText: text,
            venueName,
            city: city || undefined,
            artistNames: [title],
            rawPayload: { text: text.slice(0, 2_000) },
          });
        }
        return events;
      },
      { sourceUrl: source.base_url, venueName: source.name, city: source.city },
    ),
};

export const isLinkedEventDetailUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return !parsed.hash && DETAIL_LINK.test(parsed.pathname);
  } catch {
    return false;
  }
};
