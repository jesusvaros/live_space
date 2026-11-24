// Fan subscription «Live Space+» (2,99 €/mes). Prepared, switched OFF.
//
// What it is for: watching the «Concierto completo» (every fan clip of a
// concert, in order) of artists who authorised it when claiming their
// profile. Artists and venues never pay to manage their profile: the venue
// Pro plan was dropped on 24 Nov 2026.
//
// Sold ONLY as an in-app subscription (Google Play Billing / App Store)
// through RevenueCat, entitlement «fan_plus». No web checkout. The RevenueCat
// SDK is not installed yet; while FAN_PLUS_ENABLED is false no screen shows a
// price, a lock or a purchase button. Switch it on at ~1.000 active users.

export const FAN_PLUS_ENABLED = false;
export const FAN_PLUS_ENTITLEMENT = 'fan_plus';
export const FAN_PLUS_PRICE = '2,99 €/mes';

export type FanPlusBenefit = 'full_concert';

/** What the subscription unlocks (only for artists who authorised it). */
export const FAN_PLUS_BENEFITS: FanPlusBenefit[] = ['full_concert'];

export type PurchaseResult = { kind: 'purchased' } | { kind: 'cancelled' } | { kind: 'unavailable' };

export type PurchasesProvider = {
  /** Whether store purchases can be offered on this build. */
  available: () => boolean;
  /** Whether the signed-in fan has «fan_plus» now. */
  hasFanPlus: () => Promise<boolean>;
  purchase: () => Promise<PurchaseResult>;
  restore: () => Promise<boolean>;
};

const provider: PurchasesProvider = {
  available: () => false,
  hasFanPlus: async () => false,
  purchase: async () => ({ kind: 'unavailable' }),
  restore: async () => false,
};

export const purchases: PurchasesProvider = {
  ...provider,
  available: () => FAN_PLUS_ENABLED && provider.available(),
};

/** Whether a fan can watch an artist's full concert: the artist authorised it and the fan has Live Space+. */
export const canWatchFullConcert = (artistAuthorised: boolean, fanHasPlus: boolean) =>
  FAN_PLUS_ENABLED && artistAuthorised && fanHasPlus;
