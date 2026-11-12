// Who answers for the data and where to write. Set at build time (repo
// variables read by publish-web.yml for the web; .env for the app). Until
// the owner fills them, the legal texts show the bracketed placeholders.

import { resolvePublicSiteUrl } from '../../shared/siteUrl';

const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;

export const CONTACT_EMAIL_PLACEHOLDER = '[EMAIL DE CONTACTO]';
export const OWNER_PLACEHOLDER = '[TITULAR]';

export const LEGAL_CONTACT_EMAIL = env.VITE_CONTACT_EMAIL?.trim() || '';
export const LEGAL_OWNER = env.VITE_LEGAL_OWNER?.trim() || '';

// Public pages on the web (they also work without the app).
export const PUBLIC_SITE_URL = resolvePublicSiteUrl(env.VITE_PUBLIC_SITE_URL);
