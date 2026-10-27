import { corsHeaders, jsonResponse, requireJsonPost } from "../_shared/http.ts";
import {
  abortMultipartUpload,
  bearerToken,
  buildUploadPlan,
  callerClient,
  createMultipartUpload,
  deleteObject,
  loadLiveReservation,
  MULTIPART_THRESHOLD_BYTES,
  objectKeyFor,
  type R2Reservation,
  readR2Config,
  RESERVATION_COLUMNS,
  resolveVideoProvider,
  serviceClient,
  stagingKeyFor,
  VIDEO_CONTENT_TYPES,
} from "../_shared/r2.ts";

/**
 * Authorizes a fan video upload to Cloudflare R2.
 *
 * - start:  same reservation, terms, pause and quota checks as
 *           cloudinary-sign-upload (reserve_media_upload RPC), then a presigned
 *           PUT, or presigned multipart part URLs for files over 10 MB.
 *           Answers { provider: "cloudinary" } without reserving anything when
 *           videos are not on R2, so the client falls back to Cloudinary.
 * - resume: fresh URLs for an unfinished upload (after a restart or when the
 *           one-hour URLs expired).
 * - abort:  cancels an upload and frees its quota slot.
 *
 * media-r2-complete verifies the object and creates the media asset.
 */

type SignRequest = {
  action?: "start" | "resume" | "abort";
  kind?: "image" | "video";
  eventId?: string | null;
  subjectId?: string | null;
  purpose?: "user" | "professional" | "catalog";
  contentType?: string;
  sizeBytes?: number;
  durationSeconds?: number | null;
  reservationId?: string;
};

