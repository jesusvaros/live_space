import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn((..._args: unknown[]) => Promise.resolve({ data: null, error: null }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { deviceKey, recordPostView, viewRecorded } from './postViews';

describe('postViews', () => {
  beforeEach(() => {
    rpc.mockClear();
  });

  it('keeps one random device key', () => {
    const key = deviceKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(deviceKey()).toBe(key);
  });

  it('records a view once per post per session', () => {
    recordPostView('post-1');
    recordPostView('post-1');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('record_post_view', { p_post_id: 'post-1', p_device_key: deviceKey() });
    expect(viewRecorded('post-1')).toBe(true);
  });

  it('never throws when the backend has no view tracking yet', async () => {
    rpc.mockImplementationOnce(() => Promise.reject(new Error('function not found')));
    expect(() => recordPostView('post-2')).not.toThrow();
    await Promise.resolve();
  });
});
