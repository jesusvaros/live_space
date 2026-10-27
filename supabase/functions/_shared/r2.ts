import { AwsClient, AwsV4Signer } from "npm:aws4fetch@1.0.20";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requiredEnv } from "./cloudinary.ts";

/** Files above this size go up as S3 multipart parts (R2 needs >= 5 MiB parts). */
export const MULTIPART_THRESHOLD_BYTES = 10 * 1024 * 1024;
export const MULTIPART_PART_BYTES = 8 * 1024 * 1024;
export const PRESIGN_TTL_SECONDS = 60 * 60;
/**
 * Uploads land under this prefix, which the public domain must not serve (only
 * v/ is public; see the runbook). media-r2-complete copies a verified object to
 * its v/ key and deletes the staging copy; a lifecycle rule removes leftovers.
 */
export const STAGING_PREFIX = "incoming/";
/** A started upload can be resumed (re-signed) for this long after reserving. */
export const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

export const VIDEO_CONTENT_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  /** "eu" or "fedramp" when the bucket was created with a jurisdiction. */
  jurisdiction: string | null;
};

export type R2Reservation = {
  id: string;
  user_id: string;
  kind: "image" | "video";
  event_id: string | null;
  subject_id: string | null;
  cloudinary_public_id: string;
  max_bytes: number;
  max_duration_seconds: number | null;
  expires_at: string;
  consumed_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  storage_provider: "cloudinary" | "r2";
  storage_key: string | null;
  content_type: string | null;
  expected_bytes: number | null;
  r2_upload_id: string | null;
};

export const RESERVATION_COLUMNS =
  "id,user_id,kind,event_id,subject_id,cloudinary_public_id,max_bytes,max_duration_seconds,expires_at,consumed_at,rejected_reason,created_at,storage_provider,storage_key,content_type,expected_bytes,r2_upload_id";

/** R2 settings, or null when any secret is missing (then videos stay on Cloudinary). */
export const readR2Config = (): R2Config | null => {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET");
  const publicBaseUrl = Deno.env.get("R2_PUBLIC_BASE_URL");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) return null;
  if (!publicBaseUrl.startsWith("https://")) return null;
  const jurisdiction = Deno.env.get("R2_JURISDICTION")?.trim().toLowerCase() || null;
  if (jurisdiction && !/^[a-z]+$/.test(jurisdiction)) return null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
    jurisdiction,
  };
};

export const serviceClient = (): SupabaseClient =>
  createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const callerClient = (token: string): SupabaseClient =>
  createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

/**
 * Which storage new videos use. VIDEO_PROVIDER (env) wins over
 * platform_settings.video_provider; r2 only applies when its secrets exist.
 */
export const resolveVideoProvider = async (service: SupabaseClient): Promise<"cloudinary" | "r2"> => {
  if (!readR2Config()) return "cloudinary";
  const fromEnv = Deno.env.get("VIDEO_PROVIDER")?.trim().toLowerCase();
  if (fromEnv === "r2" || fromEnv === "cloudinary") return fromEnv;
  const { data, error } = await service
    .from("platform_settings")
    .select("video_provider")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw error;
  return data?.video_provider === "r2" ? "r2" : "cloudinary";
};

const objectUrl = (config: R2Config, key: string, query: Record<string, string> = {}) => {
  const url = new URL(
    `https://${config.accountId}.${config.jurisdiction ? `${config.jurisdiction}.` : ""}r2.cloudflarestorage.com/${
      encodeURIComponent(config.bucket)
    }/${key}`,
  );
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  return url;
};

const client = (config: R2Config) =>
  new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
    retries: 2,
  });

/**
 * Presigned PUT. Content-Type and Content-Length are part of the signature, so
 * R2 refuses a body of another size or type than the one reserved.
 */
const presignPut = async (
  config: R2Config,
  key: string,
  query: Record<string, string>,
  headers: Record<string, string>,
) => {
  const url = objectUrl(config, key, query);
  url.searchParams.set("X-Amz-Expires", String(PRESIGN_TTL_SECONDS));
  const signer = new AwsV4Signer({
    method: "PUT",
    url: url.toString(),
    headers,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
    signQuery: true,
    allHeaders: true,
  });
  const signed = await signer.sign();
  return signed.url.toString();
};

export type UploadPlan =
  | { type: "single"; url: string; headers: Record<string, string> }
  | {
    type: "multipart";
    partSize: number;
    parts: { partNumber: number; url: string; size: number; headers: Record<string, string> }[];
  };

export const partCount = (totalBytes: number) => Math.ceil(totalBytes / MULTIPART_PART_BYTES);

export const buildUploadPlan = async (
  config: R2Config,
  reservation: Pick<R2Reservation, "storage_key" | "content_type" | "expected_bytes" | "r2_upload_id">,
): Promise<UploadPlan> => {
  const key = stagingKeyFor(reservation.storage_key!);
  const contentType = reservation.content_type!;
  const totalBytes = reservation.expected_bytes!;
  if (!reservation.r2_upload_id) {
    const headers = { "content-type": contentType, "content-length": String(totalBytes) };
    return { type: "single", url: await presignPut(config, key, {}, headers), headers: { "content-type": contentType } };
  }

  const parts = [];
  for (let partNumber = 1; partNumber <= partCount(totalBytes); partNumber += 1) {
    const size = Math.min(MULTIPART_PART_BYTES, totalBytes - (partNumber - 1) * MULTIPART_PART_BYTES);
    const url = await presignPut(
      config,
      key,
      { partNumber: String(partNumber), uploadId: reservation.r2_upload_id },
      { "content-length": String(size) },
    );
    parts.push({ partNumber, url, size, headers: {} });
  }
  return { type: "multipart", partSize: MULTIPART_PART_BYTES, parts };
};

