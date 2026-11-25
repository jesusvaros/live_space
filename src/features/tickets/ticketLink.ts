// Where «Entradas» on a concert leads, and which seller that is.
//
// The official ticket link comes first (events.ticket_url). Without one the
// button opens the concert's own page on the venue's site (events.source_url),
// which almost always carries the venue's buy button. Every tap goes through
// here, so a referral link is set up in one place once a programme is signed.

export type TicketSeller =
  | 'dice'
  | 'movingtickets'
  | 'onebox'
  | 'entradas_com'
  | 'entradium'
  | 'enterticket'
  | 'fever'
  | 'notikumi'
  | 'mutick'
  | 'ticketmaster'
  | 'ticketandroll'
  | 'other'
  | 'venue_page';

const SELLERS: Array<[RegExp, TicketSeller]> = [
  [/(^|\.)dice\.fm$/, 'dice'],
  [/(^|\.)movingtickets\.com$/, 'movingtickets'],
  [/(^|\.)oneboxtds\.com$/, 'onebox'],
  [/(^|\.)entradas\.com$/, 'entradas_com'],
  [/(^|\.)entradium\.com$/, 'entradium'],
  [/(^|\.)enterticket\.es$/, 'enterticket'],
  [/(^|\.)feverup\.com$/, 'fever'],
  [/(^|\.)notikumi\.com$/, 'notikumi'],
  [/(^|\.)mutick\.com$/, 'mutick'],
  [/(^|\.)ticketmaster\.es$/, 'ticketmaster'],
  [/(^|\.)ticketandroll\.com$/, 'ticketandroll'],
];

// How each referral programme wants its links. Empty until one is signed.
// `params` are added to the seller's URL; `wrap` sends the tap through the
// network's redirect, with `{url}` replaced by the encoded seller URL (Awin:
// https://www.awin1.com/cread.php?awinmid=24761&awinaffid=<ID>&ued={url};
// Impact: https://<domain>/c/<account>/<ad>/<campaign>?u={url}).
// docs/lanzamiento/8-referidos-entradas.md lists the programmes.
export type Referral = { params?: Record<string, string>; wrap?: string };
export const REFERRALS: Partial<Record<TicketSeller, Referral>> = {};

const httpUrl = (value: string | null | undefined): URL | null => {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
};

export const sellerOf = (url: URL): TicketSeller => {
  const host = url.hostname.toLowerCase();
  return SELLERS.find(([pattern]) => pattern.test(host))?.[1] ?? 'other';
};

export type TicketLink = { url: string; seller: TicketSeller; official: boolean };

export const ticketLink = (
  event: { ticket_url?: string | null; event_url?: string | null },
  referrals: Partial<Record<TicketSeller, Referral>> = REFERRALS,
): TicketLink | null => {
  const official = httpUrl(event.ticket_url);
  if (official) {
    const seller = sellerOf(official);
    const referral = referrals[seller];
    for (const [key, value] of Object.entries(referral?.params ?? {})) official.searchParams.set(key, value);
    const url = referral?.wrap ? referral.wrap.replace('{url}', encodeURIComponent(official.toString())) : official.toString();
    return { url, seller, official: true };
  }
  const page = httpUrl(event.event_url);
  return page ? { url: page.toString(), seller: 'venue_page', official: false } : null;
};
