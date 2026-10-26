import type { EventOffer } from '../types/domain.js';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const httpUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

const toPrice = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1000 ? Math.round(parsed * 100) / 100 : null;
};

const EURO_RE = /(\d{1,3}(?:[.,]\d{1,2})?)\s?€/g;
const FREE_RE = /\b(gratis|gratuito|entrada libre|free entry)\b/i;

// Tribe's `utc_end_date` is "YYYY-MM-DD HH:mm:ss" in UTC; sources reuse the
// start as end or span the whole day, so only plausible concert lengths count.
const tribeEndsAt = (payload: Record<string, unknown>, startsAt: string | null): string | undefined => {
  if (!startsAt || payload.all_day === true || typeof payload.utc_end_date !== 'string') return undefined;
  const end = new Date(`${payload.utc_end_date.replace(' ', 'T')}Z`);
  const minutes = (end.getTime() - new Date(startsAt).getTime()) / 60_000;
  return minutes >= 30 && minutes <= 12 * 60 ? end.toISOString() : undefined;
};

/**
 * Ticket link, prices and end time that parsers already capture in the raw
 * payload: tribe-events (`website`, `cost_details`, `utc_end_date`), Shopify
 * products (the product page sells the ticket), Elementor (`ticketUrl`) and
 * card text with euro amounts.
 */
export const extractOffer = (
  rawPayload: unknown,
  sourceEventUrl: string | null | undefined,
  startsAt: string | null,
): EventOffer => {
  const payload = asRecord(asRecord(rawPayload).payload);
  const isShopifyProduct = typeof payload.handle === 'string' && 'product_type' in payload;
  const ticketUrl =
    httpUrl(payload.ticketUrl) || httpUrl(payload.website) || (isShopifyProduct ? httpUrl(sourceEventUrl) : undefined);

  const prices = new Set<number>();
  const costValues = asRecord(payload.cost_details).values;
  for (const value of Array.isArray(costValues) ? costValues : []) {
    const price = toPrice(value);
    if (price) prices.add(price);
  }
  for (const value of Array.isArray(payload.prices) ? payload.prices : []) {
    const price = toPrice(value);
    if (price) prices.add(price);
  }
  const text = [payload.cost, payload.text, payload.meta].filter((item) => typeof item === 'string').join(' ');
  for (const match of text.matchAll(EURO_RE)) {
    const price = toPrice(match[1]);
    if (price) prices.add(price);
  }

  return {
    ticketUrl,
    priceTiers: [...prices].sort((a, b) => a - b).map((price) => ({ label: 'Entrada', price })),
    isFree: prices.size === 0 && FREE_RE.test(text),
    endsAt: tribeEndsAt(payload, startsAt),
  };
};
