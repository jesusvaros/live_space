// Where «Entradas» on a concert leads, and which seller that is.
//
// The official ticket link comes first (events.ticket_url). Without one the
// button opens the concert's own page on the venue's site (events.source_url),
// which almost always carries the venue's buy button. Every tap goes through
// here, so a referral code is added in one place once a programme is signed.

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

// Query parameters each referral programme asks for. Empty until one is
// signed; a seller listed here gets them on every tap.
export const REFERRAL_PARAMS: Partial<Record<TicketSeller, Record<string, string>>> = {};

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
  referral: Partial<Record<TicketSeller, Record<string, string>>> = REFERRAL_PARAMS,
): TicketLink | null => {
  const official = httpUrl(event.ticket_url);
  if (official) {
    const seller = sellerOf(official);
    for (const [key, value] of Object.entries(referral[seller] ?? {})) official.searchParams.set(key, value);
    return { url: official.toString(), seller, official: true };
  }
  const page = httpUrl(event.event_url);
  return page ? { url: page.toString(), seller: 'venue_page', official: false } : null;
};
