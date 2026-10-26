import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';

export const eventsManagerCalendarParser: VenueParser = {
  key: 'events-manager-calendar',
  canHandle: (_url, html) =>
    (html.includes('em-cal-event') && html.includes('data-calendar-date')) ||
    (html.includes('gran-contenedor-agenda') && html.includes('nombre_evento')),
  parseListPage: async (page, source) =>
    page.evaluate(({ sourceUrl, venueName, city }) => {
      const events: RawScrapedEvent[] = [];
      const seen = new Set<string>();

      document.querySelectorAll<HTMLElement>('.gran-contenedor-agenda').forEach((card) => {
        const category = card.querySelector<HTMLElement>('.categoria-12')?.textContent?.trim() || '';
        if (!/conciertos?/i.test(category)) return;
        const anchor = card.querySelector<HTMLAnchorElement>('.nombre_evento a[href]');
        const title = anchor?.textContent?.replace(/\s+/g, ' ').trim();
        const date = card.querySelector<HTMLElement>('.fecha-superior')?.textContent?.replace(/\s+/g, ' ').trim();
        const time = card.querySelector<HTMLElement>('.espacio')?.textContent?.replace(/\s+/g, ' ').trim();
        const eventUrl = anchor?.href;
        if (!title || !date || !eventUrl || seen.has(eventUrl)) return;
        seen.add(eventUrl);
        events.push({
          sourceUrl,
          sourceEventUrl: eventUrl,
          sourceEventId: new URL(eventUrl).pathname,
          title,
          dateText: `${date} ${time || '20:00'}`,
          venueName,
          city,
          artistNames: [title],
          rawPayload: { category, date, time: time || null },
        });
      });

      if (events.length > 0) return events;

      document.querySelectorAll('.em-cal-day').forEach((day) => {
        const dateNode = day.querySelector<HTMLElement>('[data-calendar-date]');
        const epoch = Number(dateNode?.dataset.calendarDate);
        if (!Number.isFinite(epoch)) return;
        if (epoch * 1000 < Date.now() - 24 * 60 * 60 * 1000) return;

        const date = new Date(epoch * 1000);
        const dateLabel = new Intl.DateTimeFormat('es-ES', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(date);

        day.querySelectorAll<HTMLElement>('.em-cal-event').forEach((event) => {
          const anchor = event.querySelector<HTMLAnchorElement>('a[href]');
          const title = anchor?.textContent?.replace(/\s+/g, ' ').trim();
          if (!title) return;

          const rawText = event.textContent?.replace(/\s+/g, ' ').trim() || '';
          const time = rawText.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM)?)\b/i)?.[1] || '20:00';
          const eventUrl = event.dataset.eventUrl || anchor?.href;
          if (eventUrl && seen.has(eventUrl)) return;
          if (eventUrl) seen.add(eventUrl);

          events.push({
            sourceUrl,
            sourceEventUrl: eventUrl,
            sourceEventId: event.dataset.eventId,
            title,
            dateText: `${dateLabel} ${time}`,
            venueName,
            city,
            artistNames: [title],
            rawPayload: { dateLabel, time, eventId: event.dataset.eventId },
          });
        });
      });

      return events;
    }, { sourceUrl: source.base_url, venueName: source.name, city: source.city || undefined }),
};
