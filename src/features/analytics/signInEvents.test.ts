import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubLocalStorage } from '../../test/memoryStorage';
import { track } from './analytics';
import { completePendingSignIn, rememberPendingSignIn, trackSignInTap } from './signInEvents';

beforeEach(() => {
  stubLocalStorage();
  vi.mocked(track).mockClear();
});

describe('Google/Apple sign-ins through a page', () => {
  it('count once, when the session lands', () => {
    trackSignInTap('google');
    rememberPendingSignIn('google');
    expect(completePendingSignIn()).toBe('google');
    expect(completePendingSignIn()).toBeNull();
    expect(vi.mocked(track).mock.calls).toEqual([
      ['sign_in_tap', { provider: 'google' }],
      ['sign_in', { provider: 'google', via: 'redirect' }],
    ]);
  });

  it('do not count after 10 minutes or after another attempt', () => {
    rememberPendingSignIn('apple');
    expect(completePendingSignIn(Date.now() + 11 * 60_000)).toBeNull();
    rememberPendingSignIn('apple');
    trackSignInTap('email');
    expect(completePendingSignIn()).toBeNull();
    expect(track).not.toHaveBeenCalledWith('sign_in', expect.anything());
  });
});
