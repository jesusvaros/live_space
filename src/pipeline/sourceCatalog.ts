import type { ParserKey, ScrapeSourceMetadata, SourceType } from '../types/scrape.js';

export type SeedSource = {
  source_type: SourceType;
  name: string;
  base_url: string;
  city: 'Madrid' | 'Barcelona';
  parser_key: ParserKey;
  metadata: ScrapeSourceMetadata;
  is_active: boolean;
  terms_reviewed_at: string | null;
};

const source = (
  name: string,
  base_url: string,
  city: SeedSource['city'],
  officialWebsite: string,
  options: {
    parserKey?: ParserKey;
    ready?: boolean;
    structuredDataVerified?: boolean;
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
  },
  terms_reviewed_at: options.ready ? '2026-07-18T00:00:00.000Z' : null,
  is_active: options.ready ?? false,
});

export const seedSources: SeedSource[] = [
  source('Movistar Arena', 'https://www.movistararena.es/', 'Madrid', 'https://www.movistararena.es/'),
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
  source('Sala But', 'https://www.salabut.es/agenda-conciertos/', 'Madrid', 'https://www.salabut.es/'),
  source('Sala Copérnico', 'https://www.salacopernico.es/', 'Madrid', 'https://www.salacopernico.es/'),
  source(
    'Independance Club',
    'https://independanceclub.com/pages/conciertos',
    'Madrid',
    'https://independanceclub.com/'
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
  source('Sidecar', 'https://sidecar.es/', 'Barcelona', 'https://sidecar.es/'),
  source('Upload', 'https://uploadbarcelona.com/', 'Barcelona', 'https://uploadbarcelona.com/'),
  source('La Nau', 'https://lanau.com/', 'Barcelona', 'https://lanau.com/'),
  source('Luz de Gas', 'https://luzdegas.com/', 'Barcelona', 'https://luzdegas.com/'),
  source('Jamboree', 'https://jamboreejazz.com/', 'Barcelona', 'https://jamboreejazz.com/'),
  source('Wolf Barcelona', 'https://wolfbarcelona.com/', 'Barcelona', 'https://wolfbarcelona.com/'),
];
