import { describe, expect, it, vi } from 'vitest';

import { CloudinaryMediaProvider } from './cloudinary';
import { MediaUploadError } from './errors';

const NOW = Date.parse('2026-07-17T18:00:00.000Z');

const authorization = (overrides: Record<string, unknown> = {}) => ({
  cloudName: 'live-space',
  apiKey: 'public-api-key',
  resourceType: 'image',
  signature: 'a'.repeat(40),
  signatureAlgorithm: 'sha1',
  context: 'reservation_id=reservation-1|owner_id=user-1',
  folder: 'live-space/pilot/users/user-1',
  public_id: 'asset-1',
  timestamp: Math.floor(NOW / 1_000),
  upload_preset: 'live_space_user_media',
  reservationId: 'reservation-1',
  expiresAt: new Date(NOW + 10 * 60_000).toISOString(),
  limits: {
    maxBytes: 10_000,
    maxDurationSeconds: null,
    maxPublicHeight: 720,
  },
  ...overrides,
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

class FakeXhr {
  readonly upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  status = 0;
  response: unknown = null;
  responseType: XMLHttpRequestResponseType = '';
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onload: (() => void) | null = null;
  method = '';
  url = '';
  sentBody: Document | XMLHttpRequestBodyInit | null = null;
  autoComplete = true;
  aborted = false;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.sentBody = body;
    if (!this.autoComplete) return;
    this.upload.onprogress?.({
      loaded: 2,
      total: 4,
      lengthComputable: true,
    } as ProgressEvent);
    this.status = 200;
    this.response = {
      public_id: 'asset-1',
      secure_url: 'https://res.cloudinary.com/live-space/image/upload/asset-1.jpg',
      resource_type: 'image',
      version: 42,
      width: 1200,
      height: 800,
      bytes: 4,
      format: 'jpg',
    };
    this.onload?.();
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

const createProvider = (
  fetchMock: typeof fetch,
  xhr: FakeXhr,
  overrides: Partial<ConstructorParameters<typeof CloudinaryMediaProvider>[0]> = {},
) =>
  new CloudinaryMediaProvider({
    edgeFunctionUrl: 'https://project.supabase.co/functions/v1/cloudinary-sign-upload',
    getAccessToken: async () => 'user-access-token',
    fetch: fetchMock,
    xhrFactory: () => xhr as unknown as XMLHttpRequest,
    now: () => NOW,
    ...overrides,
  });

describe('CloudinaryMediaProvider', () => {
  it('authorizes with Supabase and performs a signed upload with progress', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(authorization()),
    );
    const xhr = new FakeXhr();
    const progress = vi.fn();
    const provider = createProvider(fetchMock, xhr);
    const file = new File(['test'], 'poster.jpg', { type: 'image/jpeg' });

    const result = await provider.upload({
      file,
      eventId: 'event-1',
      onProgress: progress,
    });

    expect(result).toMatchObject({
      provider: 'cloudinary',
      reservationId: 'reservation-1',
      publicId: 'asset-1',
      secureUrl: 'https://res.cloudinary.com/live-space/image/upload/asset-1.jpg',
      bytes: 4,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [edgeUrl, edgeInit] = fetchMock.mock.calls[0];
    expect(edgeUrl).toContain('/cloudinary-sign-upload');
    expect(edgeInit).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer user-access-token',
        'content-type': 'application/json',
      },
    });
    expect(JSON.parse(String(edgeInit?.body))).toEqual({
      kind: 'image',
      eventId: 'event-1',
      subjectId: null,
      purpose: 'user',
    });

    expect(xhr.url).toBe('https://api.cloudinary.com/v1_1/live-space/image/upload');
    expect(xhr.sentBody).toBeInstanceOf(FormData);
    const form = xhr.sentBody as FormData;
    expect(form.get('signature')).toBe('a'.repeat(40));
    expect(form.get('api_key')).toBe('public-api-key');
    expect(form.get('upload_preset')).toBe('live_space_user_media');
    expect([...form.keys()]).not.toContain('api_secret');
    expect(progress).toHaveBeenCalledWith({ loadedBytes: 2, totalBytes: 4, percent: 50 });
    expect(progress).toHaveBeenLastCalledWith({ loadedBytes: 4, totalBytes: 4, percent: 100 });
  });

  it('rejects an expired authorization before sending the file', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(authorization({ expiresAt: new Date(NOW - 1).toISOString() })),
    ) as unknown as typeof fetch;
    const xhr = new FakeXhr();
    const provider = createProvider(fetchMock, xhr);

    await expect(
      provider.upload({ file: new File(['test'], 'poster.jpg', { type: 'image/jpeg' }) }),
    ).rejects.toMatchObject({ code: 'authorization_expired' } satisfies Partial<MediaUploadError>);
    expect(xhr.sentBody).toBeNull();
  });

  it('enforces the signed byte limit before sending the file', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(authorization({ limits: { maxBytes: 2, maxDurationSeconds: null, maxPublicHeight: 720 } })),
    );
    const xhr = new FakeXhr();
    const provider = createProvider(fetchMock, xhr);

    await expect(
      provider.upload({ file: new File(['test'], 'poster.jpg', { type: 'image/jpeg' }) }),
    ).rejects.toMatchObject({ code: 'file_too_large' } satisfies Partial<MediaUploadError>);
    expect(xhr.sentBody).toBeNull();
  });

  it('aborts an in-flight Cloudinary request through AbortSignal', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(authorization()),
    );
    const xhr = new FakeXhr();
    xhr.autoComplete = false;
    const provider = createProvider(fetchMock, xhr);
    const controller = new AbortController();

    const pending = provider.upload({
      file: new File(['test'], 'poster.jpg', { type: 'image/jpeg' }),
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(xhr.sentBody).toBeInstanceOf(FormData));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'aborted' } satisfies Partial<MediaUploadError>);
    expect(xhr.aborted).toBe(true);
  });

  it('does not contact Cloudinary when the signature response is malformed', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(authorization({ signature: 'not-a-valid-signature' })),
    );
    const xhr = new FakeXhr();
    const provider = createProvider(fetchMock, xhr);

    await expect(
      provider.upload({ file: new File(['test'], 'poster.jpg', { type: 'image/jpeg' }) }),
    ).rejects.toMatchObject({ code: 'invalid_authorization' } satisfies Partial<MediaUploadError>);
    expect(xhr.sentBody).toBeNull();
  });
});
