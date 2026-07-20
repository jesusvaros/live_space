import type { ParserKey, VenueParser } from '../types/scrape.js';
import { apoloAgendaParser } from './parsers/apoloAgendaParser.js';
import { eventsManagerCalendarParser } from './parsers/eventsManagerCalendarParser.js';
import { elementorAgendaParser } from './parsers/elementorAgendaParser.js';
import { genericAgendaParser } from './parsers/genericAgendaParser.js';
import { jsonLdAgendaParser } from './parsers/jsonLdAgendaParser.js';
import { residentAdvisorLikeParser } from './parsers/residentAdvisorLikeParser.js';
import { razzmatazzAgendaParser } from './parsers/razzmatazzAgendaParser.js';
import { singleEventPageParser } from './parsers/singleEventPageParser.js';
import { sirocoAgendaParser } from './parsers/sirocoAgendaParser.js';
import { tribeEventsApiParser } from './parsers/tribeEventsApiParser.js';
import { wordpressGenericParser } from './parsers/wordpressGenericParser.js';

const parserRegistry: Record<ParserKey, VenueParser> = {
  'apolo-agenda': apoloAgendaParser,
  'events-manager-calendar': eventsManagerCalendarParser,
  'elementor-agenda': elementorAgendaParser,
  'json-ld-agenda': jsonLdAgendaParser,
  'generic-agenda': genericAgendaParser,
  'wordpress-generic': wordpressGenericParser,
  'single-event-page': singleEventPageParser,
  'resident-advisor-like': residentAdvisorLikeParser,
  'razzmatazz-agenda': razzmatazzAgendaParser,
  'siroco-agenda': sirocoAgendaParser,
  'tribe-events-api': tribeEventsApiParser,
};

export const getParser = (key: ParserKey): VenueParser => {
  const parser = parserRegistry[key];
  if (!parser) {
    throw new Error(`No parser registered for key: ${key}`);
  }

  return parser;
};

export const listParsers = (): VenueParser[] => Object.values(parserRegistry);
