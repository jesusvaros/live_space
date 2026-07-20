import type { VenueParser } from '../../types/scrape.js';
import { parseCardList } from './shared.js';

const RESIDENT_ADVISOR_DEFAULTS = {
  itemSelectors: ['[data-tracking-id="event"]', '[data-testid="event-card"]', '.event-listing', 'article'],
  titleSelectors: ['h1', 'h2', 'h3', '[data-testid="event-title"]', '.TextLarge'],
  dateSelectors: ['time', '[data-testid="event-date"]', '.date', '.TextBody'],
  descriptionSelectors: ['[data-testid="event-description"]', '.description', 'p'],
  linkSelectors: ['a[href]'],
  artistSelectors: ['[data-testid="lineup-item"]', '.lineup li', '.artists li'],
  venueSelectors: ['[data-testid="venue-name"]', '.venue', '.location'],
  citySelectors: ['[data-testid="event-location"]', '.city'],
};

export const residentAdvisorLikeParser: VenueParser = {
  key: 'resident-advisor-like',
  canHandle: (url, html) => /residentadvisor|ra\.co/i.test(url) || /lineup|data-testid="event-title"/i.test(html),
  parseListPage: async (page, source) => parseCardList(page, source, RESIDENT_ADVISOR_DEFAULTS),
};
