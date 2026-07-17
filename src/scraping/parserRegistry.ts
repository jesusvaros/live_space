import type { ParserKey, VenueParser } from '../types/scrape.js';
import { genericAgendaParser } from './parsers/genericAgendaParser.js';
import { residentAdvisorLikeParser } from './parsers/residentAdvisorLikeParser.js';
import { singleEventPageParser } from './parsers/singleEventPageParser.js';
import { wordpressGenericParser } from './parsers/wordpressGenericParser.js';

const parserRegistry: Record<ParserKey, VenueParser> = {
  'generic-agenda': genericAgendaParser,
  'wordpress-generic': wordpressGenericParser,
  'single-event-page': singleEventPageParser,
  'resident-advisor-like': residentAdvisorLikeParser,
};

export const getParser = (key: ParserKey): VenueParser => {
  const parser = parserRegistry[key];
  if (!parser) {
    throw new Error(`No parser registered for key: ${key}`);
  }

  return parser;
};

export const listParsers = (): VenueParser[] => Object.values(parserRegistry);
