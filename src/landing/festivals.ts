// One entry per festival landing at /festival/<slug>/. The general landing
// never names a festival; a festival only appears on its own page. This file
// has no imports so the prerender (tsconfig.scraper.json) can read it too.

export type FestivalLanding = {
  slug: string;
  name: string;
  place: string;
  // Free text shown next to the place, e.g. "3–5 de julio de 2027".
  dates?: string;
  // Path under public/, ideally the festival's own photo with its licence.
  hero: string;
  heroAlt: string;
  // Bands on the bill; the cartel section is hidden when empty.
  lineup?: string[];
};

export const FESTIVALS: FestivalLanding[] = [
  {
    slug: 'ufovision-fest',
    name: 'Ufovision Fest',
    place: 'Los Escullos, Cabo de Gata (Almería)',
    hero: '/landing/festival-multitud.jpg',
    heroAlt: 'Público de festival frente a un escenario iluminado',
  },
];

export const festivalBySlug = (slug: string | undefined): FestivalLanding | undefined =>
  FESTIVALS.find((festival) => festival.slug === slug);

export const festivalPath = (festival: FestivalLanding) => `/festival/${festival.slug}/`;
