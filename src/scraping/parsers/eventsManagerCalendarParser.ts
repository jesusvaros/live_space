import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';

export const eventsManagerCalendarParser: VenueParser = {
  key: 'events-manager-calendar',
  canHandle: (_url, html) => html.includes('em-cal-event') && html.includes('data-calendar-date'),
  parseListPage: async (page, source) =>
    page.evaluate(({ sourceUrl, venueName, city }) => {
      const events: RawScrapedEvent[] = [];

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
