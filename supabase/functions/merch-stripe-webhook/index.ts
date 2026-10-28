import { jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/r2.ts";
import { type Stripe, stripeClient, stripeCrypto } from "../_shared/stripe.ts";

/**
 * Stripe → merch orders. Signed by Stripe (no JWT).
 *
 * - checkout.session.completed / async_payment_succeeded → paid
 * - checkout.session.expired / async_payment_failed     → cancelled, stock back
 * - charge.refunded (whole amount)                       → refunded
 * - account.updated (Connect)                            → seller can take payments
 *
 * Platform events and Connect events may come from two endpoints with their
 * own signing secrets: STRIPE_WEBHOOK_SECRET and STRIPE_CONNECT_WEBHOOK_SECRET.
 */

const secrets = () =>
  [Deno.env.get("STRIPE_WEBHOOK_SECRET"), Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET")].filter(
    (secret): secret is string => Boolean(secret),
  );

const verify = async (payload: string, signature: string): Promise<Stripe.Event | null> => {
  const stripe = stripeClient();
  for (const secret of secrets()) {
    try {
      return await stripe.webhooks.constructEventAsync(payload, signature, secret, undefined, stripeCrypto);
    } catch {
      // try the next secret
    }
  }
  return null;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, { allow: "POST" });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return jsonResponse({ error: "Missing signature" }, 400);

  const event = await verify(await request.text(), signature);
  if (!event) return jsonResponse({ error: "Invalid signature" }, 400);

  // Checkout sessions and charges are created on the platform account only.
  // The same type coming from a connected account must not touch our orders.
  if (event.account && event.type !== "account.updated") return jsonResponse({ received: true, ignored: true });

  const service = serviceClient();
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.order_id;
        if (orderId && session.payment_status === "paid") {
          const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
          const { data, error } = await service.rpc("merch_mark_paid", {
            p_order_id: orderId,
            p_session_id: session.id,
            p_payment_intent_id: paymentIntent ?? null,
          });
          if (error) throw error;
          if (data !== true) console.warn("[merch-stripe-webhook] paid session matched no pending order", session.id, orderId);
        }
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.order_id;
        if (orderId) {
          const { error } = await service.rpc("merch_release_order", { p_order_id: orderId, p_session_id: session.id });
          if (error) throw error;
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (paymentIntent && charge.refunded) {
          const { error } = await service.rpc("merch_mark_refunded", { p_payment_intent_id: paymentIntent });
          if (error) throw error;
        }
        break;
      }
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const { error } = await service
          .from("merch_sellers")
          .update({ charges_enabled: account.charges_enabled })
          .eq("stripe_account_id", account.id);
        if (error) throw error;
        break;
      }
      default:
        break;
    }
    return jsonResponse({ received: true });
  } catch (error) {
    console.error("[merch-stripe-webhook]", event.type, error);
    // 500 makes Stripe retry later.
    return jsonResponse({ error: "Processing failed" }, 500);
  }
});
