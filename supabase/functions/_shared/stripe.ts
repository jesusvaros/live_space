import Stripe from "npm:stripe@17.7.0";
import { requiredEnv } from "./cloudinary.ts";

// Merch payments: Stripe Checkout with Connect destination charges. The seller
// (band or venue) has an Express account; Live Space keeps MERCH_FEE_BPS.

export const stripeClient = () =>
  new Stripe(requiredEnv("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });

export const stripeCrypto = Stripe.createSubtleCryptoProvider();

// Basis points: 800 = 8 %. Capped at 30 % like merch_create_order.
export const merchFeeBps = () => {
  const value = Number(Deno.env.get("MERCH_FEE_BPS") ?? "800");
  return Number.isInteger(value) && value >= 0 && value <= 3000 ? value : 800;
};

// Public site that hands Stripe's redirects back to the app (/vuelta).
export const publicSiteUrl = () =>
  (Deno.env.get("PUBLIC_SITE_URL") ?? "https://livespace.pages.dev").replace(/\/+$/, "");

export { Stripe };
