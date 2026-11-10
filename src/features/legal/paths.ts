// Legal document routes, without the texts (so a link does not pull them
// into the bundle of the screen that shows it).

export const LEGAL_SLUGS = ['privacidad', 'condiciones', 'borrar-cuenta', 'licencia-momentos'] as const;

export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export const isLegalSlug = (value: string | undefined): value is LegalSlug =>
  (LEGAL_SLUGS as readonly string[]).includes(value ?? '');

/** App route of a document; the public web serves the same text at /<slug>/. */
export const legalAppPath = (slug: LegalSlug) => `/legal/${slug}`;
