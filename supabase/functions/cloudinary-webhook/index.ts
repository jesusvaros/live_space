import { createClient } from "npm:@supabase/supabase-js@2";
import { requiredEnv, verifyWebhookSignature } from "../_shared/cloudinary.ts";
import { jsonResponse, requireJsonPost } from "../_shared/http.ts";

type CloudinaryWebhook = {
  notification_type?: string;
  public_id?: string;
  version?: number;
  resource_type?: "image" | "video";
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  duration?: number;
  secure_url?: string;
  etag?: string;
  context?: {
    custom?: Record<string, string>;
    [key: string]: unknown;
  } | string;
};

type Reservation = {
  id: string;
  user_id: string;
  kind: "image" | "video";
  event_id: string | null;
  subject_id: string | null;
  cloudinary_public_id: string;
  max_bytes: number;
  max_duration_seconds: number | null;
  consumed_at: string | null;
};

const reservationIdFrom = (context: CloudinaryWebhook["context"]): string | null => {
  if (!context) return null;
  if (typeof context === "string") {
    const entry = context.split("|").find((part) => part.startsWith("reservation_id="));
    return entry?.slice("reservation_id=".length) ?? null;
  }
  return context.custom?.reservation_id ??
    (typeof context.reservation_id === "string" ? context.reservation_id : null);
};

const thumbnailFor = (payload: CloudinaryWebhook): string | null => {
  if (!payload.secure_url) return null;
  const transformation = payload.resource_type === "video"
    ? "so_0,w_640,h_720,c_limit,q_auto,f_jpg"
    : "w_640,h_720,c_limit,q_auto,f_auto";
  return payload.secure_url.replace("/upload/", `/upload/${transformation}/`);
};

Deno.serve(async (request) => {
  const methodError = requireJsonPost(request);
  if (methodError) return methodError;

  try {
    const timestamp = request.headers.get("x-cld-timestamp");
    const signature = request.headers.get("x-cld-signature")?.toLowerCase();
    if (!timestamp || !signature || !/^\d+$/.test(timestamp)) {
      return jsonResponse({ error: "Missing Cloudinary signature" }, 401);
    }
    const timestampSeconds = Number(timestamp);
    if (Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) {
      return jsonResponse({ error: "Stale webhook" }, 401);
    }

    const rawBody = await request.text();
    const valid = await verifyWebhookSignature(
      rawBody,
      timestamp,
      signature,
      requiredEnv("CLOUDINARY_API_SECRET"),
    );
    if (!valid) return jsonResponse({ error: "Invalid Cloudinary signature" }, 401);

    const payload = JSON.parse(rawBody) as CloudinaryWebhook;
    if (payload.notification_type && payload.notification_type !== "upload") {
      return jsonResponse({ accepted: true, ignored: payload.notification_type }, 202);
    }
    const reservationId = reservationIdFrom(payload.context);
    if (!reservationId || !payload.public_id || !payload.resource_type) {
      return jsonResponse({ error: "Webhook is missing reservation metadata" }, 400);
    }

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabase
      .from("media_upload_reservations")
      .select("id,user_id,kind,event_id,subject_id,cloudinary_public_id,max_bytes,max_duration_seconds,consumed_at")
      .eq("id", reservationId)
      .maybeSingle();
    if (error) throw error;
    const reservation = data as Reservation | null;
    if (!reservation) return jsonResponse({ error: "Unknown upload reservation" }, 404);

    const { data: existingAsset, error: existingAssetError } = await supabase
      .from("media_assets")
      .select("id")
      .eq("reservation_id", reservation.id)
      .maybeSingle();
    if (existingAssetError) throw existingAssetError;
    if (existingAsset) {
      return jsonResponse({ accepted: true, reservationId: reservation.id, duplicate: true });
    }

    const rejectionReasons: string[] = [];
    if (reservation.cloudinary_public_id !== payload.public_id) rejectionReasons.push("public_id mismatch");
    if (reservation.kind !== payload.resource_type) rejectionReasons.push("resource type mismatch");
    if (!Number.isFinite(payload.bytes) || (payload.bytes ?? 0) > reservation.max_bytes) rejectionReasons.push("file exceeds byte limit");
    if (reservation.kind === "video" && (
      !Number.isFinite(payload.duration) ||
      (payload.duration ?? 0) > (reservation.max_duration_seconds ?? 45)
    )) rejectionReasons.push("video exceeds duration limit");

    if (rejectionReasons.length > 0) {
      await supabase.from("media_upload_reservations").update({
        rejected_reason: rejectionReasons.join(", "),
        consumed_at: new Date().toISOString(),
      }).eq("id", reservation.id);
      return jsonResponse({ accepted: false, error: "Upload rejected by pilot limits" }, 422);
    }

    const now = new Date().toISOString();
    const { error: assetError } = await supabase.from("media_assets").insert({
      reservation_id: reservation.id,
      owner_id: reservation.user_id,
      kind: reservation.kind,
      event_id: reservation.event_id,
      subject_id: reservation.subject_id,
      cloudinary_public_id: payload.public_id,
      cloudinary_version: payload.version ?? null,
      resource_type: payload.resource_type,
      format: payload.format ?? null,
      bytes: payload.bytes ?? null,
      width: payload.width ?? null,
      height: payload.height ?? null,
      duration_seconds: payload.duration ?? null,
      secure_url: payload.secure_url ?? null,
      thumbnail_url: thumbnailFor(payload),
      checksum: payload.etag ?? null,
      status: "pending_review",
      updated_at: now,
    });
    if (assetError) throw assetError;

    const { error: reservationError } = await supabase
      .from("media_upload_reservations")
      .update({ consumed_at: reservation.consumed_at ?? now, rejected_reason: null })
      .eq("id", reservation.id);
    if (reservationError) throw reservationError;

    return jsonResponse({ accepted: true, reservationId: reservation.id });
  } catch (error) {
    console.error("cloudinary-webhook failed", error);
    return jsonResponse({ error: "Unable to process webhook" }, 500);
  }
});
