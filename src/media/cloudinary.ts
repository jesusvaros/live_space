import { MediaUploadError } from './errors';
import type {
  MediaKind,
  MediaProvider,
  MediaUploadProgress,
  MediaUploadRequest,
  MediaUploadResult,
} from './types';

type CloudinaryAuthorization = {
  cloudName: string;
  apiKey: string;
  resourceType: MediaKind;
  signature: string;
  signatureAlgorithm: 'sha1';
  context: string;
  folder: string;
  public_id: string;
  timestamp: number;
  upload_preset: string;
  reservationId: string;
  expiresAt: string;
  limits: {
    maxBytes: number;
    maxDurationSeconds: number | null;
    maxPublicHeight: number;
  };
};

type CloudinaryUploadPayload = {
  public_id?: unknown;
  secure_url?: unknown;
  resource_type?: unknown;
  version?: unknown;
  width?: unknown;
  height?: unknown;
  duration?: unknown;
  bytes?: unknown;
  format?: unknown;
  error?: { message?: unknown };
};

export type CloudinaryMediaProviderOptions = {
  edgeFunctionUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
  xhrFactory?: () => XMLHttpRequest;
  now?: () => number;
  /** Refuse a signature that will expire before the upload can reasonably start. */
  minimumAuthorizationTtlMs?: number;
};

const DEFAULT_MINIMUM_AUTHORIZATION_TTL_MS = 5_000;
const SHA1_HEX = /^[a-f\d]{40}$/i;
const CLOUD_NAME = /^[a-z\d_-]+$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const inferMediaKind = (file: File): MediaKind =>
  file.type.toLowerCase().startsWith('video/') ? 'video' : 'image';

const readErrorMessage = (payload: unknown, fallback: string): string => {
  if (!isRecord(payload)) return fallback;
  const direct = payload.error;
  if (typeof direct === 'string' && direct.trim()) return direct;
  if (isRecord(direct) && typeof direct.message === 'string' && direct.message.trim()) {
    return direct.message;
  }
  return fallback;
};

const safeJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const parseAuthorization = (
  value: unknown,
  expectedKind: MediaKind,
  now: number,
  minimumTtlMs: number,
): CloudinaryAuthorization => {
  if (!isRecord(value) || !isRecord(value.limits)) {
    throw new MediaUploadError('invalid_authorization', 'The upload authorization response is malformed.');
  }

  const expiresAtMs = Date.parse(String(value.expiresAt ?? ''));
  const valid =
    isNonEmptyString(value.cloudName) &&
    CLOUD_NAME.test(value.cloudName) &&
    isNonEmptyString(value.apiKey) &&
    value.resourceType === expectedKind &&
    isNonEmptyString(value.signature) &&
    SHA1_HEX.test(value.signature) &&
    value.signatureAlgorithm === 'sha1' &&
    isNonEmptyString(value.context) &&
    isNonEmptyString(value.folder) &&
    isNonEmptyString(value.public_id) &&
    typeof value.timestamp === 'number' &&
    Number.isSafeInteger(value.timestamp) &&
    value.timestamp > 0 &&
    isNonEmptyString(value.upload_preset) &&
    isNonEmptyString(value.reservationId) &&
    Number.isFinite(expiresAtMs) &&
    isFiniteNonNegativeNumber(value.limits.maxBytes) &&
    (value.limits.maxDurationSeconds === null ||
      isFiniteNonNegativeNumber(value.limits.maxDurationSeconds)) &&
    isFiniteNonNegativeNumber(value.limits.maxPublicHeight);

  if (!valid) {
    throw new MediaUploadError('invalid_authorization', 'The upload authorization response is invalid.');
  }
  if (expiresAtMs <= now + minimumTtlMs) {
    throw new MediaUploadError('authorization_expired', 'The upload authorization has expired.');
  }

  return value as CloudinaryAuthorization;
};

const parseUploadResult = (
  payload: CloudinaryUploadPayload,
  authorization: CloudinaryAuthorization,
): MediaUploadResult => {
  if (
    !isNonEmptyString(payload.public_id) ||
    payload.public_id !== authorization.public_id ||
    !isNonEmptyString(payload.secure_url) ||
    !payload.secure_url.startsWith('https://') ||
    payload.resource_type !== authorization.resourceType ||
    !isFiniteNonNegativeNumber(payload.bytes)
  ) {
    throw new MediaUploadError('invalid_upload_response', 'Cloudinary returned an invalid upload response.');
  }

  return {
    provider: 'cloudinary',
    reservationId: authorization.reservationId,
    publicId: payload.public_id,
    resourceType: authorization.resourceType,
    secureUrl: payload.secure_url,
    version: isFiniteNonNegativeNumber(payload.version) ? payload.version : null,
    width: isFiniteNonNegativeNumber(payload.width) ? payload.width : null,
    height: isFiniteNonNegativeNumber(payload.height) ? payload.height : null,
    durationSeconds: isFiniteNonNegativeNumber(payload.duration) ? payload.duration : null,
    bytes: payload.bytes,
    format: isNonEmptyString(payload.format) ? payload.format : null,
  };
};

