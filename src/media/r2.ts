import { MediaUploadError } from './errors';
import { LiveSpaceMedia } from './native/liveSpaceMedia';
import type { MediaProvider, MediaUploadPurpose, MediaUploadRequest, MediaUploadResult } from './types';
import { extractVideoThumbnail, probeVideo } from './videoProbe';

/**
 * Cloudflare R2 storage for fan videos. The Edge Function media-r2-sign runs
 * the same reservation/quota checks as Cloudinary and returns presigned URLs;
 * the client PUTs the bytes straight to R2 (single PUT up to 10 MB, multipart
 * parts above) and media-r2-complete verifies the object and records the asset.
 * The server decides whether videos go to R2: when it answers
 * { provider: "cloudinary" } nothing was reserved and the Cloudinary flow runs.
 */

/** Types media-r2-sign accepts; anything else (3gp, m4v…) stays on Cloudinary. */
export const R2_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
export const isR2VideoType = (contentType: string) => R2_VIDEO_TYPES.includes(contentType.toLowerCase());

export type R2PartPlan = { partNumber: number; url: string; size: number; headers: Record<string, string> };

export type R2UploadPlan =
  | { type: 'single'; url: string; headers: Record<string, string> }
  | { type: 'multipart'; partSize: number; parts: R2PartPlan[] };

export type R2Session = {
  provider: 'r2';
  reservationId: string;
  key: string;
  expiresAt: string;
  limits: { maxBytes: number; maxDurationSeconds: number };
  upload: R2UploadPlan;
};

export type R2StartResult = R2Session | { provider: 'cloudinary' };

export type R2CompletedPart = { partNumber: number; etag: string };

export type R2CompleteResult = {
  reservationId: string;
  mediaAssetId: string;
  secureUrl: string;
  thumbnailUrl: string | null;
};

export type R2StartInput = {
  eventId?: string | null;
  subjectId?: string | null;
  purpose?: MediaUploadPurpose;
  contentType: string;
  sizeBytes: number;
  durationSeconds?: number | null;
};

export type R2CompleteInput = {
  reservationId: string;
  parts?: R2CompletedPart[];
  durationSeconds: number;
  width?: number | null;
  height?: number | null;
  thumbnailReservationId?: string | null;
};

export type R2ClientOptions = {
  /** https://<project>.supabase.co/functions/v1 */
  functionsBaseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isHttpsUrl = (value: unknown): value is string => typeof value === 'string' && value.startsWith('https://');

const toHeaders = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
};

const parsePlan = (value: unknown): R2UploadPlan | null => {
  if (!isRecord(value)) return null;
  if (value.type === 'single' && isHttpsUrl(value.url)) {
    return { type: 'single', url: value.url, headers: toHeaders(value.headers) };
  }
  if (value.type === 'multipart' && typeof value.partSize === 'number' && Array.isArray(value.parts)) {
    const parts: R2PartPlan[] = [];
    for (const part of value.parts) {
      if (!isRecord(part) || !isHttpsUrl(part.url) || typeof part.partNumber !== 'number' || typeof part.size !== 'number') {
        return null;
      }
      parts.push({ partNumber: part.partNumber, url: part.url, size: part.size, headers: toHeaders(part.headers) });
    }
    return parts.length > 0 ? { type: 'multipart', partSize: value.partSize, parts } : null;
  }
  return null;
};

const parseSession = (value: unknown): R2Session => {
  const plan = isRecord(value) ? parsePlan(value.upload) : null;
  if (
    !isRecord(value) ||
    value.provider !== 'r2' ||
    typeof value.reservationId !== 'string' ||
    typeof value.key !== 'string' ||
    !isRecord(value.limits) ||
    !plan
  ) {
    throw new MediaUploadError('invalid_authorization', 'The R2 upload authorization is invalid.');
  }
  return {
    provider: 'r2',
    reservationId: value.reservationId,
    key: value.key,
    expiresAt: String(value.expiresAt ?? ''),
    limits: {
      maxBytes: Number(value.limits.maxBytes),
      maxDurationSeconds: Number(value.limits.maxDurationSeconds),
    },
    upload: plan,
  };
};

const errorMessage = (payload: unknown, fallback: string) =>
  isRecord(payload) && typeof payload.error === 'string' && payload.error.trim() ? payload.error : fallback;

const errorFor = (status: number, payload: unknown, fallback: string) => {
  const message = errorMessage(payload, fallback);
  if (status === 401) return new MediaUploadError('authentication_required', message, { status });
  if (status === 403 && /quota/i.test(message)) return new MediaUploadError('quota_exceeded', message, { status });
  if (status === 413 || status === 415 || status === 422) {
    return new MediaUploadError('upload_rejected', message, { status });
  }
  return new MediaUploadError('authorization_failed', message, { status });
};

