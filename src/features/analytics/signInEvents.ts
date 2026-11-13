import { track } from './analytics';
import type { SignInProvider } from './props';

// Google/Apple through a page (the web redirect, the in-app browser) finish
// later, when the session lands: the provider waits here so that moment
// becomes `sign_in { provider }`.

const KEY = 'live_space.analytics.pending_sign_in';
const TTL_MS = 10 * 60 * 1000;

const forget = () => {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // ignore
  }
};

export const trackSignInTap = (provider: SignInProvider) => {
  forget();
  track('sign_in_tap', { provider });
};

export const rememberPendingSignIn = (provider: SignInProvider) => {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify({ provider, at: Date.now() }));
  } catch {
    // No storage: that sign-in is not counted.
  }
};

/** The session arrived (SIGNED_IN): counts a pending Google/Apple sign-in, once. */
export const completePendingSignIn = (now = Date.now()): SignInProvider | null => {
  let pending: { provider?: unknown; at?: unknown } | null = null;
  try {
    pending = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null');
  } catch {
    pending = null;
  }
  if (!pending) return null;
  forget();
  const provider = pending.provider;
  if ((provider !== 'google' && provider !== 'apple') || typeof pending.at !== 'number' || now - pending.at > TTL_MS) return null;
  track('sign_in', { provider, via: 'redirect' });
  return provider;
};