const createAbortedError = (cause?: unknown) =>
  new MediaUploadError('aborted', 'The media upload was cancelled.', { cause });

const normalizeProgress = (loadedBytes: number, totalBytes: number): MediaUploadProgress => ({
  loadedBytes,
  totalBytes,
  percent: totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0,
});

export class CloudinaryMediaProvider implements MediaProvider {
  private readonly edgeFunctionUrl: string;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly xhrFactory: () => XMLHttpRequest;
  private readonly now: () => number;
  private readonly minimumAuthorizationTtlMs: number;

  constructor(options: CloudinaryMediaProviderOptions) {
    if (!isNonEmptyString(options.edgeFunctionUrl)) {
      throw new Error('edgeFunctionUrl is required');
    }
    this.edgeFunctionUrl = options.edgeFunctionUrl;
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.xhrFactory = options.xhrFactory ?? (() => new XMLHttpRequest());
    this.now = options.now ?? Date.now;
    this.minimumAuthorizationTtlMs =
      options.minimumAuthorizationTtlMs ?? DEFAULT_MINIMUM_AUTHORIZATION_TTL_MS;
  }

  async upload(request: MediaUploadRequest): Promise<MediaUploadResult> {
    if (request.signal?.aborted) throw createAbortedError(request.signal.reason);

    const kind = request.kind ?? inferMediaKind(request.file);
    const authorization = await this.authorize(request, kind);
    if (request.file.size > authorization.limits.maxBytes) {
      throw new MediaUploadError(
        'file_too_large',
        `The selected file exceeds the ${authorization.limits.maxBytes} byte upload limit.`,
      );
    }

    return this.uploadToCloudinary(request, authorization);
  }

  private async authorize(
    request: MediaUploadRequest,
    kind: MediaKind,
  ): Promise<CloudinaryAuthorization> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      throw new MediaUploadError('authentication_required', 'Sign in before uploading media.');
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.edgeFunctionUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          kind,
          eventId: request.eventId ?? null,
          subjectId: request.subjectId ?? null,
          purpose: request.purpose ?? 'user',
        }),
        signal: request.signal,
      });
    } catch (error) {
      if (request.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw createAbortedError(error);
      }
      throw new MediaUploadError('authorization_failed', 'Unable to authorize the media upload.', {
        cause: error,
      });
    }

    const payload = await safeJson(response);
    if (!response.ok) {
      throw new MediaUploadError(
        response.status === 401 ? 'authentication_required' : 'authorization_failed',
        readErrorMessage(payload, 'Unable to authorize the media upload.'),
        { status: response.status },
      );
    }

    return parseAuthorization(
      payload,
      kind,
      this.now(),
      this.minimumAuthorizationTtlMs,
    );
  }

  private uploadToCloudinary(
    request: MediaUploadRequest,
    authorization: CloudinaryAuthorization,
  ): Promise<MediaUploadResult> {
    return new Promise((resolve, reject) => {
      const xhr = this.xhrFactory();
      const uploadUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(authorization.cloudName)}/${authorization.resourceType}/upload`;
      let settled = false;

      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        request.signal?.removeEventListener('abort', abort);
        callback();
      };
      const abort = () => {
        xhr.abort();
        settle(() => reject(createAbortedError(request.signal?.reason)));
      };

      xhr.open('POST', uploadUrl, true);
      xhr.responseType = 'json';
      xhr.upload.onprogress = (event) => {
        request.onProgress?.(
          normalizeProgress(event.loaded, event.lengthComputable ? event.total : request.file.size),
        );
      };
      xhr.onerror = () =>
        settle(() => reject(new MediaUploadError('upload_failed', 'Cloudinary upload failed.')));
      xhr.onabort = () => settle(() => reject(createAbortedError(request.signal?.reason)));
      xhr.onload = () => {
        const payload = (xhr.response ?? {}) as CloudinaryUploadPayload;
        if (xhr.status < 200 || xhr.status >= 300) {
          settle(() =>
            reject(
              new MediaUploadError(
                'upload_failed',
                readErrorMessage(payload, 'Cloudinary rejected the media upload.'),
                { status: xhr.status },
              ),
            ),
          );
          return;
        }

        try {
          const result = parseUploadResult(payload, authorization);
          request.onProgress?.(normalizeProgress(request.file.size, request.file.size));
          settle(() => resolve(result));
        } catch (error) {
          settle(() => reject(error));
        }
      };

      request.signal?.addEventListener('abort', abort, { once: true });

      const form = new FormData();
      form.set('file', request.file);
      form.set('api_key', authorization.apiKey);
      form.set('timestamp', String(authorization.timestamp));
      form.set('signature', authorization.signature);
      form.set('context', authorization.context);
      form.set('folder', authorization.folder);
      form.set('public_id', authorization.public_id);
      form.set('upload_preset', authorization.upload_preset);
      xhr.send(form);
    });
  }
}

export const createCloudinaryMediaProvider = (options: CloudinaryMediaProviderOptions): MediaProvider =>
  new CloudinaryMediaProvider(options);
