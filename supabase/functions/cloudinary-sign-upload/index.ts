import { createClient } from "npm:@supabase/supabase-js@2";
import { requiredEnv, signUploadParameters } from "../_shared/cloudinary.ts";
import { corsHeaders, jsonResponse, requireJsonPost } from "../_shared/http.ts";

type SignRequest = {
  kind?: "image" | "video";
  eventId?: string | null;
  subjectId?: string | null;
  purpose?: "user" | "professional" | "catalog";
};

type Reservation = {
  reservation_id: string;
  cloudinary_public_id: string;
  folder: string;
  upload_preset: string;
  max_bytes: number;
  max_duration_seconds: number | null;
  expires_at: string;
};

Deno.serve(async (request) => {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const methodError = requireJsonPost(request);
  if (methodError) return new Response(methodError.body, { status: methodError.status, headers: { ...cors, allow: "POST, OPTIONS", "content-type": "application/json; charset=utf-8" } });

  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "Authentication required" }, 401, cors);

    const body = (await request.json()) as SignRequest;
    if (body.kind !== "image" && body.kind !== "video") {
      return jsonResponse({ error: "kind must be image or video" }, 400, cors);
    }

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) {
      return jsonResponse({ error: "Invalid or expired session" }, 401, cors);
    }

    // The RPC uses auth.uid(), so preserve the caller JWT on this request while
    // still keeping the service key out of the browser.
    const caller = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_ANON_KEY"),
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await caller.rpc("reserve_media_upload", {
      p_kind: body.kind,
      p_event_id: body.eventId ?? null,
      p_subject_id: body.subjectId ?? null,
      p_purpose: body.purpose ?? "user",
    });
    if (error) {
      const quotaOrPolicy = ["42501", "54000", "55000"].includes(error.code ?? "");
      return jsonResponse({ error: error.message }, quotaOrPolicy ? 403 : 400, cors);
    }

    const reservation = (data as Reservation[] | null)?.[0];
    if (!reservation) throw new Error("Upload reservation was not created");

    const timestamp = Math.floor(Date.now() / 1000);
    const context = `reservation_id=${reservation.reservation_id}|owner_id=${userData.user.id}`;
    const signedParameters = {
      context,
      folder: reservation.folder,
      public_id: reservation.cloudinary_public_id,
      timestamp,
      upload_preset: reservation.upload_preset,
    };
    const signature = await signUploadParameters(
      signedParameters,
      requiredEnv("CLOUDINARY_API_SECRET"),
    );

    return jsonResponse({
      cloudName: requiredEnv("CLOUDINARY_CLOUD_NAME"),
      apiKey: requiredEnv("CLOUDINARY_API_KEY"),
      resourceType: body.kind === "video" ? "video" : "image",
      signature,
      signatureAlgorithm: "sha1",
      ...signedParameters,
      reservationId: reservation.reservation_id,
      expiresAt: reservation.expires_at,
      limits: {
        maxBytes: reservation.max_bytes,
        maxDurationSeconds: reservation.max_duration_seconds,
        maxPublicHeight: 720,
      },
    }, 200, cors);
  } catch (error) {
    console.error("cloudinary-sign-upload failed", error);
    return jsonResponse({ error: "Unable to authorize upload" }, 500, cors);
  }
});
