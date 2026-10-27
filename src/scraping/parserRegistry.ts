import type { ParserKey, VenueParser } from '../types/scrape.js';
import { apoloAgendaParser } from './parsers/apoloAgendaParser.js';
import { eventsManagerCalendarParser } from './parsers/eventsManagerCalendarParser.js';
import { elementorAgendaParser } from './parsers/elementorAgendaParser.js';
import { genericAgendaParser } from './parsers/genericAgendaParser.js';
import { jsonLdAgendaParser } from './parsers/jsonLdAgendaParser.js';
import { linkedEventCardsParser } from './parsers/linkedEventCardsParser.js';
import { luzDeGasCalendarParser } from './parsers/luzDeGasCalendarParser.js';
import { movistarArenaAgendaParser } from './parsers/movistarArenaAgendaParser.js';
import { residentAdvisorLikeParser } from './parsers/residentAdvisorLikeParser.js';
import { razzmatazzAgendaParser } from './parsers/razzmatazzAgendaParser.js';
import { singleEventPageParser } from './parsers/singleEventPageParser.js';
import { sirocoAgendaParser } from './parsers/sirocoAgendaParser.js';
import { shopifyConcertsParser } from './parsers/shopifyConcertsParser.js';
import { tribeEventsApiParser } from './parsers/tribeEventsApiParser.js';
import { wordpressGenericParser } from './parsers/wordpressGenericParser.js';
import { marulaAgendaParser } from './parsers/marulaAgendaParser.js';
import { wolfAgendaParser } from './parsers/wolfAgendaParser.js';
import { sidecarAgendaParser } from './parsers/sidecarAgendaParser.js';
import { heliogabalAgendaParser } from './parsers/heliogabalAgendaParser.js';
import { salaVolAgendaParser } from './parsers/salaVolAgendaParser.js';
import { freedoniaAgendaParser } from './parsers/freedoniaAgendaParser.js';
import { sodaAgendaParser } from './parsers/sodaAgendaParser.js';
import { jsonLdBillAgendaParser } from './parsers/jsonLdBillAgendaParser.js';
import { sixteenToneladasAgendaParser } from './parsers/sixteenToneladasAgendaParser.js';
import { wixEventsWarmupParser } from './parsers/wixEventsWarmupParser.js';
import { repvbliccaAgendaParser } from './parsers/repvbliccaAgendaParser.js';
import { jimmyGlassAgendaParser } from './parsers/jimmyGlassAgendaParser.js';
import { radioCityAgendaParser } from './parsers/radioCityAgendaParser.js';
import { salaCustomAgendaParser } from './parsers/salaCustomAgendaParser.js';
import { rollercoasterAgendaParser } from './parsers/rollercoasterAgendaParser.js';
import { malandarAgendaParser } from './parsers/malandarAgendaParser.js';

const parserRegistry: Record<ParserKey, VenueParser> = {
  'apolo-agenda': apoloAgendaParser,
  'events-manager-calendar': eventsManagerCalendarParser,
  'elementor-agenda': elementorAgendaParser,
  'json-ld-agenda': jsonLdAgendaParser,
  'linked-event-cards': linkedEventCardsParser,
  'luz-de-gas-calendar': luzDeGasCalendarParser,
  'movistar-arena-agenda': movistarArenaAgendaParser,
  'generic-agenda': genericAgendaParser,
  'wordpress-generic': wordpressGenericParser,
  'single-event-page': singleEventPageParser,
  'resident-advisor-like': residentAdvisorLikeParser,
  'razzmatazz-agenda': razzmatazzAgendaParser,
  'siroco-agenda': sirocoAgendaParser,
  'shopify-concerts': shopifyConcertsParser,
  'tribe-events-api': tribeEventsApiParser,
  'marula-agenda': marulaAgendaParser,
  'wolf-agenda': wolfAgendaParser,
  'sidecar-agenda': sidecarAgendaParser,
  'heliogabal-agenda': heliogabalAgendaParser,
  'sala-vol-agenda': salaVolAgendaParser,
  'freedonia-agenda': freedoniaAgendaParser,
  'soda-agenda': sodaAgendaParser,
  'json-ld-bill-agenda': jsonLdBillAgendaParser,
  'sixteen-toneladas-agenda': sixteenToneladasAgendaParser,
  'wix-events-warmup': wixEventsWarmupParser,
  'repvblicca-agenda': repvbliccaAgendaParser,
  'jimmy-glass-agenda': jimmyGlassAgendaParser,
  'radio-city-agenda': radioCityAgendaParser,
  'sala-custom-agenda': salaCustomAgendaParser,
  'rollercoaster-agenda': rollercoasterAgendaParser,
  'malandar-agenda': malandarAgendaParser,
};

export const getParser = (key: ParserKey): VenueParser => {
  const parser = parserRegistry[key];
  if (!parser) {
    throw new Error(`No parser registered for key: ${key}`);
  }

  return parser;
};

export const listParsers = (): VenueParser[] => Object.values(parserRegistry);
