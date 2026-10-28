import { corsHeaders, jsonResponse, requireJsonPost } from "../_shared/http.ts";
import { bearerToken, serviceClient } from "../_shared/r2.ts";
import { merchFeeBps, publicSiteUrl, stripeClient } from "../_shared/stripe.ts";

/**
 * Starts a merch purchase: merch_create_order reserves the stock and fixes the
 * prices, then a Stripe Checkout session charges the buyer on behalf of the
 * seller (destination charge, Live Space keeps the fee). The session expires
 * in 30 minutes; merch-stripe-webhook gives the stock back when it does.
 */

type CheckoutRequest = {
  eventId?: string;
  sellerSubjectId?: string;
  lines?: Array<{ variantId?: string; quantity?: number }>;
};

type CreatedOrder = {
  order_id: string;
  total_cents: number;
  fee_cents: number;
  lines: Array<{ item_name: string; variant_label: string; quantity: number; unit_price_cents: number }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// merch_create_order raises "merch:<reason>"; these are safe to show.
const REASONS: Record<string, string> = {
  closed: "Las reservas de este concierto ya están cerradas.",
  event: "Este concierto no admite reservas.",
  not_selling: "Este merch no está a la venta en este concierto.",
  seller: "El vendedor aún no puede cobrar pagos.",
  stock: "No quedan unidades suficientes.",
  variant: "Uno de los productos ya no está disponible.",
  quantity: "Cantidad no válida.",
  lines: "Pedido no válido.",
  too_many_pending: "Tienes pedidos sin pagar. Termínalos o espera 30 minutos.",
};

Deno.serve(async (request) => {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (requireJsonPost(request)) return jsonResponse({ error: "Method not allowed" }, 405, { ...cors, allow: "POST, OPTIONS" });

  const service = serviceClient();
  let orderId: string | null = null;
  try {
    const token = bearerToken(request);
    if (!token) return jsonResponse({ error: "Authentication required" }, 401, cors);
    const { data: userData, error: authError } = await service.auth.getUser(token);
    if (authError || !userData.user) return jsonResponse({ error: "Invalid or expired session" }, 401, cors);
    const user = userData.user;

    const body = (await request.json()) as CheckoutRequest;
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (
      !UUID.test(body.eventId ?? "") ||
      !UUID.test(body.sellerSubjectId ?? "") ||
      lines.length === 0 ||
      lines.length > 10 ||
      lines.some((line) => !UUID.test(line.variantId ?? "") || !Number.isInteger(line.quantity))
    ) {
      return jsonResponse({ error: "Pedido no válido." }, 400, cors);
    }

    const { data, error } = await service.rpc("merch_create_order", {
      p_buyer_id: user.id,
      p_event_id: body.eventId,
      p_seller_subject_id: body.sellerSubjectId,
      p_lines: lines.map((line) => ({ variant_id: line.variantId, quantity: line.quantity })),
      p_fee_bps: merchFeeBps(),
    });
    if (error) {
      const reason = /merch:([a-z_]+)/.exec(error.message ?? "")?.[1];
      if (reason && REASONS[reason]) return jsonResponse({ error: REASONS[reason] }, 409, cors);
      throw error;
    }
    const order = data as CreatedOrder;
    orderId = order.order_id;

    const { data: seller } = await service
      .from("merch_sellers")
      .select("stripe_account_id")
      .eq("subject_id", body.sellerSubjectId)
      .single();

    const site = publicSiteUrl();
    const session = await stripeClient().checkout.sessions.create(
      {
        mode: "payment",
        locale: "es",
        customer_email: user.email ?? undefined,
        client_reference_id: order.order_id,
        metadata: { order_id: order.order_id },
        // Stripe's minimum is 30 minutes; one more absorbs clock skew.
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        line_items: order.lines.map((line) => ({
          quantity: line.quantity,
          price_data: {
            currency: "eur",
            unit_amount: line.unit_price_cents,
            product_data: { name: `${line.item_name} · ${line.variant_label}` },
          },
        })),
        payment_intent_data: {
          application_fee_amount: order.fee_cents,
          transfer_data: { destination: seller!.stripe_account_id },
          metadata: { order_id: order.order_id },
        },
        success_url: `${site}/vuelta/?pedido=${order.order_id}`,
        cancel_url: `${site}/vuelta/?pedido=${order.order_id}`,
      },
      { idempotencyKey: `merch-order-${order.order_id}` },
    );

    // Without the session on the order the webhook could not mark it paid:
    // never hand out a payment link it would not recognise.
    const { data: attached, error: attachError } = await service.rpc("merch_attach_session", {
      p_order_id: order.order_id,
      p_session_id: session.id,
    });
    if (attachError || attached !== true) {
      await stripeClient().checkout.sessions.expire(session.id).catch(() => undefined);
      throw attachError ?? new Error("Order could not take the session");
    }
    orderId = null;
    return jsonResponse({ orderId: order.order_id, url: session.url }, 200, cors);
  } catch (error) {
    console.error("[merch-checkout]", error);
    // No session: give the stock back now instead of waiting for an expiry that never comes.
    if (orderId) {
      // Attached or not, an unpaid order gives its stock back; the expired
      // session's webhook then finds nothing to do.
      const { data: released } = await service.rpc("merch_release_order", { p_order_id: orderId, p_session_id: null });
      if (released !== true) {
        const { data: row } = await service.from("merch_orders").select("stripe_session_id").eq("id", orderId).maybeSingle();
        if (row?.stripe_session_id) {
          await service.rpc("merch_release_order", { p_order_id: orderId, p_session_id: row.stripe_session_id });
        }
      }
    }
    return jsonResponse({ error: "No se ha podido iniciar el pago." }, 500, cors);
  }
});
