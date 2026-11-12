// Public website base URL (landing, prerendered pages, /upload for concert
// QRs, /vuelta for Stripe). The one default for the repo; deploys override it
// with the PUBLIC_SITE_URL repo variable (VITE_PUBLIC_SITE_URL in Vite
// builds). Supabase Edge Functions keep a copy of this default because Deno
// cannot import from src/ (supabase/functions/_shared/stripe.ts).
// It is printed in concert QR codes: settle it before printing them.
export const DEFAULT_PUBLIC_SITE_URL = 'https://livespace-dusky.vercel.app';

/** The configured URL, or the default, without a trailing slash. */
export const resolvePublicSiteUrl = (configured?: string | null) =>
  (configured?.trim() || DEFAULT_PUBLIC_SITE_URL).replace(/\/+$/, '');
