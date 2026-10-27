import type { ParserKey, ScrapeSourceMetadata, SourceType } from '../types/scrape.js';

export type SeedSource = {
  source_type: SourceType;
  name: string;
  base_url: string;
  city: 'Madrid' | 'Barcelona' | 'Sevilla' | 'Valencia';
  parser_key: ParserKey;
  metadata: ScrapeSourceMetadata;
  is_active: boolean;
  terms_reviewed_at: string | null;
};

const LOCAL_SCENE_REVIEW = '2026-10-27T00:00:00.000Z';

const source = (
  name: string,
  base_url: string,
  city: SeedSource['city'],
  officialWebsite: string,
  options: {
    parserKey?: ParserKey;
    ready?: boolean;
    structuredDataVerified?: boolean;
    categoryAllowlist?: string[];
    reviewedAt?: string;
  } = {}
): SeedSource => ({
  source_type: 'venue',
  name,
  base_url,
  city,
  parser_key: options.parserKey ?? 'json-ld-agenda',
  metadata: {
    officialWebsite,
    termsReviewStatus: options.ready ? 'approved' : 'pending',
    fixtureVerified: options.ready ?? false,
    structuredDataVerified: options.structuredDataVerified ?? false,
    categoryAllowlist: options.categoryAllowlist ?? [],
  },
  terms_reviewed_at: options.ready ? (options.reviewedAt ?? '2026-07-18T00:00:00.000Z') : null,
  is_active: options.ready ?? false,
});

export const seedSources: SeedSource[] = [
  source(
    'Movistar Arena',
    'https://www.movistararena.es/programacion/?cat%5B%5D=1',
    'Madrid',
    'https://www.movistararena.es/',
    { parserKey: 'movistar-arena-agenda', ready: true, structuredDataVerified: true }
  ),
  source(
    'La Riviera',
    'https://salariviera.com/conciertossalariviera/',
    'Madrid',
    'https://salariviera.com/',
    { parserKey: 'tribe-events-api', ready: true, structuredDataVerified: true }
  ),
  source('Sala El Sol', 'https://salaelsol.com/agenda/', 'Madrid', 'https://salaelsol.com/', {
    parserKey: 'events-manager-calendar',
    ready: true,
  }),
  source('Sala Caracol', 'https://salacaracol.com/', 'Madrid', 'https://salacaracol.com/'),
  source('Sala But', 'https://www.salabut.es/agenda-conciertos/', 'Madrid', 'https://www.salabut.es/', {
    parserKey: 'elementor-agenda',
    ready: true,
    structuredDataVerified: true,
  }),
  source('Sala Copérnico', 'https://www.salacopernico.es/', 'Madrid', 'https://www.salacopernico.es/'),
  source(
    'Independance Club',
    'https://independanceclub.com/pages/conciertos',
    'Madrid',
    'https://independanceclub.com/',
    { parserKey: 'shopify-concerts', ready: true, structuredDataVerified: true }
  ),
  source('Siroco', 'https://siroco.es/agenda/', 'Madrid', 'https://siroco.es/', {
    parserKey: 'siroco-agenda',
    ready: true,
  }),
  source('Ochoymedio Club', 'https://ochoymedio.com/', 'Madrid', 'https://ochoymedio.com/'),
  source('Teatro Eslava', 'https://teatroeslava.com/', 'Madrid', 'https://teatroeslava.com/'),
  source('Razzmatazz', 'https://www.salarazzmatazz.com/agenda/conciertos/', 'Barcelona', 'https://www.salarazzmatazz.com/', {
    parserKey: 'razzmatazz-agenda',
    ready: true,
  }),
  source('Sala Apolo', 'https://www.sala-apolo.com/es/agenda', 'Barcelona', 'https://www.sala-apolo.com/', {
    parserKey: 'apolo-agenda',
    ready: true,
  }),
  source('Sidecar', 'https://sidecar.es/programacio/', 'Barcelona', 'https://sidecar.es/', {
    parserKey: 'linked-event-cards',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
  }),
  source('Upload', 'https://uploadbarcelona.com/', 'Barcelona', 'https://uploadbarcelona.com/'),
  source('La Nau', 'https://lanau.com/', 'Barcelona', 'https://lanau.com/'),
  source('Luz de Gas', 'https://luzdegas.com/', 'Barcelona', 'https://luzdegas.com/', {
    parserKey: 'luz-de-gas-calendar',
    ready: true,
    structuredDataVerified: true,
  }),
  source('Jamboree', 'https://jamboreejazz.com/agenda/', 'Barcelona', 'https://jamboreejazz.com/', {
    parserKey: 'tribe-events-api',
    ready: true,
    structuredDataVerified: true,
    categoryAllowlist: ['Concert'],
  }),
  source('Wolf Barcelona', 'https://wolfbarcelona.com/conciertos/', 'Barcelona', 'https://wolfbarcelona.com/', {
    parserKey: 'linked-event-cards',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
  }),
  // Small venues of the local scene, reviewed 2026-10-27: public agenda and
  // robots.txt allow it. Sala Villanos stays out: its robots.txt blocks
  // every crawler but the search engines.
  source('Café La Palma', 'https://cafelapalma.com/', 'Madrid', 'https://cafelapalma.com/', {
    parserKey: 'tribe-events-api',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  source('Sala Galileo Galilei', 'https://salagalileo.es/programacion/', 'Madrid', 'https://salagalileo.es/', {
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  source('Gruta 77', 'https://gruta77.com/programacion-eventos-gruta77-madrid/', 'Madrid', 'https://gruta77.com/', {
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  source('Marula Café', 'https://marulacafe.com/agenda', 'Barcelona', 'https://marulacafe.com/', {
    parserKey: 'linked-event-cards',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
  }),
];
