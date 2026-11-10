import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { deleteMyAccount, isDeleteConfirmed } from './deleteAccount';

describe('isDeleteConfirmed', () => {
  it('needs the word, in any case', () => {
    expect(isDeleteConfirmed('')).toBe(false);
    expect(isDeleteConfirmed('elimina')).toBe(false);
    expect(isDeleteConfirmed(' eliminar ')).toBe(true);
    expect(isDeleteConfirmed('ELIMINAR')).toBe(true);
  });
});

describe('deleteMyAccount', () => {
  beforeEach(() => rpc.mockReset());

  it('calls delete_my_account and succeeds when the account went', async () => {
    rpc.mockResolvedValue({ data: { deleted: true, posts: 2 }, error: null });
    await expect(deleteMyAccount()).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('delete_my_account');
  });

  it('treats a second call after success as done', async () => {
    rpc.mockResolvedValue({ data: { deleted: false, reason: 'already_deleted' }, error: null });
    await expect(deleteMyAccount()).resolves.toEqual({ ok: true });
  });

  it('reports a backend without the function so the screen offers the email request', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(deleteMyAccount()).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('reports other errors as failed', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Authentication required' } });
    await expect(deleteMyAccount()).resolves.toEqual({ ok: false, reason: 'failed' });
  });
});
