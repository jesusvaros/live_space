import type { VenueParser } from '../../types/scrape.js';
import { parseCardList } from './shared.js';

const SINGLE_EVENT_DEFAULTS = {
  itemSelectors: ['main', 'article', 'body'],
  titleSelectors: ['h1', '.event-title', '.entry-title', '.tribe-events-single-event-title'],
  dateSelectors: ['time', '.date', '.event-date', '.tribe-events-schedule__datetime', '.datetime'],
  descriptionSelectors: ['.description', '.entry-content', '.event-description', 'article p', 'main p'],
  linkSelectors: ['link[rel="canonical"]', 'a[href]'],
  artistSelectors: ['.artist', '.artists li', '.lineup li', '.event-artists li'],
  venueSelectors: ['.venue', '.location', '.event-venue', '.tribe-events-venue-details'],
  citySelectors: ['.city', '.locality', '.event-city'],
};

export const singleEventPageParser: VenueParser = {
  key: 'single-event-page',
  canHandle: (_url, html) => /<h1|event/i.test(html),
  parseListPage: async (page, source) => {
    const results = await parseCardList(page, source, SINGLE_EVENT_DEFAULTS);
    return results.slice(0, 1);
  },
};
