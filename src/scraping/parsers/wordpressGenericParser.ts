import type { VenueParser } from '../../types/scrape.js';
import { parseCardList } from './shared.js';

const WORDPRESS_DEFAULTS = {
  itemSelectors: [
    '.tribe-events-calendar-list__event-row',
    'article.type-tribe_events',
    'article.post',
    '.wp-block-post',
  ],
  titleSelectors: ['.tribe-events-calendar-list__event-title', '.entry-title', '.wp-block-post-title', 'h1', 'h2'],
  dateSelectors: ['time', '.tribe-event-date-start', '.tribe-events-schedule__datetime', '.posted-on'],
  descriptionSelectors: ['.tribe-events-calendar-list__event-description', '.entry-summary', '.excerpt', 'p'],
  linkSelectors: ['.tribe-events-calendar-list__event-title-link', '.wp-block-post-title a', 'a[href]'],
  artistSelectors: ['.lineup li', '.artists li', '.event-artists li'],
  venueSelectors: ['.tribe-events-calendar-list__event-venue-title', '.venue', '.location'],
  citySelectors: ['.city', '.tribe-events-venue-details .locality'],
};

export const wordpressGenericParser: VenueParser = {
  key: 'wordpress-generic',
  canHandle: (_url, html) => /wp-content|wp-block|tribe-events/i.test(html),
  parseListPage: async (page, source) => parseCardList(page, source, WORDPRESS_DEFAULTS),
};
