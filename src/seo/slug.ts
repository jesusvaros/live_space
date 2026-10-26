// Public, indexable URLs: a readable slug followed by the entity UUID, so a
// renamed entity keeps resolving and no slug column is needed.
const UUID_AT_END = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export const slugify = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');

export const idFromSlug = (slug: string | undefined): string | null => slug?.match(UUID_AT_END)?.[1] ?? null;

const withId = (label: string, id: string) => `${slugify(label) || 'live-space'}-${id}`;

export const publicPath = {
  event: (label: string, id: string) => `/concierto/${withId(label, id)}`,
  venue: (name: string, id: string) => `/sala/${withId(name, id)}`,
  artist: (name: string, id: string) => `/artista/${withId(name, id)}`,
};

export const PUBLIC_CITIES: Record<string, string> = { madrid: 'Madrid', barcelona: 'Barcelona' };
