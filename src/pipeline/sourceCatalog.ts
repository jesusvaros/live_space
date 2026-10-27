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
    parserKey: 'sidecar-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
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
    parserKey: 'wolf-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
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
    parserKey: 'marula-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  // Barcelona local scene (agent)
  source('Heliogàbal', 'https://www.heliogabal.com/', 'Barcelona', 'https://www.heliogabal.com/', {
    parserKey: 'heliogabal-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  source('Sala Vol', 'https://salavol.com/', 'Barcelona', 'https://salavol.com/', {
    parserKey: 'sala-vol-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  source('Freedonia', 'https://freedonia.eu/evento/categoria/conciertos/', 'Barcelona', 'https://freedonia.eu/', {
    parserKey: 'freedonia-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  source('Soda Acústic', 'https://soda.cat/agenda-de-conciertos/', 'Barcelona', 'https://soda.cat/', {
    parserKey: 'soda-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  // Valencia local scene (agent), reviewed 2026-10-27: public agenda on the
  // venue's own site and robots.txt allows it. Left out: Sala Moon (domain
  // parked), Wah Wah (closed, domain is now a blog), Matisse (hand-edited list
  // without years), Café Mercedes (no concerts published), La Fábrica de Hielo
  // (robots.txt blocks its calendar views), Spook (large techno club).
  source('Loco Club', 'https://lococlub.es/', 'Valencia', 'https://lococlub.es/', {
    parserKey: 'json-ld-bill-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  source('16 Toneladas', 'https://16toneladas.com/', 'Valencia', 'https://16toneladas.com/', {
    parserKey: 'sixteen-toneladas-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  source('Black Note Club', 'https://www.blacknoteclub.com/', 'Valencia', 'https://www.blacknoteclub.com/', {
    parserKey: 'wix-events-warmup',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  source('Sala Repvblicca', 'https://republicca.com/agenda/', 'Valencia', 'https://republicca.com/', {
    parserKey: 'repvblicca-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  source('Jimmy Glass Jazz Bar', 'https://www.jimmyglassjazz.net/Eventos/', 'Valencia', 'https://www.jimmyglassjazz.net/', {
    parserKey: 'jimmy-glass-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  source('Radio City', 'https://radiocityvalencia.es/agenda/', 'Valencia', 'https://radiocityvalencia.es/', {
    parserKey: 'radio-city-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  // Sevilla local scene (agent), reviewed 2026-10-27: public agenda on the
  // venue's own site and robots.txt allows it. Malandar's pages never print
  // the year (inferred from the poster upload folder), so it is not marked
  // as structured data.
  source('Fun Club', 'https://funclubsevilla.com/agenda/', 'Sevilla', 'https://funclubsevilla.com/', {
    parserKey: 'tribe-events-api',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
    categoryAllowlist: ['Concierto'],
  }),
  source('Sala Custom', 'https://salacustom.com/', 'Sevilla', 'https://salacustom.com/', {
    parserKey: 'sala-custom-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  source('Sala Malandar', 'https://salamalandar.com/programacion/', 'Sevilla', 'https://salamalandar.com/', {
    parserKey: 'malandar-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
  }),
  source('Sala Pandora', 'https://pandorasevilla.com/agenda_category/conciertos/', 'Sevilla', 'https://pandorasevilla.com/', {
    parserKey: 'rollercoaster-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
  source('Supra Music Hall', 'https://www.supramusichall.com/agenda_category/conciertos/', 'Sevilla', 'https://www.supramusichall.com/', {
    parserKey: 'rollercoaster-agenda',
    ready: true,
    reviewedAt: LOCAL_SCENE_REVIEW,
    structuredDataVerified: true,
  }),
];
