import { corsHeaders, jsonResponse, requireJsonPost } from "../_shared/http.ts";
import {
  bearerToken,
  completeMultipartUpload,
  deleteObject,
  headObject,
  loadLiveReservation,
  partCount,
  publicUrl,
  readR2Config,
  serviceClient,
  VIDEO_CONTENT_TYPES,
} from "../_shared/r2.ts";

/**
 * Finishes an R2 upload authorized by media-r2-sign: completes the multipart
 * upload, checks with HEAD that the object exists with the reserved size and
 * type, then records the media asset exactly like cloudinary-webhook does
 * (status pending_review, reservation consumed). Idempotent per reservation.
 */

type CompleteRequest = {
  reservationId?: string;
  parts?: { partNumber?: number; etag?: string }[];
  durationSeconds?: number;
  width?: number | null;
  height?: number | null;
  thumbnailReservationId?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const positiveInt = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 16384 ? value : null;

/** Same poster transformation cloudinary-webhook applies to images. */
const thumbnailTransform = (secureUrl: string) =>
  secureUrl.startsWith("https://res.cloudinary.com/")
    ? secureUrl.replace("/upload/", "/upload/w_640,h_720,c_limit,q_auto,f_auto/")
    : null;

Deno.serve(async (request) => {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const methodError = requireJsonPost(request);
  if (methodError) return jsonResponse({ error: "Method not allowed" }, 405, { ...cors, allow: "POST, OPTIONS" });

  try {
    const token = bearerToken(request);
    if (!token) return jsonResponse({ error: "Authentication required" }, 401, cors);
    const body = (await request.json()) as CompleteRequest;
    if (!body.reservationId || !UUID.test(body.reservationId)) {
      return jsonResponse({ error: "reservationId is required" }, 400, cors);
    }

    const config = readR2Config();
    if (!config) return jsonResponse({ error: "R2 is not configured" }, 503, cors);
    const service = serviceClient();
    const { data: userData, error: authError } = await service.auth.getUser(token);
    if (authError || !userData.user) return jsonResponse({ error: "Invalid or expired session" }, 401, cors);
    const userId = userData.user.id;

    const { data: existingAsset, error: existingError } = await service
      .from("media_assets")
      .select("id,secure_url,thumbnail_url")
      .eq("reservation_id", body.reservationId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingAsset) {
      const { data: owner } = await service
        .from("media_upload_reservations")
        .select("user_id")
        .eq("id", body.reservationId)
        .maybeSingle();
      if (owner?.user_id !== userId) return jsonResponse({ error: "Unknown upload reservation" }, 404, cors);
      return jsonResponse({
        accepted: true,
        duplicate: true,
        reservationId: body.reservationId,
        mediaAssetId: existingAsset.id,
        secureUrl: existingAsset.secure_url,
        thumbnailUrl: existingAsset.thumbnail_url,
      }, 200, cors);
    }

    const loaded = await loadLiveReservation(service, body.reservationId, userId);
    if ("error" in loaded) return jsonResponse({ error: loaded.error }, loaded.status, cors);
    const { reservation } = loaded;
    if (reservation.consumed_at) return jsonResponse({ error: "Upload reservation already used" }, 409, cors);
    const key = reservation.storage_key!;

    const reject = async (reason: string, status = 422) => {
      await deleteObject(config, key).catch((error) => console.error("R2 delete failed", error));
      await service.from("media_upload_reservations").update({
        rejected_reason: reason,
        consumed_at: new Date().toISOString(),
      }).eq("id", reservation.id);
      return jsonResponse({ accepted: false, error: "Upload rejected by pilot limits", reason }, status, cors);
    };

    let head = await headObject(config, key);
    if (!head && reservation.r2_upload_id) {
      const expected = partCount(reservation.expected_bytes ?? 0);
      const parts = (Array.isArray(body.parts) ? body.parts : [])
        .map((part) => ({ partNumber: Number(part?.partNumber), etag: String(part?.etag ?? "") }))
        .filter((part) => Number.isSafeInteger(part.partNumber) && part.etag.length > 0 && part.etag.length <= 200)
        .sort((left, right) => left.partNumber - right.partNumber);
      const complete = parts.length === expected && parts.every((part, index) => part.partNumber === index + 1);
      if (!complete) return jsonResponse({ error: "Missing upload parts", expectedParts: expected }, 409, cors);
      if (!(await completeMultipartUpload(config, key, reservation.r2_upload_id, parts))) {
        return jsonResponse({ error: "R2 could not assemble the upload parts" }, 409, cors);
      }
      head = await headObject(config, key);
    }
    if (!head) return jsonResponse({ error: "The file has not been uploaded yet" }, 409, cors);

    const reasons: string[] = [];
    if (!Number.isFinite(head.size) || head.size > reservation.max_bytes) reasons.push("file exceeds byte limit");
    if (reservation.expected_bytes !== null && head.size !== Number(reservation.expected_bytes)) {
      reasons.push("size mismatch");
    }
    if (head.contentType !== reservation.content_type) reasons.push("content type mismatch");
    // R2 cannot probe the video, so the duration is the one the client measured
    // (on device after trimming). Moderation still reviews every asset.
    const duration = Number(body.durationSeconds);
    const maxDuration = reservation.max_duration_seconds ?? 45;
    if (!Number.isFinite(duration) || duration <= 0 || duration > maxDuration + 0.5) {
      reasons.push("video exceeds duration limit");
    }
    if (reasons.length > 0) return await reject(reasons.join(", "));

    let thumbnailUrl: string | null = null;
    if (body.thumbnailReservationId && UUID.test(body.thumbnailReservationId)) {
      const { data: thumbnail, error: thumbnailError } = await service
        .from("media_assets")
        .select("id,secure_url,attribution")
        .eq("reservation_id", body.thumbnailReservationId)
        .eq("owner_id", userId)
        .eq("kind", "image")
        .maybeSingle();
      if (thumbnailError) throw thumbnailError;
      if (thumbnail?.secure_url) {
        thumbnailUrl = thumbnailTransform(thumbnail.secure_url);
        // Mark the poster so moderation and feeds can tell it from a photo.
        await service.from("media_assets").update({
          attribution: { ...(thumbnail.attribution ?? {}), role: "video_thumbnail", video_reservation_id: reservation.id },
        }).eq("id", thumbnail.id);
      }
    }

    const now = new Date().toISOString();
    const { data: inserted, error: insertError } = await service.from("media_assets").insert({
      reservation_id: reservation.id,
      owner_id: reservation.user_id,
      kind: "video",
      event_id: reservation.event_id,
      subject_id: reservation.subject_id,
      cloudinary_public_id: reservation.cloudinary_public_id,
      resource_type: "video",
      format: VIDEO_CONTENT_TYPES[reservation.content_type ?? ""] ?? null,
      bytes: head.size,
      width: positiveInt(body.width),
      height: positiveInt(body.height),
      duration_seconds: Math.round(duration * 1000) / 1000,
      secure_url: publicUrl(config, key),
      thumbnail_url: thumbnailUrl,
      checksum: head.etag,
      status: "pending_review",
      storage_provider: "r2",
      storage_key: key,
      updated_at: now,
    }).select("id,secure_url,thumbnail_url").single();
    if (insertError) {
      // A concurrent completion of the same reservation won the insert.
      if (insertError.code === "23505") {
        const { data: raced } = await service
          .from("media_assets").select("id,secure_url,thumbnail_url").eq("reservation_id", reservation.id).maybeSingle();
        if (raced) {
          return jsonResponse({
            accepted: true,
            duplicate: true,
            reservationId: reservation.id,
            mediaAssetId: raced.id,
            secureUrl: raced.secure_url,
            thumbnailUrl: raced.thumbnail_url,
          }, 200, cors);
        }
      }
      throw insertError;
    }

    const { error: reservationError } = await service
      .from("media_upload_reservations")
      .update({ consumed_at: now, rejected_reason: null })
      .eq("id", reservation.id);
    if (reservationError) throw reservationError;

    return jsonResponse({
      accepted: true,
      reservationId: reservation.id,
      mediaAssetId: inserted.id,
      secureUrl: inserted.secure_url,
      thumbnailUrl: inserted.thumbnail_url,
    }, 200, cors);
  } catch (error) {
    console.error("media-r2-complete failed", error);
    return jsonResponse({ error: "Unable to complete upload" }, 500, cors);
  }
});
