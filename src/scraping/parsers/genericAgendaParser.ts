import type { VenueParser } from '../../types/scrape.js';
import { GENERIC_CARD_DEFAULTS, parseCardList } from './shared.js';

export const genericAgendaParser: VenueParser = {
  key: 'generic-agenda',
  canHandle: () => true,
  parseListPage: async (page, source) => parseCardList(page, source, GENERIC_CARD_DEFAULTS),
};
