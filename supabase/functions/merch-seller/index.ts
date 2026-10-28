import { corsHeaders, jsonResponse, requireJsonPost } from "../_shared/http.ts";
import { bearerToken, callerClient, serviceClient } from "../_shared/r2.ts";
import { publicSiteUrl, stripeClient } from "../_shared/stripe.ts";

/**
 * Payouts for merch sellers (a band or a venue).
 *
 * - onboard: creates the seller's Stripe Express account the first time and
 *            returns a Stripe onboarding link.
 * - status:  refreshes whether the account can take payments.
 *
 * Only owners and admins of the profile (can_admin_subject) may set up where
 * the money goes; editors manage the catalogue but not the payouts.
 */

type SellerRequest = { action?: "onboard" | "status"; subjectId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (requireJsonPost(request)) return jsonResponse({ error: "Method not allowed" }, 405, { ...cors, allow: "POST, OPTIONS" });

  try {
    const token = bearerToken(request);
    if (!token) return jsonResponse({ error: "Authentication required" }, 401, cors);
    const body = (await request.json()) as SellerRequest;
    const subjectId = body.subjectId ?? "";
    if (!UUID.test(subjectId)) return jsonResponse({ error: "subjectId required" }, 400, cors);

    const caller = callerClient(token);
    const { data: allowed, error: allowedError } = await caller.rpc("can_admin_subject", { p_subject_id: subjectId });
    if (allowedError || allowed !== true) return jsonResponse({ error: "Not allowed" }, 403, cors);

    const service = serviceClient();
    const { data: subject } = await service
      .from("subjects")
      .select("id,type,artist:artists(status),venue:venue_places(status)")
      .eq("id", subjectId)
      .maybeSingle();
    if (!subject || !["artist", "venue"].includes(subject.type)) {
      return jsonResponse({ error: "Only artists and venues sell merch" }, 400, cors);
    }
    // Only published profiles sell: a draft artist made up for the occasion cannot take payments.
    const profileStatus = (subject as any).artist?.status ?? (subject as any).venue?.status;
    if (profileStatus !== "published") {
      return jsonResponse({ error: "El perfil tiene que estar publicado para vender merch." }, 409, cors);
    }

    const stripe = stripeClient();
    const { data: seller } = await service
      .from("merch_sellers")
      .select("stripe_account_id,charges_enabled")
      .eq("subject_id", subjectId)
      .maybeSingle();

    if ((body.action ?? "status") === "status") {
      if (!seller?.stripe_account_id) return jsonResponse({ started: false, chargesEnabled: false }, 200, cors);
      const account = await stripe.accounts.retrieve(seller.stripe_account_id);
      await service
        .from("merch_sellers")
        .update({ charges_enabled: account.charges_enabled })
        .eq("subject_id", subjectId);
      return jsonResponse(
        { started: true, chargesEnabled: account.charges_enabled, detailsSubmitted: account.details_submitted },
        200,
        cors,
      );
    }

    let accountId = seller?.stripe_account_id ?? null;
    if (!accountId) {
      const account = await stripe.accounts.create(
        {
          type: "express",
          country: "ES",
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          business_profile: { product_description: "Merch vendido en conciertos a través de Live Space" },
          metadata: { subject_id: subjectId },
        },
        { idempotencyKey: `merch-seller-${subjectId}` },
      );
      accountId = account.id;
      const { error } = await service
        .from("merch_sellers")
        .upsert({ subject_id: subjectId, stripe_account_id: accountId, charges_enabled: account.charges_enabled });
      if (error) throw error;
    }

    const site = publicSiteUrl();
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${site}/vuelta/?cobros=1`,
      return_url: `${site}/vuelta/?cobros=1`,
    });
    return jsonResponse({ url: link.url }, 200, cors);
  } catch (error) {
    console.error("[merch-seller]", error);
    return jsonResponse({ error: "Could not set up payouts" }, 500, cors);
  }
});
