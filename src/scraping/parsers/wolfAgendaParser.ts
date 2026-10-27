import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { billArtists, fetchDetailHtml, isCancelled, isUpcoming, madridIso, monthNumber, withoutFestivalTag } from './localScene.js';

// wolfbarcelona.com/conciertos: cards with the bill and "Vie 30 Oct 2026";
// the start time ("Inicio de concierto: 20:00H") is only on the detail page.
export const wolfAgendaParser: VenueParser = {
  key: 'wolf-agenda',
  canHandle: (_url, html) => html.includes('slider_title_bold') && html.includes('/conciertos/'),
  parseListPage: async (page, source) => {
    const cards = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/conciertos/"]')).flatMap((anchor) => {
        const title = anchor.querySelector('.slider_title_bold')?.textContent?.replace(/\s+/g, ' ').trim();
        const date = anchor.querySelector('.slider_title_slim')?.textContent?.replace(/\s+/g, ' ').trim();
        const img = anchor.querySelector('img');
        return title && date
          ? [{ url: anchor.href, title, date, image: img?.getAttribute('data-src') || img?.getAttribute('src') || undefined }]
          : [];
      }),
    );

    const upcoming = cards.flatMap((card) => {
      const match = card.date.match(/(\d{1,2})\s+([a-zà-ü]+)\.?\s+(\d{4})/i);
      const month = match ? monthNumber(match[2]) : undefined;
      if (!match || !month || isCancelled(card.title)) return [];
      const dayStart = madridIso(Number(match[3]), month, Number(match[1]), 23, 59);
      return isUpcoming(dayStart) ? [{ ...card, year: Number(match[3]), month, day: Number(match[1]) }] : [];
    });
    const unique = Array.from(new Map(upcoming.map((card) => [card.url, card])).values());
    const details = await fetchDetailHtml(page, unique.map((card) => card.url));

    return unique.flatMap((card): RawScrapedEvent[] => {
      const detail = details.get(card.url) || '';
      const time =
        detail.match(/Inicio de concierto:[\s\S]{0,80}?(\d{1,2})[:.](\d{2})\s*h/i) ??
        detail.match(/>\s*(\d{1,2})[:.](\d{2})\s*h\s*</i);
      const startsAt = madridIso(card.year, card.month, card.day, Number(time?.[1] ?? 20), Number(time?.[2] ?? 0));
      if (!startsAt) return [];
      const ticketUrl = detail.match(/href="(https?:\/\/(?!wolfbarcelona\.com)[^"]+)"[^>]*>\s*(?:ENTRADES|ENTRADAS|TICKETS)/i)?.[1];

      return [{
        sourceUrl: source.base_url,
        sourceEventUrl: card.url,
        sourceEventId: card.url,
        title: withoutFestivalTag(card.title),
        dateText: `${card.date} ${time ? `${time[1]}:${time[2]}` : ''}`.trim(),
        startsAt,
        venueName: source.name,
        city: source.city || undefined,
        artistNames: billArtists(card.title),
        imageUrl: card.image,
        rawPayload: { ...card, ticketUrl },
      }];
    });
  },
};