export class R2MediaClient {
  private readonly functionsBaseUrl: string;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: R2ClientOptions) {
    this.functionsBaseUrl = options.functionsBaseUrl.replace(/\/$/, '');
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async start(input: R2StartInput, signal?: AbortSignal): Promise<R2StartResult> {
    const payload = await this.call('media-r2-sign', { action: 'start', kind: 'video', ...input }, signal);
    if (isRecord(payload) && payload.provider === 'cloudinary') return { provider: 'cloudinary' };
    return parseSession(payload);
  }

  async resume(reservationId: string, signal?: AbortSignal): Promise<R2Session> {
    return parseSession(await this.call('media-r2-sign', { action: 'resume', reservationId }, signal));
  }

  async abort(reservationId: string): Promise<void> {
    await this.call('media-r2-sign', { action: 'abort', reservationId });
  }

  async complete(input: R2CompleteInput, signal?: AbortSignal): Promise<R2CompleteResult> {
    const payload = await this.call('media-r2-complete', input, signal);
    if (!isRecord(payload) || payload.accepted !== true || typeof payload.mediaAssetId !== 'string') {
      throw new MediaUploadError('invalid_upload_response', 'The upload could not be confirmed.');
    }
    return {
      reservationId: String(payload.reservationId ?? input.reservationId),
      mediaAssetId: payload.mediaAssetId,
      secureUrl: String(payload.secureUrl ?? ''),
      thumbnailUrl: typeof payload.thumbnailUrl === 'string' ? payload.thumbnailUrl : null,
    };
  }

  private async call(fn: 'media-r2-sign' | 'media-r2-complete', body: unknown, signal?: AbortSignal) {
    const token = await this.getAccessToken();
    if (!token) throw new MediaUploadError('authentication_required', 'Sign in before uploading media.');
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.functionsBaseUrl}/${fn}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw new MediaUploadError('aborted', 'The media upload was cancelled.', { cause: error });
      throw new MediaUploadError('authorization_failed', 'Unable to reach the upload service.', { cause: error });
    }
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) throw errorFor(response.status, payload, 'Unable to authorize the media upload.');
    return payload;
  }
}

// ---------------------------------------------------------------------------
// Byte transport

export type UploadSource = { type: 'blob'; blob: Blob } | { type: 'native'; path: string };

export type PutRangeInput = {
  source: UploadSource;
  url: string;
  headers: Record<string, string>;
  offset: number;
  length: number;
  taskId?: string;
  signal?: AbortSignal;
  onProgress?: (sentBytes: number) => void;
};

const statusError = (status: number) =>
  status === 403
    // Presigned URLs live one hour: a 403 means "sign again".
    ? new MediaUploadError('authorization_expired', 'The upload URL expired.', { status })
    : new MediaUploadError('upload_failed', `R2 rejected the upload (${status}).`, { status });

/**
 * The WebView's own fetch. With CapacitorHttp enabled, window.fetch and XHR
 * send the body over the native bridge as base64; Capacitor keeps the original
 * fetch as CapacitorWebFetch. It has no upload progress, so on native the
 * progress moves per part (native paths use the plugin, which reports bytes).
 */
const webviewFetch = () =>
  (globalThis as { CapacitorWebFetch?: typeof fetch }).CapacitorWebFetch ?? null;

