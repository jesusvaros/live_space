// First-run onboarding: shown once, on the first open without an account.
// Kept on the device; anyone who came in through a concert QR skips it.

const KEY = 'live_space.onboarding_seen';

export const hasSeenOnboarding = () => {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    // No storage (private mode): do not trap the visitor in the onboarding.
    return true;
  }
};

export const markOnboardingSeen = () => {
  try {
    window.localStorage.setItem(KEY, '1');
  } catch {
    // ignore storage failures
  }
};