const xmlValue = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1] : null;
};

const xmlEscape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const createMultipartUpload = async (config: R2Config, key: string, contentType: string) => {
  const response = await client(config).fetch(objectUrl(config, key, { uploads: "" }).toString(), {
    method: "POST",
    headers: { "content-type": contentType },
  });
  const body = await response.text();
  const uploadId = response.ok ? xmlValue(body, "UploadId") : null;
  if (!uploadId) throw new Error(`R2 CreateMultipartUpload failed with ${response.status}`);
  return uploadId;
};

export const completeMultipartUpload = async (
  config: R2Config,
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
) => {
  const body = `<CompleteMultipartUpload>${
    parts
      .map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${xmlEscape(part.etag)}</ETag></Part>`)
      .join("")
  }</CompleteMultipartUpload>`;
  const response = await client(config).fetch(objectUrl(config, key, { uploadId }).toString(), {
    method: "POST",
    headers: { "content-type": "application/xml" },
    body,
  });
  const text = await response.text();
  // S3 can answer 200 with an <Error> body for CompleteMultipartUpload.
  return response.ok && !text.includes("<Error>");
};

export const abortMultipartUpload = async (config: R2Config, key: string, uploadId: string) => {
  const response = await client(config).fetch(objectUrl(config, key, { uploadId }).toString(), {
    method: "DELETE",
  });
  await response.body?.cancel();
};

export const headObject = async (config: R2Config, key: string) => {
  const response = await client(config).fetch(objectUrl(config, key).toString(), { method: "HEAD" });
  await response.body?.cancel();
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`R2 HEAD failed with ${response.status}`);
  return {
    size: Number(response.headers.get("content-length") ?? "NaN"),
    contentType: (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(),
    etag: response.headers.get("etag"),
  };
};

export const deleteObject = async (config: R2Config, key: string) => {
  const response = await client(config).fetch(objectUrl(config, key).toString(), { method: "DELETE" });
  await response.body?.cancel();
};

export const publicUrl = (config: R2Config, key: string) => `${config.publicBaseUrl}/${key}`;

/** v/2026/10/<uuid>.mp4 → incoming/2026/10/<uuid>.mp4 */
export const stagingKeyFor = (publicKey: string) => publicKey.replace(/^v\//, STAGING_PREFIX);

/** Server-side copy inside the bucket (keeps Content-Type). Returns false on failure. */
export const copyObject = async (config: R2Config, fromKey: string, toKey: string) => {
  const response = await client(config).fetch(objectUrl(config, toKey).toString(), {
    method: "PUT",
    headers: { "x-amz-copy-source": `/${encodeURIComponent(config.bucket)}/${fromKey}` },
  });
  const text = await response.text();
  return response.ok && !text.includes("<Error>");
};

export const objectKeyFor = (publicId: string, contentType: string, now = new Date()) => {
  const extension = VIDEO_CONTENT_TYPES[contentType];
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `v/${year}/${month}/${publicId}.${extension}`;
};

/**
 * Loads an R2 reservation for its owner and keeps it alive: an expired one is
 * extended by ten minutes only if the quota still has room (revive_r2_reservation). Returns an error
 * message instead when it cannot be used any more.
 */
export const loadLiveReservation = async (
  service: SupabaseClient,
  reservationId: string,
  userId: string,
): Promise<{ reservation: R2Reservation } | { error: string; status: number }> => {
  const { data, error } = await service
    .from("media_upload_reservations")
    .select(RESERVATION_COLUMNS)
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw error;
  const reservation = data as R2Reservation | null;
  if (!reservation || reservation.user_id !== userId) return { error: "Unknown upload reservation", status: 404 };
  if (reservation.storage_provider !== "r2" || !reservation.storage_key) {
    return { error: "Reservation is not an R2 upload", status: 409 };
  }
  if (reservation.rejected_reason) return { error: "Upload was rejected", status: 409 };
  if (Date.now() - Date.parse(reservation.created_at) > RESUME_WINDOW_MS) {
    return { error: "Upload reservation is too old", status: 410 };
  }

  if (!reservation.consumed_at && Date.parse(reservation.expires_at) <= Date.now()) {
    // Locked SQL (same advisory lock as reserve_media_upload): concurrent
    // revivals cannot all slip under the monthly quota.
    const { data: expiresAt, error: reviveError } = await service.rpc("revive_r2_reservation", {
      p_reservation_id: reservation.id,
    });
    if (reviveError) {
      if (reviveError.code === "54000") return { error: "Monthly video upload quota reached", status: 403 };
      if (reviveError.code === "55000") return { error: reviveError.message, status: 403 };
      throw reviveError;
    }
    reservation.expires_at = String(expiresAt);
  }
  return { reservation };
};

export const bearerToken = (request: Request) =>
  request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
