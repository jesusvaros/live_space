import { screenName } from '@jesusvaros/app-kit/analytics';

// Pure builders for event props. Props never carry personal data: no emails,
// names, coordinates, file names, URLs or free text — only enums, counts and
// sizes. docs/analitica.md lists every event.

// Routes whose second segment is an id or a slug (a concert, a venue, an
// artist, an order…): grouped so «screen» counts screens, not pages.
const ENTITY_ROUTES =
  /^\/(concierto|sala|artista|post|event|profile|pedidos|artist|venue|tabs\/artist|tabs\/venue|tabs\/festival|gestion\/festival|gestion\/evento|reclamar\/[a-z]+)\/[^/]+/;
const CITY_LISTING = /^\/([a-z-]+)\/conciertos\/.+$/;

/** A pathname as the `path` of a `screen` event: ids, slugs and handles out; ≤ 80 characters. */
export const appScreenName = (pathname: string): string => {
  const clean = (pathname || '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const grouped = clean
    .replace(ENTITY_ROUTES, (_match, prefix: string) => `/${prefix}/:id`)
    .replace(CITY_LISTING, (_match, city: string) => `/${city}/conciertos/:filtro`);
  return screenName(grouped);
};

const SAFE_TOKEN = /^[a-z][a-z0-9_]{0,39}$/;

/** `type` of a push (fcm.ts sends e.g. concert_day); anything unexpected → 'other'. */
export const notificationType = (data: Record<string, unknown> | null | undefined): string => {
  const value = data?.type;
  return typeof value === 'string' && SAFE_TOKEN.test(value) ? value : 'other';
};

/**
 * Why an upload failed, as a closed set: the MediaUploadError code
 * (file_too_large, quota_exceeded, upload_failed…), a database code, or
 * 'network' / 'unknown'. Never the message: it can carry a file name.
 */
export const uploadFailureReason = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const { name, code } = error as { name?: unknown; code?: unknown };
    if (name === 'MediaUploadError' && typeof code === 'string' && SAFE_TOKEN.test(code)) return code;
    if (typeof code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code)) return `db_${code.toLowerCase()}`;
  }
  if (error instanceof TypeError) return 'network';
  return 'unknown';
};

/** The HTTP status of an upload error, when there is one. */
export const uploadFailureStatus = (error: unknown): number | null => {
  const status = error && typeof error === 'object' ? (error as { status?: unknown }).status : null;
  return typeof status === 'number' && Number.isFinite(status) ? status : null;
};

export type SignInProvider = 'email' | 'google' | 'apple';
