import type { RawScrapedEvent, ScrapeSource, VenueParser } from '../../types/scrape.js';
import { billArtists, isCancelled, isNotConcert, isUpcoming, madridIso, monthNumber, parseClock } from './localScene.js';
import { keepLeadingPlus } from './icsFeedParser.js';
import { htmlToText } from './shared.js';

// Escenario Santander prints its whole agenda on /agenda/: a month header
// ("Noviembre 2026") and, under it, one card per night with the event page,
// "Vie 13 nov — 21:30h" and the title. The year comes from the header the
// card sits under. Theme parties ("Del Remember al Perreo", "Winter Mix Love
// 90s") are in the same list and are left to the review rules.

type SourceLike = Pick<ScrapeSource, 'base_url' | 'name' | 'city'>;

// "Steve Wynn – Artista invitada: Juana Everett", "LOS ANTILUNES presentan
// PLADÜR + DEATHSHOT", "Uncut en Rock Nights", "+dMANÁ «Amar es combatir
// Show»": the promoter, the in-house "Rock Nights" series, the quoted show
// name and the guest label are not part of a performer's name.
export const escenarioBill = (title: string): string =>
  title
    .replace(/\s+[–—-]\s+artistas?\s+invitad[oa]s?:\s*/i, ' + ')
    .replace(/^.{2,60}?\bpresenta[ns]?:?\s+/i, '')
    .replace(/\s*[«"“][^»"”]*[»"”]?/g, ' ')
    .replace(/\s+(?:live\s+)?(?:in\s+|en\s+)?rock\s+nights\s*$/i, '')
    .replace(/\s+concierto\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

export const parseEscenarioSantanderHtml = (html: string, source: SourceLike, now = new Date()): RawScrapedEvent[] => {
  const tokens = html.matchAll(
    /<div class="es-agenda__month">([^<]*)<\/div>|<a href="([^"]+)" class="es-card"[^>]*>([\s\S]*?)<\/a>/g,
  );
  let year: number | undefined;
  let headerMonth: number | undefined;
  const seen = new Set<string>();
  const events: RawScrapedEvent[] = [];

  for (const [, monthHeader, url, card] of tokens) {
    if (monthHeader !== undefined) {
      const match = htmlToText(monthHeader).match(/([A-Za-zÁÉÍÓÚáéíóú]+)\s+(20\d{2})/);
      year = match ? Number(match[2]) : undefined;
      headerMonth = match ? monthNumber(match[1]) : undefined;
      continue;
    }
    if (!year || !url || !card || seen.has(url)) continue;
    const dateLabel = htmlToText(card.match(/class="es-card__date">([^<]*)</)?.[1]);
    const title = htmlToText(card.match(/class="es-card__title">([\s\S]*?)<\/h3>/)?.[1]).replace(/\s+/g, ' ').trim();
    const date = dateLabel.match(/(\d{1,2})\s+([a-záéíóú]+)\.?/i);
    const month = date ? monthNumber(date[2]) : undefined;
    if (!title || !date || !month || isCancelled(title) || isNotConcert(title)) continue;
    // A card under "Diciembre 2026" dated in January belongs to the next year.
    const cardYear = headerMonth && month < headerMonth ? year + 1 : year;
    const clock = parseClock(dateLabel.split(/[—–-]/).slice(1).join(' '));
    const startsAt = madridIso(cardYear, month, Number(date[1]), clock?.hour, clock?.minute);
    if (!startsAt || !isUpcoming(startsAt, now)) continue;
    seen.add(url);
    const image = card.match(/data-src="([^"]+)"/)?.[1] ?? card.match(/<img[^>]+src="(https?:[^"]+)"/)?.[1];
    const pad = (value: number) => String(value).padStart(2, '0');
    const time = clock ? ` ${pad(clock.hour)}:${pad(clock.minute)}` : '';

    events.push({
      sourceUrl: source.base_url,
      sourceEventUrl: url,
      sourceEventId: url,
      title,
      dateText: `${pad(Number(date[1]))}/${pad(month)}/${cardYear}${time}`,
      startsAt: clock ? startsAt : undefined,
      venueName: source.name,
      city: source.city || undefined,
      artistNames: keepLeadingPlus(escenarioBill(title), billArtists(escenarioBill(title))),
      imageUrl: image,
      rawPayload: { url, title, date: dateLabel, year: cardYear, image: image ?? null },
    });
  }

  return events;
};

export const escenarioSantanderAgendaParser: VenueParser = {
  key: 'escenario-santander-agenda',
  canHandle: (_url, html) => html.includes('es-agenda__month') && html.includes('es-card__date'),
  parseListPage: async (page, source) => parseEscenarioSantanderHtml(await page.content(), source),
};
