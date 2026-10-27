import type { VenueParser } from '../../types/scrape.js';
import { billArtistNames } from './shared.js';
import { tribeEventsApiParser } from './tribeEventsApiParser.js';

// The Events Calendar API for venues whose titles carry the whole bill with
// genre and origin: "CHINI.PNG + JUANITA LA O (Indie Pop Art Rock) Chile",
// "Patronas 2026: BUENTRIPI (Neo Soul R&B Funk)". Same capture as
// tribe-events-api; the line-up is split per act and private bookings dropped.
// The prose description stays in the payload only: words such as "club" or
// "sesión" in it would make the normalizer read a concert as a DJ session.
export const tribeEventsLineupParser: VenueParser = {
  key: 'tribe-events-lineup',
  canHandle: tribeEventsApiParser.canHandle,
  parseListPage: async (page, source) =>
    (await tribeEventsApiParser.parseListPage(page, source))
      .filter((event) => !/\bevento privado\b/i.test(event.title || ''))
      .map((event) => ({ ...event, description: undefined, artistNames: billArtistNames(event.title) })),
};
