import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@capgo/capacitor-social-login', () => ({ SocialLogin: { initialize: vi.fn(), login: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: {} } }));

import { canSignInNatively, createNonce } from './nativeSocialLogin';

describe('native sign-in', () => {
  it('gives the provider the SHA-256 of the nonce Supabase receives', async () => {
    const nonce = await createNonce();
    expect(nonce.raw).toMatch(/^[0-9a-f]{64}$/);
    expect(nonce.hashed).toBe(createHash('sha256').update(nonce.raw).digest('hex'));
    expect((await createNonce()).raw).not.toBe(nonce.raw);
  });

  it('keeps the browser flow on the web', () => {
    expect(canSignInNatively('google')).toBe(false);
    expect(canSignInNatively('apple')).toBe(false);
  });
});
