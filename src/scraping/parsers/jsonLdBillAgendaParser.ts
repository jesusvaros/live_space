import type { VenueParser } from '../../types/scrape.js';
import { parseJsonLdDocuments } from './jsonLdAgendaParser.js';
import { billArtistNames } from './shared.js';

// Schema.org agendas whose events carry no performer and title the night as a
// bill ("PYRAMIDIACS + RADIO DAYS"): same records as json-ld-agenda, with
// every act of the bill as an artist, headliner first.
export const jsonLdBillAgendaParser: VenueParser = {
  key: 'json-ld-bill-agenda',
  canHandle: (_url, html) => html.includes('application/ld+json') && html.includes('"Event"'),
  parseListPage: async (page, source) => {
    const documents = await page.locator('script[type="application/ld+json"]').allTextContents();
    return parseJsonLdDocuments(documents, source).map((event) => {
      const performers = (event.rawPayload as { performer?: unknown }).performer;
      const hasPerformer = Array.isArray(performers) ? performers.length > 0 : Boolean(performers);
      return hasPerformer ? event : { ...event, artistNames: billArtistNames(event.title) };
    });
  },
};