/** PUTs one byte range and returns the ETag R2 assigned to it. */
export const putRange = async (input: PutRangeInput): Promise<string | null> => {
  if (input.signal?.aborted) throw new MediaUploadError('aborted', 'The media upload was cancelled.');

  if (input.source.type === 'native') {
    const taskId = input.taskId ?? `put-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const handle = input.onProgress
      ? await LiveSpaceMedia.addListener('uploadProgress', (event) => {
        if (event.taskId === taskId) input.onProgress?.(event.sentBytes);
      })
      : null;
    try {
      const result = await LiveSpaceMedia.uploadFileRange({
        taskId,
        path: input.source.path,
        url: input.url,
        offset: input.offset,
        length: input.length,
        headers: input.headers,
      });
      if (result.status < 200 || result.status >= 300) throw statusError(result.status);
      return result.etag;
    } catch (error) {
      if (error instanceof MediaUploadError) throw error;
      throw new MediaUploadError('upload_failed', 'Network error while uploading.', { cause: error });
    } finally {
      await handle?.remove();
    }
  }

  const body = input.source.blob.slice(input.offset, input.offset + input.length);
  const headers = Object.fromEntries(
    Object.entries(input.headers).filter(([name]) => name.toLowerCase() !== 'content-length'),
  );
  const originalFetch = webviewFetch();
  if (originalFetch) {
    let response: Response;
    try {
      response = await originalFetch(input.url, { method: 'PUT', headers, body, signal: input.signal });
    } catch (error) {
      if (input.signal?.aborted) throw new MediaUploadError('aborted', 'The media upload was cancelled.', { cause: error });
      throw new MediaUploadError('upload_failed', 'Network error while uploading.', { cause: error });
    }
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw statusError(response.status);
    input.onProgress?.(input.length);
    return response.headers.get('ETag');
  }

  return new Promise<string | null>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    input.signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => input.signal?.removeEventListener('abort', abort);
    xhr.open('PUT', input.url, true);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => input.onProgress?.(event.loaded);
    xhr.onerror = () => {
      cleanup();
      reject(new MediaUploadError('upload_failed', 'Network error while uploading.'));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new MediaUploadError('aborted', 'The media upload was cancelled.'));
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        // Needs ExposeHeaders: ETag in the bucket CORS policy (docs/media.md).
        resolve(xhr.getResponseHeader('ETag'));
      } else {
        reject(statusError(xhr.status));
      }
    };
    xhr.send(body);
  });
};

/**
 * Uploads every part of a session that is not in `completedParts`, re-signing
 * once when the URLs expired. Calls onPartDone after each part so a queue can
 * persist progress and resume after a restart.
 */
export const uploadSessionParts = async (options: {
  client: R2MediaClient;
  session: R2Session;
  source: UploadSource;
  /** Size of the whole file (signed into the single-PUT URL). */
  totalBytes: number;
  completedParts?: R2CompletedPart[];
  taskId?: string;
  signal?: AbortSignal;
  onPartDone?: (part: R2CompletedPart) => void | Promise<void>;
  onProgress?: (uploadedBytes: number) => void;
}): Promise<R2CompletedPart[]> => {
  let session = options.session;
  const done = new Map((options.completedParts ?? []).map((part) => [part.partNumber, part]));

  const withResign = async <T>(run: (current: R2Session) => Promise<T>): Promise<T> => {
    try {
      return await run(session);
    } catch (error) {
      if (!(error instanceof MediaUploadError) || error.code !== 'authorization_expired') throw error;
      session = await options.client.resume(session.reservationId, options.signal);
      return run(session);
    }
  };

  if (session.upload.type === 'single') {
    await withResign(async (current) => {
      if (current.upload.type !== 'single') throw new MediaUploadError('invalid_authorization', 'Unexpected upload plan.');
      return putRange({
        source: options.source,
        url: current.upload.url,
        headers: current.upload.headers,
        offset: 0,
        length: options.totalBytes,
        taskId: options.taskId,
        signal: options.signal,
        onProgress: options.onProgress,
      });
    });
    return [];
  }

  const uploadedBefore = () =>
    [...done.keys()].reduce((sum, partNumber) => {
      const part = session.upload.type === 'multipart'
        ? session.upload.parts.find((candidate) => candidate.partNumber === partNumber)
        : undefined;
      return sum + (part?.size ?? 0);
    }, 0);

  const partNumbers = session.upload.parts.map((part) => part.partNumber);
  for (const partNumber of partNumbers) {
    if (done.has(partNumber)) continue;
    const base = uploadedBefore();
    const etag = await withResign(async (current) => {
      if (current.upload.type !== 'multipart') throw new MediaUploadError('invalid_authorization', 'Unexpected upload plan.');
      const part = current.upload.parts.find((candidate) => candidate.partNumber === partNumber);
      if (!part) throw new MediaUploadError('invalid_authorization', 'Missing upload part.');
      return putRange({
        source: options.source,
        url: part.url,
        headers: part.headers,
        offset: (partNumber - 1) * current.upload.partSize,
        length: part.size,
        taskId: options.taskId,
        signal: options.signal,
        onProgress: (sent) => options.onProgress?.(base + sent),
      });
    });
    if (!etag) {
      throw new MediaUploadError('upload_failed', 'R2 did not return an ETag (check the bucket CORS ExposeHeaders).');
    }
    const completed = { partNumber, etag };
    done.set(partNumber, completed);
    await options.onPartDone?.(completed);
  }
  return [...done.values()].sort((left, right) => left.partNumber - right.partNumber);
};

// ---------------------------------------------------------------------------
// MediaProvider

export type R2MediaProviderOptions = {
  client: R2MediaClient;
  /** Cloudinary: images, posters, and videos whenever R2 is off. */
  cloudinary: MediaProvider;
  /** Resolves the media asset id of a Cloudinary reservation (webhook). */
  waitForAsset?: (reservationId: string) => Promise<string>;
  now?: () => number;
};

const CLOUDINARY_DECISION_TTL_MS = 5 * 60 * 1000;

/**
 * Routes uploads: images to Cloudinary, videos to R2 when the server says so,
 * otherwise to Cloudinary. A missing or unreachable media-r2-sign function
 * (not deployed yet) also means Cloudinary, so nothing breaks before setup.
 */
export class R2MediaProvider implements MediaProvider {
  private cloudinaryUntil = 0;

  constructor(private readonly options: R2MediaProviderOptions) {}

  get client() {
    return this.options.client;
  }

  /** Direct Cloudinary upload (images, and videos while R2 is off). */
  uploadToCloudinary(request: MediaUploadRequest) {
    return this.options.cloudinary.upload(request);
  }

  /** True when a recent answer said videos are on Cloudinary. */
  prefersCloudinary() {
    return (this.options.now ?? Date.now)() < this.cloudinaryUntil;
  }

  rememberCloudinary() {
    this.cloudinaryUntil = (this.options.now ?? Date.now)() + CLOUDINARY_DECISION_TTL_MS;
  }

  /** start() with the Cloudinary fallback rules applied. */
  async startVideo(input: R2StartInput, signal?: AbortSignal): Promise<R2StartResult> {
    if (this.prefersCloudinary()) return { provider: 'cloudinary' };
    try {
      const result = await this.options.client.start(input, signal);
      if (result.provider === 'cloudinary') this.rememberCloudinary();
      return result;
    } catch (error) {
      // Only a missing function means "not set up". A network error must not
      // send the clip to Cloudinary: the caller retries the R2 start instead.
      const notDeployed = error instanceof MediaUploadError &&
        error.code === 'authorization_failed' && error.status === 404;
      if (notDeployed) {
        this.rememberCloudinary();
        return { provider: 'cloudinary' };
      }
      throw error;
    }
  }

  /** Uploads a poster through the Cloudinary image path; returns its reservation id or null. */
  async uploadPoster(poster: Blob | null, signal?: AbortSignal): Promise<string | null> {
    if (!poster) return null;
    try {
      const file = new File([poster], 'poster.jpg', { type: 'image/jpeg' });
      const result = await this.options.cloudinary.upload({ file, kind: 'image', eventId: null, purpose: 'user', signal });
      // media-r2-complete reads the poster's asset, which the Cloudinary
      // webhook creates; give it a few seconds, then go on without a poster.
      if (this.options.waitForAsset) {
        await this.options.waitForAsset(result.reservationId).catch(() => null);
      }
      return result.reservationId;
    } catch {
      return null;
    }
  }

  async upload(request: MediaUploadRequest): Promise<MediaUploadResult> {
    const kind = request.kind ?? (request.file.type.toLowerCase().startsWith('video/') ? 'video' : 'image');
    if (kind !== 'video') return this.options.cloudinary.upload({ ...request, kind });

    const probe = request.durationSeconds ? null : await probeVideo(request.file);
    const durationSeconds = request.durationSeconds ?? probe?.durationSeconds ?? null;
    // R2 cannot measure the clip; when the browser cannot either (or the type is
    // one R2 does not take), Cloudinary does.
    if (!durationSeconds || !isR2VideoType(request.file.type || 'video/mp4')) return this.options.cloudinary.upload({ ...request, kind });
    const contentType = request.file.type.toLowerCase() || 'video/mp4';
    const start = await this.startVideo({
      eventId: request.eventId ?? null,
      subjectId: request.subjectId ?? null,
      purpose: request.purpose ?? 'user',
      contentType,
      sizeBytes: request.file.size,
      durationSeconds,
    }, request.signal);
    if (start.provider === 'cloudinary') return this.options.cloudinary.upload({ ...request, kind });

    const total = request.file.size;
    const parts = await uploadSessionParts({
      client: this.options.client,
      session: start,
      source: { type: 'blob', blob: request.file },
      totalBytes: request.file.size,
      signal: request.signal,
      onProgress: (loaded) => request.onProgress?.({
        loadedBytes: loaded,
        totalBytes: total,
        percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
      }),
    });
    const poster = request.thumbnail ?? await extractVideoThumbnail(request.file);
    const thumbnailReservationId = await this.uploadPoster(poster, request.signal);
    const completed = await this.options.client.complete({
      reservationId: start.reservationId,
      parts: start.upload.type === 'multipart' ? parts : undefined,
      durationSeconds,
      width: request.width ?? probe?.width ?? null,
      height: request.height ?? probe?.height ?? null,
      thumbnailReservationId,
    }, request.signal);

    return {
      provider: 'r2',
      reservationId: completed.reservationId,
      publicId: start.key,
      resourceType: 'video',
      secureUrl: completed.secureUrl,
      version: null,
      width: request.width ?? probe?.width ?? null,
      height: request.height ?? probe?.height ?? null,
      durationSeconds,
      bytes: total,
      format: start.key.split('.').pop() ?? null,
      mediaAssetId: completed.mediaAssetId,
    };
  }
}
