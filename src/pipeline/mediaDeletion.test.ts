import { describe, expect, it, vi } from 'vitest';
import { createCloudinaryDeleter, drainQueue, isDeletableKey, MAX_ATTEMPTS, summarize, type QueueRow } from './mediaDeletion';

const r2Key = 'v/2026/11/0b6f3c5e-6d1a-4a51-9a0b-2f6f1d0c9e11.mp4';
const row = (id: number, provider: QueueRow['provider'], object_key: string, attempts = 0): QueueRow => ({
  id,
  provider,
  object_key,
  resource_type: provider === 'r2' ? 'video' : 'image',
  attempts,
});

describe('isDeletableKey', () => {
  it('accepts only fan video keys in R2', () => {
    expect(isDeletableKey({ provider: 'r2', object_key: r2Key })).toBe(true);
    expect(isDeletableKey({ provider: 'r2', object_key: 'posters/v1/abc/w320.webp' })).toBe(false);
    expect(isDeletableKey({ provider: 'r2', object_key: 'incoming/2026/11/x.mp4' })).toBe(false);
  });

  it('accepts Cloudinary public ids without path tricks', () => {
    expect(isDeletableKey({ provider: 'cloudinary', object_key: 'live-space/pilot/users/u/abc' })).toBe(true);
    expect(isDeletableKey({ provider: 'cloudinary', object_key: '../x' })).toBe(false);
  });
});

describe('drainQueue', () => {
  it('deletes each row with its provider and records failures as a new attempt', async () => {
    const r2 = vi.fn(async (_row: QueueRow) => undefined);
    const cloudinary = vi.fn(async (current: QueueRow) => {
      if (current.id === 3) throw new Error('boom');
    });
    const updates = await drainQueue(
      [row(1, 'r2', r2Key), row(2, 'cloudinary', 'a/b'), row(3, 'cloudinary', 'a/c', 2)],
      { r2, cloudinary },
    );
    expect(updates).toEqual([
      { id: 1, outcome: 'deleted', attempts: 1 },
      { id: 2, outcome: 'deleted', attempts: 1 },
      { id: 3, outcome: 'failed', attempts: 3, error: 'boom' },
    ]);
    expect(r2).toHaveBeenCalledTimes(1);
    expect(summarize(updates)).toEqual({ deleted: 2, failed: 1, skipped: 0 });
  });

  it('leaves rows pending when their provider is not configured or they failed too often', async () => {
    const r2 = vi.fn(async () => undefined);
    const updates = await drainQueue([row(1, 'cloudinary', 'a/b'), row(2, 'r2', r2Key, MAX_ATTEMPTS)], { r2 });
    expect(updates.map(update => update.outcome)).toEqual(['skipped', 'skipped']);
    expect(r2).not.toHaveBeenCalled();
  });

  it('never calls a deleter for an unexpected key and stops retrying it', async () => {
    const r2 = vi.fn(async () => undefined);
    const [update] = await drainQueue([row(1, 'r2', 'posters/v1/x/w800.webp')], { r2 });
    expect(r2).not.toHaveBeenCalled();
    expect(update).toMatchObject({ outcome: 'failed', attempts: MAX_ATTEMPTS });
  });
});

describe('createCloudinaryDeleter', () => {
  const config = { cloudName: 'demo', apiKey: 'k', apiSecret: 's' };

  it('calls the Admin API and accepts deleted or not_found', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ deleted: { 'a/b': 'not_found' } }), { status: 200 }));
    await createCloudinaryDeleter(config, fetchImpl as unknown as typeof fetch)(row(1, 'cloudinary', 'a/b'));
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain('/v1_1/demo/resources/image/upload?public_ids%5B%5D=a%2Fb');
    expect(init.method).toBe('DELETE');
  });

  it('throws when Cloudinary did not delete it', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ deleted: { 'a/b': 'error' } }), { status: 200 }));
    await expect(createCloudinaryDeleter(config, fetchImpl as unknown as typeof fetch)(row(1, 'cloudinary', 'a/b'))).rejects.toThrow();
  });
});