type ReservationRow = {
  reservation_id: string;
  cloudinary_public_id: string;
  max_bytes: number;
  max_duration_seconds: number | null;
  expires_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const methodError = requireJsonPost(request);
  if (methodError) return jsonResponse({ error: "Method not allowed" }, 405, { ...cors, allow: "POST, OPTIONS" });

  try {
    const token = bearerToken(request);
    if (!token) return jsonResponse({ error: "Authentication required" }, 401, cors);
    const body = (await request.json()) as SignRequest;

    const service = serviceClient();
    const { data: userData, error: authError } = await service.auth.getUser(token);
    if (authError || !userData.user) return jsonResponse({ error: "Invalid or expired session" }, 401, cors);
    const userId = userData.user.id;

    const action = body.action ?? "start";
    if (action === "start") {
      if (body.kind !== "video") return jsonResponse({ error: "Only videos are stored on R2" }, 400, cors);
      if ((await resolveVideoProvider(service)) !== "r2") {
        return jsonResponse({ provider: "cloudinary" }, 200, cors);
      }
      const config = readR2Config()!;

      const contentType = String(body.contentType ?? "").toLowerCase();
      if (!VIDEO_CONTENT_TYPES[contentType]) {
        return jsonResponse({ error: "Unsupported video type" }, 415, cors);
      }
      const sizeBytes = Number(body.sizeBytes);
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
        return jsonResponse({ error: "sizeBytes must be a positive integer" }, 400, cors);
      }
      const declaredDuration = body.durationSeconds == null ? null : Number(body.durationSeconds);
      if (declaredDuration !== null && (!Number.isFinite(declaredDuration) || declaredDuration < 0)) {
        return jsonResponse({ error: "durationSeconds is invalid" }, 400, cors);
      }

      const { data, error } = await callerClient(token).rpc("reserve_media_upload", {
        p_kind: "video",
        p_event_id: body.eventId ?? null,
        p_subject_id: body.subjectId ?? null,
        p_purpose: body.purpose ?? "user",
      });
      if (error) {
        const quotaOrPolicy = ["42501", "54000", "55000"].includes(error.code ?? "");
        return jsonResponse({ error: error.message, code: error.code ?? null }, quotaOrPolicy ? 403 : 400, cors);
      }
      const reservation = (data as ReservationRow[] | null)?.[0];
      if (!reservation) throw new Error("Upload reservation was not created");

      const rejectReservation = async (reason: string) => {
        await service.from("media_upload_reservations").update({
          rejected_reason: reason,
          consumed_at: new Date().toISOString(),
        }).eq("id", reservation.reservation_id);
      };
      if (sizeBytes > reservation.max_bytes) {
        await rejectReservation("file exceeds byte limit");
        return jsonResponse({ error: "File exceeds the upload limit", maxBytes: reservation.max_bytes }, 413, cors);
      }
      const maxDuration = reservation.max_duration_seconds ?? 45;
      if (declaredDuration !== null && declaredDuration > maxDuration + 0.5) {
        await rejectReservation("video exceeds duration limit");
        return jsonResponse({ error: "Video exceeds the duration limit", maxDurationSeconds: maxDuration }, 422, cors);
      }

      const key = objectKeyFor(reservation.cloudinary_public_id, contentType);
      const uploadId = sizeBytes > MULTIPART_THRESHOLD_BYTES
        ? await createMultipartUpload(config, stagingKeyFor(key), contentType)
        : null;
      const { error: updateError } = await service.from("media_upload_reservations").update({
        storage_provider: "r2",
        storage_key: key,
        content_type: contentType,
        expected_bytes: sizeBytes,
        r2_upload_id: uploadId,
      }).eq("id", reservation.reservation_id);
      if (updateError) throw updateError;

      const upload = await buildUploadPlan(config, {
        storage_key: key,
        content_type: contentType,
        expected_bytes: sizeBytes,
        r2_upload_id: uploadId,
      });
      return jsonResponse({
        provider: "r2",
        reservationId: reservation.reservation_id,
        key,
        expiresAt: reservation.expires_at,
        limits: { maxBytes: reservation.max_bytes, maxDurationSeconds: maxDuration },
        upload,
      }, 200, cors);
    }

    if (!body.reservationId || !UUID.test(body.reservationId)) {
      return jsonResponse({ error: "reservationId is required" }, 400, cors);
    }
    const config = readR2Config();
    if (!config) return jsonResponse({ error: "R2 is not configured" }, 503, cors);

    if (action === "resume") {
      const loaded = await loadLiveReservation(service, body.reservationId, userId);
      if ("error" in loaded) return jsonResponse({ error: loaded.error }, loaded.status, cors);
      const { reservation } = loaded;
      if (reservation.consumed_at) {
        return jsonResponse({ error: "Upload already completed", completed: true }, 409, cors);
      }
      return jsonResponse({
        provider: "r2",
        reservationId: reservation.id,
        key: reservation.storage_key,
        expiresAt: reservation.expires_at,
        limits: { maxBytes: reservation.max_bytes, maxDurationSeconds: reservation.max_duration_seconds ?? 45 },
        upload: await buildUploadPlan(config, reservation),
      }, 200, cors);
    }

    if (action === "abort") {
      const { data, error } = await service
        .from("media_upload_reservations")
        .select(RESERVATION_COLUMNS)
        .eq("id", body.reservationId)
        .maybeSingle();
      if (error) throw error;
      const reservation = data as R2Reservation | null;
      if (!reservation || reservation.user_id !== userId || reservation.storage_provider !== "r2") {
        return jsonResponse({ error: "Unknown upload reservation" }, 404, cors);
      }
      // Claim the reservation first: once media-r2-complete has claimed it
      // (consumed_at set) the upload can no longer be cancelled, and the other
      // way round complete refuses a rejected reservation.
      const { data: claimed, error: claimError } = await service.from("media_upload_reservations").update({
        rejected_reason: "cancelled by client",
        consumed_at: new Date().toISOString(),
      }).eq("id", reservation.id).is("consumed_at", null).select("id");
      if (claimError) throw claimError;
      if (!claimed || claimed.length === 0) {
        return jsonResponse({ aborted: false, completed: !reservation.rejected_reason }, 200, cors);
      }
      if (reservation.storage_key) {
        const staging = stagingKeyFor(reservation.storage_key);
        if (reservation.r2_upload_id) await abortMultipartUpload(config, staging, reservation.r2_upload_id);
        await deleteObject(config, staging);
      }
      return jsonResponse({ aborted: true }, 200, cors);
    }

    return jsonResponse({ error: "Unknown action" }, 400, cors);
  } catch (error) {
    console.error("media-r2-sign failed", error);
    return jsonResponse({ error: "Unable to authorize upload" }, 500, cors);
  }
});
